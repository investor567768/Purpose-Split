// Creates the two Sputnik DAOs Purpose Split leans on, through NEAR's own DAO
// factory (sputnik-v2.testnet). Nothing here is a multisig of ours.
//
//   purposesplit-council.sputnik-v2.testnet   the payee council: votes payees onto the verified list
//   adeyemi-street.sputnik-v2.testnet         the street: its neighbours vote to pay the electrician
//
// Usage: node daos.mjs   (safe to run twice: existing DAOs are left alone)

import { NEAR, TGAS, ROOT, account, exists, link, sub, view } from "./lib.mjs";
import { actions } from "near-api-js";

export const FACTORY = "sputnik-v2.testnet";
export const COUNCIL_DAO = `purposesplit-council.${FACTORY}`;
export const STREET_DAO = `adeyemi-street.${FACTORY}`;

/** A real person's wallet: the build holds no key for it, so its vote is a real tap. */
export const HUMAN_COUNCILLOR = "chrysolitee.testnet";
/** A seat the build holds, so the demo can cast the first vote. Two votes are needed. */
export const STANDIN_COUNCILLOR = sub("council-seat");
export const NEIGHBOURS = [1, 2, 3, 4, 5].map((i) => sub(`resident${i}`));

const VOTE = ["*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize"];
const WEEK_NS = String(7n * 24n * 3600n * 1_000_000_000n);

/** A plain policy: anyone may propose (with a small bond), the group votes, and more than half must agree. */
function policy(group, roleName) {
  return {
    roles: [
      { name: "all", kind: "Everyone", permissions: ["*:AddProposal"], vote_policy: {} },
      { name: roleName, kind: { Group: group }, permissions: ["*:AddProposal", ...VOTE], vote_policy: {} },
    ],
    default_vote_policy: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] },
    proposal_bond: String(NEAR / 10n),
    proposal_period: WEEK_NS,
    bounty_bond: String(NEAR / 10n),
    bounty_forgiveness_period: WEEK_NS,
  };
}

async function createDao(name, purpose, group, roleName) {
  const id = `${name}.${FACTORY}`;
  if (await exists(id)) {
    console.log(`${id} already exists`);
    return id;
  }
  const args = { config: { name, purpose, metadata: "" }, policy: policy(group, roleName) };
  const r = await account(ROOT).signAndSendTransaction({
    receiverId: FACTORY,
    actions: [actions.functionCall("create", { name, args: Buffer.from(JSON.stringify(args)).toString("base64") }, 150n * TGAS, 6n * NEAR)],
  });
  const failed = r.receipts_outcome.find((o) => o.outcome.status.Failure);
  if (failed) throw new Error(`creating ${id} failed: ${JSON.stringify(failed.outcome.status.Failure).slice(0, 300)}`);
  console.log(`${id} created: ${link(r.transaction.hash)}`);
  return id;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createSub } = await import("./lib.mjs");
  if (!(await exists(STANDIN_COUNCILLOR))) await createSub(ROOT, "council-seat", 2);
  if (!(await exists(HUMAN_COUNCILLOR))) throw new Error(`${HUMAN_COUNCILLOR} does not exist on testnet`);
  await createDao(
    "purposesplit-council",
    "The school-list council for Purpose Split: votes schools, hospitals and vendors onto the verified list, with evidence.",
    [HUMAN_COUNCILLOR, STANDIN_COUNCILLOR],
    "council",
  );
  await createDao(
    "adeyemi-street",
    "Adeyemi Street's neighbours: a vote of the street pays the electrician from the street's money box.",
    NEIGHBOURS,
    "neighbours",
  );
  for (const id of [COUNCIL_DAO, STREET_DAO]) {
    const p = await view(id, "get_policy");
    const group = p.roles.find((r) => r.kind.Group).kind.Group;
    console.log(`${id}: members ${group.join(", ")}; bond ${Number(BigInt(p.proposal_bond)) / 1e24} NEAR; threshold ${p.default_vote_policy.threshold.join("/")}`);
  }
}
