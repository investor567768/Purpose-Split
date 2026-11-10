// Creates two long-lived, funded, unpaid pots for the website's live "Try to cheat":
// one family pot and one street pot, each open for 30 days.
// Usage: node showcase.mjs [dev|final]   Prints the two pot ids.

import { D, NEAR, TGAS, call, link, sub } from "./lib.mjs";

const MODE = process.argv[2] || "dev";
const TOKEN = sub("tusd");
const POTS = sub(process.env.PS_POTS || (MODE === "dev" ? "pots-dev5" : "pots"));
const STREET = sub(MODE === "dev" ? "street-dev" : "adeyemi-street"); // replaced by the DAO in final
const DAYS30 = 30 * 24 * 60;

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

const fam = (await must("Family showcase pot created", call(sub("mum"), POTS, "create_pot", {
  kind: "Personal", title: "Tolu's 2026/27 fees", payees: [sub("llu")], reference: "LLU/2024/0193",
  releaser: sub("tolu"), target: String(300n * D), deadline_minutes: DAYS30,
  free_part: { label: "Pocket money", amount: String(50n * D), to: sub("tolu") },
}, { deposit: NEAR / 10n }))).value;
await must("Mum adds 200", give(sub("mum"), fam, 200n * D));
await must("Mum adds 50 pocket money", give(sub("mum"), fam, 50n * D, "free"));
await must("Uncle Femi adds 100", give(sub("uncle-femi"), fam, 100n * D));

const street = (await must("Street showcase pot created", call(sub("chairman"), POTS, "create_pot", {
  kind: "Group", title: "Adeyemi Street transformer repair", payees: [sub("sparks")], reference: "Job 114",
  releaser: STREET, target: String(200n * D), deadline_minutes: DAYS30,
}, { deposit: NEAR / 10n }))).value;
for (let i = 1; i <= 5; i++) await must(`resident${i} adds 40`, give(sub(`resident${i}`), street, 40n * D));

await must("The school bills Tolu 280", call(sub("llu"), POTS, "request_payment", { pot_id: fam, amount: String(280n * D), note: "2026/27 session fees" }));
await must("Sparks Electrical asks for 100", call(sub("sparks"), POTS, "request_payment", { pot_id: street, amount: String(100n * D), note: "Parts for the transformer" }));

const appeal = (await must("Appeal showcase pot created", call(sub("emeka"), POTS, "create_pot", {
  kind: "Personal", title: "Mama Ngozi's surgery", payees: [sub("lagoonheights"), sub("cornercare")],
  reference: "Patient 2219", releaser: sub("emeka"), target: String(500n * D), deadline_minutes: DAYS30,
  all_or_nothing: true, free_part: { label: "Food and transport", amount: String(80n * D), to: sub("ngozi-family") },
}, { deposit: NEAR / 10n }))).value;
for (let i = 1; i <= 5; i++) await must(`resident${i} gives 100`, give(sub(`resident${i}`), appeal, 100n * D));
await must("The hospital bills 380", call(sub("lagoonheights"), POTS, "request_payment", { pot_id: appeal, amount: String(380n * D), note: "Surgery and two nights' stay" }));

console.log(JSON.stringify({ family: fam, street, appeal }));
