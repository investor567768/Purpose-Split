// Checks the claims in the README against NEAR testnet, live. No keys, no wallet,
// no install: it only reads public data over NEAR's JSON-RPC.
//
//   node scripts/verify.mjs            checks the final contract (pots.purposesplit.testnet)
//   node scripts/verify.mjs pots-dev7  checks another contract under purposesplit.testnet
//
// Needs Node 18 or newer. Prints one line per check and "X/Y checks passed".

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = "purposesplit.testnet";
const s = (name) => `${name}.${ROOT}`;
const POTS = s(process.argv[2] || "pots");
const TOKEN = s("tusd");
const COUNCIL = "purposesplit-council.sputnik-v2.testnet";
const STREET = "adeyemi-street.sputnik-v2.testnet";
const RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
const D = 1_000_000n;

async function rpc(method, params) {
  let last;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "verify", method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
      return j.result;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function view(contract, method, args = {}) {
  const r = await rpc("query", {
    request_type: "call_function", finality: "final", account_id: contract, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString());
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(buf) {
  let n = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const byte of buf) { if (byte === 0) out = "1" + out; else break; }
  return out;
}

const results = [];
async function check(label, fn) {
  try {
    const { ok, detail } = await fn();
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      ${detail}`);
  } catch (e) {
    results.push(false);
    console.log(`FAIL  ${label}\n      could not check: ${e.message}`);
  }
}
const usd = (v) => `${(Number(BigInt(v)) / 1e6).toLocaleString("en-US")} tUSD`;

console.log(`Purpose Split: checking ${POTS} on NEAR testnet\n`);

// ------------------------------------------------------------ the code itself
await check("The deployed code is exactly the code in this repository", async () => {
  const acct = await rpc("query", { request_type: "view_account", finality: "final", account_id: POTS });
  const file = path.join(HERE, "..", "build", "purpose_split.wasm");
  if (!fs.existsSync(file)) return { ok: false, detail: "build/purpose_split.wasm is missing; run scripts/build.sh first" };
  const mine = base58(crypto.createHash("sha256").update(fs.readFileSync(file)).digest());
  return { ok: acct.code_hash === mine, detail: `on chain ${acct.code_hash}, built here ${mine}` };
});

// Not a pass/fail check: the contract is deliberately not locked (see the README).
{
  const keys = await rpc("query", { request_type: "view_access_key_list", finality: "final", account_id: POTS });
  console.log(`NOTE  Keys on the contract account: ${keys.keys.length}. ${keys.keys.length ? "It is not locked: whoever holds that key could deploy new code. The check above shows the code running now is the code in this repository." : "It is locked: nobody can change its code."}`);
}

// ------------------------------------------------------------ who decides
await check("Only the school-list council, a Sputnik DAO, can change the verified list", async () => {
  const c = await view(POTS, "get_config");
  return { ok: c.registry_dao === COUNCIL, detail: `get_config says the list is held by ${c.registry_dao}` };
});

await check("The council needs more than half of its members to agree", async () => {
  const p = await view(COUNCIL, "get_policy");
  const group = p.roles.find((r) => r.kind.Group).kind.Group;
  const t = p.default_vote_policy.threshold;
  return { ok: group.length >= 2 && t.join("/") === "1/2", detail: `members: ${group.join(", ")}; threshold ${t.join("/")}` };
});

await check("The street's money moves only by a vote of its five neighbours", async () => {
  const p = await view(STREET, "get_policy");
  const group = p.roles.find((r) => r.kind.Group).kind.Group;
  return { ok: group.length === 5 && p.default_vote_policy.threshold.join("/") === "1/2", detail: `members: ${group.join(", ")}` };
});

// ------------------------------------------------------------ the money
await check("The books balance: every coin the contract holds belongs to a box or is owed to someone", async () => {
  const t = await view(POTS, "get_totals");
  const bal = await view(TOKEN, "ft_balance_of", { account_id: POTS });
  const need = BigInt(t.held) + BigInt(t.owed);
  return { ok: BigInt(bal) === need, detail: `holds ${usd(bal)}; boxes hold ${usd(t.held)}, owed ${usd(t.owed)}` };
});

const potCheck = (id, label, want) => check(label, async () => {
  const p = await view(POTS, "get_pot", { pot_id: id });
  if (!p) return { ok: false, detail: `box ${id} does not exist` };
  const payees = new Set(p.payees.map((x) => x.account_id));
  const allToPayees = p.payments.every((x) => payees.has(x.to));
  const ok = p.status === "Settled" && BigInt(p.paid) === want.paid * D && BigInt(p.refunded) === want.refunded * D && allToPayees
    && p.payments.every((x) => x.confirmed);
  return { ok, detail: `status ${p.status}; paid ${usd(p.paid)}, only to ${[...payees].join(", ")}, every payment confirmed by the payee; refunded ${usd(p.refunded)}` };
});
await potCheck(0, "School fees (box 0): paid only the school, the unused part went back", { paid: 280n, refunded: 20n });
await potCheck(1, "Street repair (box 1): paid only the electrician, by vote, the rest went back", { paid: 180n, refunded: 20n });
await potCheck(2, "Surgery appeal (box 2): paid only the hospital and pharmacy, the rest went back", { paid: 450n, refunded: 50n });

// ------------------------------------------------------------ the passes
await check("The student holds a \"Fees paid\" pass, made by the school's confirmation", async () => {
  const passes = await view(POTS, "get_passes", { account_id: s("tolu") });
  const p = passes.find((x) => x.pot_id === 0);
  return { ok: Boolean(p) && p.title.startsWith("Fees paid") && p.payee === s("llu"), detail: p ? `"${p.title}", pass ${p.token_id}, ${usd(p.amount)}` : "no pass for box 0" };
});
await check("Passes are standard NEAR NFTs (NEP-171) anyone can read", async () => {
  const m = await view(POTS, "nft_metadata");
  const n = await view(POTS, "nft_total_supply");
  return { ok: m.spec.startsWith("nft-") && Number(n) >= 5, detail: `${m.name} (${m.symbol}), spec ${m.spec}, ${n} passes issued` };
});

// ------------------------------------------------------------ try to cheat, live
const open = await view(POTS, "get_pots", { from_index: 3, limit: 1 }).then((x) => x[0]).catch(() => null);
const cheat = (label, caller, to, amount) => check(`Refused live: ${label}`, async () => {
  if (!open) return { ok: false, detail: "no open box to test on" };
  const why = await view(POTS, "why_refused", { pot_id: open.id, caller, to, amount: String(amount * D) });
  return { ok: Boolean(why), detail: why ? `"${why}"` : "the contract would allow it" };
});
if (open) console.log(`\nTrying to cheat open box ${open.id} ("${open.title}"). These are read-only checks: nothing is sent.\n`);
await cheat("the student sends the fees to his own wallet", s("tolu"), s("tolu"), 100n);
await cheat("the student sends the fees to a betting site", s("tolu"), s("sureodds"), 100n);
await cheat("the student pays a lookalike of the school's account", s("tolu"), s("llu-bursary"), 100n);
await cheat("the parent who gave takes the money back early", s("mum"), s("mum"), 100n);
await check("Refused live: a refund before the deadline", async () => {
  const why = await view(POTS, "why_refund_refused", { pot_id: open.id });
  return { ok: Boolean(why), detail: why ? `"${why}"` : "the contract would allow it" };
});

// ------------------------------------------------------------ NEAR Intents ready
await check("A gift through a go-between (as NEAR Intents delivers) is credited to the real giver", async () => {
  const run = JSON.parse(fs.readFileSync(path.join(HERE, "..", "proof", "intents-sim.json"), "utf8"));
  if (run.contract !== POTS) return { ok: false, detail: `the recorded run was on ${run.contract}` };
  const p = await view(POTS, "get_pot", { pot_id: run.pot });
  const giver = p.contributions.find((x) => x.account_id === run.giver);
  const viaIsGiver = p.contributions.some((x) => x.account_id === run.go_between);
  return {
    ok: Boolean(giver) && !viaIsGiver && Object.values(run.checks).every(Boolean),
    detail: `box ${run.pot}: ${giver ? usd(giver.amount) : "nothing"} credited to ${run.giver}, none to ${run.go_between}; the 50 that didn't fit was kept for the giver, not bounced (proof/intents-sim.json)`,
  };
});

// ------------------------------------------------------------ the recorded run
await check("The recorded test run finished with every step as expected", async () => {
  const file = path.join(HERE, "..", "proof", "demo-final.json");
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  const refused = run.steps.filter((x) => x.refused).length;
  const ok = run.contract === POTS && run.books_match && run.steps.every((x) => x.ok || x.refused);
  return { ok, detail: `${run.steps.length} steps on ${run.contract}, ${refused} cheating attempts refused, books matched (proof/demo-final.json)` };
});

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
