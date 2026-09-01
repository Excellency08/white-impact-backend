const express = require("express");
const crypto = require("crypto");
const argon2 = require("argon2");

const router = express.Router();
const { pool, query } = require("../db/database");
const { sendEmail } = require("../middleware/mailer");
const {
  validateAuthRegister,
  validateAuthLogin,
  validatePasswordReset,
  validateEmail,
} = require("../middleware/validators");
const {
  requireAuth,
  requireRole,
  signAccessToken,
} = require("../middleware/auth");

const SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS) || 30;
const VERIFY_TTL_HOURS = Number(process.env.AUTH_VERIFY_TTL_HOURS) || 24;
const RESET_TTL_HOURS = Number(process.env.AUTH_RESET_TTL_HOURS) || 2;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getClientMeta(req) {
  return {
    userAgent: req.get("user-agent") || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
  };
}

async function issueSession(client, user, req) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateToken(48);
  const refreshTokenHash = sha256(refreshToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
  const { userAgent, ipAddress } = getClientMeta(req);

  await client.query(
    `INSERT INTO auth_sessions (
      id, user_id, refresh_token_hash, user_agent, ip_address, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, user.id, refreshTokenHash, userAgent, ipAddress, expiresAt],
  );

  await client.query(
    `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [user.id],
  );

  return { accessToken, refreshToken, expiresAt, sessionId };
}

async function sendVerificationEmail(user, token) {
  const baseUrl =
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    "https://whiteimpactinitiative.org";
  const verifyUrl = `${baseUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: user.email,
    subject: "Verify your White Impact account",
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
        <h2>Verify your email</h2>
        <p>Hi ${user.full_name},</p>
        <p>Please verify your email address to activate your White Impact account.</p>
        <p><a href="${verifyUrl}">Verify email</a></p>
      </div>
    `,
  });
}

async function sendResetEmail(user, token) {
  const baseUrl =
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    "https://whiteimpactinitiative.org";
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: user.email,
    subject: "Reset your White Impact password",
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
        <h2>Password reset requested</h2>
        <p>Hi ${user.full_name},</p>
        <p>Use the link below to set a new password. This link expires soon.</p>
        <p><a href="${resetUrl}">Reset password</a></p>
      </div>
    `,
  });
}

router.get("/health", (_req, res) => {
  res.json({ success: true, service: "auth", status: "ok" });
});

router.post("/register", async (req, res) => {
  const { fullName, email, password } = req.body;
  const validation = validateAuthRegister({ fullName, email, password });
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [normalizedEmail],
    );
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "An account with that email already exists.",
      });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active, is_email_verified)
       VALUES ($1, $2, $3, 'viewer', TRUE, FALSE)
       RETURNING id, full_name, email, role, is_email_verified`,
      [fullName.trim(), normalizedEmail, passwordHash],
    );

    const user = result.rows[0];
    const verificationToken = generateToken(32);
    const tokenHash = sha256(verificationToken);
    const expiresAt = addHours(new Date(), VERIFY_TTL_HOURS);

    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );

    await client.query("COMMIT");

    await sendVerificationEmail(
      { email: normalizedEmail, full_name: fullName.trim() },
      verificationToken,
    ).catch(console.error);

    res.status(201).json({
      success: true,
      message: "Account created. Please verify your email to continue.",
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.is_email_verified,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: "Registration failed." });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const validation = validateAuthLogin({ email, password });
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const result = await query(
      `SELECT id, full_name, email, password_hash, role, is_active, is_email_verified
       FROM users WHERE email = $1 LIMIT 1`,
      [normalizedEmail],
    );

    const user = result.rows[0];
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }
    if (!user.is_active) {
      return res
        .status(403)
        .json({ success: false, message: "This account is disabled." });
    }
    if (!user.is_email_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before signing in.",
      });
    }

    const passwordMatches = await argon2.verify(user.password_hash, password);
    if (!passwordMatches) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const session = await issueSession(pool, user, req);

    res.json({
      success: true,
      message: "Signed in successfully.",
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Login failed." });
  }
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res
      .status(400)
      .json({ success: false, message: "Refresh token is required." });
  }

  const tokenHash = sha256(refreshToken);

  try {
    const { rows } = await query(
      `SELECT s.id AS session_id, s.user_id, s.is_revoked, s.expires_at, u.full_name, u.email, u.role, u.is_active, u.is_email_verified
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.refresh_token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );

    const session = rows[0];
    if (
      !session ||
      session.is_revoked ||
      new Date(session.expires_at) <= new Date() ||
      !session.is_active
    ) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is invalid or expired.",
      });
    }

    const accessToken = signAccessToken({
      id: session.user_id,
      full_name: session.full_name,
      email: session.email,
      role: session.role,
    });

    const nextRefreshToken = generateToken(48);
    const nextRefreshHash = sha256(nextRefreshToken);
    const nextExpiresAt = addDays(new Date(), SESSION_TTL_DAYS);

    await query(
      `UPDATE auth_sessions
       SET refresh_token_hash = $2, expires_at = $3, last_used_at = NOW()
       WHERE id = $1`,
      [session.session_id, nextRefreshHash, nextExpiresAt],
    );

    res.json({
      success: true,
      accessToken,
      refreshToken: nextRefreshToken,
      expiresAt: nextExpiresAt,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({ success: false, message: "Token refresh failed." });
  }
});

router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res
      .status(400)
      .json({ success: false, message: "Refresh token is required." });
  }

  try {
    const tokenHash = sha256(refreshToken);
    await query(
      `UPDATE auth_sessions
       SET is_revoked = TRUE
       WHERE refresh_token_hash = $1`,
      [tokenHash],
    );

    res.json({ success: true, message: "Signed out successfully." });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ success: false, message: "Logout failed." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, role, is_active, is_email_verified, last_login_at, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id],
    );

    const user = rows[0];
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error("Me lookup error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load user profile." });
  }
});

router.get(
  "/roles",
  requireAuth,
  requireRole("super_admin", "admin"),
  (_req, res) => {
    res.json({
      success: true,
      data: [
        "super_admin",
        "admin",
        "editor",
        "content_manager",
        "program_manager",
        "finance_manager",
        "viewer",
      ],
    });
  },
);

router.post("/verify-email", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res
      .status(400)
      .json({ success: false, message: "Verification token is required." });
  }

  const tokenHash = sha256(token);

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT id, user_id, expires_at, used_at
         FROM email_verification_tokens
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash],
      );

      const record = rows[0];
      if (
        !record ||
        record.used_at ||
        new Date(record.expires_at) <= new Date()
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Verification token is invalid or expired.",
        });
      }

      await client.query(
        `UPDATE users SET is_email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [record.user_id],
      );

      await client.query(
        `UPDATE email_verification_tokens SET used_at = NOW()
         WHERE id = $1`,
        [record.id],
      );

      await client.query("COMMIT");
      res.json({ success: true, message: "Email verified successfully." });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Verify email error:", error);
    res
      .status(500)
      .json({ success: false, message: "Email verification failed." });
  }
});

