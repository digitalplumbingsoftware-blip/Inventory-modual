const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  try {
    const { rows } = await query(
      "SELECT * FROM users WHERE email = $1 AND active = true",
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: `${user.first_name} ${user.last_name}` },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        color: user.color,
        initials: user.initials,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  const { rows } = await query(
    "SELECT id, email, first_name, last_name, role, color, initials, phone FROM users WHERE id = $1",
    [req.user.id]
  );
  res.json(rows[0]);
});

// GET /api/auth/techs-for-pin  — public endpoint for PIN login screen
router.get("/techs-for-pin", async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, first_name, last_name, initials, color FROM users WHERE role='technician' AND active=true ORDER BY first_name"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/pin-login  — technician PIN login
router.post("/pin-login", async (req, res) => {
  const { techId, pin } = req.body;
  if (!techId || !pin)
    return res.status(400).json({ error: "techId and pin required" });

  try {
    const { rows } = await query(
      "SELECT * FROM users WHERE id = $1 AND role = 'technician' AND active = true",
      [techId]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Technician not found" });

    // If no PIN set yet, accept "1234" as default and prompt to change
    const storedPin = user.pin_hash;
    let valid = false;

    if (!storedPin) {
      // No PIN set — accept default 1234
      valid = pin === "1234";
    } else {
      try {
        valid = await bcrypt.compare(pin, storedPin);
      } catch (bcryptErr) {
        return res.status(500).json({ error: "PIN verification failed" });
      }
    }

    if (!valid) return res.status(401).json({ error: "Incorrect PIN" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: `${user.first_name} ${user.last_name}` },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        color: user.color,
        initials: user.initials,
        phone: user.phone,
        defaultPin: !storedPin,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/refresh  — reissue token for authenticated user
router.post("/refresh", authenticate, async (req, res) => {
  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, role: req.user.role, name: req.user.name },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
  res.json({ token });
});

// POST /api/auth/set-pin  — technician sets their PIN
router.post("/set-pin", authenticate, async (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin))
    return res.status(400).json({ error: "PIN must be exactly 4 digits" });

  try {
    const hash = await bcrypt.hash(pin, 10);
    await query("UPDATE users SET pin_hash = $1 WHERE id = $2", [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
