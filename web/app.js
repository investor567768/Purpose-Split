// Purpose Split website. Reads everything straight from NEAR testnet in the
// browser. "Try to cheat" asks the contract's own `why_refused` check, so the
// answers on screen are the contract's words, not ours.

import { CHEATS, EXPLORER, LIVE, PEOPLE, POTS, RPCS, SAY, STORY, TOKEN, GITHUB } from "./config.js";
import {
  canPlay, closeBox, confirmPayment, createBox, currentAccount, explain, getTestDollars, give,
  loadWallet, onAccountChange, payBill, playPayee, sendBill, signIn, signOut,
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

/** The contract's answer with account names swapped for people's names. */
function plain(words) {
  let out = words.replace(/\bThis pot\b/g, "This money box").replace(/\bthis pot\b/g, "this money box");
  const ids = Object.keys(SAY).sort((x, y) => y.length - x.length);
  for (const id of ids) out = out.split(id).join(SAY[id]);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const acct = (id) => `<a href="${EXPLORER}/address/${esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`;

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
const payeeName = (x) => (x && (x.name || nameOf(x.account_id))) || "the payee";

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

function cheatSlip(storyKey = "family", { heading = "h2" } = {}) {
  const id = `cheat-${Math.random().toString(36).slice(2, 8)}`;
  return `
  <form class="slip" id="${id}" data-story="${storyKey}" aria-describedby="${id}-hint">
    <div class="slip__head">
      <${heading}>Try to break the rules</${heading}>
      <span class="slip__no" data-potno></span>
    </div>
    <p class="small" id="${id}-hint">Pick a person and what they try. The real contract answers yes or no. Nothing is actually sent.</p>
    <div class="switch" role="group" aria-label="Which money box">
      <button type="button" data-story-btn="family">Tolu's school fees</button>
      <button type="button" data-story-btn="street">The street's transformer</button>
      <button type="button" data-story-btn="appeal">The surgery appeal</button>
    </div>
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
  </form>`;
}

function wireCheat(form) {
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

  function load(key) {
    const c = CHEATS[key];
    form.dataset.story = key;
    form.querySelectorAll("[data-story-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.storyBtn === key)));
    signer.innerHTML = c.signers.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
    to.innerHTML = c.destinations.map((d) => `<option value="${esc(d.id)}">${esc(d.label)}</option>`).join("");
    amount.value = c.amount;
    action.value = "send";
    potNo.innerHTML = `<a href="#/pot/${c.pot}">Money box no. ${c.pot}</a>`;
    showFields();
  }

  form.querySelectorAll("[data-story-btn]").forEach((b) => b.addEventListener("click", () => load(b.dataset.storyBtn)));
  action.addEventListener("change", showFields);
  [signer, to, amount].forEach((el) => el.addEventListener("change", () => (verdict.innerHTML = "")));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = CHEATS[form.dataset.story];
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
  ["Can the student send the money anywhere else?", "No. The money box pays only the school named on it, and only against a bill the school itself sent. Try it above: every other destination is refused."],
  ["Can the parent take the money back?", "Not before the deadline. Once it's in the box, it is kept for its purpose. After the deadline, whatever wasn't used goes back to each person in proportion to what they gave."],
  ["How do you know the account really belongs to the school?", "The contract can't know that by itself, so the list has to be trustworthy. A school is added only by a council vote, and only with a link to where the school itself publishes its account. You see that link before you send. If a school is ever removed, families can take their money back at once."],
  ["What if the fees are less than what was sent, or the plan falls through?", "The rest comes back automatically. That covers a bill smaller than the box, a street fund that doesn't reach its target, and a school or contractor that is removed from the list."],
  ["Can the people who built this take the money?", "The contract has no function that sends a box's money anywhere except its named payees, its stated free part, or back to the givers. In the final version the contract's keys are deleted so nobody can change that. This practice version is not locked yet."],
  ["What does it cost?", "We charge nothing. Each action is a NEAR transaction with a network fee well under a cent, and creating a money box needs a small one-time storage deposit in NEAR."],
  ["Can I check all this?", `Yes. Every step of the test run is on the public explorer, and the contract is open source with a test for every rule. <a href="#/proof">Open the proof page</a>.`],
];

const TEMPLATES = [
  ["School fees", "Relatives fund it. The student pays the school's bill and nothing else.", "Working in this demo"],
  ["A shared repair", "Neighbours fund it. Their vote pays the named contractor, against his requests.", "Working in this demo"],
  ["A public appeal", "Anyone gives through a link. Only the hospital, pharmacy or other named payees can be paid.", "Working in this demo"],
  ["A wedding, burial or event", "Family and friends fund the hall, caterer and canopy, plus a stated part for the family.", "Same rules, different payees"],
  ["Rent or a group purchase", "Pays only the landlord or seller, and only if the full amount is raised.", "Same rules, different payees"],
];

function home() {
  setTitle("");
  markNav("");
  main.innerHTML = `
  <section class="hero">
    <h1>Parents send school fees. The money can only pay the school.</h1>
    <p class="lead">Your child pays the school from it, and it can't go anywhere else. You see when the school has it, and whatever isn't used comes back to you.</p>
    <p class="cta">
      <a class="button" href="#/cheat">Try to break the rules</a>
      <a class="button button--quiet" href="#/start">Start a money box</a>
    </p>
  </section>

  <ol class="story" aria-label="How it works">
    <li class="slip">
      <h2>Mum sends Tolu's fees</h2>
      <p>She puts 300 into a locked money box for his school fees. Uncle Femi adds to the same box.</p>
    </li>
    <li class="slip">
      <h2>It can't go anywhere else</h2>
      <p>Tolu's own wallet, a friend who wants a loan, a betting site: the money box says no to all of them.</p>
      <span class="stamp stamp--small stamp--no">Refused</span>
    </li>
    <li class="slip">
      <h2>Tolu pays the school's bill</h2>
      <p>The school sends a bill for 280. Tolu pays it, the school stamps the receipt, and the 20 left over goes back.</p>
      <span class="stamp stamp--small stamp--ok">Paid</span>
    </li>
  </ol>

  <section class="section" aria-labelledby="try-h">
    <h2 id="try-h">Don't take our word for it</h2>
    <p class="lead">Be Tolu. Choose where to send his school fees and see what happens. The answer comes from the real money box on NEAR, live.</p>
    <div class="pot-grid">
      ${cheatSlip("family", { heading: "h3" })}
      <aside class="prose">
        <h3>What is the money box?</h3>
        <p>It's a small program on the NEAR blockchain, called a smart contract. It holds the fees and follows its rules on its own. Nobody can override it: not Tolu, not Mum, not us.</p>
        <p>Pocket money is separate. If Mum adds some, it goes straight to Tolu to spend as he likes.</p>
        <h3>How do we know it's really the school?</h3>
        <p>The money box only pays accounts on a verified list. A school gets on the list when a council votes it in, and only with a link to where the school itself publishes that account. You see the link before you send.</p>
        <p data-evidence class="small"></p>
        <p><a href="#/pot/${STORY.family}">See Tolu's finished fees, paid and confirmed by the school</a></p>
      </aside>
    </div>
  </section>

  <section class="section" aria-labelledby="back-h">
    <h2 id="back-h">What if it doesn't work out?</h2>
    <p class="lead">Nobody's money gets stuck. The contract sends it back on its own, to each person in proportion to what they gave.</p>
    <ul class="outcomes">
      <li><h3>The bill is smaller than the box</h3><p>After the deadline, the part that wasn't used goes back to everyone who gave.</p></li>
      <li><h3>The target isn't reached</h3><p>A street fund that falls short pays nobody. Every neighbour gets everything back.</p></li>
      <li><h3>The school or contractor is removed</h3><p>If the council takes them off the verified list, givers can take their money back at once.</p></li>
    </ul>
  </section>

  <section class="section" aria-labelledby="street-h">
    <h2 id="street-h">The same rules work for a street fund</h2>
    <div class="pair">
      <div class="prose">
        <p>Adeyemi Street's transformer is broken. Five neighbours each put 40 into one money box for the repair.</p>
        <p>The electrician asks for 100 to buy parts. The neighbours vote, and only then does the box pay him. The chairman can't take the money, even if a vote says so.</p>
        <p><a class="button button--quiet" href="#/cheat?story=street">Try to break the street fund</a></p>
      </div>
      <article class="slip slip--yellow">
        <div class="slip__head"><h3>Adeyemi Street's transformer</h3></div>
        ${field("Who adds money", "Five neighbours, 40 each")}
        ${field("Who can be paid", "Only Sparks Electrical, against its own request")}
        ${field("Who decides", "The neighbours, by vote")}
        <p><a href="#/pot/${STORY.street}">See the finished street fund</a></p>
      </article>
    </div>
  </section>

  <section class="section" aria-labelledby="appeal-h">
    <h2 id="appeal-h">An appeal people can trust</h2>
    <div class="pair">
      <div class="prose">
        <p>Emeka shares a link on X: his mother needs surgery. Strangers give. The money can only go to the hospital and the pharmacy, against their own bills.</p>
        <p>A fixed 80 for food and transport goes straight to the family. Everyone sees that split before they give. Emeka can't send the rest to himself, and whatever isn't used goes back to the givers.</p>
        <p><a class="button button--quiet" href="#/cheat?story=appeal">Try to break the appeal</a></p>
      </div>
      <article class="slip">
        <div class="slip__head"><h3>Mama Ngozi's surgery</h3></div>
        ${field("Who gives", "Anyone with the link")}
        ${field("Who can be paid", "Only Lagoon Heights Hospital or Corner Care Pharmacy, against their bills")}
        ${field("Food and transport", "80 more, sent straight to the family, stated up front")}
        <p><a href="#/pot/${STORY.appeal}">See the finished appeal and its receipts</a></p>
      </article>
    </div>
  </section>

  <section class="section" aria-labelledby="rules-h">
    <h2 id="rules-h">Money with rules, for any purpose</h2>
    <p class="lead">Every money box has the same parts: who can be paid, who decides, a target, a deadline and an optional free part for costs nobody can bill. Change the parts and it fits whatever the money is for.</p>
    ${templateList()}
  </section>

  <section class="section" aria-labelledby="q-h">
    <h2 id="q-h">Questions</h2>
    <div class="faq">
      ${QUESTIONS.map(([q, ans]) => `<details><summary>${q}</summary><p>${ans}</p></details>`).join("")}
    </div>
  </section>

  <section class="section" aria-labelledby="books-h">
    <h2 id="books-h">Check it yourself</h2>
    <div class="books" data-books><p class="loading">Reading the contract…</p></div>
    <p><a href="#/proof">See every step of the test run, each one on the public NEAR explorer</a></p>
  </section>`;

  wireCheat(main.querySelector("form.slip"));
  view(POTS, "get_pot", { pot_id: LIVE.family })
    .then(({ value: p }) => {
      if (p && p.payees[0]) main.querySelector("[data-evidence]").innerHTML = evidenceLine(p.payees[0]);
    })
    .catch(() => {});
  booksLine()
    .then((b) => (main.querySelector("[data-books]").innerHTML = b.html))
    .catch(() => (main.querySelector("[data-books]").innerHTML = `<p class="error">Couldn't reach NEAR testnet just now.</p>`));
}

function templateList() {
  return `<ul class="templates">${TEMPLATES.map(
    ([name, rule, state]) => `<li><h3>${name}</h3><p>${rule}</p><p class="small">${state}</p></li>`
  ).join("")}</ul>`;
}

function startPage() {
  setTitle("Start a money box");
  markNav("");
  main.innerHTML = `
  <section class="page-head">
    <h1>Start a money box</h1>
    <p class="lead">Say what the money is for and who can be paid. Those rules are locked in when you create it, so the money can only be used for that.</p>
  </section>
  <div class="pot-grid">
    <form class="slip" data-start novalidate>
      <div class="slip__head"><h2>Your money box</h2><span class="slip__no">NEAR testnet</span></div>
      <label class="field"><span class="field__label">What is the money for?</span>
        <input name="title" maxlength="80" required placeholder="Tolu's 2026/27 school fees"></label>
      <fieldset class="field"><legend class="field__label">Who can be paid? Pick up to three from the verified list</legend>
        <div class="checks" data-payees><span class="small">Reading the verified list…</span></div></fieldset>
      <label class="field"><span class="field__label">A reference sent with every payment (optional)</span>
        <input name="reference" maxlength="40" placeholder="Matric number, patient number, job number"></label>
      <fieldset class="field"><legend class="field__label">Who presses pay?</legend>
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
      <label class="radio"><input type="checkbox" name="aon"> If the target isn't reached, pay nothing and give everyone their money back</label>
      <label class="radio"><input type="checkbox" name="free"> Add a free part, for costs nobody can bill</label>
      <div data-free hidden>
        <label class="field"><span class="field__label">Name it</span><input name="freeLabel" maxlength="40" value="Pocket money"></label>
        <label class="field"><span class="field__label">Amount</span>
          <span class="amount-row"><input name="freeAmount" type="number" min="0.01" step="any" value="50"><span>tUSD</span></span></label>
        <label class="field"><span class="field__label">Sent straight to</span><input name="freeTo" placeholder="their-account.testnet"></label>
      </div>
      <div class="agree" data-agree></div>
      <div data-go></div>
      <p class="small" data-msg aria-live="polite"></p>
    </form>
    <aside class="prose">
      <h3>Any purpose</h3>
      ${templateList()}
      <h3>New to NEAR testnet?</h3>
      <p>You need a free testnet wallet. <a href="https://wallet.meteorwallet.app" target="_blank" rel="noopener">Meteor Wallet</a> makes one in a minute; switch it to testnet. Creating a box costs 0.1 test NEAR for storage, and the unused part comes back.</p>
    </aside>
  </div>`;

  const form = main.querySelector("[data-start]");
  const msg = form.querySelector("[data-msg]");
  const units = (v) => Math.round(Number(v) * 1e6);

  view(POTS, "get_payees", { from_index: 0, limit: 100 })
    .then(({ value }) => {
      form.querySelector("[data-payees]").innerHTML = value
        .map((x) => `<label class="radio"><input type="checkbox" name="payee" value="${esc(x.account_id)}"> ${esc(x.name)} <span class="small">${esc(x.account_id)}</span></label>`)
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
    const free = f.get("free") === "on";
    return {
      me, who, releaser, payees, free,
      title: (f.get("title") || "").trim(),
      reference: (f.get("reference") || "").trim(),
      target: units(f.get("target")),
      deadline: Number(f.get("deadline")),
      aon: f.get("aon") === "on",
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
    form.querySelector("[data-free]").hidden = !d.free;
    const names = d.payees.map((id) => nameOf(id));
    const who = d.who === "dao" ? `a vote of ${d.releaser || "the DAO"}` : d.who === "me" ? "you" : d.releaser || "the person you name";
    form.querySelector("[data-agree]").innerHTML = `
      <h3>What you're agreeing to</h3>
      <ul>
        <li>Up to ${money(d.target || 0)} can only ever go to ${esc(names.length ? either(names) : "the payees you pick")}, and only against their own bills.</li>
        <li>Only ${esc(who)} can pay those bills.</li>
        ${d.free ? `<li>${money(d.freeAmount || 0)} is “${esc(d.freeLabel)}”, sent straight to ${esc(d.freeTo || "the person you name")} as it comes in.</li>` : ""}
        <li>${d.aon ? "If the target isn't reached, nothing is paid and everyone gets everything back." : "Bills can be paid from whatever has been raised."}</li>
        <li>After the deadline, whatever is left goes back to each giver, in proportion.</li>
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
  const text = `${p.title}: ${money(pay.amount)} paid to ${payee}${pay.confirmed ? ", confirmed by them" : ""}. Check the receipt: ${location.href}`;
  main.innerHTML = `
  <section class="page-head">
    <h1>Receipt</h1>
    <p class="lead">Read live from the contract on NEAR testnet. Nobody can edit it, including the person sharing it.</p>
  </section>
  <article class="slip receipt">
    <div class="slip__head"><h2>${esc(p.title)}</h2><span class="slip__no">Box ${p.id}, payment ${Number(index) + 1}</span></div>
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
    <p class="cta">
      <a class="button" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Share on WhatsApp</a>
      <a class="button button--quiet" href="#/pot/${p.id}">See the whole money box</a>
    </p>
  </article>`;
}

function cheatPage(query) {
  setTitle("Try to break the rules");
  markNav("cheat");
  const story = ["street", "appeal"].includes(query.get("story")) ? query.get("story") : "family";
  main.innerHTML = `
  <section class="page-head">
    <h1>Try to break the rules</h1>
    <p class="lead">Three money boxes are open and funded on NEAR testnet. Pick who is sending and where the money should go, and the real contract tells you yes or no.</p>
  </section>
  <div class="pot-grid">
    ${cheatSlip(story, { heading: "h2" })}
    <aside class="slip slip--yellow">
      <div class="slip__head"><h2>Things to try</h2></div>
      <ul class="prose">
        <li>Tolu sends the fees to a betting site.</li>
        <li>Tolu sends the fees to his own wallet.</li>
        <li>Tolu pays “LLU Bursary”, an account he made to look like the school's.</li>
        <li>Tolu pays a different school that is on the verified list.</li>
        <li>Mum takes the fees back before the deadline.</li>
        <li>The chairman pays himself, on his own.</li>
        <li>The street's vote passes, and it pays the chairman.</li>
        <li>Emeka sends the appeal's donations to himself.</li>
        <li>Emeka pays the hospital's bill to the pharmacy.</li>
        <li>Tolu pays the school less than its bill, to keep the rest.</li>
        <li>Ask for more than the box holds.</li>
        <li>Take the money back before the deadline.</li>
      </ul>
      <p class="small">Every one of these was also tried with real transactions in the demo run. <a href="#/proof">See them on the proof page</a>.</p>
    </aside>
  </div>`;
  wireCheat(main.querySelector("form.slip"));
}

function potCard(p) {
  const kind = p.kind === "Group" ? "Decided by a vote" : "One person presses pay";
  return `
  <a class="slip pot-card ${p.kind === "Group" ? "slip--yellow" : ""}" href="#/pot/${p.id}" style="text-decoration:none;color:inherit">
    <div class="slip__head"><h3>${esc(p.title)}</h3><span class="slip__no">No. ${p.id}</span></div>
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
    <p class="lead">Every money box in the contract, read live from NEAR testnet. Open ones can still take money; closed ones have paid out and returned the rest.</p>
  </section>
  <div class="pot-list" data-list><p class="loading">Reading the contract…</p></div>`;
  try {
    const { value: pots } = await view(POTS, "get_pots", { from_index: 0, limit: 50 });
    const list = main.querySelector("[data-list]");
    list.innerHTML = pots.length ? pots.slice().reverse().map(potCard).join("") : `<p>No money boxes yet.</p>`;
  } catch {
    main.querySelector("[data-list]").innerHTML = `<p class="error">Couldn't reach NEAR testnet just now. Reload the page to try again.</p>`;
  }
}

async function potPage(id) {
  setTitle(`Money box no. ${id}`);
  markNav("pots");
  main.innerHTML = `<p class="loading">Reading money box no. ${esc(id)} from NEAR testnet…</p>`;
  let p;
  try {
    ({ value: p } = await view(POTS, "get_pot", { pot_id: Number(id) }));
  } catch {
    main.innerHTML = `<p class="error">Couldn't reach NEAR testnet just now. Reload the page to try again.</p>`;
    return;
  }
  if (!p) {
    main.innerHTML = `<section class="page-head"><h1>There is no money box no. ${esc(id)}</h1><p class="lead"><a href="#/pots">See all the money boxes</a></p></section>`;
    return;
  }
  const group = p.kind === "Group";
  const only = either(p.payees.map(payeeName));
  const hasFree = BigInt(p.free_target) > 0n;
  const shareText = `${p.title}. The money can only go to ${only}${hasFree ? `, plus ${money(p.free_target)} for ${p.free_label.toLowerCase()} sent to ${nameOf(p.free_to)}` : ""}. Whatever isn't used goes back to the givers. See it live: ${location.href}`;
  const target = BigInt(p.target) || 1n;
  const pct = (v) => `${Number((BigInt(v) * 10000n) / target) / 100}%`;
  const status = p.status === "Open"
    ? p.deadline_passed ? "The deadline has passed. Anyone can close the box to send the rest back." : `Open until ${when(p.deadline_ns)}`
    : "Closed. What was left went back to the people who gave it.";

  main.innerHTML = `
  <section class="page-head">
    <h1>${esc(p.title)}</h1>
    <p class="lead">This money can only go to ${esc(only)}, against their own bills. ${group ? "A vote decides each payment." : `${esc(SAY[p.releaser] || nameOf(p.releaser))} presses pay.`} Whatever isn't used goes back to the givers.</p>
    <div class="split">
      <p><strong>${money(p.target)}</strong> can only go to ${esc(only)}.</p>
      ${hasFree ? `<p><strong>${money(p.free_target)}</strong> more is “${esc(p.free_label)}”, sent straight to ${esc(nameOf(p.free_to))}.</p>` : ""}
    </div>
    <p class="cta">
      <a class="button" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">Share on WhatsApp</a>
      <button class="button button--quiet" type="button" data-copy>Copy the link</button>
    </p>
  </section>
  <div class="pot-grid">
    <article class="slip ${group ? "slip--yellow" : ""}">
      <div class="slip__head"><h2>The rules</h2><span class="slip__no">Money box no. ${p.id}</span></div>
      ${p.payees.map((x) => field("Can be paid", `${esc(payeeName(x))} <small>${acct(x.account_id)} ${x.verified ? '<span class="check">on the verified list</span>' : "(no longer verified)"}</small><small>${evidenceLine(x)}</small>`)).join("")}
      ${field(group ? "Who decides each payment" : "Who presses pay", `${esc(nameOf(p.releaser))} <small>${acct(p.releaser)}</small>`)}
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

    <div style="display:grid;gap:32px">
      <section class="slip" aria-labelledby="who-gave">
        <div class="slip__head"><h2 id="who-gave">Who gave</h2><span class="slip__no">${p.contributions.length} ${p.contributions.length === 1 ? "person" : "people"}</span></div>
        ${p.contributions.length ? `<table class="rows"><thead><tr><th>Person</th><th class="num">Amount</th></tr></thead><tbody>
          ${p.contributions.map((c) => `<tr><td>${esc(nameOf(c.account_id))}<br><span class="small">${acct(c.account_id)}</span></td><td class="num">${money(c.amount)}</td></tr>`).join("")}
        </tbody></table>` : `<p>Nobody has added money yet.</p>`}
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
          ${p.payments.map((x, i) => `<tr><td>${when(x.at_ns)}<div class="status-line"><span class="stamp stamp--small stamp--ok">Paid</span><span>to ${esc(payeeOf(p, x.to))}</span>${x.confirmed ? `<span class="check">confirmed by them</span>` : ""}<a href="#/receipt/${p.id}/${i}">Open the receipt</a></div></td><td class="num">${money(x.amount)}</td></tr>`).join("")}
        </tbody></table>` : `<p>No payments yet.</p>`}
      </section>
      <section class="slip slip--yellow" aria-labelledby="act-h" data-actions>
        <div class="slip__head"><h2 id="act-h">What you can do here</h2></div>
        <p class="loading">Checking…</p>
      </section>
      ${p.status === "Open" && !p.deadline_passed && Object.values(LIVE).includes(p.id)
        ? `<p><a class="button" href="#/cheat?story=${Object.keys(LIVE).find((k) => LIVE[k] === p.id)}">Try to break this one</a></p>` : ""}
    </div>
  </div>`;
  renderActions(p);
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
  const blocks = [];

  if (!me) {
    blocks.push(`<p>Sign in with a NEAR testnet wallet to ${closable ? "close this box and send the rest back" : "give or pay a bill"}.</p>
      <p><button class="button" type="button" data-act="signin">Sign in</button></p>
      <p class="small">No testnet wallet? <a href="https://wallet.meteorwallet.app" target="_blank" rel="noopener">Meteor Wallet</a> makes one in a minute; switch it to testnet.</p>`);
  } else {
    let bal = 0n, registered = false;
    try {
      const [b, s] = await Promise.all([
        view(TOKEN, "ft_balance_of", { account_id: me }),
        view(TOKEN, "storage_balance_of", { account_id: me }),
      ]);
      bal = BigInt(b.value);
      registered = Boolean(s.value);
    } catch {}
    blocks.push(`<p>Signed in as <strong>${esc(me)}</strong>. You have <strong>${money(bal)}</strong>.</p>
      ${bal + 500_000_000n <= 1_000_000_000n ? `<p><button class="button button--quiet" type="button" data-act="dollars" data-registered="${registered}">Get 500 test dollars</button></p>` : ""}`);
    if (live) {
      const freeLeft = BigInt(p.free_target) - BigInt(p.free_sent);
      blocks.push(`<form data-give class="mini">
        <h3>Give</h3>
        <label class="field"><span class="field__label">Amount</span><span class="amount-row"><input name="amount" type="number" min="0.01" step="any" value="20"><span>tUSD</span></span></label>
        ${freeLeft > 0n ? `<label class="field"><span class="field__label">For</span><select name="part">
          <option value="purpose">The purpose (only to ${esc(either(p.payees.map(payeeName)))})</option>
          <option value="free">“${esc(p.free_label)}”, straight to ${esc(nameOf(p.free_to))}</option></select></label>` : ""}
        <button class="button" type="submit">Give</button></form>`);
    }
    if (me === p.releaser && live) {
      blocks.push(`<h3>Bills waiting for you to pay</h3>${openBills.length ? openBills.map((r) => `
        <p>${esc(payeeOf(p, r.payee))}: ${esc(r.note)}, <strong>${money(r.amount)}</strong>
        <button class="button" type="button" data-act="pay" data-id="${r.id}">Pay this bill</button></p>`).join("") : "<p>No bills yet.</p>"}`);
    }
    if (p.payees.some((x) => x.account_id === me) && live) blocks.push(billForm(me, false));
    const mineToConfirm = p.payments.map((x, i) => ({ ...x, i })).filter((x) => x.to === me && !x.confirmed);
    mineToConfirm.forEach((x) => blocks.push(`<p>You were paid ${money(x.amount)}. <button class="button" type="button" data-act="confirm" data-id="${x.i}">Confirm you received it</button></p>`));
    if (closable) blocks.push(`<p>${allGone ? "Every payee has left the verified list." : "The deadline has passed."} Anyone can close the box now.</p>
      <p><button class="button" type="button" data-act="close">Close the box and send the rest back</button></p>`);
    blocks.push(`<p><button class="link" type="button" data-act="signout">Sign out</button></p>`);
  }

  // The open "try to break" boxes keep their one bill, so playing payees is offered on other boxes.
  if (live && !Object.values(LIVE).includes(p.id)) {
    p.payees.filter((x) => x.verified && canPlay(x.account_id)).forEach((x) => blocks.push(billForm(x.account_id, true)));
  }
  p.payments.map((x, i) => ({ ...x, i })).filter((x) => !x.confirmed && canPlay(x.to) && x.to !== me)
    .forEach((x) => blocks.push(`<p>Play ${esc(payeeOf(p, x.to))}: <button class="button button--quiet" type="button" data-act="playconfirm" data-to="${esc(x.to)}" data-id="${x.i}">Confirm it received ${money(x.amount)}</button></p>`));

  box.innerHTML = `<div class="slip__head"><h2 id="act-h">What you can do here</h2></div>${blocks.join("")}<p class="small" data-msg aria-live="polite"></p>`;
  const msg = box.querySelector("[data-msg]");

  function billForm(payee, play) {
    return `<form data-bill data-payee="${esc(payee)}" data-play="${play}" class="mini">
      <h3>${play ? `Play ${esc(payeeOf(p, payee))}: send a bill` : "Send a bill"}</h3>
      ${play ? `<p class="small">This uses the made-up payee's limited demo key. It can only send bills and confirm payments, never move money. No wallet needed.</p>` : ""}
      <label class="field"><span class="field__label">Amount</span><span class="amount-row"><input name="amount" type="number" min="0.01" step="any" value="${Math.min(Number(BigInt(p.held) / 1_000_000n) || 50, 280)}"><span>tUSD</span></span></label>
      <label class="field"><span class="field__label">What it's for</span><input name="note" maxlength="80" value="${p.reference ? "Fees for " + esc(p.reference) : "Payment"}"></label>
      <button class="button ${play ? "button--quiet" : ""}" type="submit">Send the bill</button></form>`;
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
      const payee = e.target.dataset.payee;
      const note = String(f.get("note") || "").trim() || "Payment";
      if (e.target.dataset.play === "true") {
        return run("Sending with the demo key…", () => playPayee(payee, "request_payment", { pot_id: p.id, amount: String(amount), note }));
      }
      return run("Confirm it in your wallet…", () => sendBill(p.id, amount, note));
    }
  });
}

async function proofPage() {
  setTitle("Proof");
  markNav("proof");
  main.innerHTML = `
  <section class="page-head">
    <h1>Check every step yourself</h1>
    <p class="lead">These are the transactions from the full demo run on NEAR testnet. Each link opens the public explorer. The refused ones are the cheating attempts, and they failed on purpose.</p>
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
        <p class="small">This is the practice version. In the final version, two Sputnik DAOs take over the school list and the street's vote, and the contract's keys are deleted so nobody can change it.</p>
      </section>
    </div>
  </div>`;

  booksLine()
    .then((b) => (main.querySelector("[data-books]").innerHTML = b.html))
    .catch(() => (main.querySelector("[data-books]").innerHTML = `<p class="error">Couldn't reach NEAR testnet just now.</p>`));

  try {
    const run = await (await fetch("data/demo-dev.json")).json();
    const refused = run.steps.filter((s) => s.refused).length;
    main.querySelector("[data-count]").textContent = `${run.steps.length} steps, ${refused} refused`;
    main.querySelector("[data-steps]").innerHTML = run.steps
      .map((s) => {
        const said = s.refused ? `<span class="said">${esc(s.verdict.replace(/^Refused: /, "Refused: "))}</span>` : "";
        return `<li><span class="n">${s.step}</span><span class="what">${esc(s.title)}${said}</span>${
          s.tx ? `<a href="${EXPLORER}/txns/${esc(s.tx)}" target="_blank" rel="noopener">Open in explorer</a>` : ""
        }</li>`;
      })
      .join("");
  } catch {
    main.querySelector("[data-steps]").innerHTML = `<li class="error">Couldn't load the demo run.</li>`;
  }
}

// ------------------------------------------------------------------ router

function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const query = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  if (parts[0] === "cheat") return cheatPage(query);
  if (parts[0] === "pots") return potsPage();
  if (parts[0] === "pot" && /^\d+$/.test(parts[1] || "")) return potPage(parts[1]);
  if (parts[0] === "proof") return proofPage();
  if (parts[0] === "start") return startPage();
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
