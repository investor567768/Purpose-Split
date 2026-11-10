// Runs the three demo stories on testnet and prints an explorer link for every step,
// including every refused cheating attempt.
//
//   node demo.mjs dev     uses pots-dev, where a plain account stands in for both DAOs
//   node demo.mjs final   uses pots, governed by the real Sputnik DAOs (later)
//
// Testnet only. Test dollars have no value.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  D, NEAR, TGAS, ROOT, account, call, createSub, dollars, exists, link, sleep, sub, view,
} from "./lib.mjs";

const MODE = process.argv[2] || "dev";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(HERE, "..", "build", "purpose_split.wasm");

const TOKEN = sub("tusd");
const POTS = sub(process.env.PS_POTS || (MODE === "dev" ? "pots-dev5" : "pots"));
const REGISTRY = sub("registry-dev"); // a plain account standing in for the registry DAO
const STREET = sub("street-dev"); // a plain account standing in for the street DAO

const P = {
  mum: sub("mum"),
  uncle: sub("uncle-femi"),
  tolu: sub("tolu"),
  school: sub("llu"), // Lagos Lagoon University (a made-up school)
  otherSchool: sub("marinapoly"), // Marina Polytechnic (made up)
  lookalike: sub("llu-bursary"), // the fake "school" Tolu made himself
  sparks: sub("sparks"), // Sparks Electrical (made up)
  chairman: sub("chairman"),
  residents: [1, 2, 3, 4, 5].map((i) => sub(`resident${i}`)),
  hospital: sub("lagoonheights"), // Lagoon Heights Hospital (made up)
  pharmacy: sub("cornercare"), // Corner Care Pharmacy (made up)
  organiser: sub("emeka"), // Emeka, who runs the appeal for his mother
  family: sub("ngozi-family"), // the family's own account, for the free part
};

const log = [];
let step = 0;
function record(title, r, expectRefusal = false) {
  step += 1;
  const verdict = expectRefusal
    ? r.ok
      ? "NOT REFUSED (this is a bug)"
      : `Refused: "${r.error}"`
    : r.ok
      ? "Done"
      : `FAILED: ${r.error}`;
  const line = `${String(step).padStart(2)}. ${title}\n    ${verdict}\n    ${link(r.tx)}`;
  console.log(line);
  log.push({ step, title, ok: r.ok, refused: expectRefusal && !r.ok, verdict, tx: r.tx || null });
  if (expectRefusal && r.ok) throw new Error(`A cheat was not refused: ${title}`);
  if (!expectRefusal && !r.ok) throw new Error(`Step failed: ${title}: ${r.error}`);
  return r;
}

const pay = (signer, pot, to, amount) =>
  call(signer, POTS, "pay_to", { pot_id: pot, to, amount: String(amount) }, { gas: 100n * TGAS });

const give = (from, pot, amount, part = "purpose") =>
  call(
    from,
    TOKEN,
    "ft_transfer_call",
    { receiver_id: POTS, amount: String(amount), msg: JSON.stringify({ pot_id: pot, part }) },
    { deposit: 1n, gas: 150n * TGAS, failOn: [POTS] }
  );

async function ensureAccount(id, near) {
  if (await exists(id)) return;
  const name = id.slice(0, -(ROOT.length + 1));
  const r = await createSub(ROOT, name, near);
  console.log(`   created ${id} ${link(r.tx)}`);
}

async function ensureRegistered(id) {
  const bal = await view(TOKEN, "storage_balance_of", { account_id: id });
  if (bal) return;
  const r = await call(ROOT, TOKEN, "storage_deposit", { account_id: id, registration_only: true }, {
    deposit: 1_250_000_000_000_000_000_000n,
  });
  if (!r.ok) throw new Error(`register ${id}: ${r.error}`);
}

async function ensureDollars(id, amount) {
  const bal = BigInt(await view(TOKEN, "ft_balance_of", { account_id: id }));
  if (bal >= amount) return;
  const registered = await view(TOKEN, "storage_balance_of", { account_id: id });
  const r = await call(id, TOKEN, "get_test_dollars", {}, { deposit: registered ? 0n : 1_250_000_000_000_000_000_000n });
  if (!r.ok) throw new Error(`test dollars for ${id}: ${r.error}`);
}

