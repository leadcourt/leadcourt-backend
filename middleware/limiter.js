const rateLimit = require("express-rate-limit")

const limiter = rateLimit({
    windowMs: 1*60*1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests",
    },
    onLimitReached: (req, res, options) => {
    console.warn("🚫 Rate limit hit!", {
      ip: req.ip,
      path: req.originalUrl,
      userAgent: req.headers['user-agent'],
    });
  },
});

module.exports = {
    limiter
};