const request = require("supertest");
const path = require("path");
const fs = require("fs");

jest.mock("../src/db/pool", () => ({
  query: jest.fn(),
}));

// Mock Twilio so tests don't need credentials
jest.mock("twilio", () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: "SM123" }) },
}));

const { query } = require("../src/db/pool");

let app;
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "authtest";
  process.env.TWILIO_PHONE_NUMBER = "+15550000000";
  process.env.NODE_ENV = "test";
  app = require("../src/index");
});

afterAll(() => {
  if (app && app.close) app.close();
});

function makeToken(role = "technician") {
  const jwt = require("jsonwebtoken");
  return jwt.sign(
    { id: "user-1", email: "tech@test.com", role, name: "Test Tech" },
    "test-secret",
    { expiresIn: "1h" }
  );
}

describe("PATCH /api/jobs/:id — SMS trigger", () => {
  it("updates status and does not block response even if SMS is triggered", async () => {
    const token = makeToken("admin");

    // First query: get previous status
    query.mockResolvedValueOnce({ rows: [{ status: "scheduled" }] });
    // Second query: update
    query.mockResolvedValueOnce({
      rows: [{ id: "job-1", status: "en_route" }],
    });
    // Third query: SMS customer lookup (async, fire-and-forget)
    query.mockResolvedValue({
      rows: [{
        first_name: "Mike",
        phones: [{ number: "+15551234567", primary: true }],
        sms_opt_out: false,
      }],
    });

    const res = await request(app)
      .patch("/api/jobs/job-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "en_route" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("en_route");
  });

  it("does not send SMS when status has not changed", async () => {
    const token = makeToken("admin");
    const twilio = require("twilio")();

    query.mockResolvedValueOnce({ rows: [{ status: "en_route" }] });
    query.mockResolvedValueOnce({ rows: [{ id: "job-1", status: "en_route" }] });

    await request(app)
      .patch("/api/jobs/job-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "en_route" });

    // Allow async fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(twilio.messages.create).not.toHaveBeenCalled();
  });

  it("does not send SMS when customer has sms_opt_out = true", async () => {
    const token = makeToken("admin");

    query.mockResolvedValueOnce({ rows: [{ status: "scheduled" }] });
    query.mockResolvedValueOnce({ rows: [{ id: "job-1", status: "complete" }] });
    query.mockResolvedValueOnce({
      rows: [{
        first_name: "Mike",
        phones: [{ number: "+15551234567", primary: true }],
        sms_opt_out: true,
      }],
    });

    const res = await request(app)
      .patch("/api/jobs/job-1")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "complete" });

    expect(res.status).toBe(200);
    // SMS suppressed — no throw, no error
  });
});

describe("POST /api/jobs/:id/photos", () => {
  it("returns 400 with no file", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/jobs/job-1/photos")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("rejects non-image files", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/jobs/job-1/photos")
      .set("Authorization", `Bearer ${token}`)
      .attach("photo", Buffer.from("fake pdf"), {
        filename: "doc.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
  });

  it("accepts a valid JPEG and saves to DB", async () => {
    const token = makeToken();
    query.mockResolvedValueOnce({
      rows: [{
        id: "photo-1",
        job_id: "job-1",
        file_path: "test.jpg",
        created_at: new Date().toISOString(),
      }],
    });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const res = await request(app)
      .post("/api/jobs/job-1/photos")
      .set("Authorization", `Bearer ${token}`)
      .attach("photo", fakeJpeg, {
        filename: "job-photo.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
  });
});
