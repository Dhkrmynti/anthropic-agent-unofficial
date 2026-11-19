# anthropic-agent (terminal, unofficial)

The engine with no visuals: ANT quote, $10,000 paper portfolio, S-1/A figures, and the Claude analyst.
Paper trading only — no real money, no brokerage, no blockchain. Not affiliated with Anthropic or Nasdaq. Not investment advice.

Project website: [anthropicagent.app](https://anthropicagent.app) · Source: [GitHub](https://github.com/Dhkrmynti/anthropic-agent-unofficial).

## Install

Requires Node.js 18 or later. This is an unofficial educational simulator, not a brokerage or an Anthropic product.

    npm install -g anthropic-agent-unofficial
    anthropic-agent help

Or run the source locally:

    npm install
    node bin/anthropic-agent.mjs

## Commands

    anthropic-agent quote                   last ANT price (Nasdaq via Yahoo Finance, delayed)
    anthropic-agent buy 500                 paper buy in dollars
    anthropic-agent sell 200 | sell all     paper sell
    anthropic-agent portfolio               cash, shares, cost basis, value, P&L
    anthropic-agent history [n]             last paper trades
    anthropic-agent filing                  S-1/A figures (amendment no. 3, 17 Nov 2026) with the SEC link
    anthropic-agent ask "why is the net loss so big?"
    anthropic-agent reset

Options: `--model claude-opus-5-5 | claude-sonnet-5-5 | claude-haiku-5-5` (or `ANTHROPIC_AGENT_MODEL`), `--json`.

- Orders fill only at a printed price; before ANT's first trade every order is refused.
- Quotes come from a delayed public Yahoo Finance feed. If the quote is missing or stale, orders are refused rather than priced from the filing range.
- Portfolio lives in `~/.anthropic-agent/portfolio.json` (`ANTHROPIC_AGENT_HOME` to move it). It is separate from the web app's
  portfolio, which lives in the browser.
- The analyst uses the official `@anthropic-ai/sdk` (1.4.0) with your own credentials: `ANTHROPIC_API_KEY`, or a
  profile from `ant auth login`. Effort `low`; server-side refusal fallback on Opus/Sonnet 5.5. It can place paper
  orders through one tool, `place_paper_order`, and prints `[paper order] …` when it does.

Source filing: [Anthropic S-1/A on SEC EDGAR](https://www.sec.gov/Archives/edgar/data/2130357/000162828026074338/anthropicpbc-sx1ax3.htm). These are historical filing figures and may be superseded by later reports. The CLI does not place real stock or blockchain orders.
