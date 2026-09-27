import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { MAX_JSON_BODY } from "./config.js";
import { handleHealth, handleParseBulk, handleParseSingle } from "./handlers.js";
import { createX402Middleware } from "./payments.js";

export function createApp(): Express {
  const app = express();

  // Server-side input size cap (Test 8). Oversized bodies are rejected by
  // express.json before they ever reach the parser or the payment layer.
  app.use(express.json({ limit: MAX_JSON_BODY }));

  // Free route - no payment required.
  app.get("/health", handleHealth);

  // x402 payment gate. Only requests matching a configured route below are
  // affected; everything else (like /health above) passes through untouched.
  app.use(createX402Middleware());

  // Paid routes (see src/payments.ts for server-controlled pricing).
  app.post("/api/parse", handleParseSingle);
  app.post("/api/parse/bulk", handleParseBulk);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found." });
  });

  // Catches JSON body-parser errors (e.g. body too large, invalid JSON) with
  // a clean 4xx instead of leaking a stack trace / falling through to 500.
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status < 500 ? err.status : 400;
    res.status(status).json({ error: err.message || "Bad request." });
  });

  return app;
}
