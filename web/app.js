// Purpose Split website. Reads everything straight from NEAR testnet in the
// browser. "Try to cheat" asks the contract's own `why_refused` check, so the
// answers on screen are the contract's words, not ours.

import { CHEATS, COUNCIL_DAO, STREET_DAO, INTENTS_BOX, HIDDEN_BOXES, EXPLORER, LIVE, PEOPLE, POTS, RPCS, ROOT, SAY, STORY, SPLIT, TOKEN, GITHUB } from "./config.js";
import {
  canPlay, closeBox, confirmPayment, createBox, currentAccount, explain, getTestDollars, give,
  loadWallet, onAccountChange, payBill, playPayee, proposePayee, proposeRemoval, sendBill, signIn, signOut, voteOnCouncil,
} from "./act.js";

const main = document.getElementById("main");

// ------------------------------------------------------------------ NEAR reads

async function rpc(method, params) {
  let lastError;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "ps", method, params }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error.data || body.error.message);
      if (body.result && body.result.error) throw new Error(body.result.error);
      return body.result;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function view(contract, method, args = {}) {
  const result = await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  const text = new TextDecoder().decode(new Uint8Array(result.result));
  return { value: text ? JSON.parse(text) : null, block: result.block_height };
}

// ------------------------------------------------------------------ helpers

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const nameOf = (id) => PEOPLE[id] || id;
/** The made-up payees carry "(demo)" in their on-chain names; the footer already says they are made up. */
const undemo = (t) => String(t || "").replace(/\s*\(demo\)/gi, "");
/** Our demo boxes were titled with made-up people's names; show them by what they are for. */
const DEMO_TITLES = {
  "Tolu's 2026/27 fees": "School fees, 2026/27",
  "Tolu's whole school year": "A whole school year",
  "Adeyemi Street transformer repair": "Street transformer repair",
  "Mama Ngozi's surgery": "A surgery appeal",
};
/** The test run's step titles name made-up people; show their roles instead. */
const ROLE_WORDS = [
  [/\bUncle Femi's\b/g, "the relative abroad's"], [/\bUncle Femi\b/g, "a relative abroad"],
  [/\bTolu's\b/g, "the student's"], [/\bTolu\b/g, "the student"],
  [/\bMum's\b/g, "the parent's"], [/\bMum\b/g, "the parent"],
  [/\bEmeka's\b/g, "the organiser's"], [/\bEmeka\b/g, "the organiser"],
  [/\bresident(\d)\b/g, "neighbour $1"],
];
const roles = (t) => {
  let out = undemo(t);
  for (const [re, to] of ROLE_WORDS) out = out.replace(re, to);
  return out.replace(/(^|[.:!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
};
const titleOf = (p) => (p.creator && p.creator.endsWith(`.${ROOT}`) && DEMO_TITLES[p.title]) || p.title;

/** The contract's answer with account names swapped for people's names. */
function plain(words) {
  let out = words.replace(/\bThis pot\b/g, "This money box").replace(/\bthis pot\b/g, "this money box");
  const ids = Object.keys(SAY).sort((x, y) => y.length - x.length);
  for (const id of ids) out = out.split(id).join(SAY[id]);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const acct = (id) => `<a class="acct" href="${EXPLORER}/address/${esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`;

/** Base units (6 decimals) to an exact, plain amount: 13333333 → "13.333333". */
function money(base) {
  const v = BigInt(base);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? "." + frac : ""} tUSD`;
}

function when(ns) {
  const d = new Date(Number(BigInt(ns) / 1_000_000n));
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const field = (label, value) =>
  `<div class="field"><span class="field__label">${label}</span><span class="field__value">${value}</span></div>`;

function setTitle(t) {
  document.title = t ? `${t} | Purpose Split` : "Purpose Split";
}

function markNav(name) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/** A payee's display name. */
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const payeeName = (x) => (x && undemo(x.name || nameOf(x.account_id))) || "the payee";

/** "A", "A or B", "A, B or C". */
function either(names) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** The name of the payee an account belongs to, on this box. */
function payeeOf(p, accountId) {
  return payeeName(p.payees.find((x) => x.account_id === accountId) || { account_id: accountId });
}

/** Where a payee itself publishes its account. Demo links use the reserved .example domain. */
function evidenceLine(x) {
  if (!x.evidence) return "";
  const demo = /\.example(\/|$)/.test(x.evidence);
  return `${esc(payeeName(x))} publishes its account at <a href="${esc(x.evidence)}" target="_blank" rel="noopener">${esc(x.evidence.replace(/^https:\/\//, ""))}</a>${demo ? " (a made-up link, because the demo payee is made up)" : ""}.`;
}

// ------------------------------------------------------------------ try to cheat

// Short ideas for "Try to cheat", one list per money box. Roles, not names.
const IDEAS = {
  family: [
    "The student sends the fees to a betting site.",
    "The student sends the fees to their own wallet.",
    "The student pays a fake account that looks like the school's.",
    "The student pays the school less than its bill, to keep the rest.",
  ],
  street: [
    "The chairman pays himself, on his own.",
    "The vote passes, but it tries to pay the chairman.",
    "The vote pays one of the neighbours.",
    "Take the money back before the deadline.",
  ],
  appeal: [
    "The organiser sends the donations to himself.",
    "The organiser pays the hospital's bill to the pharmacy.",
    "The organiser sends it all to the family's own account.",
    "Take the money back before the deadline.",
  ],
};

function cheatSlip(storyKey = "family", { heading = "h2", tabs = true, whose = "demo" } = {}) {
  const id = `cheat-${Math.random().toString(36).slice(2, 8)}`;
  return `
  <form class="slip" id="${id}" data-story="${storyKey}" aria-describedby="${id}-hint">
    <div class="slip__head">
      <${heading}>Try to cheat</${heading}>
      <span class="slip__no" data-potno></span>
    </div>
    ${whose === "demo"
      ? `<p class="live-stamp"><span>Demo box, real rules</span> The people are made up. The answer is real: it comes from the contract on NEAR, which runs this same check before every payment. Nothing is sent.</p>`
      : `<p class="live-stamp"><span>${whose === "yours" ? "Your box" : "This box"}, real rules</span> No money moves when you try. Each answer comes from the real contract on NEAR, the same check it runs before every real payment.</p>`}
    <p class="small" id="${id}-hint">Pick who tries, what they try, and where the money goes. Then press Try it.</p>
    ${tabs ? `<div class="switch" role="group" aria-label="Which money box">
      <button type="button" data-story-btn="family">School fees</button>
      <button type="button" data-story-btn="street">Street fund</button>
      <button type="button" data-story-btn="appeal">Appeal</button>
    </div>` : ""}
    <label class="field"><span class="field__label">Who is trying</span><select data-signer></select></label>
    <label class="field"><span class="field__label">What they try</span>
      <select data-action>
        <option value="send">Send money out of the box</option>
        <option value="refund">Take the money back now, before the deadline</option>
      </select>
    </label>
    <label class="field" data-send-only><span class="field__label">Send the money to</span><select data-to></select></label>
    <label class="field" data-send-only><span class="field__label">Amount</span>
      <span class="amount-row"><input data-amount type="number" min="0.000001" step="any" inputmode="decimal"><span>tUSD</span></span>
    </label>
    <button class="button" type="submit">Try it</button>
    <div class="verdict" data-verdict aria-live="polite"></div>
    <details class="ideas"><summary>Ideas to try <span data-ideas-n></span></summary><ol data-ideas></ol></details>
  </form>`;
}

/** A live NEAR Intents price for giving from another chain (a dry quote: nothing is sent). */
const INTENTS_ROUTES = [
  ["usdc-base", "USDC on Base"], ["usdc-sol", "USDC on Solana"], ["usdc-eth", "USDC on Ethereum"],
  ["usdc-arb", "USDC on Arbitrum"], ["usdt-tron", "USDT on Tron"],
];
function intentsQuoteForm(compact = false) {
  const head = compact
    ? `<p class="small">This shows what a gift from another chain would cost on mainnet, through NEAR Intents. It is a live price and nothing is sent. In this testnet demo, you give test dollars with the Give button.</p>`
    : `<div class="slip__head"><h2>Give from another chain</h2><span class="slip__no">NEAR Intents · live</span></div>
    <p class="small">A relative abroad can pay with what they already hold. NEAR Intents brings it to NEAR as USDC. Ask for a live price: it is a real mainnet quote from NEAR Intents, and nothing is sent.</p>`;
  return `
  <form class="${compact ? "mini intents--compact" : "slip intents"}" data-intents>
    ${head}
    <label class="field"><span class="field__label">They pay with</span>
      <select name="route">${INTENTS_ROUTES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
    <label class="field"><span class="field__label">Amount</span>
      <span class="amount-row"><input name="amount" type="number" min="1" max="100000" step="0.01" inputmode="decimal" value="200"><span data-intents-unit>USDC</span></span></label>
    <button class="button" type="submit">Get a price</button>
    <div class="intents__out" data-intents-out aria-live="polite"></div>
  </form>`;
}
async function askIntents(form) {
  const out = form.querySelector("[data-intents-out]");
  const route = form.route.value;
  const amount = form.amount.value.trim();
  out.innerHTML = `<p class="small">Asking NEAR Intents…</p>`;
  try {
    const r = await fetch("/api/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ route, amount }) });
    const q = await r.json().catch(() => ({}));
    if (!r.ok || !q.amountOut) throw new Error(q.error || "");
    const n = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
    const secs = Number(q.seconds);
    const time = secs > 0 ? (secs < 90 ? `about ${Math.max(1, Math.round(secs))} seconds` : `about ${Math.round(secs / 60)} minutes`) : "";
    const at = new Date(q.at);
    out.innerHTML = `
      <p class="intents__big"><strong>${esc(n(q.amountIn))} ${esc(q.from)}</strong> → about <strong>${esc(n(q.amountOut))} USDC on NEAR</strong>${time ? `, in ${time}` : ""}.</p>
      <p class="small">Live mainnet price from NEAR Intents${isNaN(at) ? "" : `, ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}. A dry quote: it prices the route and nothing is sent. ${form.classList.contains("intents--compact") ? "On mainnet that USDC would go into this box and count as the giver's gift." : "On mainnet that USDC would go into the money box and be credited to the relative, as the stand-in shows above with test dollars."}</p>`;
  } catch (e) {
    const tooSmall = /minimum/i.test(e.message || "");
    out.innerHTML = `<p class="small">Couldn't get a price from NEAR Intents${tooSmall ? "" : " right now"}${e.message ? ` (${esc(e.message)})` : ""}. ${tooSmall ? "Try a larger amount." : "Try again in a minute."}</p>`;
  }
}
document.addEventListener("submit", (e) => {
  const form = e.target.closest && e.target.closest("[data-intents]");
  if (!form) return;
  e.preventDefault();
  askIntents(form);
});
document.addEventListener("change", (e) => {
  const form = e.target.closest && e.target.closest("[data-intents]");
  if (form && e.target.name === "route") form.querySelector("[data-intents-unit]").textContent = e.target.value.startsWith("usdt") ? "USDT" : "USDC";
});

/** The "Try to cheat" choices for any box, worked out from the box itself. */
function cheatFor(p, me) {
  const s = (n) => `${n}.${ROOT}`;
  const group = p.kind === "Group";
  // Real roles from the box itself: "The student", "A parent", or "You" on your own box.
  const short = (id) => cap(String(SAY[id] || nameOf(id)).split(",")[0]); // "Chrysolite, a councillor" -> "Chrysolite"
  const role = (id) => (id === me ? "You" : short(id));
  const whose = (id) => (id === me ? "Your own wallet" : `${short(id)}'s own wallet`);
  const signers = [{ id: p.releaser, label: group ? "The group, after its vote passed" : `${role(p.releaser)} (pays the bills)`, next: "" }];
  if (p.creator !== p.releaser) signers.push({ id: p.creator, label: `${role(p.creator)} (started the box)`, next: "" });
  if (me && me !== p.releaser && me !== p.creator) signers.push({ id: me, label: "You", next: "" });
  signers.push({ id: s("kunle"), label: "A stranger", next: "" });

  const destinations = [{ id: p.releaser, label: group ? "The group's own account" : whose(p.releaser) }];
  if (p.creator !== p.releaser) destinations.push({ id: p.creator, label: whose(p.creator) });
  destinations.push({ id: s("sureodds"), label: "A betting site" }, { id: s("kunle"), label: "A friend who wants a loan" });
  const other = [s("marinapoly"), s("llu")].find((a) => !p.payees.some((x) => x.account_id === a));
  if (other) destinations.push({ id: other, label: `${payeeName({ account_id: other })}, which this box doesn't pay` });
  p.payees.forEach((x) => destinations.push({ id: x.account_id, label: `${payeeName(x)}, the payee on this box` }));

  const bill = p.requests.find((x) => x.status === "Open");
  const base = bill ? bill.amount : BigInt(p.held) > 0n ? p.held : p.target;
  return {
    pot: p.id,
    amount: Number(BigInt(base)) / 1e6,
    signers,
    destinations,
    ideas: [
      "Send the money to your own wallet.",
      "Send it to a betting site.",
      "Pay a payee an amount it never billed.",
      "Take the money back before the deadline.",
    ],
  };
}

function wireCheat(form, own) {
  const signer = form.querySelector("[data-signer]");
  const action = form.querySelector("[data-action]");
  const to = form.querySelector("[data-to]");
  const amount = form.querySelector("[data-amount]");
  const verdict = form.querySelector("[data-verdict]");
  const potNo = form.querySelector("[data-potno]");
  const submit = form.querySelector("button[type=submit]");

  function showFields() {
    const send = action.value === "send";
    form.querySelectorAll("[data-send-only]").forEach((el) => (el.hidden = !send));
    verdict.innerHTML = "";
  }

  const configOf = (key) => own || CHEATS[key];
  const ideasOf = (key) => (own && own.ideas) || IDEAS[key];

  function load(key) {
    const c = configOf(key);
    form.dataset.story = key;
    form.querySelectorAll("[data-story-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.storyBtn === key)));
    signer.innerHTML = c.signers.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
    to.innerHTML = c.destinations.map((d) => `<option value="${esc(d.id)}">${esc(d.label)}</option>`).join("");
    amount.value = c.amount;
    action.value = "send";
    potNo.innerHTML = location.hash === `#/pot/${c.pot}` ? "" : `<a href="#/pot/${c.pot}">See this box</a>`;
    form.querySelector("[data-ideas]").innerHTML = ideasOf(key).map((t) => `<li>${esc(t)}</li>`).join("");
    form.querySelector("[data-ideas-n]").textContent = `(${ideasOf(key).length})`;
    showFields();
  }

  form.querySelectorAll("[data-story-btn]").forEach((b) => b.addEventListener("click", () => load(b.dataset.storyBtn)));
  action.addEventListener("change", showFields);
  [signer, to, amount].forEach((el) => el.addEventListener("change", () => (verdict.innerHTML = "")));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = configOf(form.dataset.story);
    const refund = action.value === "refund";
    const units = Math.round(Number(amount.value) * 1e6);
    if (!refund && (!Number.isFinite(units) || units <= 0)) {
      verdict.innerHTML = `<p class="error">Enter an amount above zero.</p>`;
      return;
    }
    submit.disabled = true;
    submit.textContent = "Checking…";
    try {
      const method = refund ? "why_refund_refused" : "why_refused";
      const args = refund
        ? { pot_id: c.pot }
        : { pot_id: c.pot, caller: signer.value, to: to.value, amount: String(units) };
      const { value, block } = await view(POTS, method, args);
      const answered = `<p class="answered">Answered by ${acct(POTS)} on NEAR testnet at block ${block.toLocaleString("en-US")}, through its <code>${method}</code> check. Nothing was sent and no wallet was needed.</p>`;
      if (value) {
        verdict.innerHTML = `
          <span class="stamp stamp--no">Refused</span>
          <p class="words words--no">${esc(plain(value))}</p>
          <details class="exact"><summary>See the contract's exact words</summary>
            <p>“${esc(value)}”</p>${answered}
          </details>`;
      } else {
        const yes = refund
          ? "Yes. The deadline has passed, so the money can go back to the people who gave it."
          : `Yes. ${money(units)} can go to ${SAY[to.value] || nameOf(to.value)}, because that is exactly what it billed.`;
        verdict.innerHTML = `
          <span class="stamp stamp--ok">Allowed</span>
          <p class="words words--ok">${esc(yes)}</p>
          <details class="exact"><summary>See how this was checked</summary>
            <p>The contract found no reason to refuse. ${esc(refund ? "" : (c.signers.find((s) => s.id === signer.value) || {}).next || "")}</p>${answered}
          </details>`;
      }
    } catch (err) {
      verdict.innerHTML = `<p class="error">Couldn't reach NEAR testnet just now. Check your connection and press the button again.</p>`;
    } finally {
      submit.disabled = false;
      submit.textContent = "Try it";
    }
  });

  load(form.dataset.story);
}

// ------------------------------------------------------------------ books

async function booksLine() {
  const [{ value: totals }, { value: balance }] = await Promise.all([
    view(POTS, "get_totals"),
    view(TOKEN, "ft_balance_of", { account_id: POTS }),
  ]);
  const accounted = BigInt(totals.held) + BigInt(totals.owed);
  const ok = BigInt(balance) === accounted;
  return {
    ok,
    html: `<p>The contract holds <strong>${money(balance)}</strong> right now. Its open money boxes${
      BigInt(totals.owed) > 0n ? " and the money it owes" : ""
    } account for <strong>${money(accounted)}</strong>.</p>
    <span class="stamp stamp--small ${ok ? "stamp--ok" : "stamp--no"}">${ok ? "Balanced" : "Mismatch"}</span>`,
  };
}

// ------------------------------------------------------------------ pages

const QUESTIONS = [
  ["Is this real money?", "No. This runs on NEAR testnet with test dollars (tUSD) that are free and have no value, so you can try every step safely. A real launch would use USDC, a digital dollar that already exists on NEAR."],
  ["Why not just pay the school directly?", "If one parent pays one school, a bank transfer is fine. A money box helps when several people chip in, including relatives abroad. Everyone puts money into one place, everyone can see the school was paid, and whatever isn't used can be sent back to each of them, by anyone, without anyone's approval. Nobody has to trust the person holding the money."],
  ["Can the student send the money anywhere else?", "No. The money box pays only the school named on it, and only against a bill the school itself sent. Try it above: every other destination is refused."],
  ["What is the pass?", `When the school confirms it was paid, the contract gives the student a "Fees paid" pass. Nobody can make one any other way, and it can't be sold or lent to a friend. Anyone can check it, for example before an exam or at the hostel gate, and another system can ask the contract directly whether a student has paid a school, and get a yes or no. <a href="#/pass">Check a pass</a>.`],
  ["How do you know the account really belongs to the school?", "The contract can't know that by itself, so the list has to be trustworthy. A school is added only by a council vote, and only with a link to where the school itself publishes its account. You see that link before you send. If a school is ever removed, families can take their money back at once."],
  ["How does a school, hospital or shop get onboarded?", "It makes a free NEAR account and shows that account on a page it already runs, such as its website or official social media, the way businesses print their bank account today. Anyone then proposes it on the <a href=\"#/payees\">Payees page</a> with that link, and the payee council checks the link and votes. Once the vote passes, money boxes can name it, and it sends its bills and confirms payments from its own account. On mainnet it would be paid in USDC; cashing out to naira or another local currency is on our roadmap."],
  ["Do families need crypto to use it?", "On this testnet demo, yes: giving needs a NEAR testnet wallet, and <a href=\"#/try\">How to try it</a> takes about five minutes. In real use, givers would still need a NEAR account, so refunds have somewhere to go, but they won't need to hold NEAR: through NEAR Intents they can pay with what they already have on other chains, such as USDT on Tron (see the live price under Give on any box), and an app can cover NEAR's small network fees for them. Paying in with a bank account or card, in local currency, is on our roadmap."],
  ["Can the people who built this take the money?", "The contract has no function that sends a box's money anywhere except its named payees, its stated free part, or back to the givers. This contract is not locked yet: we kept its key so we could fix a bug during the hackathon. Anyone can check that the code running now is exactly the open-source code, and a real launch would delete the key so nobody could change it."],
  ["Why NEAR?", "Several things here work because it's NEAR. Accounts have names, like llu.purposesplit.testnet, so families can see who is being paid instead of a long code. The verified list of payees and the street's vote run on Sputnik DAO, NEAR's DAO system. A NEAR key can be limited to a few actions, which is how you can play the school on this site: its key can send bills and confirm payments, but can't move money. Passes are standard NEAR NFTs. And the money box is ready for NEAR Intents, so a relative abroad can give from another chain: the contract credits the gift and any refund to the real giver. Intents runs only on mainnet, so here the gift is shown with a stand-in, and the website shows live NEAR Intents prices. <a href=\"#/pot/7\">See a gift from abroad</a>."],
  ["What does it cost?", "We charge nothing. Each action is a NEAR transaction with a network fee well under a cent, and creating a money box needs a small one-time storage deposit in NEAR."],
  ["Can I check all this?", `Yes. Every step of the test run is on the public explorer, the books are checked live, and the contract is open source with a test for every rule. <a href="#/proof">Open the proof page</a>.`],
];

const faq = (list) => `<div class="faq">${list
  .map(([q, ans], i) => `<details><summary><span class="faq__n">Q${i + 1}</span><span class="faq__q">${q}</span></summary><p>${ans}</p></details>`)
  .join("")}</div>`;

const TEMPLATES = [
  ["School fees", "Relatives fund it. The student pays the school's bill and nothing else.", "Working in this demo"],
  ["A shared repair", "Neighbours fund it. Their vote pays the named contractor, against his requests.", "Working in this demo"],
  ["A public appeal", "Anyone gives through a link. Only the hospital, pharmacy or other named payees can be paid.", "Working in this demo"],
  ["A wedding, burial or event", "Family and friends fund the hall, caterer and canopy, plus a stated part for the family.", "Same rules, different payees"],
  ["Rent or a group purchase", "Pays only the landlord or seller, and only if the full amount is raised.", "Same rules, different payees"],
];

function home() {
  setTitle("");
  markNav("home");
  main.innerHTML = `
  <section class="hero">
    <h1>Parents send school fees. The money can only pay the school.</h1>
    <p class="lead">The family puts the fees into one money box. The student can pay the school from it, and nobody else. When the school confirms, the student gets a pass that proves the fees are paid.</p>
    <p class="cta">
      <a class="button" href="#try-h">Try to cheat</a>
      <a class="button button--quiet" href="#/try">How to try it</a>
    </p>
  </section>

  <ol class="story" aria-label="How it works">
    <li class="slip">
      <h2>The family sends the fees</h2>
      <p>A parent puts 300 into a money box for the school fees. An uncle abroad adds to the same box.</p>
    </li>
    <li class="slip">
      <h2>It can only pay the school</h2>
      <p>The student's own wallet, a friend who wants a loan, a fake account: the money box says no to all of them.</p>
      <span class="stamp stamp--small stamp--no">Refused</span>
    </li>
    <li class="slip">
      <h2>The student gets a pass</h2>
      <p>The school sends its bill, the student pays it, and the school confirms. The student now holds a "Fees paid" pass that anyone can check.</p>
      <span class="stamp stamp--small stamp--ok">Paid</span>
    </li>
  </ol>

  <section class="section" aria-labelledby="try-h">
    <h2 id="try-h">Don't take our word for it</h2>
    <p class="lead">Choose where the school fees go and see what happens. The answer comes from the real money box on NEAR, live.</p>
    <div class="pot-grid">
      ${cheatSlip("family", { heading: "h3", tabs: false })}
      <aside class="prose">
        <h3>What is the money box?</h3>
        <p>A small program on the NEAR blockchain, called a smart contract. It holds the fees and follows its rules on its own. Nobody can override it: not the student, not the parent, not us.</p>
        <h3>How do we know it's really the school?</h3>
        <p>The money box only pays accounts on a verified list. A school gets on the list when a council votes it in, with a link to where the school itself publishes that account. You see the link before you send.</p>
        <p data-evidence class="small"></p>
      </aside>
    </div>
  </section>

  <section class="section" aria-labelledby="pass-h">
    <h2 id="pass-h">Proof the fees were paid</h2>
    <p class="lead">This is a real pass, read from NEAR just now. The school's confirmation made it. Nobody can fake one, sell one or lend one to a friend.</p>
    <div class="pot-grid">
      <div data-pass><p class="loading">Reading the pass from NEAR testnet…</p></div>
      <aside class="prose">
        <h3>Check anyone's pass</h3>
        <p>An exam officer or a hostel porter types the student's account and sees the answer straight from the contract.</p>
        ${passForm()}
      </aside>
    </div>
  </section>

  <section class="section" aria-labelledby="back-h">
    <h2 id="back-h">What if it doesn't work out?</h2>
    <p class="lead">Nobody's money gets stuck. Anyone can press refund, with no approval needed, and the contract sends each person their exact share of what they gave.</p>
    <ul class="outcomes">
      <li><h3>The bill is smaller than the box</h3><p>After the deadline, the part that wasn't used goes back to everyone who gave.</p></li>
      <li><h3>The target isn't reached</h3><p>If the box was set to "all or nothing", nobody is paid and everyone gets everything back.</p></li>
      <li><h3>The school is removed from the list</h3><p>Givers can take their money back at once, without waiting for the deadline.</p></li>
    </ul>
  </section>

  <section class="section" aria-labelledby="q-h">
    <h2 id="q-h">Questions</h2>
    ${faq(QUESTIONS)}
  </section>`;

  wireCheat(main.querySelector("form[data-story]"));
  wirePassForm(main);
  view(POTS, "get_pass", { pot_id: STORY.family, payment_index: 0 })
    .then(({ value, block }) => {
      main.querySelector("[data-pass]").innerHTML = value ? passCard(value, block) : `<p>No pass has been issued yet.</p>`;
    })
    .catch(() => (main.querySelector("[data-pass]").innerHTML = `<p class="error">Couldn't reach NEAR testnet just now.</p>`));
  view(POTS, "get_pot", { pot_id: LIVE.family })
    .then(({ value: p }) => {
      if (p && p.payees[0]) main.querySelector("[data-evidence]").innerHTML = evidenceLine(p.payees[0]);
    })
    .catch(() => {});
}

// ------------------------------------------------------------------ passes

/** One pass, drawn as a stamped ticket. */
function passCard(x, block) {
  const [what, ...rest] = undemo(x.title).split(": ");
  const to = rest.join(": ") || x.payee;
  return `
  <article class="pass">
    <div class="pass__top"><span>Purpose Split pass</span><span>No. ${esc(x.token_id)}</span></div>
    <h3 class="pass__what">${esc(what)}</h3>
    <p class="pass__to">${esc(to)}</p>
    ${field("Held by", `${esc(nameOf(x.holder))} <small>${acct(x.holder)}</small>`)}
    ${field("Amount", money(x.amount))}
    ${x.reference ? field("Reference", esc(x.reference)) : ""}
    ${field("Confirmed by the payee on", when(x.confirmed_at_ns))}
    <div class="status-line">
      <span class="stamp stamp--ok">Paid</span>
      <p class="small">${block ? `Read from ${acct(POTS)} at block ${block.toLocaleString("en-US")}. ` : ""}It cannot be faked, sold or lent.</p>
    </div>
    <p class="pass__links"><a href="#/receipt/${x.pot_id}/${x.payment_index}">The receipt</a> <a href="#/pot/${x.pot_id}">The money box</a></p>
  </article>`;
}

const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([._-][a-z0-9]+)*$/;

function passForm(value = "") {
  return `<form class="mini pass-form" data-pass-form novalidate>
    <label class="field"><span class="field__label">A NEAR account</span>
      <input name="account" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="tolu.${ROOT}" value="${esc(value)}"></label>
    <button class="button" type="submit">Check</button>
    <p class="small" data-pass-msg aria-live="polite"></p>
  </form>`;
}

function wirePassForm(root) {
  const form = root.querySelector("[data-pass-form]");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const account = String(new FormData(form).get("account") || "").trim().toLowerCase();
    if (!ACCOUNT_RE.test(account)) {
      form.querySelector("[data-pass-msg]").textContent = "Type a NEAR account name, like tolu.purposesplit.testnet.";
      return;
    }
    location.hash = `#/pass/${account}`;
  });
}

async function passPage(account) {
  setTitle("Check a pass");
  markNav("pass");
  const valid = account && ACCOUNT_RE.test(account);
  const demo = `tolu.${ROOT}`;
  main.innerHTML = `
  <section class="page-head">
    <h1>Check a pass</h1>
    <p class="lead">When a school confirms it was paid, the contract gives the student a pass. Type an account to see its passes. The answer comes straight from NEAR, so nobody can fake it.</p>
  </section>
  <div class="pot-grid">
    <div data-results>${valid ? `<p class="loading">Reading passes for ${esc(account)} from NEAR testnet…</p>` : `<p>Type an account to check, or try the student from our demo: <a href="#/pass/${demo}">${demo}</a>.</p>`}</div>
    <aside class="slip slip--yellow">
      <div class="slip__head"><h2>Whose pass?</h2></div>
      ${passForm(valid ? account : "")}
      ${currentAccount() ? `<p><a href="#/pass/${esc(currentAccount())}">Check my own account</a></p>` : ""}
      <p class="small">A pass appears only after a verified payee confirms it was paid. It stays with the account that paid, and it can't be moved.</p>
    </aside>
  </div>`;
  wirePassForm(main);
  if (!valid) return;
  const out = main.querySelector("[data-results]");
  try {
    const { value: passes, block } = await view(POTS, "get_passes", { account_id: account });
    if (!document.body.contains(out)) return;
    out.innerHTML = passes.length
      ? `<p class="kicker">${passes.length} ${passes.length === 1 ? "pass" : "passes"} held by ${esc(account)}</p><div class="pass-list">${passes.slice().reverse().map((x) => passCard(x, block)).join("")}</div>`
      : `<div class="slip"><span class="stamp stamp--no">No pass</span><p><strong>${esc(account)}</strong> holds no pass on this contract.</p><p class="small">Either no bill has been paid from a box where this account presses pay, or the payee has not confirmed it yet. Try the student from our demo: <a href="#/pass/${demo}">${demo}</a>.</p></div>`;
  } catch {
    out.innerHTML = `<p class="error">Couldn't reach NEAR testnet just now. Reload the page to try again.</p>`;
  }
}

/** Where a box is in its life: give, the payee bills, pay, the payee confirms. */
function nextSteps(p) {
  const openBill = p.requests.find((x) => x.status === "Open");
  const unconfirmed = p.payments.find((x) => !x.confirmed);
  const payees = either(p.payees.map(payeeName));
  const payer = p.kind === "Group" ? "The group's vote" : p.releaser === currentAccount() ? "You" : cap(SAY[p.releaser] || nameOf(p.releaser));
  let now, note;
  if (p.status !== "Open") { now = 4; note = "This box is closed. Whatever wasn't used went back to the people who gave."; }
  else if (BigInt(p.raised) === 0n) { now = 0; note = "Nobody has given yet. The box needs money before anything else can happen."; }
  else if (openBill) { now = 2; note = `${payeeOf(p, openBill.payee)} has sent a bill for ${money(openBill.amount)}. ${payer} can pay it now.`; }
  else if (unconfirmed) { now = 3; note = `The bill is paid. When ${payeeOf(p, unconfirmed.to)} confirms it arrived, a pass is issued.`; }
  else if (!p.payments.length) { now = 1; note = `There is money in the box. Nothing can leave until ${payees} sends a bill.`; }
  else { now = 4; note = `Paid and confirmed, and a pass was issued. <a href="#/pass/${esc(p.releaser)}">See the pass</a>. Whatever is left goes back after the deadline.`; }
  const names = ["Give", "The payee sends a bill", "Pay the bill", "The payee confirms"];
  return `<div class="nextup" aria-label="What happens next">
    <ol>${names.map((n, i) => `<li class="${i < now ? "done" : ""}" ${i === now ? 'aria-current="step"' : ""}><span>${i + 1}</span>${n}</li>`).join("")}</ol>
    <p>${now === 4 && p.status === "Open" ? note : esc(note)}</p>
  </div>`;
}

function templateList() {
  return `<ul class="templates">${TEMPLATES.map(
    ([name, rule, state]) => `<li><h3>${name}</h3><p>${rule}</p><p class="small">${state}</p></li>`
  ).join("")}</ul>`;
}

function startPage() {
  setTitle("Start a money box");
  markNav("start");
  main.innerHTML = `
  <section class="page-head">
    <h1>Start a money box</h1>
    <p class="lead">Say what the money is for and who can be paid. Those rules are locked in when you create it, so the money can only be used for that.</p>
  </section>
  <div class="pot-grid">
    <form class="slip" data-start novalidate>
      <div class="slip__head"><h2>Your money box</h2><span class="slip__no">NEAR testnet</span></div>
      <label class="field"><span class="field__label">What is the money for?</span>
        <input name="title" maxlength="80" required placeholder="School fees, 2026/27"></label>
      <fieldset class="field"><legend class="field__label">Who can be paid? Pick up to three from the verified list</legend>
        <div class="checks" data-payees><span class="small">Reading the verified list…</span></div></fieldset>
      <label class="field"><span class="field__label">A reference sent with every payment (optional)</span>
        <input name="reference" maxlength="40" placeholder="Matric number, patient number, job number"></label>
      <fieldset class="field"><legend class="field__label">Who pays the bills from this box?</legend>
        <label class="radio"><input type="radio" name="who" value="me" checked> Me</label>
        <label class="radio"><input type="radio" name="who" value="person"> Someone else, for example the student</label>
        <label class="radio"><input type="radio" name="who" value="dao"> A group that votes (a Sputnik DAO)</label>
        <input name="releaser" placeholder="their-account.testnet" hidden></fieldset>
      <label class="field"><span class="field__label">Target</span>
        <span class="amount-row"><input name="target" type="number" min="1" step="any" inputmode="decimal" value="300"><span>tUSD</span></span></label>
      <label class="field"><span class="field__label">Deadline</span>
        <select name="deadline">
          <option value="10">In 10 minutes (to try it quickly)</option>
          <option value="60">In 1 hour</option>
          <option value="1440">In 1 day</option>
          <option value="10080" selected>In 1 week</option>
          <option value="43200">In 30 days</option>
        </select></label>
      <div class="agree" data-agree></div>
      <div data-go></div>
      <p class="small" data-msg aria-live="polite"></p>
    </form>
    <aside class="prose">
      <h3>Any purpose</h3>
      ${templateList()}
      <h3>New to NEAR testnet?</h3>
      <p>You need a free testnet wallet and a little test NEAR. <a href="#/try">How to try it</a> walks you through it in five minutes. Creating a box costs 0.1 test NEAR for storage, and the unused part comes back.</p>
    </aside>
  </div>`;

  const form = main.querySelector("[data-start]");
  const msg = form.querySelector("[data-msg]");
  const units = (v) => Math.round(Number(v) * 1e6);

  view(POTS, "get_payees", { from_index: 0, limit: 100 })
    .then(({ value }) => {
      form.querySelector("[data-payees]").innerHTML = value
        .map((x) => `<label class="radio"><input type="checkbox" name="payee" value="${esc(x.account_id)}"> ${esc(undemo(x.name))} <span class="small">${esc(x.account_id)}</span></label>`)
        .join("");
      update();
    })
    .catch(() => (form.querySelector("[data-payees]").innerHTML = `<p class="error">Couldn't read the verified list. Reload to try again.</p>`));

  function read() {
    const f = new FormData(form);
    const me = currentAccount();
    const who = f.get("who");
    const releaser = who === "me" ? me : (f.get("releaser") || "").trim();
    const payees = f.getAll("payee");
    const free = false;
    return {
      me, who, releaser, payees, free,
      title: (f.get("title") || "").trim(),
      reference: (f.get("reference") || "").trim(),
      target: units(f.get("target")),
      deadline: Number(f.get("deadline")),
      aon: false,
      freeLabel: (f.get("freeLabel") || "").trim(),
      freeAmount: units(f.get("freeAmount")),
      freeTo: (f.get("freeTo") || "").trim() || me,
    };
  }

  function problems(d) {
    if (!d.title) return "Say what the money is for.";
    if (!d.payees.length) return "Pick at least one payee.";
    if (d.payees.length > 3) return "Pick at most three payees.";
    if (!d.releaser) return d.who === "me" ? "Sign in first." : "Enter the account that presses pay.";
    if (d.payees.includes(d.releaser)) return "The person who presses pay can't also be a payee.";
    if (!(d.target > 0)) return "Enter a target above zero.";
    if (d.free && (!d.freeLabel || !(d.freeAmount > 0) || !d.freeTo)) return "Give the free part a name, an amount and who it goes to.";
    return null;
  }

  function update() {
    const d = read();
    form.querySelector("[name=releaser]").hidden = d.who === "me";
    const names = d.payees.map((id) => nameOf(id));
    const who = d.who === "dao" ? `a vote of ${d.releaser || "the DAO"}` : d.who === "me" ? "you" : d.releaser || "the person you name";
    form.querySelector("[data-agree]").innerHTML = `
      <h3>What you're agreeing to</h3>
      <ul>
        <li>Up to ${money(d.target || 0)} can only ever go to ${esc(names.length ? either(names) : "the payees you pick")}, and only against their own bills.</li>
        <li>Only ${esc(who)} can pay those bills.</li>
        ${d.free ? `<li>${money(d.freeAmount || 0)} is “${esc(d.freeLabel)}”, sent straight to ${esc(d.freeTo || "the person you name")} as it comes in.</li>` : ""}
        <li>${d.aon ? "If the target isn't reached, nothing is paid and everyone gets everything back." : "Bills can be paid from whatever has been raised."}</li>
        <li>After the deadline, anyone can send what's left back to each giver, in proportion to what they gave. Nobody has to approve it.</li>
        <li>Nobody can change these rules later, including you.</li>
      </ul>`;
    const go = form.querySelector("[data-go]");
    go.innerHTML = currentAccount()
      ? `<button class="button" type="submit">Create the money box</button>`
      : `<button class="button" type="button" data-signin>Sign in to create it</button>`;
    const si = go.querySelector("[data-signin]");
    if (si) si.addEventListener("click", () => signIn());
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  onAccountChange(() => document.body.contains(form) && update());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = read();
    const problem = problems(d);
    if (problem) { msg.textContent = problem; return; }
    msg.textContent = "Confirm it in your wallet…";
    try {
      await createBox({
        kind: d.who === "dao" ? "Group" : "Personal",
        title: d.title,
        payees: d.payees,
        reference: d.reference,
        releaser: d.releaser,
        target: String(d.target),
        deadline_minutes: d.deadline,
        all_or_nothing: d.aon,
        free_part: d.free ? { label: d.freeLabel, amount: String(d.freeAmount), to: d.freeTo } : null,
      });
      msg.textContent = "Created. Opening it…";
      const { value: totals } = await view(POTS, "get_totals");
      const from = Math.max(0, totals.pots - 20);
      const { value: recent } = await view(POTS, "get_pots", { from_index: from, limit: 20 });
      const mine = recent.filter((p) => p.creator === d.me).pop();
      location.hash = mine ? `#/pot/${mine.id}` : "#/pots";
    } catch (err) {
      msg.textContent = explain(err);
    }
  });
  update();
}

async function receiptPage(potId, index) {
  setTitle("Receipt");
  markNav("pots");
  main.innerHTML = `<p class="loading">Reading the receipt from NEAR testnet…</p>`;
  let p;
  try {
    ({ value: p } = await view(POTS, "get_pot", { pot_id: Number(potId) }));
  } catch {
    main.innerHTML = `<p class="error">Couldn't reach NEAR testnet just now. Reload the page to try again.</p>`;
    return;
  }
  const pay = p && p.payments[Number(index)];
  if (!pay) {
    main.innerHTML = `<section class="page-head"><h1>There is no such receipt</h1><p class="lead"><a href="#/pots">See all the money boxes</a></p></section>`;
    return;
  }
  const req = p.requests[pay.request_id];
  const payee = payeeOf(p, pay.to);
  const text = `${titleOf(p)}: ${money(pay.amount)} paid to ${payee}${pay.confirmed ? `, and ${payee} confirmed they received it` : ""}. The money could not go anywhere else. Check it yourself: ${location.href}`;
  main.innerHTML = `
  <section class="page-head">
    <h1>Receipt</h1>
    <p class="lead">Read live from the contract on NEAR testnet. Nobody can edit it, including the person sharing it.</p>
  </section>
  <article class="slip receipt">
    <div class="slip__head"><h2>${esc(titleOf(p))}</h2><span class="slip__no">Box ${p.id}, payment ${Number(index) + 1}</span></div>
    ${field("Paid to", `${esc(payee)} <small>${acct(pay.to)} <span class="check">on the verified list</span></small>`)}
    ${field("Amount", money(pay.amount))}
    ${field("For", esc(req ? req.note : ""))}
    ${p.reference ? field("Reference", esc(p.reference)) : ""}
    ${field("Paid on", when(pay.at_ns))}
    ${field("Given by", p.contributions.map((c) => `${esc(nameOf(c.account_id))}: ${money(c.amount)}`).join("<br>"))}
    <div class="status-line">
      <span class="stamp ${pay.confirmed ? "stamp--ok" : "stamp--no"}">${pay.confirmed ? "Received" : "Not confirmed"}</span>
      <p class="small">${pay.confirmed ? `${esc(payee)} confirmed on-chain that this payment reached it.` : `${esc(payee)} has not confirmed this payment yet.`}</p>
    </div>
    ${pay.pass_id ? `<p class="small">A pass was issued to ${esc(nameOf(p.releaser))} for this payment. <a href="#/pass/${esc(p.releaser)}">See the pass</a>.</p>` : ""}
    <p class="cta">
      <a class="button" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Send the proof to the family</a>
      <a class="button button--quiet" href="#/pot/${p.id}">See the whole money box</a>
    </p>
  </article>`;
}

// Our examples, shown first on the Money boxes page.
const EXAMPLES = [
  { id: SPLIT, story: null, kicker: "School year", title: "A whole school year", blurb: "One box pays the school, a bookshop and a hostel, each only against its own bill, plus pocket money." },
  { id: LIVE.street, story: "street", kicker: "Street fund", title: "The street's transformer", blurb: "Neighbours chip in. Only their vote can pay the electrician, and never the chairman." },
  { id: LIVE.appeal, story: "appeal", kicker: "Give to a cause, not to a person", title: "A surgery appeal", blurb: "Anyone can give. Only the hospital and the pharmacy can be paid." },
  { id: INTENTS_BOX, story: null, kicker: "From abroad · NEAR Intents", title: "Fees sent from abroad", blurb: "An uncle abroad gives through a go-between, and the box credits him, not the go-between. See a live NEAR Intents price for giving from another chain." },
];
const exampleFor = (id) => EXAMPLES.find((e) => e.id === Number(id));

function potCard(p, ex) {
  const kind = p.kind === "Group" ? "Decided by a vote" : "One person pays the bills";
  return `
  <a class="slip pot-card ${p.kind === "Group" ? "slip--yellow" : ""}" href="#/pot/${p.id}" style="text-decoration:none;color:inherit">
    ${ex ? `<p class="kicker">${esc(ex.kicker)}</p>` : ""}
    <div class="slip__head"><h3>${esc(titleOf(p))}</h3></div>
    ${ex ? `<p>${esc(ex.blurb)}</p>` : ""}
    ${field("Pays only", esc(either(p.payees.map(payeeName))))}
    ${field("Raised", `${money(p.raised)} of ${money(p.target)}`)}
    ${field(kind, p.status === "Open" ? (p.deadline_passed ? "Deadline passed, waiting to be closed" : `Open until ${when(p.deadline_ns)}`) : "Closed, and the rest went back")}
  </a>`;
}

async function potsPage() {
  setTitle("Money boxes");
  markNav("pots");
  main.innerHTML = `
  <section class="page-head">
    <h1>Money boxes</h1>
    <p class="lead">Every money box lives on NEAR testnet and is read live. Start with our examples and try to cheat them. Boxes that people start show up underneath.</p>
  </section>
  <section aria-labelledby="ex-h">
    <h2 id="ex-h" class="kicker">Our examples</h2>
    <div class="pot-list" data-examples><p class="loading">Reading the contract…</p></div>
  </section>
  <section class="section" aria-labelledby="yours-h">
    <h2 id="yours-h">Boxes people made</h2>
    <div class="pot-list" data-yours><p class="loading">Reading the contract…</p></div>
    <p><a class="button" href="#/start">Start a money box</a></p>
  </section>`;
  try {
    const { value: pots } = await view(POTS, "get_pots", { from_index: 0, limit: 100 });
    const ours = (id) => id.endsWith(`.${ROOT}`);
    main.querySelector("[data-examples]").innerHTML = EXAMPLES
      .map((e) => pots.find((p) => p.id === e.id))
      .filter(Boolean)
      .map((p) => potCard(p, exampleFor(p.id)))
      .join("");
    const yours = pots.filter((p) => !ours(p.creator) && !HIDDEN_BOXES.includes(p.id)).reverse();
    main.querySelector("[data-yours]").innerHTML = yours.length
      ? yours.map((p) => potCard(p)).join("")
      : `<p>None yet. Be the first: it takes a minute on testnet.</p>`;
  } catch {
    main.querySelector("[data-examples]").innerHTML = `<p class="error">Couldn't reach NEAR testnet just now. Reload the page to try again.</p>`;
    main.querySelector("[data-yours]").innerHTML = "";
  }
}

/** Where every unit that came into a box went: each payee, the free part, returned, still held. */
function whereItWent(p, { compact = false } = {}) {
  const byPayee = new Map(p.payees.map((x) => [x.account_id, 0n]));
  for (const x of p.payments) byPayee.set(x.to, (byPayee.get(x.to) || 0n) + BigInt(x.amount));
  const parts = [];
  let i = 0;
  for (const x of p.payees) parts.push({ cls: `to${(i++ % 3) + 1}`, label: `To ${payeeName(x)}`, v: byPayee.get(x.account_id) || 0n });
  if (BigInt(p.free_sent) > 0n) parts.push({ cls: "free", label: `${p.free_label}, to ${nameOf(p.free_to)}`, v: BigInt(p.free_sent) });
  parts.push({ cls: "back", label: "Returned to the givers", v: BigInt(p.refunded) });
  parts.push({ cls: "held", label: "Still in the box", v: BigInt(p.held) });
  const total = parts.reduce((a, x) => a + x.v, 0n) || 1n;
  const shown = parts.filter((x) => x.v > 0n);
  const pc = (v) => Number((v * 10000n) / total) / 100;
  return `<div class="went ${compact ? "went--compact" : ""}">
    <div class="went__bar" role="img" aria-label="${esc(shown.map((x) => `${x.label}: ${money(x.v)}`).join("; "))}">
      ${shown.map((x) => `<span class="${x.cls}" style="width:${pc(x.v)}%"></span>`).join("")}
    </div>
    <ul class="went__key">
      ${shown.map((x) => `<li class="${x.cls}"><span>${esc(x.label)}</span><strong>${money(x.v)}</strong></li>`).join("")}
    </ul>
  </div>`;
}

/** What each giver would get back if the box closed now: their share of what is still held. */
const backNow = (p, amount) => (BigInt(p.raised) > 0n ? ((BigInt(p.held) * BigInt(amount)) / BigInt(p.raised) / 10000n) * 10000n : 0n);

async function potPage(id) {
  setTitle("Money box");
  markNav("pots");
  main.innerHTML = `<p class="loading">Reading the money box from NEAR testnet…</p>`;
  let p;
  try {
    ({ value: p } = await view(POTS, "get_pot", { pot_id: Number(id) }));
  } catch {
    main.innerHTML = `<p class="error">Couldn't reach NEAR testnet just now. Reload the page to try again.</p>`;
    return;
  }
  if (!p) {
    main.innerHTML = `<section class="page-head"><h1>There is no such money box</h1><p class="lead"><a href="#/pots">See all the money boxes</a></p></section>`;
    return;
  }
  setTitle(titleOf(p));
  const group = p.kind === "Group";
  const only = either(p.payees.map(payeeName));
  const hasFree = BigInt(p.free_target) > 0n;
  const payeesLink = `${location.origin}${location.pathname}#/payees`;
  const askText = `Hello. There is a money box for "${titleOf(p)}" on Purpose Split, holding ${money(p.held)}, and it can only pay ${either(p.payees.map(payeeName))}. To be paid, please sign in with your NEAR account and send a bill here: ${payeesLink}  The box itself: ${location.href}`;
  const shareText = `${p.id === LIVE.appeal ? "Give to a cause, not to a person. " : ""}${titleOf(p)}. The money can only go to ${only}${hasFree ? `, plus ${money(p.free_target)} for ${p.free_label.toLowerCase()} sent to ${nameOf(p.free_to)}` : ""}. Whatever isn't used goes back to the givers. See it live: ${location.href}`;
  const target = BigInt(p.target) || 1n;
  const pct = (v) => `${Number((BigInt(v) * 10000n) / target) / 100}%`;
  const showBack = p.status === "Open" && BigInt(p.held) > 0n;
  const cheatKey = p.status === "Open" && !p.deadline_passed ? Object.keys(LIVE).find((k) => LIVE[k] === p.id) : null;
  const ownCheat = !cheatKey && p.status === "Open" && !p.deadline_passed ? cheatFor(p, currentAccount()) : null;
  const status = p.status === "Open"
    ? p.deadline_passed ? "The deadline has passed. Anyone can close the box to send the rest back." : `Open until ${when(p.deadline_ns)}`
    : "Closed. What was left went back to the people who gave it.";

  const ex = exampleFor(p.id);
  main.innerHTML = `
  <section class="page-head">
    ${ex ? `<p class="kicker">${esc(ex.kicker)}</p>` : ""}
    <h1>${esc(titleOf(p))}</h1>
    <p class="lead">This money can only go to ${esc(only)}, against their own bills. ${group ? "A vote of the group decides each payment." : p.releaser === currentAccount() ? "You pay the bills." : `${esc(cap(SAY[p.releaser] || nameOf(p.releaser)))} pays the bills.`} Whatever isn't used goes back to the givers.</p>
    ${p.id === INTENTS_BOX ? `<div class="demo"><span class="demo__tag">NEAR Intents</span> <strong>Given from abroad, the NEAR Intents way.</strong> NEAR Intents lets someone pay from another chain, like USDC on Base or Solana, and the money is delivered by a go-between. Here the go-between delivered 150 and named the uncle as the giver, so the box credited the uncle, not the go-between. It then delivered 100 more, but only 50 fitted the 200 target: the other 50 was kept for the uncle, not bounced back, and he took it out. NEAR Intents only runs on mainnet, so on testnet a stand-in account plays its part. <a href="${EXPLORER}/address/intents-relay.${ROOT}" target="_blank" rel="noopener">See the stand-in's transactions</a>.</div>` : ""}
    ${p.id === INTENTS_BOX ? intentsQuoteForm() : ""}
    ${nextSteps(p)}
    <div class="split">
      <p><strong>${money(p.target)}</strong> can only go to ${esc(only)}.</p>
      ${hasFree ? `<p><strong>${money(p.free_target)}</strong> more is “${esc(p.free_label)}”, sent straight to ${esc(nameOf(p.free_to))}.</p>` : ""}
    </div>
    ${p.payments.length || BigInt(p.free_sent) > 0n || BigInt(p.refunded) > 0n ? `<h2 class="went__h">Where the money went</h2>${whereItWent(p)}` : ""}
    <p class="cta">
      <a class="button" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">Share on WhatsApp</a>
      <button class="button button--quiet" type="button" data-copy>Copy the link</button>
    </p>
    <p class="cta cta--small">
      ${p.status === "Open" && !p.deadline_passed ? `<a class="button button--quiet" href="https://wa.me/?text=${encodeURIComponent(askText)}" target="_blank" rel="noopener">Ask ${esc(p.payees.length === 1 ? payeeName(p.payees[0]) : "the payee")} to send a bill</a>` : ""}
      <button class="button button--quiet" type="button" data-csv>Download for your records (CSV)</button>
    </p>
  </section>
  <div class="pot-grid section">
    <div class="pot-col">
    <article class="slip ${group ? "slip--yellow" : ""}">
      <div class="slip__head"><h2>The rules</h2></div>
      ${p.payees.map((x) => field("Can be paid", `${esc(payeeName(x))} <small>${acct(x.account_id)} ${x.verified ? '<span class="check">on the verified list</span>' : "(no longer verified)"}</small><small>${evidenceLine(x)}</small>`)).join("")}
      ${field(group ? "Who decides each payment" : "Who pays the bills", `${esc(nameOf(p.releaser))} <small>${acct(p.releaser)}</small>`)}
      ${field("If the target isn't reached", p.all_or_nothing ? "Nothing is paid, and everyone gets everything back" : "Bills can be paid from what has been raised")}
      ${field("Reference sent with each payment", esc(p.reference || "None"))}
      ${field("Started by", `${esc(nameOf(p.creator))} <small>${acct(p.creator)}</small>`)}
      ${field("Status", esc(status))}
      <div class="ledger">
        <div class="bar" role="img" aria-label="Of the ${esc(money(p.target))} target: ${esc(money(p.paid))} paid, ${esc(money(p.refunded))} returned, ${esc(money(p.held))} still held.">
          <span class="paid" style="width:${pct(p.paid)}"></span>
          <span class="back" style="width:${pct(p.refunded)}"></span>
          <span class="held" style="width:${pct(p.held)}"></span>
        </div>
        <ul class="key">
          <li class="paid">Paid to the payees: ${money(p.paid)}</li>
          <li class="back">Returned: ${money(p.refunded)}</li>
          <li class="held">Still held: ${money(p.held)}</li>
        </ul>
      </div>
      ${field("Raised, of the target", `${money(p.raised)} of ${money(p.target)}`)}
      ${hasFree ? field(`${esc(p.free_label)}, sent straight to ${esc(nameOf(p.free_to))}`, `${money(p.free_sent)} of ${money(p.free_target)}`) : ""}
    </article>
    ${cheatKey || ownCheat ? `<section id="cheat-box" aria-label="Try to cheat this box">${cheatSlip(cheatKey || "own", { heading: "h2", tabs: false, whose: p.creator.endsWith(`.${ROOT}`) ? "demo" : p.creator === currentAccount() ? "yours" : "this" })}</section>` : ""}
    </div>

    <div style="display:grid;gap:32px">
      <section class="slip" aria-labelledby="who-gave">
        <div class="slip__head"><h2 id="who-gave">Who gave</h2><span class="slip__no">${p.contributions.length} ${p.contributions.length === 1 ? "person" : "people"}</span></div>
        ${p.contributions.length ? `<table class="rows"><thead><tr><th>Person</th><th class="num">Gave</th>${showBack ? `<th class="num">Back if it closed now</th>` : ""}</tr></thead><tbody>
          ${p.contributions.map((c) => `<tr><td>${esc(nameOf(c.account_id))}<br><span class="small">${acct(c.account_id)}</span></td><td class="num">${money(c.amount)}</td>${showBack ? `<td class="num">${money(backNow(p, c.amount))}</td>` : ""}</tr>`).join("")}
        </tbody></table>
        ${showBack ? `<p class="small">Whatever is still in the box goes back to each giver in proportion to what they gave. The contract works this out; nobody chooses who gets what.</p>` : ""}` : `<p>Nobody has added money yet.</p>`}
      </section>
      <section class="slip" aria-labelledby="bills">
        <div class="slip__head"><h2 id="bills">Bills</h2><span class="slip__no">${p.requests.length}</span></div>
        ${p.requests.length ? `<table class="rows"><thead><tr><th>From, and for</th><th class="num">Amount</th></tr></thead><tbody>
          ${p.requests.map((r) => `<tr><td>${esc(payeeOf(p, r.payee))}: ${esc(r.note)}<br><span class="small">${when(r.at_ns)}, ${r.status === "Paid" ? "paid" : r.status === "Open" ? "waiting to be paid" : "cancelled"}</span></td><td class="num">${money(r.amount)}</td></tr>`).join("")}
        </tbody></table>` : `<p>No bills yet. Only ${esc(only)} can send one.</p>`}
      </section>
      <section class="slip" aria-labelledby="payments">
        <div class="slip__head"><h2 id="payments">Payments</h2><span class="slip__no">${p.payments.length}</span></div>
        ${p.payments.length ? `<table class="rows"><thead><tr><th>When</th><th class="num">Amount</th></tr></thead><tbody>
          ${p.payments.map((x, i) => `<tr><td>${when(x.at_ns)}<div class="status-line"><span class="stamp stamp--small stamp--ok">Paid</span><span>to ${esc(payeeOf(p, x.to))}</span>${x.confirmed ? `<span class="check">confirmed by them</span>` : ""}<a href="#/receipt/${p.id}/${i}">Open the receipt</a>${x.pass_id ? `<a href="#/pass/${esc(p.releaser)}">See the pass</a>` : ""}</div></td><td class="num">${money(x.amount)}</td></tr>`).join("")}
        </tbody></table>` : `<p>No payments yet.</p>`}
      </section>
      <section class="slip slip--yellow" aria-labelledby="act-h" data-actions>
        <div class="slip__head"><h2 id="act-h">What you can do here</h2></div>
        <p class="loading">Checking…</p>
      </section>
    </div>
  </div>
`;
  if (cheatKey || ownCheat) wireCheat(main.querySelector("form[data-story]"), ownCheat || undefined);
  renderActions(p);
  main.querySelector("[data-csv]").addEventListener("click", () => downloadCsv(p));
  const copy = main.querySelector("[data-copy]");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = "Link copied";
    } catch {
      copy.textContent = "Copy it from the address bar";
    }
  });
}

/** The wallet-powered part of a money box page. */
async function renderActions(p) {
  const box = main.querySelector("[data-actions]");
  if (!box) return;
  const me = currentAccount();
  const open = p.status === "Open";
  const live = open && !p.deadline_passed;
  const allGone = p.payees.every((x) => !x.verified);
  const closable = open && (p.deadline_passed || allGone);
  const openBills = p.requests.filter((r) => r.status === "Open");
  const unconfirmed = p.payments.map((x, i) => ({ ...x, i })).filter((x) => !x.confirmed);
  const group = p.kind === "Group";
  const payer = me === p.releaser ? "you" : group ? "the group, by a vote" : (SAY[p.releaser] || nameOf(p.releaser));
  const isPayee = (id) => p.payees.some((x) => x.account_id === id);
  const demoBox = !Object.values(LIVE).includes(p.id); // the open "try to cheat" boxes keep their one bill
  let bal = 0n, registered = false;
  if (me) {
    try {
      const [b, s] = await Promise.all([
        view(TOKEN, "ft_balance_of", { account_id: me }),
        view(TOKEN, "storage_balance_of", { account_id: me }),
      ]);
      bal = BigInt(b.value);
      registered = Boolean(s.value);
    } catch {}
  }
  const signInFirst = (what) => `<p><button class="button" type="button" data-act="signin">Sign in to ${what}</button></p>
    <p class="small">No testnet wallet yet? <a href="#/try">How to try it</a> takes five minutes.</p>`;
  const demoNote = (payee) => `<p class="demo"><span class="demo__tag">Demo only</span> ${esc(payeeOf(p, payee))} is made up, so you do its part here. In real use, ${esc(payeeOf(p, payee))} does this from its own account. This uses its limited demo key, which can send bills and confirm payments but can never move money.</p>`;
  const giveForm = (label) => {
    const freeLeft = BigInt(p.free_target) - BigInt(p.free_sent);
    return `<form data-give class="mini">
      <label class="field"><span class="field__label">Amount</span><span class="amount-row"><input name="amount" type="number" min="0.01" step="any" value="20"><span>tUSD</span></span></label>
      ${freeLeft > 0n ? `<label class="field"><span class="field__label">For</span><select name="part">
        <option value="purpose">The purpose (only to ${esc(either(p.payees.map(payeeName)))})</option>
        <option value="free">“${esc(p.free_label)}”, straight to ${esc(nameOf(p.free_to))}</option></select></label>` : ""}
      <button class="button" type="submit">${label}</button></form>`;
  };

  // The one next step, said plainly, with only the button for it.
  let title = "", body = "";
  if (!open) {
    title = "This box is closed";
    body = `<p>Whatever wasn't used went back to the people who gave.</p>`;
  } else if (closable) {
    title = "Next: send what's left back to the givers";
    body = `<p>${allGone ? "Every payee has left the verified list." : "The deadline has passed."} Anyone can do this, and nobody has to approve it. The contract works out each giver's share.</p>
      ${me ? `<p><button class="button" type="button" data-act="close">Send the rest back</button></p>` : signInFirst("send it back")}`;
  } else if (BigInt(p.raised) === 0n) {
    title = "Next: someone gives money";
    body = `<p>The box is empty. Once there's money in it, ${esc(either(p.payees.map(payeeName)))} can send a bill.</p>${me ? giveForm("Give") : signInFirst("give")}`;
  } else if (openBills.length) {
    const r = openBills[0];
    title = group ? "Next: the group votes to pay the bill" : `Next: ${me === p.releaser ? "you pay" : `${esc(payer)} pays`} the bill`;
    body = `<p>${esc(payeeOf(p, r.payee))} sent a bill for <strong>${money(r.amount)}</strong>: ${esc(r.note)}.</p>
      ${group && me !== p.releaser
        ? `<p class="small">The members vote in the group's own Sputnik DAO, ${acct(p.releaser)}. When more than half say yes, the DAO pays the bill, and the contract still checks it can only go to ${esc(payeeOf(p, r.payee))}.</p>`
        : me === p.releaser
        ? `<p><button class="button" type="button" data-act="pay" data-id="${r.id}">Pay ${money(r.amount)} to ${esc(payeeOf(p, r.payee))}</button></p><p class="small">The money can only go to ${esc(payeeOf(p, r.payee))}, and only this amount.</p>`
        : `<p class="small">Only ${esc(payer)} can pay it.${me ? "" : " If that's you, sign in."}</p>${me ? "" : signInFirst("pay it")}`}`;
  } else if (unconfirmed.length) {
    const x = unconfirmed[0];
    const to = payeeOf(p, x.to);
    title = `Next: ${esc(to)} confirms it got the money`;
    body = `<p>${money(x.amount)} was paid to ${esc(to)}. When ${esc(to)} confirms it arrived, the contract issues the pass.</p>`;
    if (me === x.to) body += `<p><button class="button" type="button" data-act="confirm" data-id="${x.i}">Confirm you received ${money(x.amount)}</button></p>`;
    else if (canPlay(x.to)) body += `${demoNote(x.to)}<p><button class="button" type="button" data-act="playconfirm" data-to="${esc(x.to)}" data-id="${x.i}">Confirm as ${esc(to)}</button></p>`;
    else body += `<p class="small">Waiting for ${esc(to)}.</p>`;
  } else {
    const done = p.payments.length > 0;
    const playable = p.payees.filter((x) => x.verified && canPlay(x.account_id));
    title = done ? "Paid and confirmed" : `Next: ${esc(either(p.payees.map(payeeName)))} sends a bill`;
    body = done
      ? `<p>The payee confirmed it was paid, and the pass was issued. <a href="#/pass/${esc(p.releaser)}">See the pass</a>.</p><p>There is still ${money(p.held)} in the box. It can pay another bill, and what's left goes back to the givers after the deadline.</p>`
      : `<p>There is ${money(p.held)} in the box. Nothing can leave until ${esc(either(p.payees.map(payeeName)))} asks for it with a bill.</p>`;
    if (isPayee(me)) body += billForm(me, false);
    else if (demoBox && playable.length === 1) body += `${demoNote(playable[0].account_id)}${billForm(playable[0].account_id, true)}`;
    else if (demoBox && playable.length) {
      // Several payees: one form, pick which one sends the bill.
      body += `<p class="demo"><span class="demo__tag">Demo only</span> ${esc(playable.map((x) => payeeOf(p, x.account_id)).join(", ").replace(/, ([^,]*)$/, " and $1"))} are made up, so you do their part here. In real use, each one sends its own bill from its own account. This uses their limited demo keys, which can send bills and confirm payments but can never move money.</p>${billForm(playable[0].account_id, true, playable.map((x) => x.account_id))}`;
    }
    else if (!done) body += `<p class="small">Waiting for the bill.</p>`;
  }

  const otherChain = p.id === INTENTS_BOX ? "" : `<details class="more intents-more"><summary>Giving from another chain? See a live NEAR Intents price</summary>${intentsQuoteForm(true)}</details>`;
  if (!p.raised || BigInt(p.raised) === 0n) { if (live) body += otherChain; }

  // Giving, once a box already has money: always visible, never hidden.
  if (live && BigInt(p.raised) > 0n) {
    const room = BigInt(p.target) - BigInt(p.raised);
    body += room > 0n
      ? `<details class="more give-more"><summary>Give to this box: it still needs ${money(room)}</summary>${me ? giveForm("Give") : signInFirst("give")}</details>${otherChain}`
      : `<p class="small">This box has reached its target of ${money(p.target)}, so it takes no more gifts.</p>`;
  }

  // Everything else, out of the way.
  const more = [];
  if (me) {
    more.push(`<p>Signed in as <strong>${esc(me)}</strong>. You have <strong>${money(bal)}</strong>.</p>`);
    if (bal + 500_000_000n <= 1_000_000_000n) more.push(`<p><button class="button button--quiet" type="button" data-act="dollars" data-registered="${registered}">Get 500 test dollars</button></p>`);
    more.push(`<p><button class="link" type="button" data-act="signout">Sign out</button></p>`);
  }
  box.innerHTML = `<div class="slip__head"><h2 id="act-h">${title}</h2></div>${body}
    <p class="small" data-msg aria-live="polite"></p>
    ${more.length ? `<details class="more"><summary>Other actions</summary>${more.join("")}</details>` : ""}`;
  const msg = box.querySelector("[data-msg]");

  function billForm(payee, play, choices = []) {
    const pick = choices.length > 1
      ? `<label class="field"><span class="field__label">Send the bill as</span><select name="payee">${choices.map((a) => `<option value="${esc(a)}">${esc(payeeOf(p, a))}</option>`).join("")}</select></label>`
      : "";
    return `<form data-bill data-payee="${esc(payee)}" data-play="${play}" class="mini">${pick}
      <label class="field"><span class="field__label">Amount</span><span class="amount-row"><input name="amount" type="number" min="0.01" step="any" value="${Math.min(Number(BigInt(p.held) / 1_000_000n) || 50, 280)}"><span>tUSD</span></span></label>
      <label class="field"><span class="field__label">What it's for</span><input name="note" maxlength="80" placeholder="What the bill is for" value=""></label>
      <button class="button" type="submit">${play && !pick ? `Send a bill as ${esc(payeeOf(p, payee))}` : "Send the bill"}</button></form>`;
  }

  async function run(label, fn) {
    msg.textContent = label;
    box.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await fn();
      msg.textContent = "Done. Reading the box again…";
      setTimeout(() => potPage(p.id), 1200);
    } catch (err) {
      msg.textContent = explain(err);
      box.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "signin") return signIn();
    if (act === "signout") return signOut().then(() => potPage(p.id));
    if (act === "dollars") return run("Confirm it in your wallet…", () => getTestDollars(b.dataset.registered === "true"));
    if (act === "pay") return run("Confirm the payment in your wallet…", () => payBill(p.id, Number(b.dataset.id)));
    if (act === "confirm") return run("Confirm it in your wallet…", () => confirmPayment(p.id, Number(b.dataset.id)));
    if (act === "close") return run("Confirm it in your wallet…", () => closeBox(p.id));
    if (act === "playconfirm") return run("Sending with the demo key…", () => playPayee(b.dataset.to, "confirm_payment", { pot_id: p.id, payment_index: Number(b.dataset.id) }));
  });

  box.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const amount = Math.round(Number(f.get("amount")) * 1e6);
    if (!(amount > 0)) { msg.textContent = "Enter an amount above zero."; return; }
    if (e.target.matches("[data-give]")) {
      return run("Confirm it in your wallet…", () => give(p.id, amount, f.get("part") || "purpose"));
    }
    if (e.target.matches("[data-bill]")) {
      const payee = f.get("payee") || e.target.dataset.payee;
      const note = String(f.get("note") || "").trim() || "Payment";
      if (e.target.dataset.play === "true") {
        return run("Sending with the demo key…", () => playPayee(payee, "request_payment", { pot_id: p.id, amount: String(amount), note }));
      }
      return run("Confirm it in your wallet…", () => sendBill(p.id, amount, note));
    }
  });
}