async function waitPast(deadlineNs) {
  const target = Number(BigInt(deadlineNs) / 1_000_000n) + 5_000;
  while (Date.now() < target) {
    process.stdout.write(`   waiting for the deadline: ${Math.ceil((target - Date.now()) / 1000)}s   \r`);
    await sleep(5_000);
  }
  console.log("");
}

// ------------------------------------------------------------------- setup
console.log(`Purpose Split demo on testnet (${MODE}): contract ${POTS}\n`);
console.log("Setting up accounts...");
for (const id of [P.mum, P.uncle, P.tolu, P.chairman, ...P.residents]) await ensureAccount(id, 0.6);
for (const id of [P.school, P.otherSchool, P.lookalike, P.sparks, P.hospital, P.pharmacy, P.family]) await ensureAccount(id, 0.3);
await ensureAccount(P.organiser, 0.6);
if (MODE === "dev") {
  await ensureAccount(REGISTRY, 0.6);
  await ensureAccount(STREET, 0.6);
  if (!(await exists(POTS))) {
    const { execFileSync } = await import("node:child_process");
    execFileSync(
      "node",
      ["--no-warnings", path.join(HERE, "deploy.mjs"), POTS.split(".")[0], WASM, "4", "new",
        JSON.stringify({ token: TOKEN, registry_dao: REGISTRY, symbol: "tUSD", decimals: 6 })],
      { stdio: "inherit" }
    );
  }
}
for (const id of [POTS, P.school, P.otherSchool, P.sparks, P.tolu, P.chairman, P.hospital, P.pharmacy, P.family, P.organiser]) await ensureRegistered(id);
for (const id of [P.mum, P.uncle, ...P.residents]) await ensureDollars(id, 300n * D);

// If an earlier run sent Tolu money before he was registered with the token, the
// contract kept it as "owed". Collecting it shows the safety net working.
if (BigInt(await view(POTS, "get_owed", { account_id: P.tolu })) > 0n) {
  record("Safety net: Tolu collects money an earlier run could not deliver",
    await call(P.tolu, POTS, "withdraw_owed", {}, { gas: 100n * TGAS }));
}

if (MODE === "dev") {
  // The evidence links use the reserved .example domain: the schools are made up.
  for (const [id, name, kind, evidence] of [
    [P.school, "Lagos Lagoon University (demo)", "School", "https://lagoslagoon.example/pay-fees"],
    [P.otherSchool, "Marina Polytechnic (demo)", "School", "https://marinapoly.example/bursary"],
    [P.sparks, "Sparks Electrical (demo)", "Vendor", "https://sparkselectrical.example/contact"],
    [P.hospital, "Lagoon Heights Hospital (demo)", "Hospital", "https://lagoonheights.example/pay"],
    [P.pharmacy, "Corner Care Pharmacy (demo)", "Vendor", "https://cornercare.example/accounts"],
  ]) {
    if (!(await view(POTS, "is_verified", { account_id: id }))) {
      record(`The registry adds ${name} to the verified list`,
        await call(REGISTRY, POTS, "add_payee", { account_id: id, name, kind, evidence }));
    }
  }
}

// ------------------------------------------------------- part 1: the family
console.log("\nPart 1: Tolu's school fees\n");
const MINUTES = 5;
const created = record("Mum creates a pot for Tolu's fees: 300 fees + 50 pocket money, payable only to the school",
  await call(P.mum, POTS, "create_pot", {
    kind: "Personal",
    title: "Tolu's 2026/27 fees",
    payees: [P.school],
    reference: "LLU/2024/0193",
    releaser: P.tolu,
    target: String(300n * D),
    deadline_minutes: MINUTES,
    free_part: { label: "Pocket money", amount: String(50n * D), to: P.tolu },
  }, { deposit: NEAR / 10n }));
const fam = created.value;

record("Mum adds 200 for fees", await give(P.mum, fam, 200n * D));
record("Mum adds 50 pocket money, which goes straight to Tolu", await give(P.mum, fam, 50n * D, "free"));
record("Uncle Femi adds 100 for fees", await give(P.uncle, fam, 100n * D));

