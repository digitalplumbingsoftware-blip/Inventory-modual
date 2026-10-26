const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  // Accept token from Authorization header OR ?_token= query param (for CSV download links)
  const header = req.headers.authorization;
  const token = (header && header.startsWith("Bearer ")) ? header.slice(7) : req.query._token;
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