const FAUCET = "https://docs.near.org/getting-started/faucet";

function tryPage() {
  setTitle("How to try it");
  markNav("try");
  main.innerHTML = `
  <section class="page-head">
    <h1>How to try it</h1>
    <p class="lead">Everything runs on NEAR testnet, a practice network where the money is free and has no value. Three steps, about five minutes.</p>
  </section>
  <ol class="howto">
    <li class="slip">
      <span class="howto__n">01</span>
      <div>
        <h2>Get a testnet wallet</h2>
        <p>Any of these work. Make sure the wallet is set to <strong>testnet</strong>, not mainnet.</p>
        <p class="small"><strong>Allow pop-ups for this site.</strong> A wallet opens a small window to ask for your approval. If nothing opens when you press a button here, click the pop-up icon in your browser's address bar and choose "Always allow".</p>
        <ul class="howto__links">
          <li><a href="https://wallet.meteorwallet.app" target="_blank" rel="noopener">Meteor Wallet</a> <span class="small">(in the browser; switch the network to testnet)</span></li>
          <li><a href="https://testnet.mynearwallet.com" target="_blank" rel="noopener">MyNearWallet, testnet</a> <span class="small">(in the browser)</span></li>
          <li>HOT and Nightly <span class="small">(apps and browser extensions)</span></li>
        </ul>
      </div>
    </li>
    <li class="slip">
      <span class="howto__n">02</span>
      <div>
        <h2>Get some test NEAR</h2>
        <p>Every action costs a tiny network fee in NEAR, well under a cent. New testnet wallets often come with some. If yours is empty, the free <a href="${FAUCET}" target="_blank" rel="noopener">NEAR testnet faucet</a> sends you some: paste your account name and press Request.</p>
        <p class="small" data-near></p>
      </div>
    </li>
    <li class="slip">
      <span class="howto__n">03</span>
      <div>
        <h2>Get test dollars</h2>
        <p>Test dollars (tUSD) are what goes into the money boxes. Press the button to get 500, up to 1,000 in total. The first time also costs 0.00125 test NEAR to open your tUSD balance.</p>
        <div data-dollars></div>
        <p class="small" data-msg aria-live="polite"></p>
      </div>
    </li>
  </ol>
  <section class="section" aria-labelledby="then-h">
    <h2 id="then-h">Then try these</h2>
    <ul class="uses">
      <li><a href="#/pot/${LIVE.family}"><span class="uses__n">A</span><h3>Give to a box</h3><p>Put test dollars into the open school-fees box.</p><span class="uses__go">Open it</span></a></li>
      <li><a href="#/start"><span class="uses__n">B</span><h3>Start your own</h3><p>Name the school, choose who presses pay, set a deadline.</p><span class="uses__go">Start one</span></a></li>
      <li><a href="#/pots"><span class="uses__n">C</span><h3>Try to cheat</h3><p>No wallet needed. Open an example and see the real contract refuse.</p><span class="uses__go">Pick one</span></a></li>
    </ul>
  </section>`;

  const box = main.querySelector("[data-dollars]");
  const msg = main.querySelector("[data-msg]");
  const nearLine = main.querySelector("[data-near]");

  async function draw() {
    if (!document.body.contains(box)) return;
    const me = currentAccount();
    if (!me) {
      nearLine.textContent = "";
      box.innerHTML = `<p><button class="button" type="button" data-signin>Sign in to get test dollars</button></p>`;
      box.querySelector("[data-signin]").addEventListener("click", () => signIn());
      return;
    }
    box.innerHTML = `<p class="loading">Checking your balance…</p>`;
    let bal = 0n, registered = false, near = null;
    try {
      const [b, st, acc] = await Promise.all([
        view(TOKEN, "ft_balance_of", { account_id: me }),
        view(TOKEN, "storage_balance_of", { account_id: me }),
        rpc("query", { request_type: "view_account", finality: "final", account_id: me }).catch(() => null),
      ]);
      bal = BigInt(b.value);
      registered = Boolean(st.value);
      if (acc) near = Number(BigInt(acc.amount) / 10n ** 21n) / 1000;
    } catch {}
    nearLine.innerHTML = near === null ? "" : `<strong>${esc(me)}</strong> has ${near.toLocaleString("en-US", { maximumFractionDigits: 3 })} test NEAR.${near < 0.05 ? " That's low: use the faucet first." : ""}`;
    const canGet = bal + 500_000_000n <= 1_000_000_000n;
    box.innerHTML = `<p>You have <strong>${money(bal)}</strong>.</p>
      ${canGet ? `<p><button class="button" type="button" data-get>Get 500 test dollars</button></p>` : `<p class="small">That's the most you can hold. Give some to a box first.</p>`}`;
    const btn = box.querySelector("[data-get]");
    if (btn) btn.addEventListener("click", async () => {
      btn.disabled = true;
      msg.textContent = "Confirm it in your wallet…";
      try {
        await getTestDollars(registered);
        msg.textContent = "Done. Your test dollars have arrived.";
        draw();
      } catch (err) {
        msg.textContent = explain(err);
        btn.disabled = false;
      }
    });
  }
  onAccountChange(() => draw());
  draw();
}

