const jwt = require("jsonwebtoken");

function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "";
}

function signAccessToken(user) {
  const secret = getAccessSecret();
  if (!secret) {
    throw new Error("JWT access secret is not configured.");
  }

  return jwt.sign(
    {
      role: user.role,
      email: user.email,
      fullName: user.full_name,
    },
    secret,
    {
      subject: String(user.id),
      expiresIn: process.env.JWT_ACCESS_TTL || "15m",
    }
  );
}

function verifyAccessToken(token) {
  const secret = getAccessSecret();
  if (!secret) {
    throw new Error("JWT access secret is not configured.");
  }

  return jwt.verify(token, secret);
}

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const payload = verifyAccessToken(match[1]);
    req.user = {
      id: Number(payload.sub),
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "You do not have permission to access this resource." });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  signAccessToken,
  verifyAccessToken,
};

