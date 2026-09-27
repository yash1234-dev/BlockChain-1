# Operator's Booth — Meera's Railway Delay API

> Nobody pays for a notice she couldn't read. If parsing fails, the caller keeps their coin.

Meera is a retired Indian Railways clerk in Pune. Every morning she reads messy, half-structured
delay notices and turns them into clean JSON. This project wraps her parser in an **x402** seller:
an HTTP API where paid routes cost a fraction of a cent, paid per call, with no signups, API keys,
or invoices — like dropping a coin into a bioscope.

**Testnet only.** This project uses **Base Sepolia** and **test USDC**. It never touches mainnet.

---

## 1. Architecture

```
buyer/buyer.ts  --(x402-fetch, pays with test USDC)-->  HTTP API (Express)
                                                             │
                                          GET /health  ──────┤  free, no payment
                                          POST /api/parse ───┤  paid, x402-gated
                                          POST /api/parse/bulk ┤  paid, x402-gated (higher price)
                                                             │
                                              src/payments.ts  (x402-express paymentMiddleware:
                                                                 verify -> run handler -> settle
                                                                 only if handler responded < 400)
                                                             │
                                              src/handlers.ts  (body-size cap, Zod request
                                                                 validation, calls parser, sends
                                                                 4xx on failure)
                                                             │
                                              src/parser.ts    (deterministic regex parser,
                                                                 no external LLM)
                                                             │
                                              src/schemas.ts   (DelayNoticeSchema — explicit
                                                                 output validation)
```

**Why malformed notices are never paid:** `x402-express`'s `paymentMiddleware` buffers the route
handler's response. It only calls the facilitator's `settle()` if the buffered response status is
`< 400`. Our handlers (`src/handlers.ts`) run the parser and Zod validation *before* sending any
response, and reply with `422` (or `400` for a bad request shape) the moment parsing fails — before
any success response exists to settle payment for. This is enforced by the payment library itself,
not by an after-the-fact try/catch, so an unparseable notice structurally cannot result in a
settled payment.

## 2. Tech stack

- Node.js 20.12+ (22 LTS recommended), TypeScript, Express
- `x402`, `x402-express` (server payment gate), `x402-fetch` (buyer client)
- Base Sepolia testnet, x402.org public facilitator, test USDC
- Zod for request + output schema validation
- Vitest + Supertest for automated tests
- dotenv, tsx

## 3. API endpoints

| Method | Path                | Payment            | Price (server-controlled) |
|--------|---------------------|---------------------|----------------------------|
| GET    | `/health`           | Free                | —                           |
| POST   | `/api/parse`         | x402 (Base Sepolia) | `SINGLE_PRICE` (default `$0.001`) |
| POST   | `/api/parse/bulk`    | x402 (Base Sepolia) | `BULK_PRICE` (default `$0.004`, higher than single) |

Prices and the payout address (`PAY_TO`) are read only from server environment variables in
`src/config.ts` / `src/payments.ts`. A caller can never influence what they're charged — there is
no `price` or `payTo` field accepted anywhere in a request body, query string, or header.

### `POST /api/parse`

Request:
```json
{ "notice": "TRAIN 12137 AT PUNE EXPECTED 18:45 REASON Heavy rainfall" }
```

Success response (`200`):
```json
{ "train": "12137", "station": "PUNE", "expectedTime": "18:45", "reason": "Heavy rainfall" }
```

Malformed notice (`422`, **not settled**):
```json
{ "error": "Could not parse railway delay notice.", "reason": "Could not extract a train number from the notice.", "field": "train" }
```

### `POST /api/parse/bulk`

Request:
```json
{ "notices": ["TRAIN 12137 AT PUNE EXPECTED 18:45 REASON Heavy rainfall", "TRAIN 11010 AT NGP EXPECTED 21:30 REASON विलंब"] }
```

Response (`200`): `{ "results": [ { "ok": true, "data": { ... } }, { "ok": true, "data": { ... } } ] }`