record("The school sends Tolu's bill: 280 for the session",
  await call(P.school, POTS, "request_payment", { pot_id: fam, amount: String(280n * D), note: "2026/27 session fees" }));
record("Cheat: Tolu sends himself a bill", await call(P.tolu, POTS, "request_payment", { pot_id: fam, amount: String(280n * D), note: "For me" }), true);
record("Cheat: Tolu sends the fees to himself", await pay(P.tolu, fam, P.tolu, 280n * D), true);
record("Cheat: Tolu pays a lookalike \"school\" he made, llu-bursary", await pay(P.tolu, fam, P.lookalike, 280n * D), true);
record("Cheat: Tolu pays a different real school", await pay(P.tolu, fam, P.otherSchool, 280n * D), true);
record("Cheat: Mum tries to take the fees back early", await pay(P.mum, fam, P.mum, 280n * D), true);

record("Cheat: Tolu pays the school less than it billed, to keep the rest in play", await pay(P.tolu, fam, P.school, 150n * D), true);
record("Tolu pays the school's bill of 280, with his matric number attached",
  await call(P.tolu, POTS, "pay_request", { pot_id: fam, request_id: 0 }, { gas: 100n * TGAS }));
record("The school confirms the payment on-chain", await call(P.school, POTS, "confirm_payment", { pot_id: fam, payment_index: 0 }));
record("Cheat: Tolu tries to pay out more than is left", await pay(P.tolu, fam, P.school, 21n * D), true);

// ------------------------------------------------------- part 2: the street
console.log("\nPart 2: Adeyemi Street's transformer\n");
const street = record("The chairman creates a pot: 200 for the transformer repair, payable only to Sparks Electrical, released only by the residents' vote",
  await call(P.chairman, POTS, "create_pot", {
    kind: "Group",
    title: "Adeyemi Street transformer repair",
    payees: [P.sparks],
    reference: "Job 114",
    releaser: STREET,
    target: String(200n * D),
    deadline_minutes: MINUTES,
  }, { deposit: NEAR / 10n })).value;

for (const r of P.residents.slice(0, 3)) record(`${r.split(".")[0]} adds 40`, await give(r, street, 40n * D));
record("Sparks Electrical asks for 100 to buy parts",
  await call(P.sparks, POTS, "request_payment", { pot_id: street, amount: String(100n * D), note: "Parts for the transformer" }));
record("Cheat: the vote tries to pay before the target is reached", await pay(STREET, street, P.sparks, 100n * D), true);
for (const r of P.residents.slice(3)) record(`${r.split(".")[0]} adds 40`, await give(r, street, 40n * D));
record("Cheat: the chairman pays himself directly", await pay(P.chairman, street, P.chairman, 200n * D), true);
record("Cheat: a passed vote tries to pay the chairman", await pay(STREET, street, P.chairman, 200n * D), true);
record("Cheat: the vote tries to pay an amount the electrician never asked for", await pay(STREET, street, P.sparks, 150n * D), true);
record("The residents' vote pays the request for parts: 100",
  await call(STREET, POTS, "pay_request", { pot_id: street, request_id: 0 }, { gas: 100n * TGAS }));
record("The light is back: Sparks Electrical asks for the remaining 80",
  await call(P.sparks, POTS, "request_payment", { pot_id: street, amount: String(80n * D), note: "Labour, light restored" }));
record("The residents' vote pays it",
  await call(STREET, POTS, "pay_request", { pot_id: street, request_id: 1 }, { gas: 100n * TGAS }));
record("Cheat: a resident asks for a refund before the deadline", await call(P.residents[0], POTS, "settle", { pot_id: street }, { gas: 300n * TGAS }), true);

// ------------------------------------------------------- part 3: an appeal
console.log("\nPart 3: an appeal for Mama Ngozi's surgery\n");
const appeal = record("Emeka opens an appeal for his mother's surgery: 500, payable only to the hospital or the pharmacy, plus 80 for food and transport sent straight to the family",
  await call(P.organiser, POTS, "create_pot", {
    kind: "Personal",
    title: "Mama Ngozi's surgery",
    payees: [P.hospital, P.pharmacy],
    reference: "Patient 2219",
    releaser: P.organiser,
    target: String(500n * D),
    deadline_minutes: MINUTES,
    all_or_nothing: true,
    free_part: { label: "Food and transport", amount: String(80n * D), to: P.family },
  }, { deposit: NEAR / 10n })).value;
