//! Every rule in the plan, and every cheating attempt in the demo, as a test.

use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

/// One test dollar (6 decimals, like USDC).
const D: u128 = 1_000_000;
const MINUTE: u64 = NS_PER_MINUTE;
const START: u64 = 1_800_000_000_000_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn contract_id() -> AccountId {
    acc("pots.purposesplit.testnet")
}
fn token() -> AccountId {
    acc("tusd.purposesplit.testnet")
}
fn registry() -> AccountId {
    acc("registry.sputnikv2.testnet")
}
fn unilag() -> AccountId {
    acc("unilag.schools.testnet")
}
fn lasu() -> AccountId {
    acc("lasu.schools.testnet")
}
fn sparks() -> AccountId {
    acc("sparks.vendors.testnet")
}
fn fake_school() -> AccountId {
    acc("unilag-fees.testnet")
}
fn mum() -> AccountId {
    acc("mum.testnet")
}
fn uncle() -> AccountId {
    acc("uncle-femi.testnet")
}
fn tolu() -> AccountId {
    acc("tolu.testnet")
}
fn street_dao() -> AccountId {
    acc("adeyemi-street.sputnikv2.testnet")
}
fn chairman() -> AccountId {
    acc("chairman.testnet")
}
fn resident(i: usize) -> AccountId {
    acc(&format!("resident{i}.testnet"))
}

fn ctx(predecessor: AccountId, deposit: NearToken, minutes: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract_id())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(deposit)
        .account_balance(NearToken::from_near(10))
        .block_timestamp(START + minutes * MINUTE);
    testing_env!(b.build());
}

fn ctx_with_result(minutes: u64, result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract_id())
        .predecessor_account_id(contract_id())
        .account_balance(NearToken::from_near(10))
        .block_timestamp(START + minutes * MINUTE);
    testing_env!(
        b.build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

fn at(who: AccountId, minutes: u64) {
    ctx(who, NearToken::from_yoctonear(0), minutes)
}

/// A contract with UNILAG, LASU and Sparks Electrical on the verified list.
fn setup() -> Contract {
    at(acc("deployer.testnet"), 0);
    let mut c = Contract::new(token(), registry(), "tUSD".into(), 6);
    at(registry(), 0);
    c.add_payee(unilag(), "University of Lagos".into(), PayeeKind::School, "https://unilag.example/pay".into());
    c.add_payee(lasu(), "Lagos State University".into(), PayeeKind::School, "https://lasu.example/pay".into());
    c.add_payee(sparks(), "Sparks Electrical".into(), PayeeKind::Vendor, "https://sparks.example".into());
    c
}

fn pocket(amount: u128) -> Option<FreePart> {
    Some(FreePart { label: "Pocket money".into(), amount: U128(amount), to: tolu() })
}

/// A simple Personal pot for one payee, no free part.
fn simple(c: &mut Contract, payee: AccountId, releaser: AccountId) -> u64 {
    c.create_pot(PotKind::Personal, "Fees".into(), vec![payee], "".into(), releaser, U128(D), 60, None, None)
}

fn new_family_pot(c: &mut Contract) -> u64 {
    ctx(mum(), NearToken::from_near(1), 0);
    c.create_pot(
        PotKind::Personal,
        "Tolu's 2026/27 fees".into(),
        vec![unilag()],
        "MAT/2024/0193".into(),
        tolu(),
        U128(300 * D),
        60,
        None,
        pocket(50 * D),
    )
}

fn new_street_pot(c: &mut Contract) -> u64 {
    ctx(chairman(), NearToken::from_near(1), 0);
    c.create_pot(
        PotKind::Group,
        "Adeyemi Street transformer repair".into(),
        vec![sparks()],
        "Job 114".into(),
        street_dao(),
        U128(200 * D),
        60,
        None,
        None,
    )
}

/// Sends money into a pot the way the token does after `ft_transfer_call`.
/// Returns the part handed back to the sender.
fn add(c: &mut Contract, pot_id: u64, from: AccountId, amount: u128, part: &str, minutes: u64) -> u128 {
    at(token(), minutes);
    let msg = format!(r#"{{"pot_id":{pot_id},"part":"{part}"}}"#);
    match c.ft_on_transfer(from, U128(amount), msg) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("expected a value"),
    }
}

/// The pot's payee asks to be paid, as a school bills a student.
fn bill(c: &mut Contract, pot_id: u64, payee: AccountId, amount: u128, minutes: u64) -> u32 {
    at(payee, minutes);
    c.request_payment(pot_id, U128(amount), "Session fees".into())
}

/// Funds the family pot as in the demo: Mum 200 fees + 50 pocket, Uncle Femi 100.
fn funded_family_pot(c: &mut Contract) -> u64 {
    let id = new_family_pot(c);
    assert_eq!(add(c, id, mum(), 200 * D, "purpose", 1), 0);
    assert_eq!(add(c, id, mum(), 50 * D, "free", 1), 0);
    assert_eq!(add(c, id, uncle(), 100 * D, "purpose", 2), 0);
    assert_eq!(bill(c, id, unilag(), 280 * D, 3), 0);
    id
}

/// Funds the street pot to its 200 target: five residents, 40 each.
fn funded_street_pot(c: &mut Contract) -> u64 {
    let id = new_street_pot(c);
    for i in 1..=5 {
        assert_eq!(add(c, id, resident(i), 40 * D, "purpose", 1), 0);
    }
    assert_eq!(bill(c, id, sparks(), 100 * D, 2), 0);
    assert_eq!(bill(c, id, sparks(), 80 * D, 2), 1);
    id
}

fn refusal(c: &Contract, pot_id: u64, caller: AccountId, to: AccountId, amount: u128) -> Option<String> {
    c.why_refused(pot_id, caller, to, U128(amount))
}

/// The money the contract says it holds always equals the sum held by pots.
fn assert_books_balance(c: &Contract) {
    let pots = c.get_pots(Some(0), Some(50));
    let sum: u128 = pots.iter().map(|p| p.held.0).sum();
    assert_eq!(c.get_totals().held.0, sum, "total held must equal the pots' money");
    for p in &pots {
        assert_eq!(p.raised.0, p.paid.0 + p.refunded.0 + p.held.0);
        let contributed: u128 = p.contributions.iter().map(|x| x.amount.0).sum();
        assert_eq!(contributed, p.raised.0);
    }
}

fn logged(event_name: &str) -> bool {
    get_logs()
        .iter()
        .any(|l| l.starts_with("EVENT_JSON:") && l.contains(&format!("\"event\":\"{event_name}\"")))
}

// ------------------------------------------------------------------ registry

#[test]
fn only_the_registry_dao_can_add_schools() {
    let mut c = setup();
    at(mum(), 0);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.add_payee(fake_school(), "Fake".into(), PayeeKind::School, "https://fake.example".into())
    }));
    assert!(r.is_err());
    assert!(!c.is_verified(fake_school()));
    assert_eq!(c.get_payees(None, None).len(), 3);
}

