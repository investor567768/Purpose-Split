// Runs the three demo stories on testnet and prints an explorer link for every step,
// including every refused cheating attempt.
//
//   node demo.mjs dev     uses the practice contract
//   node demo.mjs final   uses the final contract
//
// Both are governed by real Sputnik DAOs made with NEAR's DAO factory (see daos.mjs):
// the school-list council holds the verified list, and the street's neighbours vote
// to pay the electrician. The deployer seeds the first payees, then hands the list
// to the council for good.
//
// Testnet only. Test dollars have no value.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  D, NEAR, TGAS, ROOT, account, call, createSub, dollars, exists, link, sleep, sub, view,
} from "./lib.mjs";
import { COUNCIL_DAO, STREET_DAO, HUMAN_COUNCILLOR, STANDIN_COUNCILLOR } from "./daos.mjs";

const MODE = process.argv[2] || "dev";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(HERE, "..", "build", "purpose_split.wasm");

const TOKEN = sub("tusd");
const POTS = sub(process.env.PS_POTS || (MODE === "dev" ? "pots-dev7" : "pots"));
// The picture wallets show for a pass. It lives on the website.
const PASS_ART = process.env.PS_PASS_ART || "https://purpose-split-web.vercel.app/pass.svg";
// The deployer's account that seeds the first payees, then hands the list to the council DAO.
const REGISTRY = sub("registry-dev");
const STREET = STREET_DAO;

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
  bookshop: sub("campusbooks"), // Campus Books (made up), for the school-year box
  hostel: sub("lagoonhostel"), // Lagoon Hostel (made up), for the school-year box
  caterer: sub("unityhall"), // Unity Hall Caterers (made up), proposed to the council by vote
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

/** Records something read from the contract (no transaction), such as who holds a pass. */
function note(title, ok, detail) {
  step += 1;
  const verdict = ok ? `Checked: ${detail}` : `CHECK FAILED: ${detail}`;
  console.log(`${String(step).padStart(2)}. ${title}\n    ${verdict}`);
  log.push({ step, title, ok, refused: false, verdict, tx: null });
  if (!ok) throw new Error(`Check failed: ${title}: ${detail}`);
}

const passesOf = (id) => view(POTS, "get_passes", { account_id: id });

const balanceOf = async (id) => (await import("./lib.mjs")).balanceNear(id);

/** A Sputnik proposal that calls one method on the money box contract. */
const fnCall = (method, args) => ({
  FunctionCall: {
    receiver_id: POTS,
    actions: [{ method_name: method, args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: String(150n * TGAS) }],
  },
});

/**
 * The street decides by vote: a neighbour proposes, three of the five vote yes,
 * and the third yes makes the DAO carry the call out. Records each step; when
 * `cheat` is set, the money box contract must refuse what the vote asked for.
 */
