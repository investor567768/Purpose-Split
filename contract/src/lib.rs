//! Purpose Split: money with rules. Money raised for a purpose can only be spent
//! on that purpose.
//!
//! One contract holds many pots ("money boxes"). Each pot names one to three
//! payees on the verified list (a school, a hospital, a pharmacy, a contractor),
//! one releaser (a person, or a Sputnik DAO that votes), a target and a deadline,
//! and optionally a labelled free part for costs nobody can bill. Money comes in
//! from the stablecoin through `ft_transfer_call`. It can leave in only three ways:
//!   1. to one of the pot's payees, against that payee's own payment request,
//!      when the releaser pays it;
//!   2. as the free part, straight to the person named for it, the moment it is
//!      added, up to the amount stated when the pot was made;
//!   3. back to the contributors, in proportion, through `settle`.
//! The verified list changes only when the registry DAO calls this contract.
//! After deployment the account's keys are deleted, so nobody can change the code.
//!
//! When a payee confirms a payment reached it, the contract issues a pass to the
//! account that paid: proof, for anyone to check, that this bill was paid to this
//! payee. A student's pass says "Fees paid". A pass is a non-fungible token that
//! can be read with the usual NEP-171 views, but it cannot be moved or sold.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::Token;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    env, near, require, serde_json, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

#[cfg(test)]
mod tests;

/// Most contributors one pot can have. Settling sends one refund to each of them
/// in a single call, so this keeps that call inside NEAR's gas limit.
pub const MAX_CONTRIBUTORS: usize = 12;
/// Most payments one pot can record.
pub const MAX_PAYMENTS: usize = 12;
/// Most payment requests one pot can record.
pub const MAX_REQUESTS: usize = 12;
pub const MAX_NOTE_BYTES: usize = 80;
pub const MAX_TITLE_BYTES: usize = 80;
pub const MAX_REFERENCE_BYTES: usize = 40;
pub const MAX_NAME_BYTES: usize = 60;
pub const MAX_EVIDENCE_BYTES: usize = 200;
pub const MAX_PAYEES_PER_POT: usize = 3;
pub const MAX_LABEL_BYTES: usize = 40;
pub const MIN_DEADLINE_MINUTES: u32 = 2;
pub const MAX_DEADLINE_MINUTES: u32 = 366 * 24 * 60;
/// Storage the creator pre-pays for every contributor slot and payment record.
const BYTES_PER_SLOT: u64 = 120;
/// Storage for one pass in the list of passes, and for the holder's own list.
const BYTES_PER_PASS: u64 = 60;
const BYTES_PER_HOLDER: u64 = 120;
pub const MAX_PASS_ART_BYTES: usize = 200;

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(8);
const GAS_ON_SENT: Gas = Gas::from_tgas(5);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