#[test]
#[should_panic(expected = "Only the registry DAO can change the verified list")]
fn only_the_registry_dao_can_remove_schools() {
    let mut c = setup();
    at(tolu(), 0);
    c.remove_payee(unilag());
}

#[test]
fn registry_changes_are_logged() {
    let mut c = setup();
    assert!(logged("payee_added"));
    at(registry(), 1);
    c.remove_payee(lasu());
    assert!(logged("payee_removed"));
    assert!(!c.is_verified(lasu()));
}

// --------------------------------------------------------------- create_pot

#[test]
fn creating_a_pot_records_its_rules() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    assert_eq!(id, 0);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.kind, PotKind::Personal);
    assert_eq!(p.payees.len(), 1);
    assert_eq!(p.payees[0].account_id, unilag());
    assert_eq!(p.payees[0].name.as_deref(), Some("University of Lagos"));
    assert!(p.payees[0].verified);
    assert_eq!(p.releaser, tolu());
    assert_eq!(p.target.0, 300 * D);
    assert_eq!(p.free_label, "Pocket money");
    assert_eq!(p.free_to, Some(tolu()));
    assert_eq!(p.free_target.0, 50 * D);
    assert!(!p.all_or_nothing);
    assert_eq!(p.deadline_ns, (START + 60 * MINUTE).to_string());
    assert!(logged("pot_created"));
}

#[test]
#[should_panic(expected = "unilag-fees.testnet is not on the verified list")]
fn a_pot_cannot_name_an_unverified_school() {
    let mut c = setup();
    ctx(mum(), NearToken::from_near(1), 0);
    simple(&mut c, fake_school(), tolu());
}

#[test]
#[should_panic(expected = "cannot also be a payee")]
fn the_releaser_cannot_be_the_payee() {
    let mut c = setup();
    ctx(mum(), NearToken::from_near(1), 0);
    simple(&mut c, unilag(), unilag());
}

