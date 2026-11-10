// Shared helpers for the testnet scripts.
// Keys live in KEY_DIR, outside the repository, and are never printed.
// Testnet only: every helper refuses accounts that don't end in .testnet.

import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = process.env.PS_ROOT || "purposesplit.testnet";
export const KEY_DIR = process.env.PS_KEY_DIR || path.join(os.homedir(), ".purpose-split-keys");
// rpc.testnet.near.org is deprecated and rate-limits hard, so FastNEAR comes first.
export const RPC_URLS = [
  "https://test.rpc.fastnear.com",
  "https://archival-rpc.testnet.fastnear.com",
  "https://rpc.testnet.near.org",
];
export const FAUCET = "https://helper.nearprotocol.com/account";
export const EXPLORER = "https://testnet.nearblocks.io/txns/";

/** One test dollar (6 decimals). */
export const D = 1_000_000n;
export const TGAS = 1_000_000_000_000n;
export const NEAR = 10n ** 24n;

let rpcIndex = 0;
export function provider() {
  return new JsonRpcProvider({ url: RPC_URLS[rpcIndex % RPC_URLS.length] });
}

export function assertTestnet(accountId) {
  if (!accountId.endsWith(".testnet")) {
    throw new Error(`Refusing ${accountId}: these scripts are for testnet only`);
  }
}

export const sub = (name) => `${name}.${ROOT}`;

function keyFile(accountId) {
  return path.join(KEY_DIR, `${accountId}.json`);
}

export function hasKey(accountId) {
  return fs.existsSync(keyFile(accountId));
}

/** Creates and stores a new key for an account, or returns the stored one. */
export function keyFor(accountId) {
  assertTestnet(accountId);
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const file = keyFile(accountId);
  if (fs.existsSync(file)) {
    return KeyPair.fromString(JSON.parse(fs.readFileSync(file, "utf8")).private_key);
  }
  const kp = KeyPair.fromRandom("ed25519");
  fs.writeFileSync(
    file,
    JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }),
    { mode: 0o600 }
  );
  return kp;
}

export function account(accountId) {
  assertTestnet(accountId);
  return new Account(accountId, provider(), new KeyPairSigner(keyFor(accountId)));
}

export async function exists(accountId) {
  try {
    await provider().viewAccount({ accountId, finalityQuery: { finality: "final" } });
    return true;
  } catch (e) {
    if (String(e).match(/does not exist|UNKNOWN_ACCOUNT/i)) return false;
    throw e;
  }
}

export async function balanceNear(accountId) {
  const a = await provider().viewAccount({ accountId, finalityQuery: { finality: "final" } });
  return Number(BigInt(a.amount) / 10n ** 21n) / 1000;
}

/** Creates a top-level .testnet account through the free testnet faucet. */
export async function createWithFaucet(accountId) {
  assertTestnet(accountId);
  if (await exists(accountId)) return false;
  const kp = keyFor(accountId);
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`Faucet said ${res.status}: ${(await res.text()).slice(0, 300)}`);
  for (let i = 0; i < 20 && !(await exists(accountId)); i++) await sleep(1500);
  return true;
}

/** Creates parent's sub-account `name.parent` with `near` NEAR, if missing. */
export async function createSub(parentId, name, near) {
  const id = `${name}.${parentId}`;
  if (await exists(id)) return { id, created: false };
  const kp = keyFor(id);
  const parent = account(parentId);
  const tx = await parent.createSubAccount({
    accountOrPrefix: id,
    publicKey: kp.getPublicKey(),
    nearToTransfer: BigInt(Math.round(near * 1000)) * 10n ** 21n,
  });
  return { id, created: true, tx: tx.transaction.hash };
}

export async function view(contractId, method, args = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider().callFunction({ contractId, method, args });
    } catch (e) {
      if (attempt < 4 && String(e).match(/429|rate|timeout|ECONNRESET|fetch failed/i)) {
        rpcIndex += 1;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Calls a contract method and returns { ok, tx, value, error }. Never throws on a contract refusal.
 * The call counts as failed if the transaction failed, or if any step run by an account in
 * `failOn` failed (default: the called contract). Failures elsewhere, such as a token transfer
 * the contract already handles as "owed", don't count.
 */
export async function call(signerId, contractId, methodName, args = {}, { deposit = 0n, gas = 100n * TGAS, failOn } = {}) {
  const acc = account(signerId);
  try {
    const res = await acc.signAndSendTransaction({
      receiverId: contractId,
      actions: [actions.functionCall(methodName, args, BigInt(gas), BigInt(deposit))],
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
    const tx = res.transaction.hash;
    const failure = findFailure(res, failOn || [contractId]);
    if (failure) return { ok: false, tx, error: failure };
    const ok = res.status && res.status.SuccessValue !== undefined;
    let value;
    if (ok && res.status.SuccessValue) {
      try {
        value = JSON.parse(Buffer.from(res.status.SuccessValue, "base64").toString());
      } catch {
        value = undefined;
      }
    }
    return { ok: true, tx, value };
  } catch (e) {
    return { ok: false, tx: e?.context?.transactionHash, error: cleanError(e) };
  }
}

function findFailure(res, failOn) {
  if (res.status && res.status.Failure) return cleanError(res.status.Failure);
  for (const o of res.receipts_outcome || []) {
    const st = o?.outcome?.status;
    if (st && st.Failure && failOn.includes(o.outcome.executor_id)) return cleanError(st.Failure);
  }
  return null;
}

export function cleanError(e) {
  const s = typeof e === "string" ? e : JSON.stringify(e?.message ?? e);
  const m = s.match(/Smart contract panicked: ([^"\\]+)/);
  if (m) return m[1].trim();
  const m2 = s.match(/panic_msg\\?":\s*\\?"([^"\\]+)/);
  if (m2) return m2[1].trim();
  return s.slice(0, 300);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const link = (tx) => (tx ? EXPLORER + tx : "(no transaction)");
export const dollars = (v) => (Number(BigInt(v)) / 1e6).toFixed(2);
