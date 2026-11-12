// Everything that needs a wallet: signing in, getting test dollars, giving,
// paying bills, sending bills, closing a box and starting a new one.
// The 2 MB wallet bundle loads only when it is first needed.

import { BOX_DEPOSIT, COUNCIL_DAO, DEMO_KEYS, POTS, RPCS, STORAGE_DEPOSIT, TOKEN } from "./config.js";

let walletPromise = null;
let wallet = null;
const listeners = new Set();

export function onAccountChange(fn) {
  listeners.add(fn);
}

export const currentAccount = () => (wallet ? wallet.accountId() : null);

export function loadWallet() {
  if (!walletPromise) {
    walletPromise = import("./vendor/wallet.js").then(async (m) => {
      wallet = await m.initWallet({
        contractId: POTS,
        onChange: (a) => listeners.forEach((fn) => fn(a)),
      });
      listeners.forEach((fn) => fn(wallet.accountId()));
      return wallet;
    });
  }
  return walletPromise;
}

export async function signIn() {
  (await loadWallet()).signIn();
}

export async function signOut() {
  await (await loadWallet()).signOut();
}

async function send(receiverId, methodName, args, opts) {
  const w = await loadWallet();
  if (!w.accountId()) throw new Error("Sign in first.");
  return w.call(receiverId, methodName, args, opts);
}

/** Registers with the token if needed, then gets 500 test dollars. */
export async function getTestDollars(registered) {
  return send(TOKEN, "get_test_dollars", {}, { gas: 30, deposit: registered ? "0" : STORAGE_DEPOSIT });
}

export async function give(potId, units, part) {
  return send(
    TOKEN,
    "ft_transfer_call",
    { receiver_id: POTS, amount: String(units), msg: JSON.stringify({ pot_id: potId, part }) },
    { gas: 150, deposit: "1" }
  );
}

export const payBill = (potId, requestId) => send(POTS, "pay_request", { pot_id: potId, request_id: requestId }, { gas: 100 });
export const sendBill = (potId, units, note) => send(POTS, "request_payment", { pot_id: potId, amount: String(units), note }, { gas: 50 });
export const confirmPayment = (potId, index) => send(POTS, "confirm_payment", { pot_id: potId, payment_index: index }, { gas: 50 });
export const closeBox = (potId) => send(POTS, "settle", { pot_id: potId }, { gas: 300 });
export const createBox = (args) => send(POTS, "create_pot", args, { gas: 100, deposit: BOX_DEPOSIT });

/** True if this payee has a published demo key, so a visitor can play it. */
export const canPlay = (accountId) => Boolean(DEMO_KEYS[accountId]);

/** Asks the school-list council to vote a payee onto the verified list. The bond comes back when it passes. */
export const proposePayee = (payee, bond) =>
  send(COUNCIL_DAO, "add_proposal", {
    proposal: {
      description: `Add ${payee.name} (${payee.account_id}) to the verified list. Evidence: ${payee.evidence}`,
      kind: {
        FunctionCall: {
          receiver_id: POTS,
          actions: [{
            method_name: "add_payee",
            args: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payee)))),
            deposit: "0",
            gas: "150000000000000",
          }],
        },
      },
    },
  }, { gas: 100, deposit: bond });

/** Anyone can ask the council to take a payee off the verified list. Same bond as adding one. */
export const proposeRemoval = (accountId, name, bond) =>
  send(COUNCIL_DAO, "add_proposal", {
    proposal: {
      description: `Remove ${name} (${accountId}) from the verified list.`,
      kind: {
        FunctionCall: {
          receiver_id: POTS,
          actions: [{
            method_name: "remove_payee",
            args: btoa(JSON.stringify({ account_id: accountId })),
            deposit: "0",
            gas: "150000000000000",
          }],
        },
      },
    },
  }, { gas: 100, deposit: bond });

/** A councillor's vote. The vote that passes a proposal also carries it out, so it gets plenty of gas. */
export const voteOnCouncil = (id, action, kind) =>
  send(COUNCIL_DAO, "act_proposal", { id, action, proposal: kind }, { gas: 300 });

/** Acts as a made-up payee with its limited demo key. No wallet needed. */
export async function playPayee(accountId, methodName, args) {
  const m = await import("./vendor/wallet.js");
  return m.callWithDemoKey({
    accountId,
    privateKey: DEMO_KEYS[accountId],
    rpcUrl: RPCS[0],
    contractId: POTS,
    methodName,
    args,
    gas: methodName === "confirm_payment" ? 50 : 30,
  });
}

/** Turns a wallet or contract error into one plain sentence. */
export function explain(err) {
  const s = String((err && (err.message || err)) || err);
  const m = s.match(/Smart contract panicked: ([^"\\]+)/) || s.match(/panicked: ([^"\\]+)/);
  if (m) return m[1].trim();
  if (/pop-?up/i.test(s)) return "Your browser blocked the wallet's window. Click the pop-up icon in the address bar, choose \"Always allow\", then press the button again.";
  if (/reject|cancel|closed|denied/i.test(s)) return "You cancelled it in your wallet. Nothing was sent.";
  return s.length > 220 ? s.slice(0, 220) + "…" : s;
}