async function streetVote(what, method, args, cheat = false) {
  const kind = fnCall(method, args);
  const [a, b, c] = P.residents;
  const proposed = record(`${cheat ? "Cheat: " : ""}a neighbour proposes a street vote to ${what}`,
    await call(a, STREET_DAO, "add_proposal", { proposal: { description: `Adeyemi Street: ${what}`, kind } }, { deposit: NEAR / 10n }));
  const vote = (who) => call(who, STREET_DAO, "act_proposal", { id: proposed.value, action: "VoteApprove", proposal: kind }, { gas: 300n * TGAS, failOn: [STREET_DAO, POTS] });
  record("The first neighbour votes yes", await vote(a));
  record("A second neighbour votes yes", await vote(b));
  return record(cheat ? "The vote passes, and the money box refuses to carry it out" : "The third yes vote passes it, and the DAO pays from the street's box",
    await vote(c), cheat);
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
for (const id of [P.school, P.otherSchool, P.lookalike, P.sparks, P.hospital, P.pharmacy, P.family, P.bookshop, P.hostel, P.caterer]) await ensureAccount(id, 0.3);
// Neighbours pay a small bond (0.1 NEAR) to propose, and gas to vote.
for (const id of P.residents) if ((await balanceOf(id)) < 1.2) await account(ROOT).transfer({ receiverId: id, amount: NEAR });
if ((await balanceOf(STANDIN_COUNCILLOR)) < 0.6) await account(ROOT).transfer({ receiverId: STANDIN_COUNCILLOR, amount: NEAR });
await ensureAccount(P.organiser, 0.6);
if (MODE === "dev") {
  await ensureAccount(REGISTRY, 0.6);
  if (!(await exists(POTS))) {
    const { execFileSync } = await import("node:child_process");
    execFileSync(
      "node",
      ["--no-warnings", path.join(HERE, "deploy.mjs"), POTS.split(".")[0], WASM, "4", "new",
        JSON.stringify({ token: TOKEN, registry_dao: REGISTRY, symbol: "tUSD", decimals: 6, pass_art: PASS_ART })],
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
    [P.bookshop, "Campus Books (demo)", "Vendor", "https://campusbooks.example/accounts"],
    [P.hostel, "Lagoon Hostel (demo)", "Vendor", "https://lagoonhostel.example/pay-rent"],
  ]) {
    if (!(await view(POTS, "is_verified", { account_id: id }))) {
      record(`The deployer seeds ${name} onto the verified list`,
        await call(REGISTRY, POTS, "add_payee", { account_id: id, name, kind, evidence }));
    }
  }
}

// ------------------------------------------- the verified list goes to a vote
console.log("\nThe verified list is handed to the school-list council\n");
if ((await view(POTS, "get_config")).registry_dao !== COUNCIL_DAO) {
  record(`The deployer hands the verified list to the school-list council, a Sputnik DAO (${COUNCIL_DAO})`,
    await call(REGISTRY, POTS, "set_registry_dao", { account_id: COUNCIL_DAO }));
}
note("From now on only a council vote can change the list",
  (await view(POTS, "get_config")).registry_dao === COUNCIL_DAO, `get_config says the list is held by ${COUNCIL_DAO}`);
record("Cheat: the deployer tries to add a payee after handing the list over",
  await call(REGISTRY, POTS, "add_payee", { account_id: P.lookalike, name: "LLU Bursary", kind: "School", evidence: "https://x.example" }), true);
record("Cheat: Tolu tries to put his own lookalike account on the list",
  await call(P.tolu, POTS, "add_payee", { account_id: P.lookalike, name: "LLU Bursary", kind: "School", evidence: "https://x.example" }), true);
if (!(await view(POTS, "is_verified", { account_id: P.caterer }))) {
  const addCaterer = fnCall("add_payee", {
    account_id: P.caterer, name: "Unity Hall Caterers (demo)", kind: "Vendor", evidence: "https://unityhall.example/accounts",
  });
  const proposed = record("A councillor proposes adding Unity Hall Caterers, with a link to where it publishes its account",
    await call(STANDIN_COUNCILLOR, COUNCIL_DAO, "add_proposal",
      { proposal: { description: "Add Unity Hall Caterers (demo) to the verified list. Evidence: https://unityhall.example/accounts", kind: addCaterer } },
      { deposit: NEAR / 10n }));
  record("The first councillor votes yes",
    await call(STANDIN_COUNCILLOR, COUNCIL_DAO, "act_proposal", { id: proposed.value, action: "VoteApprove", proposal: addCaterer }, { gas: 300n * TGAS }));
  note("Two yes votes are needed: the proposal waits for the second councillor, a real person",
    !(await view(POTS, "is_verified", { account_id: P.caterer })),
    `proposal ${proposed.value} on ${COUNCIL_DAO} is waiting for ${HUMAN_COUNCILLOR} to vote; Unity Hall is not on the list yet`);
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
record("Cheat: Tolu confirms the payment himself, to get a \"Fees paid\" pass without the school",
  await call(P.tolu, POTS, "confirm_payment", { pot_id: fam, payment_index: 0 }), true);
record("The school confirms the payment on-chain", await call(P.school, POTS, "confirm_payment", { pot_id: fam, payment_index: 0 }));
{
  const passes = await passesOf(P.tolu);
  const mine = passes.find((x) => x.pot_id === fam);
  note("Tolu now holds a pass that anyone can check", Boolean(mine) && mine.title.startsWith("Fees paid"),
    mine ? `"${mine.title}", pass ${mine.token_id}, held by ${mine.holder}` : "no pass found");
}
record("Cheat: Tolu tries to give his pass to a friend",
  await call(P.tolu, POTS, "nft_transfer", { receiver_id: P.lookalike, token_id: `${fam}-0` }, { deposit: 1n }), true);
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
await streetVote("pay Sparks Electrical's 100 before the target is reached",
  "pay_request", { pot_id: street, request_id: 0 }, true);
for (const r of P.residents.slice(3)) record(`${r.split(".")[0]} adds 40`, await give(r, street, 40n * D));
record("Cheat: the chairman pays himself directly", await pay(P.chairman, street, P.chairman, 200n * D), true);
await streetVote("pay the street's money to the chairman",
  "pay_to", { pot_id: street, to: P.chairman, amount: String(200n * D) }, true);
await streetVote("pay Sparks Electrical 150, an amount it never asked for",
  "pay_to", { pot_id: street, to: P.sparks, amount: String(150n * D) }, true);
await streetVote("pay Sparks Electrical's request for parts: 100",
  "pay_request", { pot_id: street, request_id: 0 });
record("Sparks Electrical confirms the 100 arrived", await call(P.sparks, POTS, "confirm_payment", { pot_id: street, payment_index: 0 }));
record("The light is back: Sparks Electrical asks for the remaining 80",
  await call(P.sparks, POTS, "request_payment", { pot_id: street, amount: String(80n * D), note: "Labour, light restored" }));
await streetVote("pay Sparks Electrical's 80 for labour",
  "pay_request", { pot_id: street, request_id: 1 });
record("Sparks Electrical confirms the 80 arrived", await call(P.sparks, POTS, "confirm_payment", { pot_id: street, payment_index: 1 }));
{
  const passes = (await passesOf(STREET)).filter((x) => x.pot_id === street);
  note("The street holds proof of both stages it paid for", passes.length === 2,
    passes.map((x) => `"${x.title}" (${x.token_id})`).join(", ") || "no passes found");
}
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
record("The pharmacy confirms the payment on-chain", await call(P.pharmacy, POTS, "confirm_payment", { pot_id: appeal, payment_index: 1 }));
{
  const passes = (await passesOf(P.organiser)).filter((x) => x.pot_id === appeal);
  note("Emeka holds proof for every giver to see: both bills were paid and confirmed", passes.length === 2,
    passes.map((x) => `"${x.title}" (${x.token_id})`).join(", ") || "no passes found");
}

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
