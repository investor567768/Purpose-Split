// Where the website reads from. Everything is read straight from NEAR testnet
// in the visitor's browser; there is no server of ours in between.

export const RPCS = ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
export const EXPLORER = "https://testnet.nearblocks.io";
export const ROOT = "purposesplit.testnet";
export const POTS = `pots.${ROOT}`;
// The two Sputnik DAOs, made with NEAR's own DAO factory.
export const DAO_FACTORY = "sputnik-v2.testnet";
export const COUNCIL_DAO = `purposesplit-council.${DAO_FACTORY}`; // votes payees onto the verified list
export const STREET_DAO = `adeyemi-street.${DAO_FACTORY}`; // the neighbours' vote pays the electrician
export const TOKEN = `tusd.${ROOT}`;
export const GITHUB = "https://github.com/investor567768/Purpose-Split"; // the public repository

// Pots from the full demo run (finished: paid, settled, refunded).
export const STORY = { family: 0, street: 1, appeal: 2 };
// Open pots kept funded for 30 days, so anyone can try to cheat them live.
export const LIVE = { family: 3, street: 4, appeal: 5 };
// The "split" box: one school year paid to the school, a bookshop and a hostel, plus pocket money.
export const SPLIT = 6;
// Spare boxes made while recording the video. Boxes can't be deleted from the chain,
// so these are only left off the list; their links still work.
export const HIDDEN_BOXES = [9, 10];
export const INTENTS_BOX = 7; // the gift through a stand-in for NEAR Intents (scripts/intents-sim.mjs)

const s = (name) => `${name}.${ROOT}`;

// Plain names for the demo accounts. The schools and the vendor are made up.
export const PEOPLE = {
  [s("mum")]: "A parent",
  [s("uncle-femi")]: "A relative abroad",
  [s("tolu")]: "The student",
  [s("chairman")]: "The street chairman",
  [STREET_DAO]: "The street's vote",
  [COUNCIL_DAO]: "The payee council",
  [s("registry-dev")]: "The deployer",
  [s("council-seat")]: "A council seat held by the build",
  ["chrysolitee.testnet"]: "Chrysolite",
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
  [s("unityhall")]: "Unity Hall Caterers",
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
  [STREET_DAO]: "the neighbours' vote",
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
      { id: STREET_DAO, label: "The neighbours, after their vote passed", next: "The street's DAO would now carry out the vote and make this payment." },
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
  "llu.purposesplit.testnet": "ed25519:4Zj5Fzj9e2uZ1i4LQviuHFXnGyet6gSgw58fedxxPN3CoJ4YdwBxD2AvopJCpTNSgfgpUDpie22CPq4wUCgoWxhw",
  "sparks.purposesplit.testnet": "ed25519:fF81kCm5rdidpzdRNKqFqmfhjSAPBDLP2HBJD71eihbFJer1RMquLMrmNkWnnQKgY4txBEvKFYtdpC1BexibPXB",
  "lagoonheights.purposesplit.testnet": "ed25519:5pKNk4YHifpbTZurBu5fXkqLwJPKdqrSqnc7yoz21BRgVGt5wt3LyFFZsfCY68K7KXkTM1URsYND4YquUAHEFSvR",
  "cornercare.purposesplit.testnet": "ed25519:2WmaWue1kTJ9pyr9FKN1TUmkPBYiMsNyfR6t4VKFjBEkGL5TKmQ6j8XEQV6CoTDALw6CC1jThe92mDg1G7xW6DB4",
  "campusbooks.purposesplit.testnet": "ed25519:5rkHaYwxfgpaCEzZPbynXK2869omErs3fjuS4eXtaemXTcKWKFazvQQWCewyfLXASh4z7Maits3yJ2N4nWnpS3tq",
  "lagoonhostel.purposesplit.testnet": "ed25519:58WTaEfjWt4Z9qiX1vFCcht4zefky483QXTPa1Dy1VDkGNj81MpLTxGdsgLsdpvmmy9MM7nWiZ8wX2FzR15223FZ"
};

export const STORAGE_DEPOSIT = "1250000000000000000000"; // 0.00125 NEAR, to register with the token
export const BOX_DEPOSIT = "100000000000000000000000"; // 0.1 NEAR for a new money box's storage; the unused part comes back