#[test]
#[should_panic(expected = "The free part cannot go to a payee")]
fn the_free_part_cannot_go_to_a_payee() {
    let mut c = setup();
    ctx(mum(), NearToken::from_near(1), 0);
    let free = Some(FreePart { label: "Extra".into(), amount: U128(D), to: unilag() });
    c.create_pot(PotKind::Personal, "Fees".into(), vec![unilag()], "".into(), tolu(), U128(D), 60, None, free);
}

#[test]
#[should_panic(expected = "Attach at least")]
fn creating_a_pot_needs_a_storage_deposit() {
    let mut c = setup();
    ctx(mum(), NearToken::from_yoctonear(0), 0);
    simple(&mut c, unilag(), tolu());
}

#[test]
#[should_panic(expected = "The deadline must be between")]
fn the_deadline_must_be_sensible() {
    let mut c = setup();
    ctx(mum(), NearToken::from_near(1), 0);
    c.create_pot(PotKind::Personal, "Fees".into(), vec![unilag()], "".into(), tolu(), U128(D), 1, None, None);
}

// ------------------------------------------------------------- adding money

#[test]
#[should_panic(expected = "This contract only accepts its own stablecoin")]
fn only_our_stablecoin_is_accepted() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    at(acc("other-token.testnet"), 1);
    let _ = c.ft_on_transfer(mum(), U128(D), format!(r#"{{"pot_id":{id}}}"#));
}

#[test]
fn every_contribution_is_recorded_and_capped_at_the_target() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    assert_eq!(add(&mut c, id, mum(), 200 * D, "purpose", 1), 0);
    assert_eq!(add(&mut c, id, uncle(), 100 * D, "purpose", 2), 0);
    // The pot is full, and a bigger gift is handed back in part.
    let id2 = new_family_pot(&mut c);
    assert_eq!(add(&mut c, id2, mum(), 350 * D, "purpose", 1), 50 * D);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.raised.0, 300 * D);
    assert_eq!(p.contributions.len(), 2);
    assert_eq!(p.contributions[0].account_id, mum());
    assert_eq!(p.contributions[0].amount.0, 200 * D);
    assert!(logged("contributed"));
    assert_books_balance(&c);
}

#[test]
fn a_repeat_contributor_is_counted_once() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    add(&mut c, id, mum(), 100 * D, "purpose", 1);
    add(&mut c, id, mum(), 50 * D, "purpose", 2);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.contributions.len(), 1);
    assert_eq!(p.contributions[0].amount.0, 150 * D);
}

#[test]
#[should_panic(expected = "already reached its target")]
fn a_full_pot_takes_no_more_fees() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    add(&mut c, id, uncle(), D, "purpose", 3);
}

#[test]
#[should_panic(expected = "the most contributors it can take")]
fn a_pot_has_a_contributor_limit() {
    let mut c = setup();
    let id = new_street_pot(&mut c);
    for i in 0..=MAX_CONTRIBUTORS {
        add(&mut c, id, resident(i), D, "purpose", 1);
    }
}

#[test]
#[should_panic(expected = "deadline has passed")]
fn no_money_can_be_added_after_the_deadline() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    add(&mut c, id, mum(), D, "purpose", 61);
}

#[test]
fn the_free_part_goes_straight_to_the_named_person() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    assert_eq!(add(&mut c, id, mum(), 30 * D, "free", 1), 0);
    // Only 20 more fits; 15 of the 35 is handed back.
    assert_eq!(add(&mut c, id, uncle(), 35 * D, "free", 2), 15 * D);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.free_sent.0, 50 * D);
    assert_eq!(p.raised.0, 0, "the free part is not purpose money");
    assert_eq!(c.get_totals().held.0, 0, "the free part is not held");
    assert!(logged("free_part_sent"));
}

#[test]
#[should_panic(expected = "This pot has no free part")]
fn a_pot_without_a_free_part_takes_none() {
    let mut c = setup();
    let id = new_street_pot(&mut c);
    add(&mut c, id, resident(1), D, "free", 1);
}

#[test]
#[should_panic(expected = "msg must look like")]
fn a_bad_message_is_refused_so_the_token_refunds_it() {
    let mut c = setup();
    new_family_pot(&mut c);
    at(token(), 1);
    let _ = c.ft_on_transfer(mum(), U128(D), "hello".into());
}

// ------------------------------------------- the family story and its cheats

