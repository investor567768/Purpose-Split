// Live NEAR Intents prices for "giving from another chain", through the 1Click API.
//
// A Vercel function, so the browser asks our own site and this asks 1Click.
// Every quote is a dry quote: it prices the route and never issues a deposit address,
// so nothing here can move money. NEAR Intents runs on mainnet only; these are real
// mainnet prices for the route a relative abroad would use, shown next to the testnet demo.
//
//   GET  /api/intents                          the routes we offer
//   POST /api/intents  {"route":"usdc-base","amount":"100"}   a dry quote

const ONE_CLICK = "https://1click.chaindefuser.com";

// What a relative abroad might hold, and a placeholder refund address on that chain.
// A dry quote never sends anything, so the refund address is only checked for its format.
const EVM = "0x1111111111111111111111111111111111111111";
const ROUTES = {
  "usdc-base": { label: "USDC on Base", blockchain: "base", symbol: "USDC", refundTo: EVM },
  "usdc-sol": { label: "USDC on Solana", blockchain: "sol", symbol: "USDC", refundTo: "So11111111111111111111111111111111111111112" },
  "usdc-eth": { label: "USDC on Ethereum", blockchain: "eth", symbol: "USDC", refundTo: EVM },
  "usdc-arb": { label: "USDC on Arbitrum", blockchain: "arb", symbol: "USDC", refundTo: EVM },
  "usdt-tron": { label: "USDT on Tron", blockchain: "tron", symbol: "USDT", refundTo: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" },
};
// Where it lands: USDC on NEAR, the stablecoin a mainnet money box would hold.
const NEAR_USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
// The NEAR account a dry quote is priced to. Nothing is ever sent to it.
const RECIPIENT = "intents.near";

let tokenCache = { at: 0, list: null };

async function call(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(ONE_CLICK + path, {
      ...options,
      signal: ctrl.signal,
      headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}) },
    });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!r.ok) throw new Error((body && body.message) || `NEAR Intents answered ${r.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function tokens() {
  if (tokenCache.list && Date.now() - tokenCache.at < 5 * 60_000) return tokenCache.list;
  const list = await call("/v0/tokens");
  if (!Array.isArray(list)) throw new Error("NEAR Intents sent an unexpected token list");
  tokenCache = { at: Date.now(), list };
  return list;
}

function pick(list, blockchain, symbol) {
  return list.find((t) => t.blockchain === blockchain && t.symbol === symbol) || null;
}

function toUnits(amount, decimals) {
  const [whole, frac = ""] = String(amount).split(".");
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    const list = await tokens();
    const dest = list.find((t) => t.assetId === NEAR_USDC) || pick(list, "near", "USDC");
    if (!dest) throw new Error("NEAR Intents doesn't list USDC on NEAR right now");

    if (req.method === "GET") {
      const routes = Object.entries(ROUTES)
        .filter(([, r]) => pick(list, r.blockchain, r.symbol))
        .map(([id, r]) => ({ id, label: r.label }));
      res.setHeader("cache-control", "public, s-maxage=300");
      return res.status(200).json({ network: "mainnet", destination: "USDC on NEAR", routes });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });

    const { route, amount } = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const r = ROUTES[route];
    if (!r) return res.status(400).json({ error: "Choose where the money comes from" });
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(String(amount || "")) || Number(amount) < 1 || Number(amount) > 100000) {
      return res.status(400).json({ error: "Enter an amount from 1 to 100,000" });
    }
    const origin = pick(list, r.blockchain, r.symbol);
    if (!origin) return res.status(400).json({ error: `NEAR Intents doesn't route ${r.label} right now` });

    const payload = await call("/v0/quote", {
      method: "POST",
      body: JSON.stringify({
        dry: true, // prices the route only: no deposit address, nothing can be sent
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: origin.assetId,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: dest.assetId,
        amount: toUnits(amount, origin.decimals),
        refundTo: r.refundTo,
        refundType: "ORIGIN_CHAIN",
        recipient: RECIPIENT,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    });
    const q = payload && payload.quote;
    if (!q) throw new Error("No solver priced this route right now");
    return res.status(200).json({
      network: "mainnet",
      dry: true,
      from: r.label,
      to: "USDC on NEAR",
      amountIn: q.amountInFormatted,
      amountOut: q.amountOutFormatted,
      amountOutUsd: q.amountOutUsd,
      seconds: q.timeEstimate,
      at: payload.timestamp || new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ error: e.name === "AbortError" ? "NEAR Intents took too long to answer" : String(e.message || e) });
  }
};