// ------------------------------------------------------------------ payees

const KINDS = { School: "School", Hospital: "Hospital", Vendor: "Shop or service", Other: "Other" };
const nearAmount = (yocto) => `${(Number(BigInt(yocto) / 10n ** 21n) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} NEAR`;

/** Reads what a council proposal asks for, if it is a call to add or remove a payee. */
function readProposal(x) {
  const call = x.kind && x.kind.FunctionCall;
  const a = call && call.receiver_id === POTS && call.actions && call.actions[0];
  if (!a) return { what: x.description, payee: null };
  let args = {};
  try { args = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(a.args), (ch) => ch.charCodeAt(0)))); } catch {}
  const other = (String(x.description || "").match(/\(other: ([^)]{1,40})\)/) || [])[1];
  if (a.method_name === "add_payee") return { what: `Add ${undemo(args.name)}${other ? ` (${other})` : ""} to the verified list`, payee: args };
  if (a.method_name === "remove_payee") return { what: `Remove ${nameOf(args.account_id)} from the verified list`, payee: args };
  if (a.method_name === "set_registry_dao") return { what: `Hand the verified list to ${args.account_id}`, payee: null };
  return { what: x.description, payee: null };
}

async function payeesPage() {
  setTitle("Payees");
  markNav("payees");
  main.innerHTML = `
  <section class="page-head">
    <h1>Payees</h1>
    <p class="lead">A money box can only pay accounts on the verified list. Nobody adds to that list alone: a payee is proposed with evidence, and the payee council votes on it. Everything here is read live from NEAR.</p>
    <p class="cta">
      <a class="button" href="#mine-h">I'm a school or payee</a>
      <a class="button button--quiet" href="#propose-h">Propose a payee</a>
    </p>
  </section>

  <section class="section" aria-labelledby="mine-h">
    <h2 id="mine-h">For schools and payees</h2>
    <p class="lead">Sign in with the payee's account to see every money box that names you, send bills and confirm payments.</p>
    <div data-mine><p class="loading">Reading the contract…</p></div>
  </section>

  <section class="section" aria-labelledby="list-h">
    <h2 id="list-h">The verified list</h2>
    <p class="small" data-holder></p>
    <div class="payee-list" data-list><p class="loading">Reading the contract…</p></div>
  </section>

  <section class="section" aria-labelledby="votes-h">
    <h2 id="votes-h">Council votes</h2>
    <p class="lead">Every proposal and every vote, from the council's own Sputnik DAO. A proposal passes when more than half of the council says yes, and then the DAO itself adds the payee.</p>
    <p class="small" data-council></p>
    <div data-votes><p class="loading">Reading the council's DAO…</p></div>
  </section>

  <section class="section" aria-labelledby="propose-h">
    <h2 id="propose-h">Propose a payee</h2>
    <div class="pot-grid">
      <form class="slip form" data-propose novalidate>
        <div class="slip__head"><h3>New payee</h3><span class="slip__no">Goes to a council vote</span></div>
        <label class="field"><span class="field__label">Name</span><input name="name" maxlength="60" required placeholder="Unity Grammar School"></label>
        <label class="field"><span class="field__label">Their NEAR account</span><input name="account" required autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="unitygrammar.testnet"></label>
        <label class="field"><span class="field__label">What they are</span><select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label class="field" data-other hidden><span class="field__label">What are they?</span><input name="other" maxlength="40" placeholder="For example: church, landlord, burial service"></label>
        <label class="field"><span class="field__label">Evidence: a link where they publish this account themselves</span><input name="evidence" required type="url" placeholder="https://unitygrammar.edu.ng/pay-fees"></label>
        <p class="small" data-bond>Proposing needs a small bond in NEAR, which comes back when the proposal passes.</p>
        <button class="button" type="submit">Send to the council</button>
        <p class="small" data-msg aria-live="polite"></p>
      </form>
      <aside class="prose">
        <h3>Why a vote?</h3>
        <p>The money box only promises that money reaches the accounts on this list. If anyone could add an account, a cheat could add their own and call it a school. So every addition needs evidence and a council vote.</p>
        <h3>What counts as evidence?</h3>
        <p>A page the payee controls that shows this exact account: the school's fees page, an official letter, a verified social profile. The council checks it before voting.</p>
      </aside>
    </div>
  </section>`;

  const me = currentAccount();
  const [cfg, payeesRes, potsRes] = await Promise.all([
    view(POTS, "get_config").catch(() => null),
    view(POTS, "get_payees", { from_index: 0, limit: 100 }).catch(() => null),
    view(POTS, "get_pots", { from_index: 0, limit: 100 }).catch(() => null),
  ]);
  if (!document.body.contains(main.querySelector("[data-list]"))) return;
  const payees = payeesRes ? payeesRes.value : [];
  const pots = potsRes ? potsRes.value : [];
  const holder = cfg && cfg.value.registry_dao;

  main.querySelector("[data-holder]").innerHTML = holder
    ? `The list is held by ${holder === COUNCIL_DAO ? "the payee council's DAO" : esc(nameOf(holder))}: ${acct(holder)}. Nobody else can change it.`
    : "";
  main.querySelector("[data-list]").innerHTML = payees.length
    ? payees.map((x) => `<article class="slip payee">
        <div class="slip__head"><h3>${esc(payeeName(x))}</h3><span class="slip__no">${esc(KINDS[x.kind] || x.kind)}</span></div>
        <p class="small">${acct(x.account_id)}</p>
        <p class="small">${evidenceLine(x)}</p>
        <p class="small">On the list since ${when(x.added_at_ns)}</p>
        <p class="small"><button class="link" type="button" data-remove="${esc(x.account_id)}" data-name="${esc(payeeName(x))}">Propose removing</button> <span data-remove-msg></span></p>
      </article>`).join("")
    : `<p>The list is empty.</p>`;
  const listEl = main.querySelector("[data-list]");
  if (!listEl.dataset.wired) listEl.dataset.wired = "1", listEl.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    const msg = b.parentElement.querySelector("[data-remove-msg]");
    if (!currentAccount()) { msg.textContent = "Sign in first, then press it again."; return signIn(); }
    if (!b.dataset.sure) {
      b.dataset.sure = "1";
      b.textContent = "Yes, ask the council to vote on removing it";
      msg.textContent = "Proposing needs the council's bond (0.1 NEAR), which comes back if the vote passes. Givers to boxes that pay only this payee can take their money back once it is removed.";
      return;
    }
    b.disabled = true;
    msg.textContent = "Confirm it in your wallet…";
    try {
      const { value: policy } = await view(COUNCIL_DAO, "get_policy");
      await proposeRemoval(b.dataset.remove, b.dataset.name, policy.proposal_bond);
      msg.textContent = "Sent. It now waits for the council's vote, below.";
      setTimeout(() => payeesPage(), 1500);
    } catch (err) {
      msg.textContent = explain(err);
      b.disabled = false;
    }
  });

  // For payees: the boxes that name the signed-in account.
  const mine = main.querySelector("[data-mine]");
  const isPayee = me && payees.some((x) => x.account_id === me);
  if (!me) {
    mine.innerHTML = `<p><button class="button button--quiet" type="button" data-signin>Sign in</button></p>
      <p class="small">Trying it out? Open any example money box and use "Play the school" instead: it acts as the made-up school with a limited key.</p>`;
    mine.querySelector("[data-signin]").addEventListener("click", () => signIn());
  } else if (!isPayee) {
    mine.innerHTML = `<p><strong>${esc(me)}</strong> is not on the verified list, so no money box can pay it yet.</p>
      <p class="small">If this is a school's or a business's account, <a href="#propose-h">propose it to the council</a> with a link to where it publishes this account.</p>`;
  } else {
    const named = pots.filter((p) => p.payees.some((x) => x.account_id === me));
    const waiting = named.reduce((a, p) => a + (p.status === "Open" ? BigInt(p.held) : 0n), 0n);
    mine.innerHTML = named.length
      ? `<p class="kicker">${named.length} money ${named.length === 1 ? "box names" : "boxes name"} you · ${money(waiting)} waiting in open boxes</p>
         <div class="mine-list">${named.slice().reverse().map((p) => payeeBox(p, me)).join("")}</div>`
      : `<p>No money box names <strong>${esc(me)}</strong> yet. When a family or a group starts one for you, it shows up here.</p>`;
    wirePayeeBoxes(mine, me);
  }

  // Council votes.
  const votes = main.querySelector("[data-votes]");
  try {
    const [{ value: policy }, { value: last }] = await Promise.all([view(COUNCIL_DAO, "get_policy"), view(COUNCIL_DAO, "get_last_proposal_id")]);
    const council = (policy.roles.find((x) => x.kind && x.kind.Group) || { kind: { Group: [] } }).kind.Group;
    const bond = policy.proposal_bond;
    main.querySelector("[data-bond]").textContent = `Proposing needs a bond of ${nearAmount(bond)}, which comes back when the proposal passes.`;
    main.querySelector("[data-council]").innerHTML = `The council: ${council.map((m) => `${esc(nameOf(m))} ${acct(m)}`).join(", ")}. DAO: ${acct(COUNCIL_DAO)}.`;
    const from = Math.max(0, last - 20);
    const { value: all } = last ? await view(COUNCIL_DAO, "get_proposals", { from_index: from, limit: 20 }) : { value: [] };
    // The council also served an earlier practice contract; show only votes about this one.
    const proposals = all.filter((x) => x.kind && x.kind.FunctionCall && x.kind.FunctionCall.receiver_id === POTS);
    const amCouncillor = me && council.includes(me);
    votes.innerHTML = proposals.length
      ? `<ol class="votes">${proposals.slice().reverse().map((x) => {
          const { what, payee } = readProposal(x);
          const yes = Object.values(x.votes || {}).filter((v) => v === "Approve").length;
          const no = Object.values(x.votes || {}).filter((v) => v === "Reject").length;
          const mineVoted = me && x.votes && x.votes[me];
          const open = x.status === "InProgress";
          return `<li class="slip vote vote--${esc(x.status.toLowerCase())}">
            <div class="slip__head"><h3>${esc(what)}</h3><span class="slip__no">Proposal ${x.id}</span></div>
            ${payee && payee.evidence ? `<p class="small">Evidence: <a href="${esc(payee.evidence)}" target="_blank" rel="noopener">${esc(payee.evidence)}</a> · account ${acct(payee.account_id)}</p>` : ""}
            <p><span class="stamp stamp--small ${x.status === "Approved" ? "stamp--ok" : open ? "" : "stamp--no"}">${esc({ InProgress: "Voting", Approved: "Passed", Rejected: "Rejected", Removed: "Removed", Expired: "Expired", Failed: "Failed" }[x.status] || x.status)}</span>
              ${yes} yes · ${no} no · of ${council.length} councillors · proposed by ${acct(x.proposer)}</p>
            ${open && amCouncillor && !mineVoted ? `<p class="cta"><button class="button" type="button" data-vote="VoteApprove" data-id="${x.id}">Vote yes</button><button class="button button--quiet" type="button" data-vote="VoteReject" data-id="${x.id}">Vote no</button></p>` : ""}
            ${open && amCouncillor && mineVoted ? `<p class="small">You voted ${mineVoted === "Approve" ? "yes" : "no"}.</p>` : ""}
            <p class="small" data-vote-msg="${x.id}" aria-live="polite"></p>
          </li>`;
        }).join("")}</ol>`
      : `<p>No proposals yet.</p>`;
    votes.querySelectorAll("[data-vote]").forEach((btn) => btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const x = proposals.find((p) => p.id === id);
      const msg = votes.querySelector(`[data-vote-msg="${id}"]`);
      votes.querySelectorAll(`[data-id="${id}"]`).forEach((b) => (b.disabled = true));
      msg.textContent = "Confirm your vote in your wallet…";
      try {
        await voteOnCouncil(id, btn.dataset.vote, x.kind);
        msg.textContent = "Vote recorded on NEAR.";
        setTimeout(() => payeesPage(), 1500);
      } catch (err) {
        msg.textContent = explain(err);
        votes.querySelectorAll(`[data-id="${id}"]`).forEach((b) => (b.disabled = false));
      }
    }));

    // Propose a payee.
    const form = main.querySelector("[data-propose]");
    const otherBox = form.querySelector("[data-other]");
    form.kind.addEventListener("change", () => { otherBox.hidden = form.kind.value !== "Other"; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const msg = form.querySelector("[data-msg]");
      const account = String(d.account || "").trim().toLowerCase();
      const problem = !String(d.name || "").trim() ? "Give the payee's name."
        : !ACCOUNT_RE.test(account) ? "Type a NEAR account name, like unitygrammar.testnet."
        : !/^https:\/\/\S+$/.test(String(d.evidence || "").trim()) ? "The evidence must be an https link."
        : payees.some((x) => x.account_id === account) ? "That account is already on the verified list."
        : d.kind === "Other" && !String(d.other || "").trim() ? "Say what they are, for example a church or a landlord."
        : "";
      if (problem) { msg.textContent = problem; return; }
      if (!currentAccount()) { msg.textContent = "Sign in first, then send it to the council."; signIn(); return; }
      msg.textContent = "Confirm the proposal in your wallet…";
      try {
        const other = d.kind === "Other" ? String(d.other || "").trim() : "";
        await proposePayee({ account_id: account, name: String(d.name).trim(), kind: d.kind, evidence: String(d.evidence).trim() }, bond, other);
        msg.textContent = "Sent. The council can now vote on it below.";
        setTimeout(() => payeesPage(), 1500);
      } catch (err) {
        msg.textContent = explain(err);
      }
    });
  } catch {
    votes.innerHTML = `<p class="error">Couldn't reach the council's DAO just now.</p>`;
  }
}