router.post("/verify-email/resend", async (req, res) => {
  const { email } = req.body;
  if (!email || !validateEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "A valid email address is required." });
  }

  try {
    const { rows } = await query(
      `SELECT id, full_name, email, is_email_verified
       FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase().trim()],
    );

    const user = rows[0];
    if (!user) {
      return res.json({
        success: true,
        message: "If an account exists, a verification email will be sent.",
      });
    }
    if (user.is_email_verified) {
      return res.json({
        success: true,
        message: "This account is already verified.",
      });
    }

    const verificationToken = generateToken(32);
    const tokenHash = sha256(verificationToken);
    const expiresAt = addHours(new Date(), VERIFY_TTL_HOURS);

    await query(
      "DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL",
      [user.id],
    );
    await query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );

    await sendVerificationEmail(user, verificationToken).catch(console.error);
    res.json({ success: true, message: "Verification email sent." });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend verification email.",
    });
  }
});

router.post("/password/forgot", async (req, res) => {
  const { email } = req.body;
  if (!email || !validateEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "A valid email address is required." });
  }

  try {
    const { rows } = await query(
      `SELECT id, full_name, email FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase().trim()],
    );
    const user = rows[0];
    if (!user) {
      return res.json({
        success: true,
        message: "If an account exists, a reset email will be sent.",
      });
    }

    const resetToken = generateToken(32);
    const tokenHash = sha256(resetToken);
    const expiresAt = addHours(new Date(), RESET_TTL_HOURS);

    await query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL",
      [user.id],
    );
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );

    await sendResetEmail(user, resetToken).catch(console.error);
    res.json({ success: true, message: "Password reset instructions sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to initiate password reset." });
  }
});

router.post("/password/reset", async (req, res) => {
  const { token, password } = req.body;
  const validation = validatePasswordReset({ token, password });
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const tokenHash = sha256(token);

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash],
      );

      const record = rows[0];
      if (
        !record ||
        record.used_at ||
        new Date(record.expires_at) <= new Date()
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Reset token is invalid or expired.",
        });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
      await client.query(
        `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
        [record.user_id, passwordHash],
      );
      await client.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
        [record.id],
      );
      await client.query(
        `UPDATE auth_sessions SET is_revoked = TRUE WHERE user_id = $1`,
        [record.user_id],
      );

      await client.query("COMMIT");
      res.json({ success: true, message: "Password reset successfully." });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ success: false, message: "Password reset failed." });
  }
});

module.exports = router;