const NS_PER_MINUTE: u64 = 60_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PotKind {
    /// One person presses pay: a student paying school fees, a family paying a
    /// hospital, an organiser paying a hall.
    Personal,
    /// A group presses pay: the members of a Sputnik DAO vote on each payment,
    /// like neighbours paying a contractor.
    Group,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PayeeKind {
    School,
    Hospital,
    Vendor,
    Other,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PotStatus {
    Open,
    Settled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Payee {
    pub name: String,
    pub kind: PayeeKind,
    /// Where the payee itself publishes this account, for example a page on
    /// its official website. Anyone can open it and check.
    pub evidence: String,
    pub added_at_ns: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Payment {
    pub to: AccountId,
    pub amount: u128,
    pub at_ns: u64,
    pub confirmed: bool,
    /// When the payee confirmed it, or 0 if it has not yet.
    pub confirmed_at_ns: u64,
    /// The payment request this payment answered.
    pub request_id: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestStatus {
    Open,
    Paid,
    Cancelled,
}

/// A bill from the pot's payee: "please pay this amount, for this".
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Request {
    pub payee: AccountId,
    pub amount: u128,
    pub note: String,
    pub at_ns: u64,
    pub status: RequestStatus,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Pot {
    pub kind: PotKind,
    pub title: String,
    pub creator: AccountId,
    pub payees: Vec<AccountId>,
    pub reference: String,
    pub releaser: AccountId,
    pub all_or_nothing: bool,
    pub target: u128,
    pub free_label: String,
    pub free_to: Option<AccountId>,
    pub free_target: u128,
    pub free_sent: u128,
    pub raised: u128,
    pub paid: u128,
    pub refunded: u128,
    pub created_at_ns: u64,
    pub deadline_ns: u64,
    pub status: PotStatus,
    pub contributions: Vec<(AccountId, u128)>,
    pub payments: Vec<Payment>,
    pub requests: Vec<Request>,
}

impl Pot {
    /// Purpose money still held for this pot.
    pub fn held(&self) -> u128 {
        self.raised - self.paid - self.refunded
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct ContributionView {
    pub account_id: AccountId,
    pub amount: U128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentView {
    pub to: AccountId,
    pub amount: U128,
    pub at_ns: String,
    pub confirmed: bool,
    pub confirmed_at_ns: String,
    /// The pass issued for this payment, once the payee has confirmed it.
    pub pass_id: Option<String>,
    pub request_id: u32,
}

/// A pass, in plain fields for a website. The same pass is also readable as a
/// standard token through `nft_token`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct PassView {
    pub token_id: String,
    /// "Fees paid: Lagos Lagoon University"
    pub title: String,
    pub holder: AccountId,
    pub pot_id: u64,
    pub payment_index: u32,
    pub pot_title: String,
    pub reference: String,
    pub payee: AccountId,
    pub payee_name: Option<String>,
    pub payee_kind: Option<PayeeKind>,
    pub amount: U128,
    pub paid_at_ns: String,
    pub confirmed_at_ns: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct RequestView {
    pub id: u32,
    pub payee: AccountId,
    pub amount: U128,
    pub note: String,
    pub at_ns: String,
    pub status: RequestStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct PayeeOnPot {
    pub account_id: AccountId,
    pub name: Option<String>,
    pub evidence: Option<String>,
    pub verified: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct PotView {
    pub id: u64,
    pub kind: PotKind,
    pub title: String,
    pub creator: AccountId,
    pub payees: Vec<PayeeOnPot>,
    pub reference: String,
    pub releaser: AccountId,
    pub all_or_nothing: bool,
    pub target: U128,
    pub free_label: String,
    pub free_to: Option<AccountId>,
    pub free_target: U128,
    pub free_sent: U128,
    pub raised: U128,
    pub paid: U128,
    pub refunded: U128,
    pub held: U128,
    pub created_at_ns: String,
    pub deadline_ns: String,
    pub deadline_passed: bool,
    pub status: PotStatus,
    pub contributions: Vec<ContributionView>,
    pub payments: Vec<PaymentView>,
    pub requests: Vec<RequestView>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct PayeeView {
    pub account_id: AccountId,
    pub name: String,
    pub kind: PayeeKind,
    pub evidence: String,
    pub added_at_ns: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct Totals {
    pub pots: u64,
    pub held: U128,
    pub owed: U128,
    pub passes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct Config {
    pub token: AccountId,
    pub symbol: String,
    pub decimals: u8,
    pub registry_dao: AccountId,
    pub max_contributors: u32,
    pub max_payments: u32,
    pub pass_art: Option<String>,
    pub version: String,
}

/// The `msg` a contributor sends with `ft_transfer_call`.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct ContributeMsg {
    pub pot_id: u64,
    /// "purpose" (the default) or "free".
    #[serde(default)]
    pub part: Option<String>,
}

/// A part of the target that goes straight to one person, for costs nobody can
/// bill: food, transport, pocket money. Its label and amount are fixed when the
/// pot is made, so every giver sees them before giving.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct FreePart {
    pub label: String,
    pub amount: U128,
    pub to: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: AccountId,
    symbol: String,
    decimals: u8,
    registry_dao: AccountId,
    payees: IterableMap<AccountId, Payee>,
    pots: Vector<Pot>,
    owed: LookupMap<AccountId, u128>,
    total_held: u128,
    total_owed: u128,
    /// Every pass, in the order issued, as (pot, payment). A pass's details are
    /// read from the payment it stands for, so they can never disagree with it.
    passes: Vector<(u32, u32)>,
    /// For each holder, the positions of their passes in `passes`.
    passes_of: LookupMap<AccountId, Vec<u32>>,
    /// A picture wallets can show for a pass. Optional.
    pass_art: Option<String>,
}

#[near]
impl Contract {
    /// `token`: the stablecoin pots are paid in, with its `symbol` and `decimals`
    /// (used only to write amounts in plain words).
    /// `registry_dao`: the Sputnik DAO that adds and removes verified payees.
    /// `pass_art`: an optional https link to a picture wallets show for a pass.
    #[init]
    pub fn new(
        token: AccountId,
        registry_dao: AccountId,
        symbol: String,
        decimals: u8,
        pass_art: Option<String>,
    ) -> Self {
        require!(decimals <= 24, "decimals must be at most 24");
        require!(!symbol.is_empty() && symbol.len() <= 12, "symbol must be 1 to 12 bytes");
        if let Some(art) = &pass_art {
            require!(
                art.starts_with("https://") && art.len() <= MAX_PASS_ART_BYTES,
                "pass_art must be an https link of at most 200 bytes"
            );
        }
        Self {
            token,
            symbol,
            decimals,
            registry_dao,
            payees: IterableMap::new(b"p"),
            pots: Vector::new(b"v"),
            owed: LookupMap::new(b"o"),
            total_held: 0,
            total_owed: 0,
            passes: Vector::new(b"n"),
            passes_of: LookupMap::new(b"h"),
            pass_art,
        }
    }

    // ---------------------------------------------------------------- registry

    /// Adds a school or vendor to the verified list. Only the registry DAO can
    /// call this, which it does when a proposal passes.
    pub fn add_payee(
        &mut self,
        account_id: AccountId,
        name: String,
        kind: PayeeKind,
        evidence: String,
    ) {
        require!(
            env::predecessor_account_id() == self.registry_dao,
            "Only the registry DAO can change the verified list"
        );
        require!(
            !name.is_empty() && name.len() <= MAX_NAME_BYTES,
            "The name must be 1 to 60 bytes"
        );
        require!(
            evidence.starts_with("https://") && evidence.len() <= MAX_EVIDENCE_BYTES,
            "The evidence must be an https link of at most 200 bytes"
        );
        require!(
            account_id != env::current_account_id(),
            "This contract cannot be a payee"
        );
        let payee = Payee {
            name,
            kind,
            evidence,
            added_at_ns: env::block_timestamp(),
        };
        event(
            "payee_added",
            serde_json::json!({
                "account_id": account_id, "name": payee.name, "kind": payee.kind, "evidence": payee.evidence
            }),
        );
        self.payees.insert(account_id, payee);
    }

    /// Removes a payee. Pots that pay it can then be settled straight away.
    pub fn remove_payee(&mut self, account_id: AccountId) {
        require!(
            env::predecessor_account_id() == self.registry_dao,
            "Only the registry DAO can change the verified list"
        );
        require!(
            self.payees.remove(&account_id).is_some(),
            "That account is not on the verified list"
        );
        event(
            "payee_removed",
            serde_json::json!({ "account_id": account_id }),
        );
    }

    /// Hands control of the verified list to another account, normally the
    /// council's Sputnik DAO. Only the current holder can do this. A deployment
    /// seeds its first payees from a plain account, then hands the list to the
    /// DAO, after which only a DAO vote can add, remove or hand it on again.
    pub fn set_registry_dao(&mut self, account_id: AccountId) {
        let caller = env::predecessor_account_id();
        require!(caller == self.registry_dao, "Only the registry DAO can hand over the verified list");
        require!(account_id != self.registry_dao, "That account already holds the verified list");
        event(
            "registry_handed_over",
            serde_json::json!({ "from": caller, "to": account_id }),
        );
        self.registry_dao = account_id;
    }

    // -------------------------------------------------------------------- pots

    /// Creates a pot. Attach about 0.1 NEAR for storage; the unused part is refunded.
    ///
    /// `payees`: one to three accounts on the verified list, the only places the
    /// purpose money can go. `releaser`: who presses pay, a person for a Personal
    /// pot or a Sputnik DAO for a Group pot. `all_or_nothing`: nothing is paid
    /// until the target is reached (default: yes for Group pots, no for Personal).
    /// `free_part`: an optional labelled amount sent straight to one person.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_pot(
        &mut self,
        kind: PotKind,
        title: String,
        payees: Vec<AccountId>,
        reference: String,
        releaser: AccountId,
        target: U128,
        deadline_minutes: u32,
        all_or_nothing: Option<bool>,
        free_part: Option<FreePart>,
    ) -> u64 {
        let creator = env::predecessor_account_id();
        let target = target.0;

        require!(
            !title.is_empty() && title.len() <= MAX_TITLE_BYTES,
            "The title must be 1 to 80 bytes"
        );
        require!(
            reference.len() <= MAX_REFERENCE_BYTES,
            "The reference must be at most 40 bytes"
        );
        require!(target > 0, "The target must be more than zero");
        require!(
            (MIN_DEADLINE_MINUTES..=MAX_DEADLINE_MINUTES).contains(&deadline_minutes),
            "The deadline must be between 2 minutes and 366 days away"
        );
        require!(
            !payees.is_empty() && payees.len() <= MAX_PAYEES_PER_POT,
            "A pot names one to three payees"
        );
        for (i, payee) in payees.iter().enumerate() {
            require!(
                self.payees.contains_key(payee),
                format!("{payee} is not on the verified list")
            );
            require!(
                !payees[..i].contains(payee),
                format!("{payee} is named twice")
            );
            require!(
                &releaser != payee,
                "The person who releases the money cannot also be a payee"
            );
        }
        require!(
            releaser != env::current_account_id(),
            "This contract cannot release money"
        );
        let (free_label, free_to, free_target) = match free_part {
            None => (String::new(), None, 0),
            Some(f) => {
                require!(
                    !f.label.is_empty() && f.label.len() <= MAX_LABEL_BYTES,
                    "The free part's label must be 1 to 40 bytes"
                );
                require!(f.amount.0 > 0, "The free part must be more than zero");
                require!(
                    !payees.contains(&f.to),
                    "The free part cannot go to a payee"
                );
                require!(
                    f.to != env::current_account_id(),
                    "The free part cannot go to this contract"
                );
                (f.label, Some(f.to), f.amount.0)
            }
        };
        let all_or_nothing = all_or_nothing.unwrap_or(kind == PotKind::Group);

        let storage_before = env::storage_usage();
        let now = env::block_timestamp();
        let pot = Pot {
            kind,
            title,
            creator: creator.clone(),
            payees,
            reference,
            releaser,
            all_or_nothing,
            target,
            free_label,
            free_to,
            free_target,
            free_sent: 0,
            raised: 0,
            paid: 0,
            refunded: 0,
            created_at_ns: now,
            deadline_ns: now + u64::from(deadline_minutes) * NS_PER_MINUTE,
            status: PotStatus::Open,
            contributions: Vec::new(),
            payments: Vec::new(),
            requests: Vec::new(),
        };
        let id = u64::from(self.pots.len());
        self.pots.push(pot.clone());
        self.pots.flush();

        // The creator pays for the pot record plus room for every contributor
        // and payment it can ever hold, so later steps never run short.
        let bytes = env::storage_usage().saturating_sub(storage_before)
            + BYTES_PER_SLOT * (MAX_CONTRIBUTORS + MAX_PAYMENTS) as u64
            + (BYTES_PER_SLOT + MAX_NOTE_BYTES as u64) * MAX_REQUESTS as u64
            + BYTES_PER_PASS * MAX_PAYMENTS as u64
            + BYTES_PER_HOLDER;
        let cost = env::storage_byte_cost().saturating_mul(u128::from(bytes));
        let attached = env::attached_deposit();
        require!(
            attached >= cost,
            format!(
                "Attach at least {} yoctoNEAR for storage",
                cost.as_yoctonear()
            )
        );
        let refund = attached.saturating_sub(cost);
        if !refund.is_zero() {
            Promise::new(creator).transfer(refund).detach();
        }

        event(
            "pot_created",
            serde_json::json!({
                "pot_id": id,
                "kind": pot.kind,
                "title": pot.title,
                "payees": pot.payees,
                "releaser": pot.releaser,
                "all_or_nothing": pot.all_or_nothing,
                "target": U128(pot.target),
                "free_label": pot.free_label,
                "free_to": pot.free_to,
                "free_target": U128(pot.free_target),
                "deadline_ns": pot.deadline_ns.to_string(),
            }),
        );
        id
    }

    /// One of the pot's payees asks to be paid: a school bills a student, a
    /// hospital bills a family, a contractor asks a street for the money for parts.
    /// Nothing leaves a pot without one.
    pub fn request_payment(&mut self, pot_id: u64, amount: U128, note: String) -> u32 {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();
        let pot = self.pot(pot_id);
        require!(
            pot.payees.contains(&caller),
            format!("Only {} can ask this pot for payment", either(&pot.payees))
        );
        require!(pot.status == PotStatus::Open, "This pot is settled");
        require!(now <= pot.deadline_ns, "This pot's deadline has passed");
        require!(
            self.payees.contains_key(&caller),
            "Only a payee on the verified list can ask for payment"
        );
        require!(amount.0 > 0, "The amount must be more than zero");
        require!(
            !note.is_empty() && note.len() <= MAX_NOTE_BYTES,
            "The note must be 1 to 80 bytes"
        );
        require!(
            pot.requests.len() < MAX_REQUESTS,
            "This pot has the most payment requests it can take"
        );
        let pot = self.pot_mut(pot_id);
        pot.requests.push(Request {
            payee: caller.clone(),
            amount: amount.0,
            note: note.clone(),
            at_ns: now,
            status: RequestStatus::Open,
        });
        let request_id = (pot.requests.len() - 1) as u32;
        event(
            "payment_requested",
            serde_json::json!({
                "pot_id": pot_id, "request_id": request_id, "by": caller, "amount": amount, "note": note
            }),
        );
        request_id
    }

    /// A payee withdraws a request it made, for example a bill sent in error.
    pub fn cancel_request(&mut self, pot_id: u64, request_id: u32) {
        let caller = env::predecessor_account_id();
        let pot = self.pot_mut(pot_id);
        let request = pot
            .requests
            .get_mut(request_id as usize)
            .unwrap_or_else(|| env::panic_str("There is no request with that number"));
        require!(caller == request.payee, "Only the payee that made a request can cancel it");
        require!(
            request.status == RequestStatus::Open,
            "This request is no longer open"
        );
        request.status = RequestStatus::Cancelled;
        event(
            "request_cancelled",
            serde_json::json!({ "pot_id": pot_id, "request_id": request_id }),
        );
    }

    /// Pays one open request in full, to the payee that made it. Only the pot's
    /// releaser can call this: the person for a Personal pot, the voting DAO for
    /// a Group pot.
    pub fn pay_request(&mut self, pot_id: u64, request_id: u32) -> Promise {
        let pot = self.pot(pot_id);
        let request = pot
            .requests
            .get(request_id as usize)
            .unwrap_or_else(|| env::panic_str("There is no request with that number"));
        match request.status {
            RequestStatus::Open => {}
            RequestStatus::Paid => env::panic_str("This request is already paid."),
            RequestStatus::Cancelled => env::panic_str("This request was cancelled."),
        }
        let (to, amount) = (request.payee.clone(), request.amount);
        self.pay(pot_id, to, amount, Some(request_id))
    }

    /// Pays `amount` from the pot to `to`. It goes through only if the caller is
    /// the pot's releaser, `to` is one of the pot's verified payees, and `to` has
    /// an open request for exactly that amount. Every other attempt is refused.
    pub fn pay_to(&mut self, pot_id: u64, to: AccountId, amount: U128) -> Promise {
        self.pay(pot_id, to, amount.0, None)
    }

    /// The payee confirms that a payment reached it and was credited. This
    /// issues a pass to the account that paid, and returns the pass's id.
    pub fn confirm_payment(&mut self, pot_id: u64, payment_index: u32) -> String {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();
        let pot = self.pot_mut(pot_id);
        let payment = pot
            .payments
            .get_mut(payment_index as usize)
            .unwrap_or_else(|| env::panic_str("There is no payment with that number"));
        require!(caller == payment.to, "Only the payee that was paid can confirm a payment");
        require!(!payment.confirmed, "This payment is already confirmed");
        payment.confirmed = true;
        payment.confirmed_at_ns = now;
        let holder = pot.releaser.clone();
        event(
            "payment_confirmed",
            serde_json::json!({ "pot_id": pot_id, "payment_index": payment_index, "by": caller }),
        );
        self.issue_pass(pot_id, payment_index, holder)
    }

    /// Returns every unused coin to the contributors, in proportion to what each
    /// added. Anyone can call it after the deadline, or straight away once every
    /// payee has been removed from the verified list. Attach 300 Tgas.
    pub fn settle(&mut self, pot_id: u64) {
        let pot = self.pot(pot_id);
        if let Some(reason) = self.settle_refusal(&pot) {
            env::panic_str(&reason);
        }
        let payee_removed = self.all_payees_removed(&pot);

        let remaining = pot.held();
        let refunds = pro_rata(remaining, pot.raised, &pot.contributions);

        let pot = self.pot_mut(pot_id);
        pot.status = PotStatus::Settled;
        pot.refunded += remaining;
        let memo = format!("Purpose Split pot #{pot_id}: refund");
        self.total_held -= remaining;

        event(
            "settled",
            serde_json::json!({
                "pot_id": pot_id,
                "refunded": U128(remaining),
                "reason": if payee_removed { "payee_removed" } else { "deadline" },
            }),
        );
        for (account_id, amount) in refunds {
            if amount == 0 {
                continue;
            }
            event(
                "refunded",
                serde_json::json!({ "pot_id": pot_id, "to": account_id, "amount": U128(amount) }),
            );
            self.send(account_id, amount, memo.clone()).detach();
        }
    }

    /// Collects money the contract tried to send you but could not, for example
    /// because your account was not registered with the token at the time.
    pub fn withdraw_owed(&mut self) -> Promise {
        let who = env::predecessor_account_id();
        let amount = self.owed.remove(&who).unwrap_or(0);
        require!(amount > 0, "Nothing is owed to this account");
        self.total_owed -= amount;
        event(
            "owed_withdrawn",
            serde_json::json!({ "to": who, "amount": U128(amount) }),
        );
        self.send(who, amount, "Purpose Split: owed money".to_string())
    }

    /// Callback after every transfer. A failed transfer is recorded as owed,
    /// so no money is ever stuck or lost.
    #[private]
    pub fn on_sent(&mut self, to: AccountId, amount: U128) -> bool {
        if env::promise_result_checked(0, 64).is_ok() {
            return true;
        }
        let owed = self.owed.get(&to).copied().unwrap_or(0);
        self.owed.insert(to.clone(), owed + amount.0);
        self.total_owed += amount.0;
        event(
            "owed",
            serde_json::json!({ "to": to, "amount": amount }),
        );
        false
    }

    // ------------------------------------------------------------------- views

    /// Says whether `caller` could pay `amount` to `to` from this pot right now,
    /// and if not, why. It runs the same check as `pay_to`, so a website can show
    /// the contract's own answer without sending a transaction.
    pub fn why_refused(
        &self,
        pot_id: u64,
        caller: AccountId,
        to: AccountId,
        amount: U128,
    ) -> Option<String> {
        let pot = self.pots.get(pot_id as u32)?;
        self.refusal(pot, &caller, &to, amount.0)
    }

    /// Says whether this pot's money could go back to its contributors right
    /// now, and if not, why. It runs the same check as `settle`.
    pub fn why_refund_refused(&self, pot_id: u64) -> Option<String> {
        let pot = self.pots.get(pot_id as u32)?;
        self.settle_refusal(pot)
    }

    pub fn get_config(&self) -> Config {
        Config {
            token: self.token.clone(),
            symbol: self.symbol.clone(),
            decimals: self.decimals,
            registry_dao: self.registry_dao.clone(),
            max_contributors: MAX_CONTRIBUTORS as u32,
            max_payments: MAX_PAYMENTS as u32,
            pass_art: self.pass_art.clone(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    pub fn is_verified(&self, account_id: AccountId) -> bool {
        self.payees.contains_key(&account_id)
    }

    pub fn get_payees(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<PayeeView> {
        self.payees
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .map(|(account_id, p)| PayeeView {
                account_id: account_id.clone(),
                name: p.name.clone(),
                kind: p.kind,
                evidence: p.evidence.clone(),
                added_at_ns: p.added_at_ns.to_string(),
            })
            .collect()
    }

    pub fn get_pot(&self, pot_id: u64) -> Option<PotView> {
        let pot = self.pots.get(u32::try_from(pot_id).ok()?)?;
        Some(self.view(pot_id, pot))
    }

    pub fn get_pots(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<PotView> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(20).min(50);
        (from..u64::from(self.pots.len()).min(from.saturating_add(limit)))
            .filter_map(|id| self.get_pot(id))
            .collect()
    }

    pub fn get_owed(&self, account_id: AccountId) -> U128 {
        U128(self.owed.get(&account_id).copied().unwrap_or(0))
    }

    /// The contract's token balance should always equal `held + owed`.
    pub fn get_totals(&self) -> Totals {
        Totals {
            pots: u64::from(self.pots.len()),
            held: U128(self.total_held),
            owed: U128(self.total_owed),
            passes: u64::from(self.passes.len()),
        }
    }

    // ------------------------------------------------------------------ passes

    /// The passes an account holds, newest last. Each one is proof that a bill
    /// was paid to a verified payee and that the payee confirmed it.
    pub fn get_passes(
        &self,
        account_id: AccountId,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<PassView> {
        self.passes_of
            .get(&account_id)
            .map(|list| {
                list.iter()
                    .skip(from_index.unwrap_or(0) as usize)
                    .take(limit.unwrap_or(50).min(100) as usize)
                    .filter_map(|n| self.passes.get(*n))
                    .filter_map(|(pot, payment)| self.pass(*pot, *payment))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// The pass for one payment of one pot, if the payee has confirmed it.
    pub fn get_pass(&self, pot_id: u64, payment_index: u32) -> Option<PassView> {
        self.pass(u32::try_from(pot_id).ok()?, payment_index)
    }

    // The usual NEP-171 / NEP-177 / NEP-181 views, so wallets and explorers can
    // show a pass like any other token.

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Purpose Split passes".to_string(),
            symbol: "PAID".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }

    pub fn nft_token(&self, token_id: String) -> Option<Token> {
        let (pot, payment) = parse_pass_id(&token_id)?;
        self.pass(pot, payment).map(|p| self.token(&p))
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(u128::from(self.passes.len()))
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        let from = from_index.map(|v| v.0).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        (from..u128::from(self.passes.len()).min(from.saturating_add(u128::from(limit))))
            .filter_map(|n| self.passes.get(n as u32))
            .filter_map(|(pot, payment)| self.pass(*pot, *payment))
            .map(|p| self.token(&p))
            .collect()
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(self.passes_of.get(&account_id).map(|l| l.len() as u128).unwrap_or(0))
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        let from = from_index.map(|v| v.0).unwrap_or(0).min(u128::from(u32::MAX)) as u32;
        let limit = limit.unwrap_or(50).min(100) as u32;
        self.get_passes(account_id, Some(from), Some(limit))
            .iter()
            .map(|p| self.token(p))
            .collect()
    }

    /// A pass cannot be moved: it is proof that this account paid, so it stays
    /// with this account. This method exists only to say so in plain words.
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let _ = (receiver_id, token_id, approval_id, memo);
        env::panic_str(PASS_STAYS);
    }

    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) {
        let _ = (receiver_id, token_id, approval_id, memo, msg);
        env::panic_str(PASS_STAYS);
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Money arrives here when someone calls `ft_transfer_call` on the token with
    /// msg `{"pot_id": 0}` (the purpose) or `{"pot_id": 0, "part": "free"}`. Any part
    /// the pot cannot take is handed back to the sender by the token. If this
    /// call fails, the token refunds the whole amount.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.token,
            "This contract only accepts its own stablecoin"
        );
        let msg: ContributeMsg = serde_json::from_str(&msg)
            .unwrap_or_else(|_| env::panic_str("msg must look like {\"pot_id\": 0}"));
        let pot_id = msg.pot_id;
        let free = match msg.part.as_deref() {
            None | Some("purpose") | Some("fees") => false,
            Some("free") | Some("pocket") => true,
            Some(_) => env::panic_str("part must be \"purpose\" or \"free\""),
        };

        let now = env::block_timestamp();
        let all_removed = {
            let pot = self.pot(pot_id);
            self.all_payees_removed(&pot)
        };
        let pot = self.pot_mut(pot_id);
        require!(pot.status == PotStatus::Open, "This pot is closed");
        require!(now <= pot.deadline_ns, "This pot's deadline has passed");
        require!(
            !all_removed,
            "This pot's payees are no longer verified, so it cannot take money"
        );

        if free {
            let to = pot
                .free_to
                .clone()
                .unwrap_or_else(|| env::panic_str("This pot has no free part"));
            let room = pot.free_target - pot.free_sent;
            require!(room > 0, "This pot's free part is already complete");
            let accepted = amount.0.min(room);
            pot.free_sent += accepted;
            let memo = format!("Purpose Split pot #{pot_id}: {}", pot.free_label);
            event(
                "free_part_sent",
                serde_json::json!({
                    "pot_id": pot_id, "from": sender_id, "to": to, "amount": U128(accepted)
                }),
            );
            self.send(to, accepted, memo).detach();
            return PromiseOrValue::Value(U128(amount.0 - accepted));
        }

        let room = pot.target - pot.raised;
        require!(room > 0, "This pot has already reached its target");
        let accepted = amount.0.min(room);
        match pot.contributions.iter_mut().find(|(a, _)| *a == sender_id) {
            Some((_, total)) => *total += accepted,
            None => {
                require!(
                    pot.contributions.len() < MAX_CONTRIBUTORS,
                    "This pot already has the most contributors it can take"
                );
                pot.contributions.push((sender_id.clone(), accepted));
            }
        }
        pot.raised += accepted;
        let raised = pot.raised;
        self.total_held += accepted;
        event(
            "contributed",
            serde_json::json!({
                "pot_id": pot_id, "from": sender_id, "amount": U128(accepted), "raised": U128(raised)
            }),
        );
        PromiseOrValue::Value(U128(amount.0 - accepted))
    }
}

impl Contract {
    fn pay(&mut self, pot_id: u64, to: AccountId, amount: u128, request_id: Option<u32>) -> Promise {
        let caller = env::predecessor_account_id();
        let pot = self.pot(pot_id);
        if let Some(reason) = self.refusal(&pot, &caller, &to, amount) {
            env::panic_str(&reason);
        }
        let request_id = request_id.unwrap_or_else(|| {
            pot.requests
                .iter()
                .position(|r| r.status == RequestStatus::Open && r.payee == to && r.amount == amount)
                .unwrap_or_else(|| env::panic_str("There is no open request for that amount")) as u32
        });

        let now = env::block_timestamp();
        let pot = self.pot_mut(pot_id);
        pot.paid += amount;
        pot.requests[request_id as usize].status = RequestStatus::Paid;
        let note = pot.requests[request_id as usize].note.clone();
        pot.payments.push(Payment {
            to: to.clone(),
            amount,
            at_ns: now,
            confirmed: false,
            confirmed_at_ns: 0,
            request_id,
        });
        let payee = to;
        let memo = format!("{}: {}", memo_for(pot_id, &pot.reference), note);
        let payment_index = pot.payments.len() - 1;
        self.total_held -= amount;

        event(
            "paid",
            serde_json::json!({
                "pot_id": pot_id,
                "payment_index": payment_index,
                "request_id": request_id,
                "to": payee,
                "amount": U128(amount),
                "by": caller,
            }),
        );
        self.send(payee, amount, memo)
    }

    /// Records a pass for a confirmed payment and tells the world about it in
    /// the standard NEP-171 way, so wallets and explorers pick it up.
    fn issue_pass(&mut self, pot_id: u64, payment_index: u32, holder: AccountId) -> String {
        let position = self.passes.len();
        self.passes.push((pot_id as u32, payment_index));
        let mut list = self.passes_of.get(&holder).cloned().unwrap_or_default();
        list.push(position);
        self.passes_of.insert(holder.clone(), list);
        let token_id = pass_id(pot_id, payment_index);
        env::log_str(&format!(
            "EVENT_JSON:{}",
            serde_json::json!({
                "standard": "nep171",
                "version": "1.0.0",
                "event": "nft_mint",
                "data": [{ "owner_id": holder, "token_ids": [token_id] }],
            })
        ));
        token_id
    }

    /// Reads a pass from the payment it stands for. There is no pass until the
    /// payee has confirmed the payment.
    fn pass(&self, pot_id: u32, payment_index: u32) -> Option<PassView> {
        let pot = self.pots.get(pot_id)?;
        let payment = pot.payments.get(payment_index as usize)?;
        if !payment.confirmed {
            return None;
        }
        let payee = self.payees.get(&payment.to);
        let what = match payee.map(|p| p.kind) {
            Some(PayeeKind::School) => "Fees paid",
            Some(PayeeKind::Hospital) => "Hospital bill paid",
            _ => "Paid",
        };
        let name = payee
            .map(|p| p.name.clone())
            .unwrap_or_else(|| payment.to.to_string());
        Some(PassView {
            token_id: pass_id(u64::from(pot_id), payment_index),
            title: format!("{what}: {name}"),
            holder: pot.releaser.clone(),
            pot_id: u64::from(pot_id),
            payment_index,
            pot_title: pot.title.clone(),
            reference: pot.reference.clone(),
            payee: payment.to.clone(),
            payee_name: payee.map(|p| p.name.clone()),
            payee_kind: payee.map(|p| p.kind),
            amount: U128(payment.amount),
            paid_at_ns: payment.at_ns.to_string(),
            confirmed_at_ns: payment.confirmed_at_ns.to_string(),
        })
    }

    /// The same pass in the shape wallets expect.
    fn token(&self, p: &PassView) -> Token {
        let to = p.payee_name.clone().unwrap_or_else(|| p.payee.to_string());
        let reference = if p.reference.is_empty() {
            String::new()
        } else {
            format!(" Reference: {}.", p.reference)
        };
        let ms = |ns: &str| (ns.parse::<u64>().unwrap_or(0) / 1_000_000).to_string();
        Token {
            token_id: p.token_id.clone(),
            owner_id: p.holder.clone(),
            metadata: Some(TokenMetadata {
                title: Some(p.title.clone()),
                description: Some(format!(
                    "{} {} from \"{}\" was paid to {to}, and {to} confirmed it.{reference} This pass cannot be moved or sold.",
                    self.amount(p.amount.0),
                    self.symbol,
                    p.pot_title
                )),
                media: self.pass_art.clone(),
                media_hash: None,
                copies: Some(1),
                issued_at: Some(ms(&p.confirmed_at_ns)),
                expires_at: None,
                starts_at: None,
                updated_at: None,
                extra: Some(
                    serde_json::json!({
                        "pot_id": p.pot_id,
                        "payment_index": p.payment_index,
                        "payee": p.payee,
                        "amount": p.amount,
                        "reference": p.reference,
                    })
                    .to_string(),
                ),
                reference: None,
                reference_hash: None,
            }),
            approved_account_ids: None,
        }
    }

    fn all_payees_removed(&self, pot: &Pot) -> bool {
        pot.payees.iter().all(|p| !self.payees.contains_key(p))
    }

    fn settle_refusal(&self, pot: &Pot) -> Option<String> {
        if pot.status != PotStatus::Open {
            return Some("This pot is already settled.".into());
        }
        if env::block_timestamp() <= pot.deadline_ns && !self.all_payees_removed(pot) {
            return Some(
                "Money goes back only after the deadline, or at once if the payees leave the verified list. Until then it is kept for its purpose."
                    .into(),
            );
        }
        None
    }

    fn pot(&self, pot_id: u64) -> Pot {
        u32::try_from(pot_id)
            .ok()
            .and_then(|i| self.pots.get(i))
            .cloned()
            .unwrap_or_else(|| env::panic_str("There is no pot with that number"))
    }

    fn pot_mut(&mut self, pot_id: u64) -> &mut Pot {
        u32::try_from(pot_id)
            .ok()
            .and_then(|i| self.pots.get_mut(i))
            .unwrap_or_else(|| env::panic_str("There is no pot with that number"))
    }

    /// Every reason a payment is refused, in the order a judge would ask.
    /// `None` means the payment is allowed.
    fn refusal(&self, pot: &Pot, caller: &AccountId, to: &AccountId, amount: u128) -> Option<String> {
        let only = either(&pot.payees);
        if pot.status != PotStatus::Open {
            return Some("This pot is settled. Its unused money went back to the contributors.".into());
        }
        if caller != &pot.releaser {
            return Some(match pot.kind {
                PotKind::Personal => format!("Only {} can pay from this pot.", pot.releaser),
                PotKind::Group => format!("Only a vote of {} can release this pot.", pot.releaser),
            });
        }
        if env::block_timestamp() > pot.deadline_ns {
            return Some(
                "The deadline has passed. The unused money now goes back to the contributors."
                    .into(),
            );
        }
        if to == &pot.releaser || to == &pot.creator || pot.free_to.as_ref() == Some(to) {
            return Some(format!("This money cannot go to {to}. This pot pays only {only}."));
        }
        if !pot.payees.contains(to) {
            if !self.payees.contains_key(to) {
                return Some(format!(
                    "{to} is not on the verified list. This pot pays only {only}."
                ));
            }
            return Some(format!("This pot pays only {only}."));
        }
        if !self.payees.contains_key(to) {
            return Some(if self.all_payees_removed(pot) {
                format!("{to} was removed from the verified list. The contributors can now get their money back.")
            } else {
                format!("{to} was removed from the verified list, so this pot can no longer pay it.")
            });
        }
        if pot.all_or_nothing && pot.raised < pot.target {
            return Some(format!(
                "Nothing can be paid until the target is reached: {} of {} {} raised so far.",
                self.amount(pot.raised),
                self.amount(pot.target),
                self.symbol
            ));
        }
        if amount == 0 {
            return Some("The amount must be more than zero.".into());
        }
        if amount > pot.held() {
            return Some(format!(
                "Only {} {} is left in this pot.",
                self.amount(pot.held()),
                self.symbol
            ));
        }
        if pot.payments.len() >= MAX_PAYMENTS {
            return Some("This pot has made the most payments it can.".into());
        }
        if !pot
            .requests
            .iter()
            .any(|r| r.status == RequestStatus::Open && &r.payee == to && r.amount == amount)
        {
            return Some(format!(
                "{to} has not asked for {} {}. Money leaves this pot only against a payment request from the payee.",
                self.amount(amount),
                self.symbol
            ));
        }
        None
    }

    /// Writes an amount in whole units, exactly: 20000000 with 6 decimals is "20",
    /// and 13333333 is "13.333333".
    fn amount(&self, value: u128) -> String {
        format_units(value, self.decimals)
    }

    fn send(&mut self, to: AccountId, amount: u128, memo: String) -> Promise {
        ext_ft_core::ext(self.token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(to.clone(), U128(amount), Some(memo))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_SENT)
                    .on_sent(to, U128(amount)),
            )
    }

    fn view(&self, id: u64, pot: &Pot) -> PotView {
        PotView {
            id,
            kind: pot.kind,
            title: pot.title.clone(),
            creator: pot.creator.clone(),
            payees: pot
                .payees
                .iter()
                .map(|a| {
                    let p = self.payees.get(a);
                    PayeeOnPot {
                        account_id: a.clone(),
                        name: p.map(|p| p.name.clone()),
                        evidence: p.map(|p| p.evidence.clone()),
                        verified: p.is_some(),
                    }
                })
                .collect(),
            reference: pot.reference.clone(),
            releaser: pot.releaser.clone(),
            all_or_nothing: pot.all_or_nothing,
            target: U128(pot.target),
            free_label: pot.free_label.clone(),
            free_to: pot.free_to.clone(),
            free_target: U128(pot.free_target),
            free_sent: U128(pot.free_sent),
            raised: U128(pot.raised),
            paid: U128(pot.paid),
            refunded: U128(pot.refunded),
            held: U128(pot.held()),
            created_at_ns: pot.created_at_ns.to_string(),
            deadline_ns: pot.deadline_ns.to_string(),
            deadline_passed: env::block_timestamp() > pot.deadline_ns,
            status: pot.status,
            contributions: pot
                .contributions
                .iter()
                .map(|(a, v)| ContributionView {
                    account_id: a.clone(),
                    amount: U128(*v),
                })
                .collect(),
            payments: pot
                .payments
                .iter()
                .enumerate()
                .map(|(i, p)| PaymentView {
                    to: p.to.clone(),
                    amount: U128(p.amount),
                    at_ns: p.at_ns.to_string(),
                    confirmed: p.confirmed,
                    confirmed_at_ns: p.confirmed_at_ns.to_string(),
                    pass_id: p.confirmed.then(|| pass_id(id, i as u32)),
                    request_id: p.request_id,
                })
                .collect(),
            requests: pot
                .requests
                .iter()
                .enumerate()
                .map(|(i, r)| RequestView {
                    id: i as u32,
                    payee: r.payee.clone(),
                    amount: U128(r.amount),
                    note: r.note.clone(),
                    at_ns: r.at_ns.to_string(),
                    status: r.status,
                })
                .collect(),
        }
    }
}

/// Splits `remaining` between contributors in proportion to what each added.
/// Everyone first gets their share rounded down; the few units left over go,
/// one each, to the people whose shares were rounded down the most. So the
/// shares add up to exactly `remaining`, and nobody gets back more than they
/// put in.
pub fn pro_rata(
    remaining: u128,
    raised: u128,
    contributions: &[(AccountId, u128)],
) -> Vec<(AccountId, u128)> {
    if remaining == 0 || raised == 0 || contributions.is_empty() {
        return Vec::new();
    }
    let mut out: Vec<(AccountId, u128)> = Vec::with_capacity(contributions.len());
    let mut leftovers: Vec<(u128, usize)> = Vec::with_capacity(contributions.len());
    let mut given = 0u128;
    for (i, (account, amount)) in contributions.iter().enumerate() {
        let exact = remaining * amount;
        let share = exact / raised;
        given += share;
        out.push((account.clone(), share));
        leftovers.push((exact % raised, i));
    }
    // Biggest rounding loss first; earlier contributors win ties.
    leftovers.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    let dust = remaining - given;
    for (_, i) in leftovers.into_iter().take(dust as usize) {
        out[i].1 += 1;
    }
    out
}

pub fn format_units(value: u128, decimals: u8) -> String {
    let unit = 10u128.pow(u32::from(decimals));
    let whole = value / unit;
    let frac = value % unit;
    if frac == 0 {
        return whole.to_string();
    }
    let frac = format!("{:0width$}", frac, width = decimals as usize);
    format!("{whole}.{}", frac.trim_end_matches('0'))
}

/// "a", "a or b", "a, b or c".
fn either(accounts: &[AccountId]) -> String {
    match accounts {
        [] => String::new(),
        [one] => one.to_string(),
        [rest @ .., last] => format!(
            "{} or {last}",
            rest.iter().map(|a| a.as_str()).collect::<Vec<_>>().join(", ")
        ),
    }
}

const PASS_STAYS: &str =
    "A pass cannot be moved or sold. It stays with the account that paid, as proof.";

/// A pass is named after the payment it stands for: pot 7, payment 0 is "7-0".
pub fn pass_id(pot_id: u64, payment_index: u32) -> String {
    format!("{pot_id}-{payment_index}")
}

fn parse_pass_id(token_id: &str) -> Option<(u32, u32)> {
    let (pot, payment) = token_id.split_once('-')?;
    let parsed = (pot.parse::<u32>().ok()?, payment.parse::<u32>().ok()?);
    // Only the exact spelling counts, so "07-0" is not another name for "7-0".
    (pass_id(u64::from(parsed.0), parsed.1) == token_id).then_some(parsed)
}

fn memo_for(pot_id: u64, reference: &str) -> String {
    if reference.is_empty() {
        format!("Purpose Split pot #{pot_id}")
    } else {
        format!("Purpose Split pot #{pot_id}: {reference}")
    }
}

/// Logs a NEP-297 event, so explorers, bots and our proof page can follow pots.
fn event(name: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        serde_json::json!({
            "standard": "purpose_split",
            "version": "1.0.0",
            "event": name,
            "data": [data],
        })
    ));
}
