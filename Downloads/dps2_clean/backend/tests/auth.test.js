const request = require("supertest");
const bcrypt = require("bcryptjs");

// Mock DB pool — tests run without a live database
jest.mock("../src/db/pool", () => ({
  query: jest.fn(),
}));

const { query } = require("../src/db/pool");

// Load app after mocks are set up
let app;
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.NODE_ENV = "test";
  app = require("../src/index");
});

afterAll(() => {
  // Close server if it exposes a close method
  if (app && app.close) app.close();
});

describe("POST /api/auth/refresh", () => {
  it("returns 401 with no token", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("returns new token with valid auth", async () => {
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { id: "user-1", email: "tech@test.com", role: "technician", name: "Test Tech" },
      "test-secret",
      { expiresIn: "12h" }
    );

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });
});

describe("POST /api/auth/pin-login", () => {
  it("returns 400 when missing fields", async () => {
    const res = await request(app).post("/api/auth/pin-login").send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 for unknown tech", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post("/api/auth/pin-login")
      .send({ techId: "bad-id", pin: "1234" });
    expect(res.status).toBe(401);
  });

  it("accepts default PIN 1234 when no pin_hash set", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "tech-1",
        email: "tech@test.com",
        role: "technician",
        first_name: "Test",
        last_name: "Tech",
        color: "blue",
        initials: "TT",
        phone: null,
        pin_hash: null,
      }],
    });

    const res = await request(app)
      .post("/api/auth/pin-login")
      .send({ techId: "tech-1", pin: "1234" });

    expect(res.status).toBe(200);
    expect(res.body.user.defaultPin).toBe(true);
  });

  it("returns 500 (not unhandled throw) when pin_hash is malformed", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "tech-1",
        email: "tech@test.com",
        role: "technician",
        first_name: "Test",
        last_name: "Tech",
        color: "blue",
        initials: "TT",
        phone: null,
        pin_hash: "NOT_A_VALID_BCRYPT_HASH",
      }],
    });

    const res = await request(app)
      .post("/api/auth/pin-login")
      .send({ techId: "tech-1", pin: "1234" });

    // Must return 401 or 500 — should NOT crash the server
    expect([401, 500]).toContain(res.status);
  });
});