#[test]
fn tolu_cannot_send_the_fees_to_himself() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    let why = refusal(&c, id, tolu(), tolu(), 280 * D).unwrap();
    assert_eq!(
        why,
        "This money cannot go to tolu.testnet. This pot pays only unilag.schools.testnet."
    );
}

#[test]
#[should_panic(expected = "This money cannot go to tolu.testnet")]
fn tolu_cannot_send_the_fees_to_himself_for_real() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_to(id, tolu(), U128(280 * D));
}

#[test]
#[should_panic(expected = "unilag-fees.testnet is not on the verified list. This pot pays only unilag.schools.testnet.")]
fn tolu_cannot_pay_a_lookalike_school() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_to(id, fake_school(), U128(280 * D));
}

#[test]
#[should_panic(expected = "This pot pays only unilag.schools.testnet.")]
fn tolu_cannot_pay_a_different_real_school() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_to(id, lasu(), U128(280 * D));
}

#[test]
#[should_panic(expected = "Only tolu.testnet can pay from this pot.")]
fn mum_cannot_take_the_fees_back_before_the_deadline() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(mum(), 5);
    let _ = c.pay_to(id, unilag(), U128(280 * D));
}

#[test]
fn tolu_pays_the_real_school() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    assert_eq!(refusal(&c, id, tolu(), unilag(), 280 * D), None);
    at(tolu(), 5);
    let _ = c.pay_to(id, unilag(), U128(280 * D));
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.paid.0, 280 * D);
    assert_eq!(p.held.0, 20 * D);
    assert_eq!(p.payments.len(), 1);
    assert!(!p.payments[0].confirmed);
    assert_eq!(c.get_totals().held.0, 20 * D);
    assert!(logged("paid"));
    assert_books_balance(&c);
}

#[test]
fn payments_can_come_in_parts() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    bill(&mut c, id, unilag(), 100 * D, 4);
    bill(&mut c, id, unilag(), 180 * D, 4);
    at(tolu(), 5);
    let _ = c.pay_to(id, unilag(), U128(100 * D));
    at(tolu(), 6);
    let _ = c.pay_to(id, unilag(), U128(180 * D));
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.payments.len(), 2);
    assert_eq!(p.held.0, 20 * D);
}

#[test]
#[should_panic(expected = "Only 20 tUSD is left in this pot.")]
fn nobody_can_pay_more_than_the_pot_holds() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_to(id, unilag(), U128(280 * D));
    at(tolu(), 6);
    let _ = c.pay_to(id, unilag(), U128(21 * D));
}

#[test]
#[should_panic(expected = "The deadline has passed")]
fn nobody_can_pay_after_the_deadline() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 61);
    let _ = c.pay_to(id, unilag(), U128(D));
}

#[test]
fn the_school_confirms_a_payment() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_to(id, unilag(), U128(280 * D));
    at(unilag(), 6);
    c.confirm_payment(id, 0);
    assert!(c.get_pot(id).unwrap().payments[0].confirmed);
    assert!(logged("payment_confirmed"));
}

#[test]
#[should_panic(expected = "Only the payee that was paid can confirm a payment")]
fn only_the_school_can_confirm() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_to(id, unilag(), U128(280 * D));
    at(tolu(), 6);
    c.confirm_payment(id, 0);
}

// ------------------------------------------------------- deadline and refunds

#[test]
#[should_panic(expected = "Money goes back only after the deadline")]
fn nobody_can_settle_before_the_deadline() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(mum(), 30);
    c.settle(id);
}