for (const r of P.residents.slice(0, 3)) record(`${r.split(".")[0]} gives 100 from a link shared on X`, await give(r, appeal, 100n * D));
record("The hospital sends its bill: 380 for the operation",
  await call(P.hospital, POTS, "request_payment", { pot_id: appeal, amount: String(380n * D), note: "Surgery and two nights' stay" }));
record("Cheat: Emeka pays the hospital before the 500 target is reached", await pay(P.organiser, appeal, P.hospital, 380n * D), true);
for (const r of P.residents.slice(3)) record(`${r.split(".")[0]} gives 100`, await give(r, appeal, 100n * D));
record("resident1 also gives 80 for food and transport, which goes straight to the family", await give(P.residents[0], appeal, 80n * D, "free"));
record("Cheat: Emeka sends the donations to his own account", await pay(P.organiser, appeal, P.organiser, 500n * D), true);
record("Cheat: Emeka sends the surgery money to the family's account instead", await pay(P.organiser, appeal, P.family, 380n * D), true);
record("Cheat: Emeka pays the hospital's bill to the pharmacy", await pay(P.organiser, appeal, P.pharmacy, 380n * D), true);
record("Emeka pays the hospital's bill of 380",
  await call(P.organiser, POTS, "pay_request", { pot_id: appeal, request_id: 0 }, { gas: 100n * TGAS }));
record("The hospital confirms the payment on-chain", await call(P.hospital, POTS, "confirm_payment", { pot_id: appeal, payment_index: 0 }));
record("The pharmacy sends its bill: 70 for medicine",
  await call(P.pharmacy, POTS, "request_payment", { pot_id: appeal, amount: String(70n * D), note: "Medicine after surgery" }));
record("Emeka pays the pharmacy's bill of 70",
  await call(P.organiser, POTS, "pay_request", { pot_id: appeal, request_id: 1 }, { gas: 100n * TGAS }));

// ------------------------------------------------------- deadlines, refunds
const famPot = await view(POTS, "get_pot", { pot_id: fam });
await waitPast(famPot.deadline_ns);
record("After the deadline, anyone settles the family pot: the unused 20 goes back to Mum and Uncle Femi",
  await call(P.uncle, POTS, "settle", { pot_id: fam }, { gas: 300n * TGAS }));
const streetPot = await view(POTS, "get_pot", { pot_id: street });
await waitPast(streetPot.deadline_ns);
record("After the deadline, anyone settles the street pot: the unused 20 goes back, 4 to each resident",
  await call(P.residents[2], POTS, "settle", { pot_id: street }, { gas: 300n * TGAS }));

const appealPot = await view(POTS, "get_pot", { pot_id: appeal });
await waitPast(appealPot.deadline_ns);
record("After the deadline, anyone settles the appeal: the unused 50 goes back, 10 to each giver",
  await call(P.residents[4], POTS, "settle", { pot_id: appeal }, { gas: 300n * TGAS }));

// ------------------------------------------------------------- the books
await sleep(3000);
const totals = await view(POTS, "get_totals");
const balance = BigInt(await view(TOKEN, "ft_balance_of", { account_id: POTS }));
const booksOk = balance === BigInt(totals.held) + BigInt(totals.owed);
console.log(`\nThe books: contract holds ${dollars(balance)} tUSD; pots hold ${dollars(totals.held)}, owed ${dollars(totals.owed)}: ${booksOk ? "they match" : "MISMATCH"}`);

const out = path.join(HERE, "..", "proof", `demo-${MODE}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ contract: POTS, token: TOKEN, ran_at: new Date().toISOString(), books_match: booksOk, steps: log }, null, 2));
const refused = log.filter((s) => s.refused).length;
console.log(`\n${log.length} steps, ${refused} cheating attempts refused. Saved to proof/demo-${MODE}.json`);
if (!booksOk) process.exit(1);
