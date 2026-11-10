// Deploys a contract file to an account (creating it under ROOT if needed)
// and calls its init method.
// Usage: node deploy.mjs <sub-name> <wasm-path> <near-to-fund> <init-method> '<init-json>'

import fs from "node:fs";
import { actions } from "near-api-js";
import { account, createSub, exists, link, ROOT, TGAS, view } from "./lib.mjs";

const [name, wasmPath, fund, initMethod, initJson] = process.argv.slice(2);
if (!name || !wasmPath) {
  console.error("Usage: node deploy.mjs <sub-name> <wasm-path> <near> <init-method> '<init-json>'");
  process.exit(1);
}
const id = `${name}.${ROOT}`;
const code = fs.readFileSync(wasmPath);

const made = await createSub(ROOT, name, Number(fund || 3));
console.log(made.created ? `Created ${id}: ${link(made.tx)}` : `${id} already exists`);

const acts = [actions.deployContract(new Uint8Array(code))];
if (initMethod) {
  acts.push(actions.functionCall(initMethod, JSON.parse(initJson || "{}"), 100n * TGAS, 0n));
}
const res = await account(id).signAndSendTransaction({
  receiverId: id,
  actions: acts,
  waitUntil: "FINAL",
});
console.log(`Deployed ${code.length} bytes to ${id}: ${link(res.transaction.hash)}`);
if (!(await exists(id))) throw new Error("account missing after deploy");
