const { auth } = require("../config/firebase");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided or invalid format.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decodedRaw = jwt.decode(token, { complete: true });
    const payload = decodedRaw?.payload || {};
    const now = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp && payload.exp < now;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // console.log("─────────────────────────────");
    // console.log("AUTH DEBUG");
    // console.log("→ Token Hash:", tokenHash);
    // console.log("→ UID:", payload.user_id || "N/A");
    // console.log("→ Email:", payload.email || "N/A");
    // console.log("→ Name:", payload.name || "N/A");
    // console.log("→ Exp:", payload.exp ? new Date(payload.exp * 1000).toISOString() : "N/A");
    // console.log("→ Iat:", payload.iat ? new Date(payload.iat * 1000).toISOString() : "N/A");
    // console.log("→ Is Expired:", isExpired);
    // console.log("→ Request Path:", req.originalUrl);
    // console.log("→ IP:", req.ip);
    // console.log("→ User-Agent:", req.headers["user-agent"]);
    // console.log("→ X-Internal-Call:", req.headers["x-internal-call"] || "false");
    // console.log("─────────────────────────────");

    if (isExpired) {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please re-authenticate.",
      });
    }

    const decodedToken = await auth.verifyIdToken(token);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      emailVerified: decodedToken.email_verified || false,
      name: decodedToken.name || null,
      picture: decodedToken.picture || null,
      role: decodedToken.role || "user",
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid token. Authentication failed.",
    });
  }
};

module.exports = {
  authenticateJWT,
};
