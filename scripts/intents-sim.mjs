// Shows, on testnet, what happens when money arrives through a go-between such as
// NEAR Intents. NEAR Intents itself runs only on mainnet, where the tokens arrive
// from `intents.near`; here a stand-in account, intents-relay, plays that part.
//
// 1. A parent opens a money box for the school fees.
// 2. The go-between delivers 150 for an uncle abroad, naming him as the giver:
//    the box credits the uncle, not the go-between.
// 3. The go-between delivers 100 more, but only 50 fits: the other 50 is kept as
//    owed to the uncle (never bounced to the go-between), and he withdraws it.
//
// Usage: node intents-sim.mjs [pots-account-name]   Writes proof/intents-sim.json.

import fs from "node:fs";
import { D, NEAR, TGAS, call, createSub, exists, link, sub, view, ROOT } from "./lib.mjs";

const POTS = sub(process.argv[2] || "pots");
const TOKEN = sub("tusd");
const RELAY = sub("intents-relay");
const school = sub("llu"), tolu = sub("tolu"), mum = sub("mum"), uncle = sub("uncle-femi");
const REG = 1_250_000_000_000_000_000_000n;
const steps = [];

async function step(title, p, expectFail = false) {
  const r = await p;
  const ok = expectFail ? !r.ok : r.ok;
  steps.push({ title, ok, tx: r.tx, url: link(r.tx), ...(r.ok ? {} : { error: r.error }) });
  console.log(`${ok ? "ok " : "BAD"} ${title}: ${link(r.tx)}${r.ok ? "" : `  (${r.error})`}`);
  if (!ok) throw new Error(title);
  return r;
}

if (!(await exists(RELAY))) await createSub(ROOT, "intents-relay", 1);
if (!(await view(TOKEN, "storage_balance_of", { account_id: RELAY }))) {
  await step("The stand-in go-between registers with tUSD", call(ROOT, TOKEN, "storage_deposit", { account_id: RELAY, registration_only: true }, { deposit: REG }));
}
if (BigInt(await view(TOKEN, "ft_balance_of", { account_id: RELAY })) < 250n * D) {
  await step("The stand-in go-between gets test dollars", call(RELAY, TOKEN, "get_test_dollars", {}));
}

const pot = (await step("A parent opens a box for the school fees", call(mum, POTS, "create_pot", {
  kind: "Personal", title: "Fees sent from abroad", payees: [school], reference: "LLU/2024/0193",
  releaser: tolu, target: String(200n * D), deadline_minutes: 30 * 24 * 60, free_part: null,
}, { deposit: NEAR / 10n }))).value;

const via = (amount) => call(RELAY, TOKEN, "ft_transfer_call",
  { receiver_id: POTS, amount: String(amount * D), msg: JSON.stringify({ pot_id: pot, giver: uncle }) },
  { deposit: 1n, gas: 150n * TGAS, failOn: [POTS] });

const owedBefore = BigInt(await view(POTS, "get_owed", { account_id: uncle }));
await step("The go-between delivers 150 for the uncle abroad, naming him as the giver", via(150n));
await step("The go-between delivers 100 more; only 50 fits", via(100n));

const p = await view(POTS, "get_pot", { pot_id: pot });
const owed = BigInt(await view(POTS, "get_owed", { account_id: uncle })) - owedBefore;
const relayInBox = p.contributions.some((x) => x.account_id === RELAY);
const credited = p.contributions.find((x) => x.account_id === uncle);
const checks = {
  credited_to_uncle: credited && BigInt(credited.amount) === 200n * D,
  go_between_not_a_giver: !relayInBox,
  extra_kept_for_uncle: owed === 50n * D,
};
console.log(checks);
if (owed > 0n) await step("The uncle withdraws the 50 that didn't fit", call(uncle, POTS, "withdraw_owed", {}, { gas: 100n * TGAS }));

const totals = await view(POTS, "get_totals");
const bal = await view(TOKEN, "ft_balance_of", { account_id: POTS });
const books_match = BigInt(bal) === BigInt(totals.held) + BigInt(totals.owed);
const out = { contract: POTS, go_between: RELAY, pot, giver: uncle, checks, books_match, steps };
fs.writeFileSync(new URL("../proof/intents-sim.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`box ${pot}; books match: ${books_match}; all checks: ${Object.values(checks).every(Boolean)}`);
