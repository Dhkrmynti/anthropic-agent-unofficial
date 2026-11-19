// The analyst in the terminal. Uses your own Claude credentials: ANTHROPIC_API_KEY, or an `ant auth login` profile.
// One tool, place_paper_order, which runs against the local paper portfolio.
import Anthropic from "@anthropic-ai/sdk";
import * as E from "./engine.mjs";

export const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];

const TOOLS = [{
  name: "place_paper_order",
  description: "Place a PAPER (virtual money) market order for Anthropic Class A stock (ANT) in the user's practice portfolio. " +
    "Only call this when the user explicitly asks you to buy or sell. It fills at the latest delayed Nasdaq price, or fails if ANT has not traded yet. " +
    "Returns the fill (shares, price, dollars) or an error message to relay.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      side: { type: "string", enum: ["buy", "sell"], description: "buy or sell" },
      usd: { type: "number", description: "Order size in US dollars of virtual money, at least 1" },
    },
    required: ["side", "usd"],
    additionalProperties: false,
  },
}];

const SYSTEM = `You are the analyst on Anthropic Agent, an unofficial paper-trading practice floor for Anthropic, PBC stock (Nasdaq: ANT), running in a terminal.
Users are beginners. Explain in plain, short sentences (aim for under 120 words unless asked for more), define jargon the first time you use it, and show the arithmetic when you compute something. Plain text only: no Markdown tables or headings.

Ground rules:
- Use only the S-1/A facts, the live quote and the portfolio given to you. If something isn't in them, say you don't have it rather than guessing. Cite the S-1/A table when you quote a figure.
- This is paper trading with virtual money. Never claim an order is real. Do not give personalised investment advice or tell the user what they should buy; you may explain trade-offs and what the numbers mean.
- This project is unofficial and not affiliated with Anthropic or Nasdaq, despite its name. You are an AI model; don't present yourself as speaking for Anthropic the company.
- Only place an order when the user clearly asks for one, and say what was filled afterwards.

S-1/A facts (Anthropic, PBC, amendment no. 3, filed 2026-11-17, figures in USD):
${JSON.stringify(E.FACTS)}`;

async function context() {
  let q = null;
  try { q = await E.quote(); } catch { /* feed down: say so below */ }
  const price = q?.listed ? q.price : null;
  const quote = !q ? { status: "quote feed unavailable" }
    : price ? { status: "trading", last_price: price, first_print: q.first, session_high: q.high, session_low: q.low, as_of: q.time ? new Date(q.time).toISOString() : null, source: q.source }
    : { status: "not yet trading", note: "No trade has printed; the filed range is $70-$78 and the floor is closed." };
  return `Live context at ${new Date().toISOString()}:\nQUOTE ${JSON.stringify(quote)}\nPORTFOLIO ${JSON.stringify(E.snapshot(E.load(), price))}`;
}

// A conversation that keeps its own history. onEvent receives { type: "order", result } as tools run.
export function session({ model = MODELS[0], onEvent = () => {} } = {}) {
  let client;
  try { client = new Anthropic(); }
  catch { throw new Error("No Claude credentials found. Set ANTHROPIC_API_KEY or run `ant auth login`."); }
  const messages = [];
  return async function ask(text) {
    const mark = messages.length;
    messages.push({ role: "user", content: [{ type: "text", text: `${await context()}\n\nQuestion: ${text}` }] });
    const out = [];
    try {
      for (let turn = 0; turn < 6; turn++) {
        const params = {
          model, max_tokens: 4000,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          output_config: { effort: "low" },
          messages,
        };
        // Opus 5.5 / Sonnet 5.5: server-side fallback if the model declines; Haiku has none.
        const res = model === "claude-haiku-5-5"
          ? await client.messages.create(params)
          : await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
        messages.push({ role: "assistant", content: res.content });
        if (res.stop_reason === "refusal") { out.push("(The model declined to answer that. Try rephrasing.)"); break; }
        const said = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (said) out.push(said);
        if (res.stop_reason !== "tool_use") break;
        const results = [];
        for (const b of res.content) {
          if (b.type !== "tool_use") continue;
          const ok = b.name === "place_paper_order" && typeof b.input?.usd === "number" && ["buy", "sell"].includes(b.input?.side);
          const r = ok ? await E.order(b.input.side, b.input.usd) : { ok: false, error: "Invalid order input." };
          onEvent({ type: "order", result: r });
          results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(r), ...(r.ok ? {} : { is_error: true }) });
        }
        messages.push({ role: "user", content: results });
      }
      return out.join("\n\n");
    } catch (e) {
      messages.length = mark;       // drop the unanswered exchange so the next question stays valid
      throw new Error(explain(e));
    }
  };
}

function explain(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic rejected the credentials. Set ANTHROPIC_API_KEY or run `ant auth login`.";
  if (e instanceof Anthropic.PermissionDeniedError) return "These credentials can't use that model. Try --model claude-haiku-5-5.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by Anthropic. Wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach api.anthropic.com. Check your connection.";
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status ?? ""}: ${e.message}`;
  return String(e?.message || e);
}
