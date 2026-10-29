// Small client for OpenRouter. It tries each model in the list until one answers.
const { openrouter: cfg } = require('../config');
const { AppError } = require('../errors');

async function callModel(model, messages, temperature) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'CM-ITA',
      },
      signal: ctrl.signal,
      body: JSON.stringify({ model, messages, temperature, max_tokens: 1000 }),
    });
    if (res.status === 401) throw new AppError(503, 'The AI key is not valid.');
    if (res.status === 402)
      throw new AppError(503, 'The AI has no credits left.');
    if (!res.ok) return null; // busy or removed: try the next model
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    return text || null;
  } catch (e) {
    if (e instanceof AppError) throw e;
    return null; // timeout or network problem: try the next model
  } finally {
    clearTimeout(timer);
  }
}

async function chat(messages, { temperature = 0.3 } = {}) {
  if (!cfg.apiKey) throw new AppError(503, 'The AI is not set up yet.');
  for (const model of cfg.models) {
    const text = await callModel(model, messages, temperature);
    if (text) return text;
    console.log(`AI: ${model} did not answer, trying the next one`);
  }
  throw new AppError(
    429,
    'The AI is busy right now. Please try again in a minute.',
  );
}

// No network call here: the website checks this every 30 seconds.
async function status() {
  const ok = Boolean(cfg.apiKey) && cfg.models.length > 0;
  return { online: ok, modelReady: ok, model: cfg.models[0] || '' };
}

module.exports = { chat, status };
