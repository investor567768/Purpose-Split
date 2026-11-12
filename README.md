# Purpose Split

**Money with rules.**

Parents send school fees. The money can only pay the school, and the student gets a pass that proves it.

Purpose Split is a money box on NEAR. Money raised for a purpose can only reach the payees named on the box, only against their own bills. When a payee confirms it was paid, the contract issues a pass that anyone can check. Whatever isn't used goes back to everyone who gave.

**Try it:** [purpose-split-web.vercel.app](https://purpose-split-web.vercel.app) (NEAR testnet, test dollars with no value)

## Why it fits the two tracks

**Social Money: coordinate value together.** A money box is a shared budget with rules. Families and neighbours put money in together, and a **Sputnik DAO** decides what only a group should decide: the street's neighbours vote to pay the electrician, and the school-list council votes payees onto the verified list. Everyone is a **named account** (`llu.purposesplit.testnet`, not `0x7a3f…`), and a pass gives reputation-based access: proof of paid fees that an exam hall or a hostel gate can check.

**Real-World Money: bring the boring money onchain.** It is money sent home for a purpose (Nigerians abroad sent about $22.8 billion in 2025), paid only against **invoices** the payee sends, with a status anyone can trust (billed → paid → confirmed, each with a transaction link) and a **CSV export** for every box that a bursar or a family can open in a spreadsheet. The money is a standard NEAR token (NEP-141), so a stablecoin such as USDC drops in where the test dollars are now.

## The problem

Nigerians abroad sent home about **$22.8 billion in 2025**, according to World Bank data ([Intelpoint](https://intelpoint.co/insights/personal-remittance-inflows-to-nigeria-increased-3-0-year-on-year-from-22-1-billion-in-2024-to-22-8-billion-in-2025/)). Families often send it for something specific: school fees, rent, a hospital bill. But when you send money for a purpose, you lose control of it the moment it lands. You can only hope.

That gets worse when several people give. Relatives, some abroad, chip in for a student's school fees, and it all sits in one person's account. Neighbours collect for a broken transformer, and the money sits with the chairman. Strangers give to a surgery appeal on WhatsApp, and nobody can tell whether it reaches the hospital.

## How it works

1. **Give.** Anyone adds money to a money box made for one purpose.
2. **Bill.** Only the payees named on the box (a school, a hospital, an electrician) can send it a bill. They are on a verified list, each with a link to where they publish their own account.
3. **Pay.** The person or group named on the box pays the bill. The money can't go anywhere else: not to the person pressing pay, not to a lookalike account, not to a different payee.
4. **Pass.** When the payee confirms the money arrived, the contract gives the payer a pass: a student's says "Fees paid". Nobody can make one any other way, and it can't be sold or lent. Anyone can check it on the website's "Check a pass" page, or read it as a standard NEAR token (NEP-171).
5. **Return.** After the deadline, whatever is left goes back to each giver, in proportion to what they gave.

One box can pay up to three payees, each only against its own bills: a student's school year can pay the school for fees, a bookshop for books and a hostel for rent. An optional, labelled free part covers costs nobody can bill, such as pocket money or food and transport, and is shown to givers before they give.

## For example

| | School fees | Street fund | Medical appeal |
|---|---|---|---|
| Who gives | The family, including relatives abroad | The neighbours | Anyone with the link |
| Who can be paid | The school | The electrician | The hospital and the pharmacy |
| Who presses pay | The student | The neighbours, by Sputnik DAO vote | The organiser |
| Unused money | Back to each giver | Back to each giver | Back to each giver |

These are examples. The same rules work for any purpose with a named payee: rent, a wedding, a funeral, a group purchase.

## Try it yourself (no wallet needed for the first three)

1. **Try to cheat.** Open the [homepage](https://purpose-split-web.vercel.app), choose "The student" and "A betting site", press **Try it** → *Refused: "A betting site is not on the verified list. This money box pays only Lagos Lagoon University."* The answer comes from the contract's own `why_refused` view, live.
2. **Check a pass.** Menu → **Check a pass** → `tolu.purposesplit.testnet` → *a "Fees paid: Lagos Lagoon University" pass, 280 tUSD, confirmed by the school.*
3. **See a vote.** Menu → **Payees** → *the verified list held by `purposesplit-council.sputnik-v2.testnet`, and proposal 0 to add Unity Hall Caterers, waiting for its second councillor.*
4. **Do it for real.** Sign in with a testnet wallet (Meteor or MyNearWallet), press **Get 500 test dollars** on **How to try it**, start a money box naming Lagos Lagoon University, give to it, then use **Play Lagos Lagoon University** to send a bill, pay it, and confirm it. Menu → **Check a pass** → your account → *your own "Fees paid" pass.*
5. **Keep the records.** On any box, press **Download for your records (CSV)** → *every gift, bill, payment and confirmation, with dates and amounts.*

## Check every claim yourself

| Claim | How to check |
|---|---|
| The money can only reach the payees on the box | "Try to cheat" on any open box; the 20 refused attempts in `proof/demo-dev.json`, each with its transaction |
| Only a vote of the street can pay from the street's box | Box 4's "Who presses pay" is `adeyemi-street.sputnik-v2.testnet`; in the test run the chairman's direct attempt is refused, and even a passed vote that tries to pay the chairman is refused by the contract |
| Nobody adds a payee alone | `get_config().registry_dao` is `purposesplit-council.sputnik-v2.testnet`; the deployer's attempt after the handover is refused in the test run |
| A pass cannot be faked, sold or lent | Tolu confirming his own payment and Tolu giving his pass away are both refused in the test run; `nft_transfer` always refuses |
| The books balance | The test run ends with the contract's token balance equal to what its boxes hold plus what it owes |
| Every rule has a test | `cargo test`: 88 tests |

## Status (11 Nov)

- The money box contract and the test-dollar token: 88 tests covering every rule, every cheating attempt, the pass and the handover to the council.
- The two Sputnik DAOs are live, made with NEAR's own DAO factory: the school-list council ([`purposesplit-council.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/purposesplit-council.sputnik-v2.testnet)), with one real person on it, and the street ([`adeyemi-street.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/adeyemi-street.sputnik-v2.testnet)), with five neighbours.
- The full test run on the practice contract (`pots-dev7.purposesplit.testnet`): 85 steps, all 20 cheating attempts refused, real DAO proposals and votes, and the books balance. Every step and its transaction is in `proof/demo-dev.json` and on the website's Proof page.
- The website is live: wallet sign-in, "Try to cheat" against the real contract, example money boxes, starting your own, the Payees page (bills, verified list, council votes, proposing a payee), passes and CSV records.
- Next: deploy the final contract and lock it by deleting its keys, so nobody can change the rules.

## Try it from the command line

```bash
cargo test                      # 88 tests: every rule, every cheat, the pass, the handover
cd scripts && npm install
./build.sh                      # builds both contracts into build/
node daos.mjs                   # the two Sputnik DAOs (already made; safe to run again)
node demo.mjs dev               # the three stories on testnet, with real DAO votes (needs testnet keys)
```

## Layout

```
contract/     the pot contract (Rust, near-sdk 5.30) and its tests
test-token/   test dollars (tUSD), a standard NEAR token with a "get test dollars" button
scripts/      build, deploy and demo scripts for testnet
proof/        transaction links from demo runs
```

## Honest limitations

- **Test dollars only.** A real launch would use USDC on NEAR and a naira on-ramp.
- **The payees are made up.** No school in Nigeria has a NEAR account today, so the schools, hospital, pharmacy, electrician and people in the demo are invented, and their evidence links use the reserved `.example` domain. The rules, the votes and the money movements are real.
- **One council seat is held by the build,** so the test run can cast the first vote. The second seat is a real person's wallet, and the build holds no key for it, so nothing passes without that person's vote.
- **Not audited.** Built and tested in a hackathon.
- **Not built yet:** paying in from any chain through NEAR Intents (relatives abroad paying in what they already hold), and gasless confirmations for payees through meta transactions. Both fit; neither is here yet.

## Built with

Written during the NEAR Hackathon, November 2026. Uses near-sdk and near-contract-standards (NEP-141, NEP-145, NEP-171, NEP-297), Sputnik DAO through NEAR's DAO factory, near-api-js, NEAR Wallet Selector, and the Archivo font (SIL Open Font License).

License: MIT
