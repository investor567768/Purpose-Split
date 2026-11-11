// The "split" showcase: one money box for a student's whole school year.
// Three verified payees (the school, a bookshop, a hostel) each bill for their own part,
// plus a labelled pocket-money part that goes straight to the student.
// Usage: node split.mjs [dev|final]   Prints the new pot id.

import { D, NEAR, TGAS, ROOT, call, createSub, exists, link, sub, view } from "./lib.mjs";

const MODE = process.argv[2] || "dev";
const TOKEN = sub("tusd");
const POTS = sub(process.env.PS_POTS || (MODE === "dev" ? "pots-dev6" : "pots"));
const REGISTRY = sub(MODE === "dev" ? "registry-dev" : "registry"); // the council DAO in final
const DAYS30 = 30 * 24 * 60;
const REG = 1_250_000_000_000_000_000_000n;

async function must(label, p) {
  const r = await p;
  if (!r.ok) throw new Error(`${label}: ${r.error}`);
  console.log(`${label}: ${link(r.tx)}`);
  return r;
}
const give = (from, pot, amount, part = "purpose") =>
  call(from, TOKEN, "ft_transfer_call",
    { receiver_id: POTS, amount: String(amount), msg: JSON.stringify({ pot_id: pot, part }) },
    { deposit: 1n, gas: 150n * TGAS, failOn: [POTS] });

async function ensureAccount(name, near) {
  const id = sub(name);
  if (await exists(id)) return id;
  const r = await createSub(ROOT, name, near);
  console.log(`created ${id}: ${link(r.tx)}`);
  return id;
}
async function ensureRegistered(id) {
  if (await view(TOKEN, "storage_balance_of", { account_id: id })) return;
  await must(`register ${id} with tUSD`, call(ROOT, TOKEN, "storage_deposit", { account_id: id, registration_only: true }, { deposit: REG }));
}
async function topUp(id, need) {
  const bal = BigInt(await view(TOKEN, "ft_balance_of", { account_id: id }));
  if (bal >= need) return;
  await must(`${id} gets test dollars`, call(id, TOKEN, "get_test_dollars", {}));
}

// 1. Two new made-up payees, verified by the school-list council.
const bookshop = await ensureAccount("campusbooks", 1);
const hostel = await ensureAccount("lagoonhostel", 1);
for (const id of [bookshop, hostel]) await ensureRegistered(id);
for (const [id, name, kind, evidence] of [
  [bookshop, "Campus Books (demo)", "Vendor", "https://campusbooks.example/accounts"],
  [hostel, "Lagoon Hostel (demo)", "Vendor", "https://lagoonhostel.example/pay-rent"],
]) {
  if (!(await view(POTS, "is_verified", { account_id: id }))) {
    await must(`The council adds ${name}`, call(REGISTRY, POTS, "add_payee", { account_id: id, name, kind, evidence }));
  }
}

// 2. One box for the whole school year.
const school = sub("llu"), tolu = sub("tolu"), mum = sub("mum"), uncle = sub("uncle-femi");
const pot = (await must("The split box is created", call(mum, POTS, "create_pot", {
  kind: "Personal", title: "Tolu's whole school year", payees: [school, bookshop, hostel], reference: "LLU/2024/0193",
  releaser: tolu, target: String(600n * D), deadline_minutes: DAYS30,
  free_part: { label: "Pocket money", amount: String(60n * D), to: tolu },
}, { deposit: NEAR / 10n }))).value;

// 3. The family gives.
await topUp(mum, 360n * D);
await topUp(uncle, 240n * D);
await must("Mum adds 300", give(mum, pot, 300n * D));
await must("Mum adds 60 pocket money", give(mum, pot, 60n * D, "free"));
await must("Uncle Femi adds 240", give(uncle, pot, 240n * D));

// 4. Each payee bills for its own part; Tolu pays each; each confirms.
const bills = [
  [school, 280n, "2026/27 session fees"],
  [bookshop, 45n, "Year 2 textbooks"],
  [hostel, 150n, "Hostel rent, first semester"],
];
for (let i = 0; i < bills.length; i++) {
  const [id, amount, note] = bills[i];
  const req = (await must(`${id} sends a bill for ${amount}`, call(id, POTS, "request_payment", { pot_id: pot, amount: String(amount * D), note }))).value;
  await must(`Tolu pays it`, call(tolu, POTS, "pay_request", { pot_id: pot, request_id: req }, { gas: 100n * TGAS, failOn: [POTS] }));
  await must(`${id} confirms`, call(id, POTS, "confirm_payment", { pot_id: pot, payment_index: i }));
}

// 5. A cheat, for the record: Tolu tries to pay the bookshop more than it billed.
const cheat = await call(tolu, POTS, "pay_to", { pot_id: pot, to: bookshop, amount: String(100n * D) }, { failOn: [POTS] });
console.log(`Cheat (pay the bookshop 100 with no bill): ${cheat.ok ? "ALLOWED?!" : "refused: " + cheat.error}`);

console.log(JSON.stringify({ split: pot }));
