// Where the website reads from. Everything is read straight from NEAR testnet
// in the visitor's browser; there is no server of ours in between.

export const RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
export const EXPLORER = "https://testnet.nearblocks.io";
export const ROOT = "purposesplit.testnet";
export const POTS = `pots-dev6.${ROOT}`;
export const TOKEN = `tusd.${ROOT}`;
export const GITHUB = ""; // filled in once the repository is public

// Pots from the full demo run (finished: paid, settled, refunded).
export const STORY = { family: 0, street: 1, appeal: 2 };
// Open pots kept funded for 30 days, so anyone can try to cheat them live.
export const LIVE = { family: 3, street: 4, appeal: 5 };
// The "split" box: one school year paid to the school, a bookshop and a hostel, plus pocket money.
export const SPLIT = 6;

const s = (name) => `${name}.${ROOT}`;

// Plain names for the demo accounts. The schools and the vendor are made up.
export const PEOPLE = {
  [s("mum")]: "A parent",
  [s("uncle-femi")]: "A relative abroad",
  [s("tolu")]: "The student",
  [s("chairman")]: "The street chairman",
  [s("street-dev")]: "The street's vote",
  [s("registry-dev")]: "The school-list council",
  [s("llu")]: "Lagos Lagoon University",
  [s("marinapoly")]: "Marina Polytechnic",
  [s("llu-bursary")]: "A lookalike of the school's account",
  [s("kunle")]: "A friend",
  [s("sureodds")]: "A betting site",
  [s("quicktrade")]: "A crypto trading app",
  [s("sparks")]: "Sparks Electrical",
  [s("lagoonheights")]: "Lagoon Heights Hospital",
  [s("cornercare")]: "Corner Care Pharmacy",
  [s("campusbooks")]: "Campus Books",
  [s("lagoonhostel")]: "Lagoon Hostel",
  [s("emeka")]: "The organiser",
  [s("ngozi-family")]: "The patient's family",
  [s("resident1")]: "Neighbour, no. 3",
  [s("resident2")]: "Neighbour, no. 5",
  [s("resident3")]: "Neighbour, no. 8",
  [s("resident4")]: "Neighbour, no. 12",
  [s("resident5")]: "Neighbour, no. 14",
};

// Short names used when the contract's answer is put into plain words.
export const SAY = {
  [s("tolu")]: "the student",
  [s("mum")]: "the parent",
  [s("llu")]: "Lagos Lagoon University",
  [s("marinapoly")]: "Marina Polytechnic",
  [s("llu-bursary")]: "a lookalike of the school's account",
  [s("kunle")]: "a friend",
  [s("sureodds")]: "a betting site",
  [s("quicktrade")]: "a trading app",
  [s("chairman")]: "the chairman",
  [s("street-dev")]: "the neighbours",
  [s("sparks")]: "Sparks Electrical",
  [s("resident1")]: "one of the neighbours",
  [s("lagoonheights")]: "Lagoon Heights Hospital",
  [s("cornercare")]: "Corner Care Pharmacy",
  [s("emeka")]: "the organiser",
  [s("ngozi-family")]: "the patient's family",
};

// The choices offered in "Try to cheat".
export const CHEATS = {
  family: {
    pot: LIVE.family,
    label: "School fees",
    amount: 280,
    signers: [
      { id: s("tolu"), label: "The student", next: "The student would now sign this payment with their own wallet." },
      { id: s("mum"), label: "The parent", next: "The parent would now sign this payment with their own wallet." },
    ],
    destinations: [
      { id: s("tolu"), label: "The student's own wallet" },
      { id: s("kunle"), label: "A friend who wants a loan" },
      { id: s("sureodds"), label: "A betting site" },
      { id: s("quicktrade"), label: "A crypto trading app" },
      { id: s("llu-bursary"), label: "A fake account that looks like the school's" },
      { id: s("marinapoly"), label: "A different school" },
      { id: s("llu"), label: "The real school, Lagos Lagoon University" },
    ],
  },
  street: {
    pot: LIVE.street,
    label: "The street's transformer",
    amount: 100,
    signers: [
      { id: s("chairman"), label: "The chairman, on his own", next: "The chairman would now sign this payment with his own wallet." },
      { id: s("street-dev"), label: "The neighbours, after their vote passed", next: "The street's DAO would now carry out the vote and make this payment." },
    ],
    destinations: [
      { id: s("chairman"), label: "The chairman's own wallet" },
      { id: s("resident1"), label: "One of the neighbours" },
      { id: s("sparks"), label: "The real electrician, Sparks Electrical" },
    ],
  },
  appeal: {
    pot: LIVE.appeal,
    label: "A surgery appeal",
    amount: 380,
    signers: [
      { id: s("emeka"), label: "The organiser", next: "The organiser would now sign this payment with their own wallet." },
      { id: s("ngozi-family"), label: "The patient's family", next: "" },
    ],
    destinations: [
      { id: s("emeka"), label: "The organiser's own wallet" },
      { id: s("ngozi-family"), label: "The family's own account" },
      { id: s("cornercare"), label: "The pharmacy, for the hospital's bill" },
      { id: s("lagoonheights"), label: "The hospital, for its own bill" },
    ],
  },
};

// Limited keys for the made-up payees. Each key can only send bills, cancel them
// and confirm payments on the money-box contract: it cannot move any money. They
// are published on purpose so any visitor can "play the school" on testnet.
export const DEMO_KEYS = {
  "llu.purposesplit.testnet": "ed25519:49HMidsZcWnvjKveyuBURN6chpdp9U272Fkzaz2G5yUQ7ksQVVCc2a1zyoPpWnXgcyGSWUqnKqFkZDTDe6vFY7Pi",
  "sparks.purposesplit.testnet": "ed25519:4vmc7HaUiNHjMxEV3z8TwYov9PmqgtDGxxxmYxx4Qv69hHYc1Nb62NoYvz8qGzaSdk3szxVBuj4BBgjW5GLgHRtK",
  "lagoonheights.purposesplit.testnet": "ed25519:2XCugtb6iJ7ho2TxmDbmyr8d9RVMqvBXpLJj7U5bu2H5jFJkqAuWUdDFhUQdnECqxT1syuYtxuFAMufBKtWg41zg",
  "cornercare.purposesplit.testnet": "ed25519:2iUBzzEYd4pF7vTyAKPW9vDoHMpNEEfbDdjDsb1w73uuCSBvKwCZ4GDAunXs3x5U1FMprrRytbLWrd75MFKCKxyx",
  "campusbooks.purposesplit.testnet": "ed25519:5eHyaqpMz8j34fikxBPQk9Ev15TupT9A4H5uPFH2RZhRxGaMgTSwAXR9hYjbGgK98ApfbUqFPztgsHZ8H7zUvURB",
  "lagoonhostel.purposesplit.testnet": "ed25519:5UXXKFgSTGfksXedbby7gap8cH2ZQnG8v6wyxNfX3icG1g8gCgHSeJCjsqYFgWXmbXmLmtvyGvoYz4nZXpGz6Fe4"
};

export const STORAGE_DEPOSIT = "1250000000000000000000"; // 0.00125 NEAR, to register with the token
export const BOX_DEPOSIT = "100000000000000000000000"; // 0.1 NEAR for a new money box's storage; the unused part comes back
