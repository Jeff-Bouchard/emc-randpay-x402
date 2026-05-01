# Proposal: `randpay` scheme — probabilistic micropayment on Emercoin

## Problem being solved

The `exact` scheme requires one on-chain transaction per paid request. For high-frequency
micro-API billing (inference endpoints, per-call data APIs, subscription gates), this means:

- One confirmation wait per request, on the critical response path
- One tx fee per request, regardless of payment size
- Block space consumption proportional to request volume

## High-level approach

Register `randpay` as a new x402 scheme backed by Emercoin's native probabilistic payment
protocol. The core primitive is already implemented in `emercoind` as three RPC calls:

```
randpay_mkchap amount risk timeout  →  CHAP hex          (server)
randpay_mktx   "chap" timeout       →  signed rawtx hex  (client, own node)
randpay_accept hexstring            →  true | false      (server)
```

`randpay_accept` returning `true` is a winning ticket — settlement is complete, no
separate broadcast step. `false` is a valid non-winning ticket — server returns 402
with a fresh CHAP embedded, client retries immediately. Expected value is preserved
across the full distribution of requests.

At `risk=0.01`: 100 requests produce 1 on-chain transaction on average, at the same
expected EMC revenue as 100 exact payments.

## Why existing schemes don't suffice

`exact` on EVM/SVM is deterministic and requires a facilitator to broadcast the settlement
transaction. `randpay` is:

- Probabilistic by design — a different settlement model, not a variant of `exact`
- Facilitator-free — `emercoind` is the facilitator
- Non-EVM — Emercoin is a Bitcoin-derived PoW/PoS chain; EVM scheme mechanics do not apply

## Prior art note

`randpay_mkchap`, `randpay_mktx`, and `randpay_accept` were designed and implemented in
Emercoin core by Oleg Khovayko (Emercoin CTO). This RPC suite predates the x402 standard
and constitutes independent prior art for the HTTP-native probabilistic payment primitive.
This PR registers that prior art within the x402 scheme namespace and extends x402
interoperability to the Emercoin network.

## Spec files

- `specs/schemes/randpay/scheme_randpay.md` — scheme overview, security properties, use cases
- `specs/schemes/randpay/scheme_randpay_emc.md` — EMC chain implementation, full RPC flow,
  PaymentRequirements and PaymentPayload structures, verification and settlement logic

## What this PR does NOT include

Per the contribution workflow, this is PR 1 (spec only). A reference implementation
in TypeScript, Python, or Go will follow after spec approval.
