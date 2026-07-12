# API and OKX.AI A2MCP Integration

## Service mode

ShipCheck Quick Acceptance is a standardized, pay-per-call service and fits A2MCP.

Official OKX.AI documentation describes A2MCP as a callable API/MCP service that either returns `HTTP 200` directly when free or uses x402. The paid flow returns `HTTP 402`, the caller pays, and the request is replayed to receive the resource.

## Production endpoint

```text
POST /v1/verify
```

Request:

```json
{
  "brief": "Build a responsive launch page with pricing, FAQ, documentation and a working waitlist form.",
  "deliveryUrl": "https://example.com",
  "mode": "quick",
  "maxRequirements": 12
}
```

Response:

```json
{
  "requestId": "sc_req_01...",
  "contract": {},
  "verdict": "CHANGES_REQUIRED",
  "summary": {
    "total": 10,
    "passed": 6,
    "failed": 2,
    "unverified": 0,
    "notObjectivelyTestable": 2,
    "unsupported": 0
  },
  "results": [],
  "receipt": {},
  "reportUrl": "https://..."
}
```

## Other endpoints

```text
GET  /health
GET  /v1/requests/{requestId}
POST /v1/compile
POST /v1/retest                 # roadmap
GET  /v1/receipts/{receiptId}
GET  /v1/receipts/{receiptId}/verify
```

## Errors

| Code | HTTP | Meaning |
|---|---:|---|
| INVALID_REQUEST | 400 | Schema validation failed |
| UNSAFE_TARGET | 400 | URL/network policy violation |
| COMPILATION_FAILED | 422 | No valid contract |
| PAYMENT_REQUIRED | 402 | x402 challenge |
| REQUEST_CONFLICT | 409 | Idempotency mismatch |
| RATE_LIMITED | 429 | Rate limit |
| EXECUTION_UNAVAILABLE | 503 | No safe execution capacity |
| INTERNAL_ERROR | 500 | Unexpected failure |

`INSUFFICIENT_SPECIFICATION` is a valid product result and normally returns 200.

## Current official Node.js packages

```bash
npm install express @okxweb3/x402-express @okxweb3/x402-core @okxweb3/x402-evm
```

Suggested configuration:

```typescript
const NETWORK = process.env.X402_NETWORK ?? "eip155:196";
const PRICE = process.env.SHIPCHECK_PRICE ?? "$0.01";
```

Use the official:

- `paymentMiddleware`
- `x402ResourceServer`
- `ExactEvmScheme`
- `OKXFacilitatorClient`

according to the current SDK reference.

Networks documented by OKX:

```text
X Layer Mainnet: eip155:196
X Layer Testnet: eip155:1952
```

## Payment boundary

Correct:

```text
request
→ x402 middleware
→ payment verified
→ validate business input
→ execute ShipCheck
→ return receipt
```

Incorrect:

```text
request
→ run browser
→ request payment
```

## Synchronous scope

V1 quick mode must remain bounded. Complex custom audits should move to A2A rather than masquerading as fast A2MCP calls.

## Registration checklist

- public global HTTPS endpoint;
- service name;
- description;
- price per call;
- endpoint URL;
- compliant free or x402 behavior;
- `curl -i` self-test;
- OKX.AI review;
- reliable operation after listing.

## Official references

- `https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp`
- `https://web3.okx.com/onchainos/dev-docs/okxai/registerasp`
- `https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk`

Re-check package versions before implementation.