#[test]
fn leftover_fees_go_back_in_proportion_after_the_deadline() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_to(id, unilag(), U128(280 * D));
    // Anyone can press settle once the deadline has passed.
    at(acc("anyone.testnet"), 61);
    c.settle(id);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.status, PotStatus::Settled);
    assert_eq!(p.refunded.0, 20 * D);
    assert_eq!(p.held.0, 0);
    assert_eq!(c.get_totals().held.0, 0);
    let logs = get_logs().join("\n");
    // Mum gave 200 of 300, Uncle Femi 100 of 300: 13.333333 and 6.666667.
    assert!(logs.contains(r#""to":"mum.testnet","amount":"13333333""#));
    assert!(logs.contains(r#""to":"uncle-femi.testnet","amount":"6666667""#));
    assert_books_balance(&c);
}

#[test]
#[should_panic(expected = "This pot is already settled.")]
fn a_pot_settles_only_once() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(mum(), 61);
    c.settle(id);
    c.settle(id);
}

#[test]
fn nothing_can_be_paid_from_a_settled_pot() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(mum(), 61);
    c.settle(id);
    let why = refusal(&c, id, tolu(), unilag(), D).unwrap();
    assert!(why.starts_with("This pot is settled"));
}

#[test]
fn shares_always_add_up_exactly() {
    let people: Vec<(AccountId, u128)> = (1..=7).map(|i| (resident(i), (i as u128) * 3 * D + 1)).collect();
    let raised: u128 = people.iter().map(|p| p.1).sum();
    for remaining in [0, 1, 7, 13 * D + 5, raised - 1, raised] {
        let shares = pro_rata(remaining, raised, &people);
        let total: u128 = shares.iter().map(|s| s.1).sum();
        assert_eq!(total, remaining);
        // Nobody gets back more than they put in.
        for (s, p) in shares.iter().zip(&people) {
            assert!(s.1 <= p.1, "{} got {} but gave {}", s.0, s.1, p.1);
        }
    }
}

// --------------------------------------------------------- school removed

#[test]
fn if_the_school_is_removed_contributors_get_refunds_at_once() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(registry(), 3);
    c.remove_payee(unilag());
    let why = refusal(&c, id, tolu(), unilag(), D).unwrap();
    assert!(why.contains("was removed from the verified list"));
    // No waiting for the deadline.
    at(uncle(), 4);
    c.settle(id);
    assert_eq!(c.get_pot(id).unwrap().refunded.0, 300 * D);
    assert!(get_logs().join("").contains(r#""reason":"payee_removed""#));
    assert_books_balance(&c);
}

#[test]
#[should_panic(expected = "no longer verified")]
fn a_pot_whose_school_was_removed_takes_no_money() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    at(registry(), 1);
    c.remove_payee(unilag());
    add(&mut c, id, mum(), D, "purpose", 2);
}

// ------------------------------------------ the street story and its cheats

#[test]
#[should_panic(expected = "Only a vote of adeyemi-street.sputnikv2.testnet can release this pot.")]
fn the_chairman_cannot_pay_out_directly() {
    let mut c = setup();
    let id = funded_street_pot(&mut c);
    at(chairman(), 5);
    let _ = c.pay_to(id, chairman(), U128(200 * D));
}

#[test]
#[should_panic(expected = "This money cannot go to chairman.testnet. This pot pays only sparks.vendors.testnet.")]
fn even_a_passed_vote_cannot_pay_the_chairman() {
    let mut c = setup();
    let id = funded_street_pot(&mut c);
    // The DAO executes a proposal that passed. The contract still refuses.
    at(street_dao(), 5);
    let _ = c.pay_to(id, chairman(), U128(200 * D));
}

#[test]
#[should_panic(expected = "resident1.testnet is not on the verified list. This pot pays only sparks.vendors.testnet.")]
fn even_a_passed_vote_cannot_pay_a_resident() {
    let mut c = setup();
    let id = funded_street_pot(&mut c);
    at(street_dao(), 5);
    let _ = c.pay_to(id, resident(1), U128(200 * D));
}

#[test]
#[should_panic(expected = "Nothing can be paid until the target is reached: 120 of 200 tUSD raised so far.")]
fn a_community_pot_pays_nothing_before_its_target() {
    let mut c = setup();
    let id = new_street_pot(&mut c);
    for i in 1..=3 {
        add(&mut c, id, resident(i), 40 * D, "purpose", 1);
    }
    at(street_dao(), 5);
    let _ = c.pay_to(id, sparks(), U128(100 * D));
}

#[test]
fn the_residents_vote_pays_the_electrician_in_stages() {
    let mut c = setup();
    let id = funded_street_pot(&mut c);
    let p = c.get_pot(id).unwrap();
    assert!(p.all_or_nothing);
    // Stage 1: half, to buy parts.
    at(street_dao(), 5);
    let _ = c.pay_to(id, sparks(), U128(100 * D));
    // Stage 2: once the light is back.
    at(street_dao(), 30);
    let _ = c.pay_to(id, sparks(), U128(80 * D));
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.paid.0, 180 * D);
    assert_eq!(p.payments.len(), 2);
    // The leftover 20 goes back, 4 to each resident.
    at(resident(3), 61);
    c.settle(id);
    let logs = get_logs().join("\n");
    for i in 1..=5 {
        assert!(logs.contains(&format!(r#""to":"resident{i}.testnet","amount":"4000000""#)));
    }
    assert_books_balance(&c);
}

#[test]
fn if_the_target_is_missed_everyone_gets_everything_back() {
    let mut c = setup();
    let id = new_street_pot(&mut c);
    add(&mut c, id, resident(1), 40 * D, "purpose", 1);
    add(&mut c, id, resident(2), 25 * D, "purpose", 1);
    at(resident(2), 61);
    c.settle(id);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.paid.0, 0);
    assert_eq!(p.refunded.0, 65 * D);
    let logs = get_logs().join("\n");
    assert!(logs.contains(r#""to":"resident1.testnet","amount":"40000000""#));
    assert!(logs.contains(r#""to":"resident2.testnet","amount":"25000000""#));
    assert_books_balance(&c);
}

// ---------------------------------------------------- failed transfers, owed

#[test]
fn a_failed_transfer_is_recorded_as_owed_and_can_be_collected() {
    let mut c = setup();
    ctx_with_result(5, PromiseResult::Failed);
    assert!(!c.on_sent(uncle(), U128(7 * D)));
    assert_eq!(c.get_owed(uncle()).0, 7 * D);
    assert_eq!(c.get_totals().owed.0, 7 * D);
    assert!(logged("owed"));

    at(uncle(), 6);
    let _ = c.withdraw_owed();
    assert_eq!(c.get_owed(uncle()).0, 0);
    assert_eq!(c.get_totals().owed.0, 0);
}

#[test]
fn a_successful_transfer_owes_nothing() {
    let mut c = setup();
    ctx_with_result(5, PromiseResult::Successful(vec![]));
    assert!(c.on_sent(uncle(), U128(7 * D)));
    assert_eq!(c.get_owed(uncle()).0, 0);
}

#[test]
#[should_panic(expected = "Nothing is owed to this account")]
fn nobody_can_withdraw_what_is_not_owed() {
    let mut c = setup();
    at(tolu(), 1);
    let _ = c.withdraw_owed();
}

// ----------------------------------------------------------------- views

#[test]
fn the_website_can_ask_why_without_a_transaction() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    assert_eq!(refusal(&c, id, tolu(), unilag(), 280 * D), None);
    assert!(refusal(&c, 99, tolu(), unilag(), D).is_none(), "unknown pot gives no verdict");
    assert!(refusal(&c, id, tolu(), lasu(), D).unwrap().contains("pays only"));
    assert!(refusal(&c, id, mum(), unilag(), D).unwrap().starts_with("Only tolu.testnet"));
}

#[test]
fn config_and_lists_are_readable() {
    let mut c = setup();
    new_family_pot(&mut c);
    new_street_pot(&mut c);
    let cfg = c.get_config();
    assert_eq!(cfg.token, token());
    assert_eq!(cfg.registry_dao, registry());
    assert_eq!(cfg.symbol, "tUSD");
    assert_eq!(cfg.decimals, 6);
    assert_eq!(c.get_pots(None, None).len(), 2);
    assert_eq!(c.get_pots(Some(1), Some(5))[0].kind, PotKind::Group);
    assert!(c.get_pot(7).is_none());
    assert_eq!(c.get_totals().pots, 2);
}

#[test]
fn amounts_are_written_in_plain_words() {
    assert_eq!(format_units(20 * D, 6), "20");
    assert_eq!(format_units(13_333_333, 6), "13.333333");
    assert_eq!(format_units(1, 6), "0.000001");
    assert_eq!(format_units(0, 6), "0");
    assert_eq!(format_units(1_500_000, 6), "1.5");
    assert_eq!(format_units(7, 0), "7");
}

#[test]
#[should_panic(expected = "The evidence must be an https link")]
fn a_school_cannot_be_listed_without_evidence() {
    let mut c = setup();
    at(registry(), 1);
    c.add_payee(fake_school(), "No evidence".into(), PayeeKind::School, "trust me".into());
}

#[test]
fn every_listed_school_shows_its_evidence() {
    let mut c = setup();
    let id = new_family_pot(&mut c);
    assert_eq!(c.get_pot(id).unwrap().payees[0].evidence.as_deref(), Some("https://unilag.example/pay"));
    assert!(c.get_payees(None, None).iter().all(|p| p.evidence.starts_with("https://")));
}

// ----------------------------------------------------------- payment requests

#[test]
fn nothing_leaves_without_a_request_from_the_payee() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    // The school asked for 280. Tolu cannot decide to send it 150 instead.
    let why = refusal(&c, id, tolu(), unilag(), 150 * D).unwrap();
    assert_eq!(
        why,
        "unilag.schools.testnet has not asked for 150 tUSD. Money leaves this pot only against a payment request from the payee."
    );
}

#[test]
fn tolu_pays_the_schools_bill_by_its_number() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_request(id, 0);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.requests[0].status, RequestStatus::Paid);
    assert_eq!(p.requests[0].note, "Session fees");
    assert_eq!(p.payments[0].request_id, 0);
    assert_eq!(p.paid.0, 280 * D);
    assert!(logged("paid"));
    assert_books_balance(&c);
}

#[test]
#[should_panic(expected = "This request is already paid.")]
fn a_bill_cannot_be_paid_twice() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 5);
    let _ = c.pay_request(id, 0);
    at(tolu(), 6);
    let _ = c.pay_request(id, 0);
}