/** One money box, as the payee sees it: what is waiting, its bills, what to confirm. */
function payeeBox(p, me) {
  const open = p.status === "Open" && !p.deadline_passed;
  const myBills = p.requests.filter((x) => x.payee === me);
  const toConfirm = p.payments.map((x, i) => ({ ...x, i })).filter((x) => x.to === me && !x.confirmed);
  return `<article class="slip" data-box="${p.id}">
    <div class="slip__head"><h3><a href="#/pot/${p.id}">${esc(titleOf(p))}</a></h3><span class="slip__no">No. ${p.id}</span></div>
    ${field("In the box now", money(p.held))}
    ${field("Who pays the bills", esc(p.kind === "Group" ? "A vote of the group" : nameOf(p.releaser)))}
    ${myBills.length ? `<ul class="bills">${myBills.map((x) => `<li>${money(x.amount)} · ${esc(x.note || "no note")} · <strong>${esc({ Open: "waiting to be paid", Paid: "paid", Cancelled: "cancelled" }[x.status] || x.status)}</strong></li>`).join("")}</ul>` : ""}
    ${toConfirm.map((x) => `<p><button class="button" type="button" data-confirm="${x.i}">Confirm you received ${money(x.amount)}</button></p>`).join("")}
    ${open ? `<form class="mini" data-bill>
      <label class="field"><span class="field__label">Send a bill</span><input name="amount" inputmode="decimal" placeholder="Amount in tUSD" required></label>
      <label class="field"><span class="field__label">What it is for</span><input name="note" maxlength="80" placeholder="2026/27 session fees"></label>
      <button class="button button--quiet" type="submit">Send the bill</button>
    </form>` : `<p class="small">This box is ${p.status === "Open" ? "past its deadline" : "closed"}.</p>`}
    <p class="small" data-msg aria-live="polite"></p>
  </article>`;
}

