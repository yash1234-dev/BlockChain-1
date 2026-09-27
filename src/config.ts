import "dotenv/config";
import type { Network } from "x402/types";

/**
 * All payment-relevant configuration is server-controlled and read only from
 * environment variables here. Nothing in this file is ever taken from a
 * request body, query string, or caller-supplied header. Routes import these
 * constants instead of reading process.env themselves, so there is exactly
 * one place that decides price and payout address.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const PORT = Number(process.env.PORT ?? 3000);

// Payment recipient - server controlled. Never accept this from a request.
export const PAY_TO = required("PAY_TO", "0x000000000000000000000000000000000000dead");

// Payment network - must be a testnet. base-sepolia == eip155:84532.
export const NETWORK = (process.env.NETWORK ?? "base-sepolia") as Network;
export const MAINNET_NETWORKS = new Set(["base", "avalanche", "polygon", "solana"]);
if (MAINNET_NETWORKS.has(NETWORK)) {
  throw new Error(
    `Refusing to start: NETWORK="${NETWORK}" looks like a mainnet network. This project is testnet-only.`,
  );
}

// x402 facilitator that performs verify + settle.
export const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";

// Server-controlled prices per route. Callers cannot influence these.
export const SINGLE_PRICE = process.env.SINGLE_PRICE ?? "$0.001";
export const BULK_PRICE = process.env.BULK_PRICE ?? "$0.004";

// Input size caps (defense in depth, enforced both at the body-parser level
// and again explicitly on the parsed notice text).
export const MAX_JSON_BODY = "10kb";
export const MAX_NOTICE_LENGTH = 1000;
export const MAX_BULK_NOTICES = 20;
