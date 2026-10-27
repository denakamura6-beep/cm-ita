const { AppError } = require("../errors");

// Tiny in-memory limiter: max N requests per window for each visitor (IP address).
module.exports = function rateLimit({ windowMs = 60000, max = 10, message = "Too many requests. Please wait a moment." } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let e = hits.get(req.ip);
    if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; hits.set(req.ip, e); }
    e.count += 1;
    if (e.count > max) {
      res.set("Retry-After", String(Math.ceil((e.reset - now) / 1000)));
      return next(new AppError(429, message));
    }
    next();
  };
};
