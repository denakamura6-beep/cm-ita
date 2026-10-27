// Small client for Ollama (the local AI).
const { ollama: cfg } = require("../config");
const { AppError } = require("../errors");

// A laptop answers one question at a time, so requests line up in a queue.
const MAX_WAITING = 4;
let tail = Promise.resolve();
let waiting = 0;
function enqueue(job) {
  if (waiting >= MAX_WAITING) throw new AppError(429, "The AI is busy right now. Please try again in a few seconds.");
  waiting += 1;
  const run = tail.then(job);
  tail = run.catch(() => {}).finally(() => { waiting -= 1; });
  return run;
}

async function callChat(messages, { json, temperature }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.model, messages, stream: false,
        ...(json ? { format: "json" } : {}),
        keep_alive: cfg.keepAlive,
        options: { temperature, num_ctx: cfg.numCtx },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404 || /not found/i.test(text)) throw new AppError(503, `The AI model "${cfg.model}" is not installed. Run: ollama pull ${cfg.model}`);
      throw new AppError(502, "The AI returned an error. Please try again.");
    }
    const data = await res.json();
    return String(data?.message?.content ?? "");
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e.name === "AbortError") throw new AppError(504, "The AI took too long to answer. Try a shorter message or a smaller model.");
    throw new AppError(503, "The AI is offline. Start Ollama and try again.");
  } finally { clearTimeout(timer); }
}

function chat(messages, { json = false, temperature = 0.3 } = {}) {
  return enqueue(() => callChat(messages, { json, temperature }));
}

async function status() {
  const base = { online: false, modelReady: false, model: cfg.model };
  try {
    const res = await fetch(`${cfg.host}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return base;
    const names = ((await res.json()).models || []).map((m) => m.name);
    return { online: true, modelReady: names.includes(cfg.model) || names.includes(`${cfg.model}:latest`), model: cfg.model };
  } catch { return base; }
}
module.exports = { chat, status };