#[test]
#[should_panic(expected = "Only unilag.schools.testnet can ask this pot for payment")]
fn only_the_payee_can_send_a_bill() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(tolu(), 4);
    c.request_payment(id, U128(10 * D), "For me".into());
}

#[test]
#[should_panic(expected = "Only tolu.testnet can pay from this pot.")]
fn only_the_releaser_can_pay_a_bill() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(unilag(), 5);
    let _ = c.pay_request(id, 0);
}

#[test]
#[should_panic(expected = "This request was cancelled.")]
fn a_cancelled_bill_cannot_be_paid() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(unilag(), 4);
    c.cancel_request(id, 0);
    at(tolu(), 5);
    let _ = c.pay_request(id, 0);
}

#[test]
fn the_street_votes_on_the_electricians_exact_requests() {
    let mut c = setup();
    let id = funded_street_pot(&mut c);
    // The vote cannot invent its own amount.
    assert!(refusal(&c, id, street_dao(), sparks(), 150 * D).unwrap().contains("has not asked for 150 tUSD"));
    at(street_dao(), 5);
    let _ = c.pay_request(id, 0);
    at(street_dao(), 6);
    let _ = c.pay_request(id, 1);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.paid.0, 180 * D);
    assert!(p.requests.iter().all(|r| r.status == RequestStatus::Paid));
}

