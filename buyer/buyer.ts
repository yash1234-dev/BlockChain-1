import "dotenv/config";
import { createSigner } from "x402/types";
import { decodeXPaymentResponse, wrapFetchWithPayment } from "x402-fetch";

/**
 * Buyer script for Meera's Railway Delay API.
 *
 * Reads a testnet-only private key from the environment, builds an x402
 * signer for Base Sepolia, and uses x402-fetch's wrapFetchWithPayment to do
 * the full x402 client flow: call the paid route, receive the 402 challenge
 * with payment requirements, sign and attach an X-PAYMENT header, and retry.
 *
 * Usage:
 *   npm run buyer               -> pays for a well-formed notice on /api/parse
 *   npm run buyer:bulk          -> pays for a batch on /api/parse/bulk
 *   npm run buyer:malformed     -> demonstrates a malformed notice: the
 *                                   server returns 4xx and payment is never
 *                                   settled (see src/handlers.ts + README).
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const BUYER_PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY;

const WELL_FORMED_NOTICE = "TRAIN: 12137\nSTATION: PUNE\nEXPECTED: 18:45\nREASON: Heavy rainfall";
const MALFORMED_NOTICE = "hello this train is late";

async function main() {
  const mode = process.argv.includes("--malformed")
    ? "malformed"
    : process.argv.includes("--bulk")
      ? "bulk"
      : "single";

  if (!BUYER_PRIVATE_KEY) {
    console.error(
      "Missing BUYER_PRIVATE_KEY in .env. Create a Base Sepolia testnet wallet, " +
        "fund it with test USDC (see README), and set BUYER_PRIVATE_KEY there.",
    );
    process.exit(1);
  }

  // Never log the raw private key. It is only ever passed to the signer.
  const signer = await createSigner("base-sepolia", BUYER_PRIVATE_KEY as `0x${string}`);
  const fetchWithPayment = wrapFetchWithPayment(fetch, signer);

  let url: string;
  let body: unknown;

  if (mode === "bulk") {
    url = `${API_BASE_URL}/api/parse/bulk`;
    body = {
      notices: [
        "TRAIN 12137 AT PUNE EXPECTED 18:45 REASON Heavy rainfall",
        "TRAIN 11010 AT NGP EXPECTED 21:30 REASON विलंब",
      ],
    };
  } else {
    url = `${API_BASE_URL}/api/parse`;
    body = { notice: mode === "malformed" ? MALFORMED_NOTICE : WELL_FORMED_NOTICE };
  }

  console.log(`--> POST ${url} (${mode})`);

  const response = await fetchWithPayment(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  console.log(`<-- status ${response.status}`);
  console.log(JSON.stringify(json, null, 2));

  const paymentResponseHeader = response.headers.get("x-payment-response");
  if (paymentResponseHeader) {
    console.log("Payment settled:", decodeXPaymentResponse(paymentResponseHeader));
  } else if (mode === "malformed") {
    console.log(
      "No X-PAYMENT-RESPONSE header present: the server rejected the notice before " +
        "settlement, so no coin was spent. This is the expected outcome for --malformed.",
    );
  }
}

main().catch((err) => {
  console.error("Buyer script failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
