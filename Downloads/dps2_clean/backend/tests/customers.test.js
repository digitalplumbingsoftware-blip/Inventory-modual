const request = require("supertest");

jest.mock("../src/db/pool", () => ({
  query: jest.fn(),
}));

const { query } = require("../src/db/pool");

let app;
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.NODE_ENV = "test";
  app = require("../src/index");
});

afterAll(() => {
  if (app && app.close) app.close();
});

function makeToken(role = "admin") {
  const jwt = require("jsonwebtoken");
  return jwt.sign(
    { id: "user-1", email: "admin@test.com", role, name: "Admin User" },
    "test-secret",
    { expiresIn: "1h" }
  );
}

describe("POST /api/customers", () => {
  it("creates a residential customer with all new fields", async () => {
    const token = makeToken();
    query.mockResolvedValueOnce({
      rows: [{
        id: "cust-1",
        first_name: "John",
        last_name: "Smith",
        customer_type: "residential",
        sms_opt_out: false,
        phones: [{ number: "+15551234567", primary: true }],
        emails: [{ address: "john@example.com", primary: true }],
        property_info: {},
        created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        first_name: "John",
        last_name: "Smith",
        customer_type: "residential",
        phones: [{ number: "+15551234567", primary: true }],
        emails: [{ address: "john@example.com", primary: true }],
      });

    expect(res.status).toBe(201);
    expect(res.body.customer_type).toBe("residential");
    expect(res.body.sms_opt_out).toBe(false);
  });

  it("creates a commercial customer with business_name", async () => {
    const token = makeToken();
    query.mockResolvedValueOnce({
      rows: [{
        id: "cust-2",
        first_name: "Jane",
        last_name: "Doe",
        business_name: "Acme Corp",
        customer_type: "commercial",
        contact_name: "Jane Doe",
        contact_title: "Manager",
        sms_opt_out: false,
        phones: [],
        emails: [],
        property_info: {},
        created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        first_name: "Jane",
        last_name: "Doe",
        customer_type: "commercial",
        business_name: "Acme Corp",
        contact_name: "Jane Doe",
        contact_title: "Manager",
      });

    expect(res.status).toBe(201);
    expect(res.body.customer_type).toBe("commercial");
    expect(res.body.business_name).toBe("Acme Corp");
  });
});
