// Gives each demo payee (the made-up school, hospital, pharmacy and electrician) a
// limited key that can only send bills and confirm payments on the money-box
// contract. The website publishes these keys on purpose, so any visitor can "play
// the school" with nothing to install. Testnet only; the keys can't move money.
// Usage: node demo-keys.mjs [pots-account-name]   Prints JSON for web/config.js.

import { KeyPair, actions } from "near-api-js";
import { account, balanceNear, sub, ROOT } from "./lib.mjs";

const POTS = sub(process.argv[2] || "pots-dev6");
const PAYEES = ["llu", "sparks", "lagoonheights", "cornercare", "campusbooks", "lagoonhostel"];
const out = {};
for (const name of PAYEES) {
  const id = sub(name);
  if ((await balanceNear(id)) < 0.8) await account(ROOT).transfer({ receiverId: id, amount: 10n ** 24n });
  const kp = KeyPair.fromRandom("ed25519");
  await account(id).signAndSendTransaction({
    receiverId: id,
    actions: [actions.addFunctionCallAccessKey(kp.getPublicKey(), POTS, ["request_payment", "confirm_payment", "cancel_request"], 25n * 10n ** 22n)],
    waitUntil: "FINAL",
  });
  out[id] = kp.toString();
  console.error(`limited key added to ${id} for ${POTS}`);
}
console.log(JSON.stringify(out, null, 2));
