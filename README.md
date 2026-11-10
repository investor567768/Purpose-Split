# Purpose Split

**Money raised for a purpose can only be spent on that purpose.**

Built at NEAR HACKATHON (November 2026). Tracks: Social Money and Real-World Money. Runs on NEAR testnet with test dollars that have no value.

## The problem

In Nigeria, parents send school fees to their children, and some of that money ends up in crypto trades and betting apps instead of at the school. On a street, residents chip in to repair the transformer, and the money sits with the chairman. In both cases, the risk is whoever holds the money.

## How it works

One contract, two kinds of pot:

| | Family pot | Community pot |
|---|---|---|
| Who adds money | Mum, Uncle Femi, other relatives | The street's residents |
| Who can be paid | Only the verified school | Only the electrician named when the pot was made |
| Who releases the money | The student | The residents, by a Sputnik DAO vote |
| Leftover money | Back to each relative, in proportion | Back to each resident, in proportion |
| Target missed | Not applicable | Everyone refunded in full |

The rule the contract enforces: **the student can pay the school, and can never pay anyone else.** The same goes for the chairman: even a passed vote cannot pay him.

## Status (9 Nov)

- The pot contract and the test-dollar token are written, with 69 tests covering every rule and every cheating attempt.
- Both demo stories ran on testnet: 53 steps, all 16 cheating attempts refused, and the books balance. See `proof/demo-dev.json` for every transaction link.
- Next: the two Sputnik DAOs, the final locked deployment, the website and a proof page.

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
