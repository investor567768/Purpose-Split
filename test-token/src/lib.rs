//! Test dollars (tUSD) for the Purpose Split demo on NEAR testnet.
//! A standard NEP-141 token with 6 decimals, like USDC, plus one extra:
//! anyone can call `get_test_dollars` to receive 500 tUSD, up to a balance of
//! 1,000 tUSD. Test dollars have no value. A real launch would use USDC.

use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, PromiseOrValue};

/// One test dollar.
pub const ONE: u128 = 1_000_000;
/// What `get_test_dollars` gives each time.
pub const GIFT: u128 = 500 * ONE;
/// Nobody can top up past this balance.
pub const CAP: u128 = 1_000 * ONE;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            token: FungibleToken::new(b"t".to_vec()),
        }
    }

    /// Gives the caller 500 test dollars, as long as their balance stays at or
    /// under 1,000. The first time, attach 0.00125 NEAR to register the account.
    #[payable]
    pub fn get_test_dollars(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let attached = env::attached_deposit();
        let mut refund = attached;
        if !self.token.accounts.contains_key(&who) {
            let min = self.storage_balance_bounds().min;
            require!(
                attached >= min,
                format!(
                    "The first time, attach {} yoctoNEAR to register",
                    min.as_yoctonear()
                )
            );
            self.token.internal_register_account(&who);
            refund = attached.saturating_sub(min);
        }
        let balance = self.token.internal_unwrap_balance_of(&who);
        require!(
            balance + GIFT <= CAP,
            "You already have enough test dollars (the limit is 1,000)"
        );
        self.token.internal_deposit(&who, GIFT);
        FtMint {
            owner_id: &who,
            amount: U128(GIFT),
            memo: Some("Test dollars, no value"),
        }
        .emit();
        if !refund.is_zero() {
            near_sdk::Promise::new(who.clone()).transfer(refund).detach();
        }
        U128(balance + GIFT)
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        #[allow(unused_variables)]
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            return true;
        }
        false
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Test Dollar (no value)".to_string(),
            symbol: "tUSD".to_string(),
            icon: Some(ICON.to_string()),
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}

const ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%231f8a5b'/%3E%3Ctext x='16' y='22' font-size='16' text-anchor='middle' fill='white' font-family='Arial'%3Et$%3C/text%3E%3C/svg%3E";

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn ctx(who: &str, deposit: NearToken) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("tusd.testnet".parse().unwrap())
            .predecessor_account_id(who.parse().unwrap())
            .attached_deposit(deposit)
            .account_balance(NearToken::from_near(10));
        testing_env!(b.build());
    }

    #[test]
    fn anyone_can_get_test_dollars_up_to_the_cap() {
        ctx("deployer.testnet", NearToken::from_yoctonear(0));
        let mut c = Contract::new();
        ctx("mum.testnet", NearToken::from_millinear(10));
        assert_eq!(c.get_test_dollars().0, 500 * ONE);
        ctx("mum.testnet", NearToken::from_yoctonear(0));
        assert_eq!(c.get_test_dollars().0, 1_000 * ONE);
        assert_eq!(c.ft_balance_of("mum.testnet".parse().unwrap()).0, 1_000 * ONE);
        assert_eq!(c.ft_total_supply().0, 1_000 * ONE);
        assert_eq!(c.ft_metadata().decimals, 6);
    }

    #[test]
    #[should_panic(expected = "You already have enough test dollars")]
    fn nobody_can_go_past_the_cap() {
        ctx("deployer.testnet", NearToken::from_yoctonear(0));
        let mut c = Contract::new();
        ctx("mum.testnet", NearToken::from_millinear(10));
        c.get_test_dollars();
        ctx("mum.testnet", NearToken::from_yoctonear(0));
        c.get_test_dollars();
        c.get_test_dollars();
    }

    #[test]
    #[should_panic(expected = "The first time, attach")]
    fn the_first_time_needs_a_registration_deposit() {
        ctx("deployer.testnet", NearToken::from_yoctonear(0));
        let mut c = Contract::new();
        ctx("mum.testnet", NearToken::from_yoctonear(0));
        c.get_test_dollars();
    }
}
