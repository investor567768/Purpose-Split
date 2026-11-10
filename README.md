# Purpose Split

**Money with rules.**

Parents send school fees. The money can only pay the school. Purpose Split is a money box on NEAR where money raised for a purpose can only reach the payees named on it, only against their own bills, and whatever isn't used goes back to everyone who gave.

**Try it:** [purpose-split-web.vercel.app](https://purpose-split-web.vercel.app) (NEAR testnet, test dollars with no value)

Tracks: Social Money and Real-World Money.

## The problem

When you send money for a purpose, you lose control of it the moment it lands. You can only hope.

That gets worse when several people give. Relatives, some abroad, chip in for a student's school fees, and it all sits in one person's account. Neighbours collect for a broken transformer, and the money sits with the chairman. Strangers give to a surgery appeal on WhatsApp, and nobody can tell whether it reaches the hospital.

## How it works

1. **Give.** Anyone adds money to a money box made for one purpose.
2. **Bill.** Only the payees named on the box (a school, a hospital, an electrician) can send it a bill. They are on a verified list, each with a link to where they publish their own account.
3. **Pay.** The person or group named on the box pays the bill. The money can't go anywhere else: not to the person pressing pay, not to a lookalike account, not to a different payee.
4. **Return.** After the deadline, whatever is left goes back to each giver, in proportion to what they gave.

An optional, labelled free part covers costs nobody can bill, such as food and transport, and is shown to givers before they give.

## For example

| | School fees | Street fund | Medical appeal |
|---|---|---|---|
| Who gives | The family, including relatives abroad | The neighbours | Anyone with the link |
| Who can be paid | The school | The electrician | The hospital and the pharmacy |
| Who presses pay | The student | The neighbours, by Sputnik DAO vote | The organiser |
| Unused money | Back to each giver | Back to each giver | Back to each giver |

These are examples. The same rules work for any purpose with a named payee: rent, a wedding, a funeral, a group purchase.

## Status (10 Nov)

- The money box contract and the test-dollar token are written, with 69 tests covering every rule and every cheating attempt.
- Three demo stories ran on testnet: 53 steps, all 16 cheating attempts refused, and the books balance. See `proof/demo-dev.json` for every transaction link.
- The website is live, with wallet sign-in, "Try to break the rules", and a form to start your own money box.
- Next: the two Sputnik DAOs and the final, locked deployment.

## Try it from the command line

```bash
cargo test                      # 69 tests: every rule and every cheat
cd scripts && npm install
./build.sh                      # builds both contracts into build/
node demo.mjs dev               # runs both stories on testnet (needs testnet keys)
```

## Layout

```
contract/     the pot contract (Rust, near-sdk 5.30) and its tests
test-token/   test dollars (tUSD), a standard NEAR token with a "get test dollars" button
scripts/      build, deploy and demo scripts for testnet
proof/        transaction links from demo runs
```

## Honest limitations

- Test dollars only. A real launch would use USDC and a naira on-ramp.
- Schools and vendors do not have NEAR accounts today. The demo uses made-up ones.
- The contract has not been audited.

License: MIT
