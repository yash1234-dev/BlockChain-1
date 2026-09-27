import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MAX_JSON_BODY } from "../src/config.js";
import { handleHealth, handleParseBulk, handleParseSingle } from "../src/handlers.js";

/**
 * The real app (full x402 payment gate in front of /api/parse and
 * /api/parse/bulk). Used to prove the routes are actually paid.
 */
const app = createApp();

/**
 * A second, payment-free app that mounts the exact same handler functions
 * used in production. This lets us thoroughly test parsing/validation/4xx
 * behavior - including "malformed notice never succeeds" - as a pure HTTP
 * contract, without depending on a live wallet, a live facilitator, or a
 * real testnet payment (the task explicitly asks that the automated test
 * suite not require that). The x402 gate itself is covered separately below
 * against the real `app`.
 */
const handlerApp = express();
handlerApp.use(express.json({ limit: MAX_JSON_BODY }));
handlerApp.get("/health", handleHealth);
handlerApp.post("/api/parse", handleParseSingle);
handlerApp.post("/api/parse/bulk", handleParseBulk);

describe("GET /health (free route)", () => {
  it("returns 200 with no payment header required", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "operators-booth" });
  });
});

describe("x402 payment gate on paid routes", () => {
  it("returns 402 with payment requirements when /api/parse is called without X-PAYMENT", async () => {
    const res = await request(app).post("/api/parse").send({ notice: "TRAIN 12137 AT PUNE EXPECTED 18:45" });
    expect(res.status).toBe(402);
    expect(res.body).toHaveProperty("accepts");
    expect(Array.isArray(res.body.accepts)).toBe(true);
    expect(res.body.accepts[0]).toMatchObject({ scheme: "exact", network: "base-sepolia" });
  });

  it("returns 402 with payment requirements when /api/parse/bulk is called without X-PAYMENT", async () => {
    const res = await request(app)
      .post("/api/parse/bulk")
      .send({ notices: ["TRAIN 12137 AT PUNE EXPECTED 18:45"] });
    expect(res.status).toBe(402);
    expect(res.body).toHaveProperty("accepts");
  });

  it("prices the bulk route higher than the single route (server-controlled)", async () => {
    const single = await request(app).post("/api/parse").send({ notice: "x" });
    const bulk = await request(app).post("/api/parse/bulk").send({ notices: ["x"] });
    const singleAmount = Number(single.body.accepts[0].maxAmountRequired);
    const bulkAmount = Number(bulk.body.accepts[0].maxAmountRequired);
    expect(bulkAmount).toBeGreaterThan(singleAmount);
  });
});

describe("POST /api/parse (handler logic)", () => {
  it("parses a well-formed notice and validates it against the schema", async () => {
    const res = await request(handlerApp)
      .post("/api/parse")
      .send({ notice: "TRAIN: 12137\nSTATION: PUNE\nEXPECTED: 18:45\nREASON: Heavy rainfall" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      train: "12137",
      station: "PUNE",
      expectedTime: "18:45",
      reason: "Heavy rainfall",
    });
  });

  it("rejects a malformed railway notice with a 4xx, not 200", async () => {
    const res = await request(handlerApp).post("/api/parse").send({ notice: "garbage input" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body).not.toHaveProperty("train");
  });

  it("rejects an empty request body", async () => {
    const res = await request(handlerApp).post("/api/parse").send({});
    expect(res.status).toBe(400);
  });

  it("rejects oversized input (input size cap)", async () => {
    const hugeNotice = "TRAIN 12137 AT PUNE EXPECTED 18:45 REASON " + "x".repeat(5000);
    const res = await request(handlerApp).post("/api/parse").send({ notice: hugeNotice });
    expect(res.status).toBe(400);
  });

  it("rejects a request body larger than the server body-size cap", async () => {
    const res = await request(handlerApp)
      .post("/api/parse")
      .set("Content-Type", "application/json")
      .send({ notice: "x".repeat(20000) });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("POST /api/parse/bulk (handler logic)", () => {
  it("parses a batch including Unicode reason text", async () => {
    const res = await request(handlerApp)
      .post("/api/parse/bulk")
      .send({
        notices: [
          "TRAIN 12137 AT PUNE EXPECTED 18:45 REASON Heavy rainfall",
          "TRAIN 11010 AT NGP EXPECTED 21:30 REASON विलंब",
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].ok).toBe(true);
    expect(res.body.results[1].data.reason).toBe("विलंब");
  });

  it("rejects a batch where every notice is unparseable", async () => {
    const res = await request(handlerApp)
      .post("/api/parse/bulk")
      .send({ notices: ["garbage", "also garbage"] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects an empty notices array", async () => {
    const res = await request(handlerApp).post("/api/parse/bulk").send({ notices: [] });
    expect(res.status).toBe(400);
  });
});
