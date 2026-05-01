# Scheme: `randpay` on `EMC`

## Summary

The `randpay` scheme on Emercoin uses three native `emercoind` RPC calls to implement
probabilistic HTTP payment gating with no smart contracts, no gas token, no third-party
facilitator, and no confirmation wait on the critical response path.

The resource server acts as both resource server and facilitator. Settlement is performed
by calling `randpay_accept` on the server's own `emercoind` node. The client requires a
funded `emercoind` wallet to call `randpay_mktx`.

**Network identifier:** `emc`  
**Asset:** EMC (native coin, 8 decimal places)  
**Facilitator:** none required — `emercoind` is the facilitator

---

## Protocol Flow

```
Client                        Resource Server               emercoind
  |                                 |                               |
  |── GET /resource ───────────────▶|                               |
  |                                 |── randpay_mkchap(amt,r,t) ───▶|
  |                                 |◀── CHAP hex ──────────────────|
  |◀─ 402  X-PAYMENT-REQUIRED ──────|                               |
  |   (PaymentRequirements b64)     |                               |
  |                                 |                               |
  |── randpay_mktx(chap,t) ────────────────────────────────────────▶|  ← client node
  |◀── rawtx hex ───────────────────────────────────────────────────|
  |                                 |                               |
  |── GET /resource                 |                               |
  |   X-PAYMENT-SIGNATURE: b64 ────▶|                               |
  |                                 |── randpay_accept(rawtx) ─────▶|
  |                                 |◀── true | false ──────────────|
  |                                 |                               |
  |◀─ 200  X-PAYMENT-RESPONSE ──────|  winner: resource returned    |
  |   or                            |                               |
  |◀─ 402  X-PAYMENT-REQUIRED ──────|  non-winner: fresh CHAP       |
  |   (fresh CHAP embedded)         |  embedded, retry immediately  |
```

Steps (1) and (2) — the cold 402 — MAY be skipped if the client already holds a
valid CHAP for this resource and it has not expired.

---

## Phase 1: `X-PAYMENT-REQUIRED` Header — PaymentRequirements

The resource server generates a CHAP by calling:

```
randpay_mkchap <amount_emc> <risk> <timeout_seconds>
```

The returned hex string is the CHAP. The server constructs a `PaymentRequirements` object
and returns it base64-encoded in the `X-PAYMENT-REQUIRED` header alongside the 402 status.

**`PaymentRequirements` fields:**

| Field | Type | Description |
|---|---|---|
| `scheme` | string | MUST be `"randpay"` |
| `network` | string | MUST be `"emc"` |
| `maxTimeoutSeconds` | integer | MUST match the `timeout` passed to `randpay_mkchap` |
| `amount` | string | Ticket price in EMC satoshi (8 decimal integer string). Actual tx value when a winning ticket settles. |
| `asset` | string | MUST be `"EMC"` |
| `payTo` | string | Server's EMC receiving address |
| `extra.chap` | string | Hex string returned by `randpay_mkchap`. Single-use. |
| `extra.risk` | number | Probability server does NOT collect on a given ticket (0–1). |
| `extra.expected` | string | Expected value per call in EMC satoshi: `floor(amount × (1 - risk))`. Informational. |

**Example `PaymentRequirements`:**

```json
{
  "x402Version": 1,
  "scheme": "randpay",
  "network": "emc",
  "maxTimeoutSeconds": 300,
  "amount": "5000000",
  "asset": "EMC",
  "payTo": "EYrmSJnMDSqnRmAhuBSMEBzRhURAKwxeZ2",
  "description": "7-day API subscription",
  "extra": {
    "chap": "a3f82c...d94e01",
    "risk": 0.10,
    "expected": "4500000"
  }
}
```

`amount` is denominated in EMC satoshi (1 EMC = 100000000 satoshi, 8 decimal places).
The `amount` field represents the ticket price — the actual EMC value broadcast when a
winning ticket settles. The `expected` field represents the expected value per call:
`amount × (1 - risk)`.

---

## Phase 2: `X-PAYMENT-SIGNATURE` Header — PaymentPayload

The client calls `randpay_mktx` on their own `emercoind` node:

```
randpay_mktx "<chap>" <timeout_seconds>
```

This produces a signed raw transaction hex string. The client constructs a `PaymentPayload`
and sends the original request again with the `X-PAYMENT-SIGNATURE` header.

**`PaymentPayload` fields:**

| Field | Type | Description |
|---|---|---|
| `x402Version` | integer | MUST be `1` |
| `scheme` | string | MUST be `"randpay"` |
| `network` | string | MUST be `"emc"` |
| `payload.rawtx` | string | Hex-encoded signed raw transaction from `randpay_mktx` |

**Example `PaymentPayload`:**

```json
{
  "x402Version": 1,
  "scheme": "randpay",
  "network": "emc",
  "payload": {
    "rawtx": "0100000001...f4ac0000"
  }
}
```

The full object MUST be base64-encoded and sent as the `X-PAYMENT-SIGNATURE` header value.

