// The wallet sign-in bundle for the static website. Built into web/vendor/wallet.js
// by build.mjs. It wraps NEAR Wallet Selector so app.js can stay plain JavaScript.

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";
import { actionCreators } from "@near-js/transactions";
import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { KeyPair } from "@near-js/crypto";

const TGAS = 1_000_000_000_000n;

export async function initWallet({ contractId, network = "testnet", onChange }) {
  const selector = await setupWalletSelector({
    network,
    // Sender is left out: we could not get it onto NEAR testnet when we tested it.
    modules: [setupMeteorWallet(), setupMyNearWallet(), setupHotWallet(), setupNightly(), setupIntearWallet()],
  });
  const modal = setupModal(selector, {
    contractId,
    description: "Sign in with a NEAR testnet wallet. Purpose Split never holds your keys.",
  });

  const current = () => {
    const accounts = selector.store.getState().accounts || [];
    const active = accounts.find((a) => a.active) || accounts[0];
    return active ? active.accountId : null;
  };
  selector.store.observable.subscribe(() => onChange && onChange(current()));

  return {
    accountId: current,
    signIn: () => modal.show(),
    async signOut() {
      const wallet = await selector.wallet();
      await wallet.signOut();
      onChange && onChange(null);
    },
    /** Sends one function call. gas in Tgas, deposit in yoctoNEAR (string or bigint). */
    async call(receiverId, methodName, args = {}, { gas = 100, deposit = "0" } = {}) {
      const wallet = await selector.wallet();
      return wallet.signAndSendTransaction({
        receiverId,
        actions: [actionCreators.functionCall(methodName, args, BigInt(gas) * TGAS, BigInt(deposit))],
      });
    },
  };
}

/**
 * Calls a contract with a published, limited demo key (for example the demo
 * school's key that can only send bills). Testnet only. Returns the tx hash.
 */
export async function callWithDemoKey({ accountId, privateKey, rpcUrl, contractId, methodName, args = {}, gas = 50 }) {
  const signer = new KeyPairSigner(KeyPair.fromString(privateKey));
  const account = new Account(accountId, new JsonRpcProvider({ url: rpcUrl }), signer);
  const outcome = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [actionCreators.functionCall(methodName, args, BigInt(gas) * TGAS, 0n)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  return outcome.transaction.hash;
}
