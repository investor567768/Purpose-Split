// Locks a contract for good: deletes every access key on its account, so nobody,
// including whoever deployed it, can ever deploy new code or act as the account again.
// This cannot be undone.
//
// Usage: node lock.mjs <sub-name> --yes     e.g. node lock.mjs pots --yes

import { PublicKey, actions } from "near-api-js";
import { account, link, provider, sub } from "./lib.mjs";

const [name, yes] = process.argv.slice(2);
if (!name || yes !== "--yes") {
  console.error("Usage: node lock.mjs <sub-name> --yes   (this deletes every key on the account and cannot be undone)");
  process.exit(1);
}
const id = sub(name);
const keysOf = async () => (await provider().query({ request_type: "view_access_key_list", finality: "final", account_id: id })).keys;

const before = await keysOf();
console.log(`${id} has ${before.length} key(s).`);
if (!before.length) { console.log("Already locked."); process.exit(0); }
const code = (await provider().query({ request_type: "view_account", finality: "final", account_id: id })).code_hash;
console.log(`Code hash that will be frozen: ${code}`);

const res = await account(id).signAndSendTransaction({
  receiverId: id,
  actions: before.map((k) => actions.deleteKey(PublicKey.fromString(k.public_key))),
  waitUntil: "FINAL",
});
console.log(`Deleted ${before.length} key(s): ${link(res.transaction.hash)}`);
const after = await keysOf();
console.log(after.length ? `STILL ${after.length} key(s) left` : `${id} is locked: it has no keys.`);
process.exit(after.length ? 1 : 0);