---

## Phase 3: Verification

The resource server calls:

```
randpay_accept <rawtx_hex>
```

`randpay_accept` performs all verification internally:

1. **CHAP validity** — confirms the rawtx was built against a CHAP issued by this server's `emercoind`.
2. **CHAP expiry** — rejects rawtx if the CHAP has exceeded `timeout_seconds`.
3. **Non-replayability** — rejects any rawtx whose CHAP has already been consumed.
4. **Amount** — confirms the transaction amount matches the CHAP parameters.
5. **Probabilistic outcome** — determines winner/non-winner using internal entropy bound to the CHAP at generation time.

`randpay_accept` returns:
- `true` — winning ticket. Server MUST fulfill the request and return 200.
- `false` — valid non-winner. Server MUST return 402 with a fresh CHAP embedded.
- throws — invalid rawtx (bad CHAP, expired, replayed, malformed). Server MUST return 402.

The server MUST NOT fulfill the request on a `false` or exception result.

**Non-winner 402:** The server calls `randpay_mkchap` again and returns a fresh
`PaymentRequirements` in `X-PAYMENT-REQUIRED`. The client retries immediately using the
embedded CHAP — no additional round-trip is required.

---

## Phase 4: Settlement

Settlement is implicit. When `randpay_accept` returns `true`, `emercoind` has already
broadcast the winning transaction to the Emercoin network. The resource server does not
submit a separate settlement transaction. There is no settlement latency on the response
path — the 200 response is returned immediately after `randpay_accept` confirms the win.

For non-winning tickets, no transaction is broadcast. The client's funds are not held,
locked, or deducted. Only winning tickets result in on-chain activity.

---

## Settlement Response — `X-PAYMENT-RESPONSE`

On a winning 200 response, the server MUST set the `X-PAYMENT-RESPONSE` header to a
base64-encoded `SettlementResponse`:

```json
{
  "scheme": "randpay",
  "network": "emc",
  "result": {
    "winner": true,
    "settled": true
  }
}
```

---

## Risk Parameter Guidelines

`risk` is set by the server operator at CHAP generation time. It MUST be in range (0, 1).

| Scenario | Recommended `risk` | Rationale |
|---|---|---|
| Per-request micro-billing, high frequency | 0.01 – 0.05 | 1 tx per 20–100 calls; block space efficient |
| 7-day subscription gate | 0.10 | Short commitment; client retry cost is negligible |
| 30-day subscription gate | 0.03 | Larger value; tighter expected-value guarantee |
| Near-deterministic single request | 0.01 | Approaches `exact` behavior |

Higher `risk` → fewer on-chain transactions → lower amortized fee per call.  
Lower `risk` → tighter expected-value guarantee → appropriate for larger per-ticket amounts.

---

## Security Considerations

**Replay attack prevention.** Each CHAP is consumed on first `randpay_accept` call regardless
of outcome. A replayed rawtx (same CHAP, second submission) MUST be rejected by `randpay_accept`.

**CHAP expiry.** `randpay_mkchap` binds the CHAP to a `timeout_seconds` window.
`randpay_accept` MUST reject rawtx submitted after expiry. Clients receiving an expired-CHAP
rejection SHOULD request a fresh CHAP and rebuild the rawtx.

**Authorization scope.** The CHAP encodes the payment amount and receiving address.
The client cannot alter destination or amount in `randpay_mktx` — the resulting rawtx
will fail `randpay_accept` validation if tampered.

**Settlement atomicity.** `randpay_accept` returning `true` is the settlement event.
No additional confirmation step exists or is required. The winning transaction is broadcast
by `emercoind` as part of the `randpay_accept` call.

**Race condition.** If two clients submit rawtx built from the same CHAP simultaneously
(which MUST NOT happen under normal operation, as CHAPs are per-client), the second
`randpay_accept` call MUST fail due to CHAP consumption. Servers SHOULD generate a unique
CHAP per client request.

---

## Client Requirements

- `emercoind` running locally with a funded EMC wallet
- `randpay_mktx` available in the installed emercoind build
- Network access to the resource server

The client does not require a third-party wallet, browser extension, or token approval.
The entire client-side flow is a single CLI call:

```bash
emercoin-cli randpay_mktx "<chap>" <timeout>
```

---

## Appendix

### RPC Reference

| RPC | Side | Signature | Returns |
|---|---|---|---|
| `randpay_mkchap` | server | `amount risk timeout` | CHAP hex string |
| `randpay_mktx` | client | `"chap" timeout` | signed rawtx hex string |
| `randpay_accept` | server | `hexstring [flags]` | `true` (winner) / `false` (non-winner) / throws |

### EMC Denomination

1 EMC = 100,000,000 satoshi (8 decimal places).  
All `amount` and `expected` fields in `PaymentRequirements` are integer strings in satoshi.

### Emercoin Resources

- Emercoin: https://emercoin.com
- emercoind source: https://github.com/emercoin/emercoin
- randpay author: Oleg Khovayko (olegarch)