#[test]
fn the_website_can_ask_why_a_refund_is_refused() {
    let mut c = setup();
    let id = funded_family_pot(&mut c);
    at(mum(), 10);
    assert!(c.why_refund_refused(id).unwrap().starts_with("Money goes back only after the deadline"));
    at(mum(), 61);
    assert_eq!(c.why_refund_refused(id), None);
}

// ------------------------------------------------- several payees, any purpose

fn hospital() -> AccountId {
    acc("lagoonheights.hospitals.testnet")
}
fn pharmacy() -> AccountId {
    acc("cornercare.pharmacy.testnet")
}
fn ngozi_family() -> AccountId {
    acc("ngozi-family.testnet")
}
fn organiser() -> AccountId {
    acc("emeka.testnet")
}

/// A public appeal: the hospital and a pharmacy can be paid, and 80 is a free
/// "Food and transport" part for the family. Nothing is paid unless 500 is raised.
fn appeal(c: &mut Contract) -> u64 {
    at(registry(), 0);
    c.add_payee(hospital(), "Lagoon Heights Hospital".into(), PayeeKind::Hospital, "https://lagoonheights.example/pay".into());
    c.add_payee(pharmacy(), "Corner Care Pharmacy".into(), PayeeKind::Vendor, "https://cornercare.example".into());
    ctx(organiser(), NearToken::from_near(1), 0);
    let free = Some(FreePart { label: "Food and transport".into(), amount: U128(80 * D), to: ngozi_family() });
    c.create_pot(
        PotKind::Personal,
        "Mama Ngozi's surgery".into(),
        vec![hospital(), pharmacy()],
        "Patient 2219".into(),
        organiser(),
        U128(500 * D),
        60,
        Some(true),
        free,
    )
}

#[test]
fn an_appeal_can_name_a_hospital_and_a_pharmacy() {
    let mut c = setup();
    let id = appeal(&mut c);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.payees.len(), 2);
    assert!(p.all_or_nothing);
    assert_eq!(p.free_label, "Food and transport");
    for i in 1..=5 {
        add(&mut c, id, resident(i), 100 * D, "purpose", 1);
    }
    add(&mut c, id, resident(1), 80 * D, "free", 1);
    bill(&mut c, id, hospital(), 380 * D, 2);
    bill(&mut c, id, pharmacy(), 70 * D, 2);
    at(organiser(), 3);
    let _ = c.pay_request(id, 0);
    at(organiser(), 4);
    let _ = c.pay_request(id, 1);
    let p = c.get_pot(id).unwrap();
    assert_eq!(p.paid.0, 450 * D);
    assert_eq!(p.payments[0].to, hospital());
    assert_eq!(p.payments[1].to, pharmacy());
    assert_eq!(p.free_sent.0, 80 * D);
    assert_books_balance(&c);
}

