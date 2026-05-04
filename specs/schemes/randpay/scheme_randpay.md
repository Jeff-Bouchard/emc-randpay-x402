# Scheme: `randpay`

## Summary

The `randpay` scheme implements probabilistic micropayment settlement natively at the
protocol layer of the Emercoin blockchain. Unlike deterministic schemes (e.g., `exact`)
where every request results in exactly one on-chain transaction, `randpay` settles
payment probabilistically: a given payment attempt succeeds with probability `1 - (1/risk)`,
where `risk` is a server-configured parameter expressed as "1 in N" (e.g., risk=10 means 1 in 10 chance of non-collection). The expected value of payment per request
is identical to a deterministic scheme at the same price — the distribution of settlement
events is what differs.

This property is not a workaround. It is a first-class primitive implemented in Emercoin
core (`emercoind`) by Oleg Khovayko, and predates the x402 standard. The scheme is
presented here to register prior art and extend x402 interoperability to the Emercoin network.

## Use Cases

**High-frequency micro-API billing.** At `risk=100`, 100 requests settle as one on-chain
transaction on average. Block space consumption and per-tx fee overhead are reduced by
`risk` while expected revenue is preserved exactly.

**Inference-as-a-service.** LLM inference endpoints can gate per-call or per-token billing
without incurring a confirmation-wait on every request. Non-winning tickets receive a fresh
CHAP embedded in the 402 response and retry immediately — the confirmation-wait is amortized
across the full population of callers.

**Subscription tiers.** Higher-value subscriptions (e.g., 30-day) use higher `risk` values
(tighter guarantee); lower-value subscriptions (e.g., 7-day) tolerate lower `risk`
(cheaper retry cost to client). The server operator tunes the expected value guarantee
to the commitment being purchased.

**Any x402-compatible resource server on Emercoin.** The scheme requires no smart contracts,
no token approvals, no gas estimation, and no third-party facilitator. `emercoind` is
the facilitator.

## Security Properties

**Unforgeability.** The CHAP is generated server-side by `emercoind` using internal entropy.
The client cannot predict the outcome of a given `randpay_mktx` call before `randpay_accept`
evaluates it.

**Non-replayability.** Each CHAP is single-use. `randpay_accept` rejects any rawtx whose
CHAP has already been consumed, regardless of whether the original attempt won or lost.

**Client-side key custody.** `randpay_mktx` executes on the client's own `emercoind` node.
The resource server never holds client private keys. Funds do not move until `randpay_accept`
broadcasts a winning transaction.

**Facilitator trust elimination.** The resource server calls `randpay_accept` on its own
`emercoind` instance. There is no third-party facilitator with custody over funds or the
ability to censor settlement. The server cannot selectively reject winning tickets — the
outcome is determined by `emercoind` internals at CHAP generation time.

**Expected value preservation.** For any sequence of N requests at `risk` r (1 in N chance of non-collection) and ticket
price p, the expected total settlement is `N × p × (1 - 1/r)`. This is mathematically
equivalent to N deterministic payments of `p × (1 - 1/r)`. The probabilistic model is a
statistical equivalence, not a discount or a gamble.

## Appendix

### Prior Art

`randpay` was designed and implemented in Emercoin core by Oleg Khovayko (Emercoin CTO,
handle: olegarch). The three-RPC interface — `randpay_mkchap`, `randpay_mktx`,
`randpay_accept` — has been available in `emercoind` since prior to 2020 and constitutes
independent prior art for the HTTP-native probabilistic payment primitive that x402
formalizes.

### Network Implementations

- `emc` — [Emercoin mainnet](specs/schemes/randpay/scheme_randpay_emc.md)
