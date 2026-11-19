// Anthropic Agent engine for the terminal: ANT quote, paper portfolio, S-1 facts. No UI.
// Same rules as the web floor: orders fill only at a real printed price; nothing is invented.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SYMBOL = "ANT";
export const START = 10000;
export const SHARES_OUT = 13086672593;      // S-1/A: all classes outstanding after the offering
export const RUN_RATE = 81e9;               // S-1/A: Run-Rate Revenue, 31 Oct 2026

export const FACTS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "s1.json"), "utf8"));

// ---------- quote (Yahoo Finance chart feed, Nasdaq: ANT, delayed) ----------
export async function quote() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=5m&range=5d&includePrePost=false`;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (unofficial paper-trading CLI)" }, signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`quote feed answered ${r.status}`);
  const j = (await r.json()).chart?.result?.[0];
  const meta = j?.meta || {};
  const ts = j?.timestamp || [], close = j?.indicators?.quote?.[0]?.close || [], opens = j?.indicators?.quote?.[0]?.open || [];
  const points = ts.map((t, i) => [t * 1000, close[i]]).filter((p) => p[1] != null);
  const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const nyDay = (t) => nyDate.format(t);
  const sessionPoints = points.length ? points.filter((p) => nyDay(p[0]) === nyDay(points.at(-1)[0])) : [];
  const reg = meta.currentTradingPeriod?.regular;
  const now = Date.now();
  return {
    symbol: SYMBOL,
    listed: points.length > 0,
    price: points.length ? (meta.regularMarketPrice ?? points.at(-1)[1]) : null,
    first: points.length ? (opens.find((v) => v != null) ?? points[0][1]) : null,
    high: sessionPoints.length ? Math.max(...sessionPoints.map((p) => p[1])) : null,
    low: sessionPoints.length ? Math.min(...sessionPoints.map((p) => p[1])) : null,
    time: meta.regularMarketTime ? meta.regularMarketTime * 1000 : points.at(-1)?.[0] ?? null,
    open: reg ? now >= reg.start * 1000 && now <= reg.end * 1000 : false,
    session: reg ? { open: reg.start * 1000, close: reg.end * 1000 } : null,
    source: "Yahoo Finance chart feed (Nasdaq: ANT), delayed",
  };
}

// ---------- portfolio (~/.anthropic-agent/portfolio.json) ----------
const DIR = process.env.ANTHROPIC_AGENT_HOME || path.join(os.homedir(), ".anthropic-agent");
const FILE = path.join(DIR, "portfolio.json");
const fresh = () => ({ cash: START, shares: 0, cost: 0, realized: 0, trades: [] });

export function load() {
  try { return { ...fresh(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch { return fresh(); }
}
export function save(pf) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(pf, null, 1)); fs.renameSync(tmp, FILE);
}
export function reset() { const pf = fresh(); save(pf); return pf; }
export const portfolioPath = () => FILE;

// Pure: applies one order to a portfolio at a given printed price. Returns { pf, fill } or { error }.
export function apply(pf, side, usd, price) {
  if (!(price > 0)) return { error: "ANT has not printed a trade yet, so the floor is closed. Orders open at the first Nasdaq price." };
  const sellAll = side === "sell" && usd === "all";
  usd = sellAll ? pf.shares * price : Math.round(+usd * 100) / 100;
  if (!Number.isFinite(usd) || (!sellAll && usd < 1)) return { error: "Minimum order is $1." };
  pf = { ...pf, trades: [...pf.trades] };
  let fill;
  if (side === "buy") {
    if (usd > pf.cash + 1e-9) return { error: `Not enough virtual cash: you have ${money(pf.cash)}.` };
    const sh = usd / price;
    pf.cash -= usd; pf.shares += sh; pf.cost += usd;
    fill = { t: Date.now(), side, shares: sh, price, usd };
  } else if (side === "sell") {
    const sh = Math.min(usd / price, pf.shares);
    if (sh <= 1e-9) return { error: "You hold no ANT to sell." };
    const proceeds = sh * price, basis = pf.cost * (sh / pf.shares);
    pf.cash += proceeds; pf.realized += proceeds - basis; pf.cost -= basis; pf.shares -= sh;
    if (pf.shares < 1e-9) { pf.shares = 0; pf.cost = 0; }
    fill = { t: Date.now(), side, shares: sh, price, usd: proceeds };
  } else return { error: "Side must be buy or sell." };
  pf.trades.unshift(fill); pf.trades = pf.trades.slice(0, 200);
  return { pf, fill };
}

export async function order(side, usd) {
  const q = await quote();
  if (q.listed && (!Number.isFinite(q.time) || Date.now() - q.time > 4 * 24 * 60 * 60_000)) return { ok: false, error: "Quote is stale. Orders are paused until a recent market price is available." };
  const r = apply(load(), side, usd, q.listed ? q.price : null);
  if (r.error) return { ok: false, error: r.error };
  save(r.pf);
  return { ok: true, side, shares: +r.fill.shares.toFixed(6), price: r.fill.price, usd: +r.fill.usd.toFixed(2), cash_after: +r.pf.cash.toFixed(2), shares_after: +r.pf.shares.toFixed(6) };
}

export function snapshot(pf, price) {
  const value = price ? pf.shares * price : null;
  return {
    cash: +pf.cash.toFixed(2), shares: +pf.shares.toFixed(6), cost_basis: +pf.cost.toFixed(2),
    market_value: value == null ? null : +value.toFixed(2), realized_pnl: +pf.realized.toFixed(2),
    total_pnl: value == null ? null : +(pf.cash + value - START).toFixed(2), start_balance: START,
    recent_trades: pf.trades.slice(0, 5).map((t) => ({ time: new Date(t.t).toISOString(), side: t.side, shares: +t.shares.toFixed(6), price: t.price, usd: +t.usd.toFixed(2) })),
  };
}

// ---------- formatting ----------
export const money = (n, d = 2) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const big = (n) => n >= 1e12 ? "$" + (n / 1e12).toFixed(2) + "T" : "$" + Math.round(n / 1e9) + "B";