If **every** notice in the batch fails to parse, the whole request is rejected with `422` and
never settled — a fully-garbage batch is never charged.

## 4. Installation

```bash
node -v            # confirm >= 20.12
npm install
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
PAY_TO=0xYourTestnetRecipientAddress
NETWORK=base-sepolia
FACILITATOR_URL=https://x402.org/facilitator
SINGLE_PRICE=$0.001
BULK_PRICE=$0.004
BUYER_PRIVATE_KEY=0xYourTestnetPrivateKey
API_BASE_URL=http://localhost:3000
```

`.env` is git-ignored. Only `.env.example` (placeholders only) is committed.

## 5. Running the server

```bash
npm run dev     # tsx watch mode
# or
npm run build && npm start
```

## 6. Running tests

```bash
npm test
```

Tests cover: valid parsing (colon-labeled and sentence-style notices), Hindi/Marathi Unicode
reasons, every "missing field" malformed case, empty/garbage notices, Zod schema validation, the
free `/health` route, the x402 402-with-payment-requirements response on both paid routes,
server-controlled pricing (bulk > single), and input-size rejection. The suite does **not**
require a live wallet or a real testnet payment — the malformed-input contract is tested by
mounting the same production handler functions directly, and the x402 gate itself is tested
against the payment-requirements response the middleware returns without a payment header.

## 7. Running the buyer (real x402 payment on testnet)

1. Get a Base Sepolia wallet + Base Sepolia test USDC. The Coinbase CDP faucet issues both:
   `https://docs.cdp.coinbase.com/x402/docs/faucet` (or any Base Sepolia ETH + testnet USDC faucet).
2. Put that wallet's private key in `.env` as `BUYER_PRIVATE_KEY` (**testnet key only — never a
   real key**).
3. Start the server (`npm run dev`) in one terminal.
4. In another terminal:

```bash
npm run buyer            # pays for a well-formed single notice
npm run buyer:bulk       # pays for a bulk batch (higher price)
npm run buyer:malformed  # sends garbage input — server returns 4xx, payment is never settled
```

`buyer/buyer.ts` uses `x402-fetch`'s `wrapFetchWithPayment` (a real x402 client): it makes the
initial request, receives the `402` challenge with payment requirements, signs an EIP-3009 USDC
authorization with the wallet built by `createSigner("base-sepolia", ...)`, retries with an
`X-PAYMENT` header, and prints the settled payment response. It is not a `curl` call.

## 8. Security / secrets

- No private keys, mnemonics, or credentials are committed anywhere in this repository.
- `.env` is listed in `.gitignore`; only `.env.example` (placeholders) is tracked.
- `BUYER_PRIVATE_KEY` must be a **testnet-only** key. Never fund it with real assets.
- The server never logs `BUYER_PRIVATE_KEY` or any private key.
- `PAY_TO` and all prices are server-side configuration only — never accepted from a request.

## 9. Project structure

```
operators-booth/
├── src/
│   ├── server.ts     entrypoint
│   ├── app.ts         express app: body-size cap, free route, x402 gate, paid routes
│   ├── handlers.ts     route logic: validate -> parse -> 4xx before any 200
│   ├── parser.ts       deterministic regex parser (parseDelayNotice)
│   ├── schemas.ts       Zod: DelayNoticeSchema + request schemas
│   ├── config.ts       server-controlled env config (PAY_TO, NETWORK, prices, caps)
│   └── payments.ts      x402-express paymentMiddleware wiring
├── buyer/buyer.ts       x402-fetch client script
├── samples/valid/*.txt, samples/malformed/*.txt
├── tests/parser.test.ts, tests/api.test.ts
├── .env.example
└── .gitignore
```

## 10. Notes

- The parser is fully deterministic (regex + string normalization) — no external LLM call.
- Network identifier `base-sepolia` used throughout the x402 SDK corresponds to chain
  `eip155:84532` (Base Sepolia testnet).
- This project is **testnet-only**. `src/config.ts` refuses to start if `NETWORK` is set to a
  known mainnet identifier.
