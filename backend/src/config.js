const path = require("path");
const fs = require("fs");
require("dotenv").config();
const num = (v, d) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

module.exports = {
  port: num(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || "",
  adminUser: process.env.ADMIN_USERNAME || "admin",
  adminHash: process.env.ADMIN_PASSWORD_HASH || "",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean),
  dbFile: process.env.DB_FILE || path.join(__dirname, "..", "data", "cmita.db"),
  uploadsDir,
  aiPerMinute: num(process.env.AI_RATE_PER_MIN, 10),
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    models: (
      process.env.OPENROUTER_MODELS ||
      "google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free,thinkingmachines/inkling-small:free"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    timeoutMs: num(process.env.OPENROUTER_TIMEOUT_MS, 25000),
  },
  ollama: {
    host: (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, ""),
    model: process.env.OLLAMA_MODEL || "llama3.2:3b",
    timeoutMs: num(process.env.OLLAMA_TIMEOUT_MS, 90000),
    numCtx: num(process.env.OLLAMA_NUM_CTX, 4096),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || "10m",
  },
};