function wirePayeeBoxes(root, me) {
  root.querySelectorAll("[data-box]").forEach((box) => {
    const id = Number(box.dataset.box);
    const msg = box.querySelector("[data-msg]");
    const run = async (label, fn) => {
      box.querySelectorAll("button").forEach((b) => (b.disabled = true));
      msg.textContent = `${label} Confirm it in your wallet…`;
      try { await fn(); msg.textContent = "Done, on NEAR."; setTimeout(() => payeesPage(), 1500); }
      catch (err) { msg.textContent = explain(err); box.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
    };
    box.querySelectorAll("[data-confirm]").forEach((b) => b.addEventListener("click", () => run("Confirming.", () => confirmPayment(id, Number(b.dataset.confirm)))));
    const form = box.querySelector("[data-bill]");
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const units = Math.round(Number(d.amount) * 1e6);
      if (!Number.isFinite(units) || units <= 0) { msg.textContent = "Type an amount, like 280."; return; }
      run("Sending the bill.", () => sendBill(id, units, String(d.note || "").trim()));
    });
  });
}

/** Everything about one box as rows a spreadsheet opens: gifts, bills, payments, refunds. */
function boxCsv(p) {
  const t = (ns) => (ns && ns !== "0" ? new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "");
  const amt = (v) => (Number(BigInt(v)) / 1e6).toFixed(2);
  const rows = [["Money box", "Type", "Date", "Who", "Account", "Amount (tUSD)", "Status", "Note"]];
  const box = `${p.id}: ${titleOf(p)}`;
  rows.push([box, "Box created", t(p.created_at_ns), nameOf(p.creator), p.creator, amt(p.target), p.status, `Pays only ${p.payees.map((x) => payeeName(x)).join(" or ")}`]);
  p.contributions.forEach((c) => rows.push([box, "Gift", "", nameOf(c.account_id), c.account_id, amt(c.amount), "Given", ""]));
  if (BigInt(p.free_sent) > 0n) rows.push([box, `Free part: ${p.free_label}`, "", nameOf(p.free_to), p.free_to, amt(p.free_sent), "Sent", ""]);
  p.requests.forEach((x) => rows.push([box, "Bill", t(x.at_ns), payeeName(p.payees.find((y) => y.account_id === x.payee) || { account_id: x.payee }), x.payee, amt(x.amount), x.status, x.note || ""]));
  p.payments.forEach((x) => rows.push([box, "Payment", t(x.at_ns), payeeName(p.payees.find((y) => y.account_id === x.to) || { account_id: x.to }), x.to, amt(x.amount), x.confirmed ? `Confirmed by the payee ${t(x.confirmed_at_ns)}` : "Paid, not yet confirmed", x.pass_id ? `Pass ${x.pass_id}` : ""]));
  if (BigInt(p.refunded) > 0n) rows.push([box, "Returned to givers", "", "", "", amt(p.refunded), "Returned", "In proportion to what each gave"]);
  rows.push([box, "Still in the box", "", "", POTS, amt(p.held), "", `Read from ${POTS}`]);
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

function downloadCsv(p) {
  const blob = new Blob(["﻿" + boxCsv(p)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `purpose-split-box-${p.id}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function proofPage() {
  setTitle("Proof");
  markNav("proof");
  main.innerHTML = `
  <section class="page-head">
    <h1>Check every step yourself</h1>
    <p class="lead">These are the transactions from the full demo run on NEAR testnet. Each link opens the public explorer. The refused ones are the cheating attempts, and they failed on purpose.</p>
    <p><a class="button button--quiet" href="${EXPLORER}/address/${POTS}" target="_blank" rel="noopener">See every transaction, including everyone else's, on the NEAR explorer</a></p>
  </section>
  <div class="pot-grid">
    <section class="slip" aria-labelledby="run-h">
      <div class="slip__head"><h2 id="run-h">The demo run</h2><span class="slip__no" data-count></span></div>
      <ol class="proof-steps" data-steps><li class="loading">Loading…</li></ol>
    </section>
    <div style="display:grid;gap:32px;align-content:start">
      <section class="slip slip--yellow" aria-labelledby="books2">
        <div class="slip__head"><h2 id="books2">The books, live</h2></div>
        <div class="books" data-books><p class="loading">Reading the contract…</p></div>
      </section>
      <section class="slip" aria-labelledby="accounts-h">
        <div class="slip__head"><h2 id="accounts-h">The accounts</h2></div>
        ${field("The contract", acct(POTS))}
        ${field("Test dollars (no value)", acct(TOKEN))}
        ${field("School-list council", acct(COUNCIL_DAO))}
        ${field("The street", acct(STREET_DAO))}
        <p class="small">Two Sputnik DAOs hold the verified list and the street's vote. The contract is not locked yet: we kept its key to fix bugs during the hackathon. Running <code>node scripts/verify.mjs</code> checks that the code on chain is exactly the code in the repository.</p>
      </section>
    </div>
  </div>`;

  booksLine()
    .then((b) => (main.querySelector("[data-books]").innerHTML = b.html))
    .catch(() => (main.querySelector("[data-books]").innerHTML = `<p class="error">Couldn't reach NEAR testnet just now.</p>`));

  try {
    const run = await (await fetch("data/demo-final.json")).json();
    const refused = run.steps.filter((s) => s.refused).length;
    main.querySelector("[data-count]").textContent = `${run.steps.length} steps, ${refused} refused`;
    main.querySelector("[data-steps]").innerHTML = run.steps
      .map((s) => {
        const said = s.refused
          ? `<span class="said">${esc(roles(s.verdict))}</span>`
          : !s.tx && /^Checked: /.test(s.verdict)
            ? `<span class="noted">${esc(roles(s.verdict.replace(/^Checked: /, "Read from the contract: ")))}</span>`
            : "";
        return `<li><span class="n">${s.step}</span><span class="what">${esc(roles(s.title))}${said}</span>${
          s.tx ? `<a href="${EXPLORER}/txns/${esc(s.tx)}" target="_blank" rel="noopener">Open in explorer</a>` : ""
        }</li>`;
      })
      .join("");
  } catch {
    main.querySelector("[data-steps]").innerHTML = `<li class="error">Couldn't load the demo run.</li>`;
  }
}

// ------------------------------------------------------------------ light / dark

const themeBtn = document.querySelector("[data-theme-btn]");
const isDark = () => {
  const set = document.documentElement.dataset.theme;
  return set ? set === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
const labelTheme = () => themeBtn.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode");
themeBtn.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
  labelTheme();
});
labelTheme();

// ------------------------------------------------------------------ menu

const menu = document.getElementById("menu");
const menuBtn = document.querySelector("[data-menu-open]");

function openMenu() {
  menu.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add("menu-on");
  (menu.querySelector('[aria-current="page"]') || menu.querySelector("a")).focus();
}

function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-on");
  menuBtn.focus();
}

menuBtn.addEventListener("click", openMenu);
menu.querySelector("[data-menu-close]").addEventListener("click", closeMenu);
menu.addEventListener("click", (e) => { if (e.target.closest("a")) closeMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

// ------------------------------------------------------------------ router

// Links that jump down the same page, without changing the page's address.
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-jump]");
  const target = link && document.getElementById(link.dataset.jump);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth" });
});

