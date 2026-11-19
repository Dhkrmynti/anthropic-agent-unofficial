#!/usr/bin/env node
// anthropic-agent — unofficial ANT paper-trading engine in your terminal. Not made by or affiliated with Anthropic. Paper trading only: no real money, no brokerage, no blockchain.
import readline from "node:readline";
import * as E from "../lib/engine.mjs";

const HELP = `anthropic-agent (unofficial) — paper-trade Anthropic (Nasdaq: ANT) from the terminal

  anthropic-agent                           interactive shell (commands below, or just type a question for the analyst)
  anthropic-agent quote                     last ANT price from Nasdaq (delayed)
  anthropic-agent buy <usd>                 paper buy, in dollars of virtual money
  anthropic-agent sell <usd|all>            paper sell
  anthropic-agent portfolio                 cash, shares, value, P&L
  anthropic-agent history [n]               last n paper trades (default 10)
  anthropic-agent filing                    the S-1/A figures, with sources
  anthropic-agent ask "<question>"          ask the analyst once
  anthropic-agent reset                     back to $10,000
  anthropic-agent help

Options
  --model <id>    claude-opus-5-5 (default) | claude-sonnet-5-5 | claude-haiku-5-5
  --json          machine-readable output for quote, portfolio, history, filing, buy, sell

The analyst uses your own Claude credentials (ANTHROPIC_API_KEY, or \`ant auth login\`).
Portfolio file: ${E.portfolioPath()} (override the folder with ANTHROPIC_AGENT_HOME).
Not affiliated with Anthropic, PBC or Nasdaq. Not investment advice.`;

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = (name) => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const JSON_OUT = has("--json");
const MODEL = flag("--model") || process.env.ANTHROPIC_AGENT_MODEL || "claude-opus-5-5";

const out = (s = "") => process.stdout.write(s + "\n");
const pad = (s, n) => String(s).padEnd(n);
const time = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const nyTime = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " New York";

async function cmdQuote() {
  const q = await E.quote();
  if (JSON_OUT) return out(JSON.stringify(q));
  if (!q.listed) {
    out("ANT  Nasdaq  not trading yet");
    out("Filed range        $70.00 - $78.00 per share");
    out("Implied value      $916B - $1.02T  (range x 13,086,672,593 shares)");
    out(q.session && q.session.open > Date.now() ? `Next session opens ${nyTime(q.session.open)}` : Date.now() < Date.UTC(2026, 10, 19, 14, 30)
      ? "Filed expected first trade: 19 Nov 2026, after 9:30 New York"
      : "No first trade verified in the delayed quote feed; the $70–$78 range is historical S-1/A guidance.");
    out("The floor stays closed until the first trade prints.");
    return;
  }
  const ch = q.price - (q.first ?? q.price);
  out(`ANT  Nasdaq  ${E.money(q.price)}  ${ch >= 0 ? "+" : "-"}${E.money(Math.abs(ch)).slice(1)} (${((ch / (q.first || q.price)) * 100).toFixed(2)}%) since first print`);
  out(`First print        ${q.first ? E.money(q.first) : "-"}`);
  out(`Range              ${E.money(q.low)} - ${E.money(q.high)}`);
  out(`Implied value      ${E.big(q.price * E.SHARES_OUT)}  (${((q.price * E.SHARES_OUT) / E.RUN_RATE).toFixed(1)}x Oct run-rate of $81B)`);
  out(`Market             ${q.open ? "open" : "closed"} · as of ${q.time ? nyTime(q.time) : "-"}`);
  out(`Source             ${q.source}`);
}

async function cmdOrder(side, amount) {
  if (amount == null || (amount !== "all" && isNaN(+amount)) || (amount === "all" && side !== "sell")) { out(`Usage: anthropic-agent ${side} <usd>${side === "sell" ? "|all" : ""}`); process.exitCode = 2; return; }
  const r = await E.order(side, amount === "all" ? "all" : +amount);
  if (JSON_OUT) return out(JSON.stringify(r));
  if (!r.ok) { out(r.error); process.exitCode = 1; return; }
  out(`Filled (paper): ${side} ${r.shares.toFixed(4)} ANT at ${E.money(r.price)} = ${E.money(r.usd)}`);
  out(`Cash ${E.money(r.cash_after)} · ANT ${r.shares_after.toFixed(4)}`);
}

async function cmdPortfolio() {
  let q = null; try { q = await E.quote(); } catch {}
  const price = q?.listed ? q.price : null, pf = E.load(), s = E.snapshot(pf, price);
  if (JSON_OUT) return out(JSON.stringify({ ...s, price }));
  out(`Cash               ${E.money(s.cash)}`);
  out(`ANT shares         ${s.shares.toFixed(4)}`);
  out(`Cost basis         ${E.money(s.cost_basis)}`);
  out(`Market value       ${s.market_value == null ? "- (no price yet)" : E.money(s.market_value)}`);
  out(`Realized P&L       ${E.money(s.realized_pnl)}`);
  out(`Total P&L          ${s.total_pnl == null ? "-" : E.money(s.total_pnl)}  (start ${E.money(E.START)})`);
}

