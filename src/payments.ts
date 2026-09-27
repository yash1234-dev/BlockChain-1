import { paymentMiddleware } from "x402-express";
import type { RoutesConfig } from "x402/types";
import { BULK_PRICE, FACILITATOR_URL, NETWORK, PAY_TO, SINGLE_PRICE } from "./config.js";

/**
 * The x402 payment gate for this API.
 *
 * - payTo and network are read exclusively from server config (never from a
 *   request). See src/config.ts.
 * - price is per-route and server-controlled: SINGLE_PRICE for a single
 *   notice, a higher BULK_PRICE for the bulk endpoint. A caller cannot send
 *   a "price" field to change what they're charged.
 * - x402-express implements the verify -> (run handler) -> settle lifecycle:
 *   it verifies payment, calls next() to run our route handler, buffers the
 *   response, and only calls settle() if the handler's response status is
 *   < 400. If our handler rejects a notice with 4xx (see src/handlers.ts),
 *   settlement is skipped automatically and the caller keeps their coin.
 */
export const paidRoutes: RoutesConfig = {
  "POST /api/parse": {
    price: SINGLE_PRICE,
    network: NETWORK,
    config: {
      description: "Parse a single railway delay notice into structured JSON.",
      mimeType: "application/json",
    },
  },
  "POST /api/parse/bulk": {
    price: BULK_PRICE,
    network: NETWORK,
    config: {
      description: "Parse a batch of railway delay notices into structured JSON.",
      mimeType: "application/json",
    },
  },
};

export function createX402Middleware() {
  return paymentMiddleware(
    PAY_TO as `0x${string}`,
    paidRoutes,
    { url: FACILITATOR_URL as `${string}://${string}` },
  );
}