function route() {
  if (location.hash && !location.hash.startsWith("#/")) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) { target.scrollIntoView({ behavior: "smooth" }); return; }
  }
  closeMenu();
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const query = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  // Old addresses from earlier versions still work.
  const moved = { cheat: `#/pot/${LIVE[query.get("story")] ?? ""}`, street: `#/pot/${LIVE.street}`, appeal: `#/pot/${LIVE.appeal}` };
  if (moved[parts[0]]) {
    location.replace(parts[0] === "cheat" && !LIVE[query.get("story")] ? "#/pots" : moved[parts[0]]);
    return;
  }
  if (parts[0] === "pots") return potsPage();
  if (parts[0] === "pot" && /^\d+$/.test(parts[1] || "")) return potPage(parts[1]);
  if (parts[0] === "proof") return proofPage();
  if (parts[0] === "start") return startPage();
  if (parts[0] === "try") return tryPage();
  if (parts[0] === "payees") return payeesPage();
  if (parts[0] === "pass") return passPage(parts[1] ? decodeURIComponent(parts[1]).toLowerCase() : "");
  if (parts[0] === "receipt" && /^\d+$/.test(parts[1] || "") && /^\d+$/.test(parts[2] || "")) return receiptPage(parts[1], parts[2]);
  return home();
}

function renderWho(account) {
  const el = document.getElementById("who");
  if (!el) return;
  el.innerHTML = account
    ? `<span class="who__name" title="${esc(account)}">${esc(account)}</span>`
    : `<button class="button button--quiet who__btn" type="button">Sign in</button>`;
  const btn = el.querySelector("button");
  if (btn) btn.addEventListener("click", () => signIn());
}
onAccountChange(renderWho);
renderWho(null);
loadWallet().catch(() => {});

document.getElementById("foot-check").innerHTML = `
  <li><a href="#/proof">Every step of the test run</a></li>
  <li><a href="${EXPLORER}/address/${POTS}" target="_blank" rel="noopener">The contract on NearBlocks</a></li>
  ${GITHUB ? `<li><a href="${GITHUB}" target="_blank" rel="noopener">Source code</a></li>` : ""}`;
window.addEventListener("hashchange", route);
route();