function cmdHistory(n = 10) {
  const t = E.load().trades.slice(0, +n || 10);
  if (JSON_OUT) return out(JSON.stringify(t));
  if (!t.length) return out("No paper trades yet.");
  for (const x of t) out(`${pad(time(x.t), 18)} ${pad(x.side, 5)} ${pad(x.shares.toFixed(4) + " ANT", 16)} @ ${pad(E.money(x.price), 10)} ${E.money(x.usd)}`);
}

function cmdFiling() {
  const f = E.FACTS;
  if (JSON_OUT) return out(JSON.stringify(f));
  const b = (m) => m >= 1000 ? "$" + (m / 1000).toFixed(1) + "B" : "$" + m + "M";
  out(`Anthropic, PBC · ${f.filing.form} · filed ${f.filing.filed}`);
  out(f.filing.url);
  out("");
  out("Growth");
  out(`  Revenue            2023 ${b(f.revenue_usd_m["2023"])} · 2024 ${b(f.revenue_usd_m["2024"])} · 2025 ${b(f.revenue_usd_m["2025"])}`);
  out(`                     9M 2025 ${b(f.revenue_usd_m["9M 2025"])} -> 9M 2026 ${b(f.revenue_usd_m["9M 2026"])}`);
  out(`  Run-rate revenue   ~$81B on 31 Oct 2026 (~$71B on 30 Sep)  · company metric`);
  out("Cash");
  out(`  Cash + short-term  $131.8B on 30 Sep 2026 · $212.7B pro forma after IPO + $26B private placement`);
  out("Customers");
  out(`  $100K+ a year      11,900+ (from 950 a year earlier) · net revenue retention ~900%`);
  out("Costs");
  out(`  Compute + infra    $18.8B in 9M 2026 = 57% of revenue (160% in 2025)`);
  out(`  Operating loss     -$1.26B in 9M 2026 (-$8.06B in all of 2025)`);
  out("The big loss");
  out(`  Net loss           -$104.0B in 9M 2026, of which -$94.3B is a non-cash fair-value charge`);
  out("Offering");
  out(`  Range              $70-$78 · 801,351,354 shares by the company + 23,648,646 by sellers`);
  out(`  Shares after       13,086,672,593 · implied value $916B-$1.02T at the range`);
  out("");
  out("Not reported in the filing: gross margin.");
}

async function cmdAsk(text) {
  const { session } = await import("../lib/analyst.mjs");
  const ask = session({ model: MODEL, onEvent: (e) => out(e.result.ok ? `[paper order] ${e.result.side} ${e.result.shares.toFixed(4)} ANT at ${E.money(e.result.price)} = ${E.money(e.result.usd)}` : `[order not placed] ${e.result.error}`) });
  out(await ask(text));
}

async function shell() {
  const { session } = await import("../lib/analyst.mjs");
  let ask = null, model = MODEL;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "anthropic-agent> " });
  out("Anthropic Agent (unofficial, not affiliated with Anthropic) · paper trading for ANT. Commands: quote, buy <usd>, sell <usd|all>, portfolio, history, filing, model <id>, reset, help, exit.");
  out("Anything else goes to the analyst (your Claude credentials).");
  rl.prompt();
  for await (const line of rl) {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    try {
      if (!cmd) {}
      else if (cmd === "exit" || cmd === "quit") break;
      else if (cmd === "help") out(HELP);
      else if (cmd === "quote") await cmdQuote();
      else if (cmd === "buy" || cmd === "sell") await cmdOrder(cmd, rest[0]);
      else if (cmd === "portfolio" || cmd === "pf") await cmdPortfolio();
      else if (cmd === "history") cmdHistory(rest[0]);
      else if (cmd === "filing") cmdFiling();
      else if (cmd === "reset") { E.reset(); out("Portfolio reset to $10,000."); }
      else if (cmd === "model") { if (rest[0]) { model = rest[0]; ask = null; } out(`Analyst model: ${model}`); }
      else {
        ask ||= session({ model, onEvent: (e) => out(e.result.ok ? `[paper order] ${e.result.side} ${e.result.shares.toFixed(4)} ANT at ${E.money(e.result.price)} = ${E.money(e.result.usd)}` : `[order not placed] ${e.result.error}`) });
        out(await ask(line.trim()));
      }
    } catch (e) { out(String(e.message || e)); ask = null; }
    out(""); rl.prompt();
  }
  rl.close();
}

try {
  const [cmd, ...rest] = argv;
  if (!cmd) await shell();
  else if (cmd === "help" || cmd === "--help" || cmd === "-h") out(HELP);
  else if (cmd === "quote") await cmdQuote();
  else if (cmd === "buy" || cmd === "sell") await cmdOrder(cmd, rest[0]);
  else if (cmd === "portfolio" || cmd === "pf") await cmdPortfolio();
  else if (cmd === "history") cmdHistory(rest[0]);
  else if (cmd === "filing") cmdFiling();
  else if (cmd === "ask") { if (!rest.length) { out('Usage: anthropic-agent ask "<question>"'); process.exitCode = 2; } else await cmdAsk(rest.join(" ")); }
  else if (cmd === "reset") { E.reset(); out("Portfolio reset to $10,000."); }
  else { out(`Unknown command: ${cmd}\n`); out(HELP); process.exitCode = 2; }
} catch (e) {
  out(String(e.message || e)); process.exitCode = 1;
}