#[test]
fn the_organiser_cannot_take_the_donations() {
    let mut c = setup();
    let id = appeal(&mut c);
    for i in 1..=5 {
        add(&mut c, id, resident(i), 100 * D, "purpose", 1);
    }
    let why = refusal(&c, id, organiser(), organiser(), 500 * D).unwrap();
    assert_eq!(
        why,
        "This money cannot go to emeka.testnet. This pot pays only lagoonheights.hospitals.testnet or cornercare.pharmacy.testnet."
    );
    // The family can't redirect purpose money to themselves either.
    let why = refusal(&c, id, organiser(), ngozi_family(), 100 * D).unwrap();
    assert!(why.starts_with("This money cannot go to ngozi-family.testnet"));
}

#[test]
fn an_appeal_that_falls_short_pays_nobody() {
    let mut c = setup();
    let id = appeal(&mut c);
    add(&mut c, id, resident(1), 100 * D, "purpose", 1);
    bill(&mut c, id, hospital(), 100 * D, 2);
    let why = refusal(&c, id, organiser(), hospital(), 100 * D).unwrap();
    assert!(why.starts_with("Nothing can be paid until the target is reached: 100 of 500 tUSD"));
}

#[test]
fn each_payee_is_paid_only_its_own_requests() {
    let mut c = setup();
    let id = appeal(&mut c);
    for i in 1..=5 {
        add(&mut c, id, resident(i), 100 * D, "purpose", 1);
    }
    bill(&mut c, id, hospital(), 380 * D, 2);
    // The pharmacy never asked for 380, so the hospital's bill can't be paid to it.
    let why = refusal(&c, id, organiser(), pharmacy(), 380 * D).unwrap();
    assert!(why.starts_with("cornercare.pharmacy.testnet has not asked for 380 tUSD"));
    assert_eq!(refusal(&c, id, organiser(), hospital(), 380 * D), None);
}

#[test]
#[should_panic(expected = "Only the payee that was paid can confirm a payment")]
fn only_the_payee_that_was_paid_can_confirm() {
    let mut c = setup();
    let id = appeal(&mut c);
    for i in 1..=5 {
        add(&mut c, id, resident(i), 100 * D, "purpose", 1);
    }
    bill(&mut c, id, hospital(), 380 * D, 2);
    at(organiser(), 3);
    let _ = c.pay_request(id, 0);
    at(pharmacy(), 4);
    c.confirm_payment(id, 0);
}

#[test]
fn removing_one_payee_keeps_the_others_and_holds_refunds() {
    let mut c = setup();
    let id = appeal(&mut c);
    for i in 1..=5 {
        add(&mut c, id, resident(i), 100 * D, "purpose", 1);
    }
    at(registry(), 2);
    c.remove_payee(pharmacy());
    bill(&mut c, id, hospital(), 380 * D, 3);
    assert_eq!(refusal(&c, id, organiser(), hospital(), 380 * D), None);
    assert!(c.why_refund_refused(id).is_some(), "the hospital can still be paid, so no early refund");
    at(registry(), 4);
    c.remove_payee(hospital());
    assert_eq!(c.why_refund_refused(id), None, "with every payee gone, givers can take their money back");
}

#[test]
#[should_panic(expected = "A pot names one to three payees")]
fn a_pot_names_at_most_three_payees() {
    let mut c = setup();
    let id_list = vec![unilag(), lasu(), sparks(), fake_school()];
    ctx(mum(), NearToken::from_near(1), 0);
    c.create_pot(PotKind::Personal, "Too many".into(), id_list, "".into(), tolu(), U128(D), 60, None, None);
}

#[test]
#[should_panic(expected = "is named twice")]
fn a_payee_cannot_be_named_twice() {
    let mut c = setup();
    ctx(mum(), NearToken::from_near(1), 0);
    c.create_pot(PotKind::Personal, "Twice".into(), vec![unilag(), unilag()], "".into(), tolu(), U128(D), 60, None, None);
}
