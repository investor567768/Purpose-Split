# Purpose Split

**Money with rules.**

Parents send school fees. The money can only pay the school, and the student gets a pass that proves it.

Purpose Split is a money box on NEAR. Money raised for a purpose can only reach the payees named on the box, only against their own bills. When a payee confirms it was paid, the contract issues a pass: an NFT nobody can buy, fake or move, which exists only because the school confirmed the fees were paid. Whatever isn't used goes back to everyone who gave. The contract is also ready to receive gifts through NEAR Intents and credit them to the real giver.

Every claim below can be checked against the live chain with one command, `node scripts/verify.mjs`, which needs no keys and no wallet.

**Try it:** [purpose-split-web.vercel.app](https://purpose-split-web.vercel.app) (NEAR testnet, test dollars with no value)

## The problem

**When you send money for a purpose, you can't make sure it's spent on that purpose.**

Nigerians abroad sent home about **$22.8 billion in 2025**, according to World Bank data ([Intelpoint](https://intelpoint.co/insights/personal-remittance-inflows-to-nigeria-increased-3-0-year-on-year-from-22-1-billion-in-2024-to-22-8-billion-in-2025/)). Families often send it for something specific: school fees, rent, a hospital bill. But when you send money for a purpose, you lose control of it the moment it lands. You can only hope.

That gets worse when several people give. Relatives, some abroad, chip in for a student's school fees, and it all sits in one person's account. Neighbours collect for a broken transformer, and the money sits with the chairman. Strangers give to a surgery appeal on WhatsApp, and nobody can tell whether it reaches the hospital.

People give out of goodwill, and that goodwill shouldn't be wasted by careless or dishonest handling. **With Purpose Split, nobody has to be trusted with the money: the rules decide where it can go.**

## Why use Purpose Split

| What people do today | What goes wrong | With a money box |
|---|---|---|
| Send the fees to the student, or to one relative | The money can be spent on anything: betting, trading, a loan to a friend | It can only pay the school, and only the amount the school billed |
| Collect in one person's account (the chairman, the organiser) | Everyone has to trust that one person, and nobody can see where it went | No person holds it; the contract does. Every gift, bill and payment is public on the chain and shown on the box's page |
| Share a fundraising link on WhatsApp | Givers can't tell if the money reached the hospital | Only the hospital can be paid, and it must confirm, which creates a pass anyone can check |
| Use a multisig or a shared wallet | The signers can still agree to send it anywhere, or be talked into it | The contract has no way to send a box's money anywhere except its named payees, its stated free part (if it has one), or back to the givers |
| Ask for leftover money back | Someone has to work out shares and actually return it | After the deadline, anyone can trigger the refund, and the contract sends each giver their exact share |

In short: **givers stay in control after they send.** The money has one purpose, the payee has to bill and confirm, the student or patient gets proof, and whatever isn't used comes back.

## How it works

1. **Give.** Anyone adds money to a money box made for one purpose.
2. **Bill.** Only the payees named on the box (a school, a hospital, an electrician) can send it a bill. They are on a verified list, each with a link to where they publish their own account.
3. **Pay.** The person or group named on the box pays the bill. The money can't go anywhere else: not to the person pressing pay, not to a lookalike account, not to a different payee.
4. **Pass.** When the payee confirms the money arrived, the contract gives the payer a pass: a student's says "Fees paid". Nobody can make one any other way, and it can't be sold or lent. Anyone can check it on the website's "Check a pass" page, or read it as a standard NEAR token (NEP-171).
5. **Return.** Money that isn't used goes back to the people who gave it. After the deadline, anyone can press the refund button, without asking permission, and the contract pays everyone back their fair share. For example, if Mum gave 100 and an uncle gave 50, and 30 is left over, Mum gets 20 back and the uncle gets 10.

Unlike a shared account or a multisig, nobody can be talked into sending the money somewhere else. The contract has no function that moves a box's money anywhere except its named payees, its stated free part, or back to the givers.

One box can pay up to three payees, each only against its own bills: a student's school year can pay the school for fees, a bookshop for books and a hostel for rent. The contract also supports an optional, labelled free part for costs nobody can bill, such as pocket money, shown to givers before they give (box 6 has one); the website's "Start a box" form leaves it out to stay simple.

## How a payee gets on the verified list

A money box can only pay accounts on the verified list, so the list has to be trustworthy. Nobody adds to it alone.

1. **Anyone proposes a payee** on the website's Payees page: its name, its NEAR account, what it is (a school, a hospital, a vendor), and a link as evidence. They put down a small bond (0.1 NEAR), returned if the proposal passes.
2. **The evidence is a page the payee runs itself that shows this NEAR account.** It works like today, when a school, a hospital or a business prints its bank account on its own website so people pay the right place. Here the payee does the same with its NEAR account, for example on its payments page or its official social media.
3. **The payee council opens the link and checks the account matches,** then votes. The council is a Sputnik DAO (`purposesplit-council.sputnik-v2.testnet`). More than half of its members must say yes.
4. **When the vote passes, the DAO itself adds the payee** to the contract's list. Nobody else can: the contract refuses `add_payee` from any other account.

Removing works the same way, with "Propose removing" on the Payees page. If every payee on a box is removed, its givers can take their money back at once, without waiting for the deadline.

In this demo the payees are made up, so their evidence links use the reserved `.example` domain and don't open a real page.

## Why it fits its tracks

**Social Money: coordinate value together.** A money box is a shared budget with rules. Families and neighbours put money in together, and a **Sputnik DAO** decides what only a group should decide: the street's neighbours vote to pay the electrician, and the payee council votes payees onto the verified list. Everyone is a **named account** (`llu.purposesplit.testnet`, not `0x7a3f…`), and a pass gives reputation-based access: proof of paid fees that an exam hall or a hostel gate can check.

**Real-World Money: bring the boring money onchain.** It is money sent home for a purpose (Nigerians abroad sent about $22.8 billion in 2025), paid only against **invoices** the payee sends, with a status anyone can trust (billed → paid → confirmed, each with a transaction link) and a **CSV export** for every box that a bursar or a family can open in a spreadsheet. The money is a standard NEAR token (NEP-141), so a stablecoin such as USDC drops in where the test dollars are now. And the box is **ready for NEAR Intents**: a relative abroad can pay from another chain, and the contract credits the gift, and any refund, to that person, never to the go-between (see below).

**NFTs That Do Something: carry credentials and access rights.** The pass is an NFT that only a payee's confirmation can create, that refuses to move, and that other systems can query for a yes or no (`has_paid`) before they let someone in. See below.

## The pass: an NFT that does something

The pass is a standard NEAR NFT (NEP-171) with rules of its own:

- **It is a credential.** Only the payee's confirmation of a real payment can create it. Nobody can mint one, and the student can't confirm his own payment.
- **It is an access right.** Any system can ask the contract `has_paid(account_id, payee)` and get `true` or `false`, with no website and no person reading a screen. An exam portal can refuse an exam card, a hostel gate can refuse a room. Try it: `has_paid("tolu.purposesplit.testnet", "llu.purposesplit.testnet")` is `true`; for the parent who gave, or for a school he didn't pay, it is `false`.
- **It can't move.** `nft_transfer` always refuses, so a pass can't be sold, lent or borrowed, and neither can the "yes".

What it doesn't do: a pass doesn't own money, earn or hold items. It is proof, not a wallet.

## Why NEAR

- **Named accounts.** Families see `llu.purposesplit.testnet`, not `0x7a3f…`, so they can tell who is being paid.
- **Sputnik DAO.** The payee council and the street's vote are real DAOs made with NEAR's own DAO factory, not a multisig of ours.
- **Limited keys.** A NEAR key can be restricted to a few contract methods. The demo school's key can only send bills and confirm payments; it can't move money. That is why any visitor can "play the school" on the website, with nothing to install.
- **Standard tokens.** Money is NEP-141, passes are NEP-171 NFTs that refuse to move, and every action emits NEP-297 events.
- **Free views.** Anyone can ask the contract why a payment would be refused (`why_refused`), with no wallet and no fee. That powers "Try to cheat".
- **NEAR Intents ready.** Through Intents, tokens arrive from `intents.near`, not from the person paying. The money box takes the real giver from the delivery message (`{"pot_id": 7, "giver": "uncle.near"}`) and credits the gift and any refund to them. It never bounces tokens back to the go-between: anything that can't go in the box is kept as owed to the giver, to withdraw any time. Intents runs only on mainnet, so on testnet a stand-in account plays `intents.near` (`node scripts/intents-sim.mjs`, recorded in `proof/intents-sim.json`, box 7); 7 tests cover it.

## For example

| | School fees | Street fund | Medical appeal |
|---|---|---|---|
| Who gives | The family, including relatives abroad | The neighbours | Anyone with the link |
| Who can be paid | The school | The electrician | The hospital and the pharmacy |
| Who pays the bills | The student | The neighbours, by Sputnik DAO vote | The organiser |
| Unused money | Back to each giver | Back to each giver | Back to each giver |

These are examples. The same rules work for any purpose with a named payee: rent, a wedding, a funeral, a group purchase.

## The boxes on testnet

| Box | What it shows |
|---|---|
| [0](https://purpose-split-web.vercel.app/#/pot/0) | School fees, finished: paid only the school, the school confirmed, the pass was issued, the unused part went back |
| [1](https://purpose-split-web.vercel.app/#/pot/1) | Street repair, finished: paid only the electrician, and only by the neighbours' DAO vote |
| [2](https://purpose-split-web.vercel.app/#/pot/2) | Surgery appeal, finished: paid only the hospital and the pharmacy |
| [3](https://purpose-split-web.vercel.app/#/pot/3) | School fees, open: the homepage's "Try to cheat" box |
| [4](https://purpose-split-web.vercel.app/#/pot/4) | Street fund, open: only a vote of the street can pay |
| [5](https://purpose-split-web.vercel.app/#/pot/5) | Surgery appeal, open: anyone can give |
| [6](https://purpose-split-web.vercel.app/#/pot/6) | A whole school year: the school, a bookshop and a hostel, each only against its own bill, plus a labelled pocket-money part |
| [7](https://purpose-split-web.vercel.app/#/pot/7) | A gift from abroad through a stand-in for NEAR Intents, credited to the real giver |

## Try it yourself (no wallet needed for the first three)

1. **Try to cheat.** Open the [homepage](https://purpose-split-web.vercel.app), choose "The student" and "A betting site", press **Try it** → *Refused: "A betting site is not on the verified list. This money box pays only Lagos Lagoon University."* The answer comes from the contract's own `why_refused` view, live.
2. **Check a pass.** Menu → **Check a pass** → `tolu.purposesplit.testnet` → *a "Fees paid: Lagos Lagoon University" pass, 280 tUSD, confirmed by the school.*
3. **See a vote.** Menu → **Payees** → *the verified list held by `purposesplit-council.sputnik-v2.testnet`, and proposal 1 to add Unity Hall Caterers with each councillor's vote, read live from the DAO.*
4. **Do it for real.** Sign in with a testnet wallet (Meteor, MyNearWallet, HOT, Nightly or Intear), press **Get 500 test dollars** on **How to try it**, start a money box naming Lagos Lagoon University, give to it, then follow the box's **Next** card: **Send a bill as Lagos Lagoon University** (a demo shortcut, since the school is made up), **Pay** it yourself, then **Confirm as Lagos Lagoon University**. Menu → **Check a pass** → your account → *your own "Fees paid" pass.*
5. **Keep the records.** On any box, press **Download for your records (CSV)** → *every gift, bill, payment and confirmation with its amount, and the date of each bill, payment and confirmation (the contract doesn't record when a gift was made).*
6. **Check it all at once.** With Node 18 or newer, from the repository folder: `node scripts/verify.mjs` → *18/18 checks passed, read live from testnet. No install, no keys, no wallet.*

## Check every claim yourself

| Claim | How to check |
|---|---|
| The money can only reach the payees on the box | "Try to cheat" on any open box; the 20 refused attempts in `proof/demo-final.json`, each with its transaction; `node scripts/verify.mjs` tries five more, live |
| Only a vote of the street can pay from the street's box | Box 4's "Who decides each payment" is `adeyemi-street.sputnik-v2.testnet`; in the test run the chairman's direct attempt is refused, and even a passed vote that tries to pay the chairman is refused by the contract |
| Nobody adds or removes a payee alone | `get_config().registry_dao` is `purposesplit-council.sputnik-v2.testnet`; the deployer's attempt after the handover is refused in the test run; on the Payees page anyone can propose adding or removing a payee, and only a council vote carries it out |
| Any system can check a pass with a yes or no | `has_paid` in the contract; `node scripts/verify.mjs` asks it live for the student, the parent and a school he didn't pay |
| A pass cannot be faked, sold or lent | Tolu confirming his own payment and Tolu giving his pass away are both refused in the test run; `nft_transfer` always refuses |
| The books balance | The test run ends with the contract's token balance equal to what its boxes hold plus what it owes |
| A gift through NEAR Intents is credited to the real giver, never bounced | Box 7 on the website; `proof/intents-sim.json`; `node scripts/verify.mjs` |
| The code on chain is the code in this repository | `node scripts/verify.mjs` compares the contract's code hash with `build/purpose_split.wasm`, which `scripts/build.sh` rebuilds byte for byte |
| Every rule has a test | `cargo test`: 97 tests |

## Status (12 Nov)

- The final contract is [`pots.purposesplit.testnet`](https://testnet.nearblocks.io/address/pots.purposesplit.testnet) (version 0.4.0). The website and `verify.mjs` read it live.
- The money box contract and the test-dollar token: 97 tests covering every rule, every cheating attempt, the pass, the handover to the council and gifts through NEAR Intents.
- The two Sputnik DAOs are live, made with NEAR's own DAO factory: the payee council ([`purposesplit-council.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/purposesplit-council.sputnik-v2.testnet)), with one real person on it, and the street ([`adeyemi-street.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/adeyemi-street.sputnik-v2.testnet)), with five neighbours.
- The full test run on the final contract: 85 steps, all 20 cheating attempts refused, real DAO proposals and votes, and the books balance. Every step and its transaction is in `proof/demo-final.json` and on the website's Proof page. The contract was then upgraded, with its state unchanged, to 0.3.0 to add NEAR Intents gifts and to 0.4.0 to add the `has_paid` access check, and box 7 was given to through a stand-in for Intents (`proof/intents-sim.json`). An earlier practice run on `pots-dev7.purposesplit.testnet` is kept in `proof/demo-dev.json`.
- The website is live: wallet sign-in, "Try to cheat" against the real contract, example money boxes, starting your own, the Payees page (bills, verified list, council votes, proposing a payee), passes and CSV records.

## Try it from the command line

```bash
cargo test                      # 97 tests: every rule, every cheat, the pass and its access check, the handover, Intents gifts
cd scripts && npm install
./build.sh                      # builds both contracts into build/
node daos.mjs                   # the two Sputnik DAOs (already made; safe to run again)
node verify.mjs                 # checks the README's claims on testnet, live (no keys, no wallet)
node demo.mjs final             # the three stories on testnet, with real DAO votes (needs testnet keys)
node intents-sim.mjs            # a gift through a stand-in for NEAR Intents (needs testnet keys)
```

## Layout

```
contract/     the money box contract (Rust, near-sdk 5.30) and its tests
test-token/   test dollars (tUSD), a standard NEAR token with a "get test dollars" button
scripts/      build, deploy, demo and verify scripts for testnet
proof/        every step of the recorded runs, with transaction links
web/          the website (plain HTML, CSS and JavaScript, reads the chain in the browser)
web-src/      the bundle for NEAR Wallet Selector
```

## Honest limitations

- **Test dollars only.** A real launch would use USDC on NEAR and a naira on-ramp.
- **The payees are made up.** No school in Nigeria has a NEAR account today, so the schools, hospital, pharmacy, electrician and people in the demo are invented, and their evidence links use the reserved `.example` domain. The rules, the votes and the money movements are real.
- **One council seat is held by the build,** so the test run can cast the first vote. The second seat is a real person's wallet, and the build holds no key for it, so nothing passes without that person's vote.
- **Not locked.** The deployer still holds the contract's key, so a bug found during the hackathon can be fixed. That key could also deploy new code, so for now you trust that it won't; `verify.mjs` shows the running code matches this repository and reports the key. A real launch would delete the key, after which nobody could change the rules.
- **Not audited.** Built and tested in a hackathon.
- **NEAR Intents is shown with a stand-in.** Intents runs only on mainnet. The contract handles its deliveries and is tested for them, but no real cross-chain payment has been made, because there is no mainnet deployment yet.
- **Not built yet:** a naira on-ramp, real schools on the list, and gasless confirmations for payees through meta transactions.

## Roadmap

1. **Mainnet launch with USDC.** The same contract, with a real stablecoin instead of test dollars.
2. **Real NEAR Intents giving.** Relatives abroad pay from Base, Solana, Ethereum or Bitcoin in one step. The contract already credits Intents gifts to the real giver (tested, and shown on testnet with a stand-in in box 7).
3. **Real payees.** Schools, hospitals and vendors publish their NEAR account and are voted onto the list.
4. **A naira on-ramp,** so families can give from a bank account or card.
5. **Lock the contract** by deleting its key once it is settled, so nobody can ever change the rules.
6. **Gasless confirmations,** so payees don't need NEAR to send a bill or confirm.

## Built with

Written from scratch during the NEAR Hackathon window, November 2026; there is no earlier code. Built with AI coding assistance from Claude (Anthropic). Uses near-sdk and near-contract-standards (NEP-141, NEP-145, NEP-171, NEP-297), Sputnik DAO through NEAR's DAO factory, near-api-js, NEAR Wallet Selector, and the Archivo font (SIL Open Font License).

License: [MIT](LICENSE)
