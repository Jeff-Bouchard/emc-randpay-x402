# emc-randpay-x402

> **EMC-randpay**: an [x402](https://github.com/x402-foundation/x402) payment scheme using Emercoin's native probabilistic payment protocol.

[![scheme](https://img.shields.io/badge/x402-scheme%3A%20randpay-1db985)](./specs/schemes/randpay/scheme_randpay.md)
[![network](https://img.shields.io/badge/network-emc-1db985)](https://emercoin.com)
[![status](https://img.shields.io/badge/status-draft-e8a030)](./specs/schemes/randpay/scheme_randpay.md)
[![license](https://img.shields.io/badge/license-Apache--2.0-666)](./LICENSE)

`randpay` predates the x402 standard. It was designed and shipped in `emercoind` years ago by **Oleg Khovayko** (Emercoin CTO) as three native RPC calls:

```
randpay_mkchap amount risk timeout   →  CHAP hex          (server)
randpay_mktx   "chap" timeout        →  signed rawtx hex  (client, own node)
randpay_accept hexstring             →  true | false      (server)
```

This repository:

1. **Specifies** `randpay` as an x402 scheme — ready to PR to the foundation
2. **Implements** an x402-compliant gateway server in Node.js
3. **Visualizes** the full flow with an interactive web UI

## Why probabilistic settlement matters

`exact` (the only scheme x402 ships with today) requires one on-chain transaction per paid request. `randpay` settles probabilistically: at `risk=100`, **100 API calls produce one on-chain transaction** with mathematically identical expected revenue. No confirmation wait. No facilitator. No smart contracts. `emercoind` is the facilitator.

| | `exact` (EVM) | `randpay` (EMC) |
|---|---|---|
| On-chain txs per request | 1 | `1/risk` (fractional) |
| Confirmation wait on response path | yes | no |
| Third-party facilitator | required | not required |
| Smart contracts | Permit2 / EIP-3009 / ERC-7710 | none |
| Gas token | yes (ETH) | no (EMC is fee + payment) |
| Settlement model | deterministic | probabilistic, fair by construction |

## Repository layout

```
emc-randpay-x402/
├── README.md                  this file
├── LICENSE                    Apache 2.0
├── server/                    x402-compliant gateway server (Node.js)
│   ├── server.js              the gateway — drop-in middleware
│   ├── client.js              CLI test client
│   ├── package.json
│   └── .env.example
├── ui/                        interactive web UI
│   └── index.html             zero-dependency, open in browser
├── specs/                     x402 scheme specification
│   └── schemes/randpay/
│       ├── scheme_randpay.md          scheme overview, security properties
│       └── scheme_randpay_emc.md      EMC chain implementation
├── docs/                      documentation
│   └── PR_ISSUE_BODY.md       text to file on the x402 foundation repo
└── scripts/                   helpers
    └── verify-spec.sh         lints the spec markdown
```

## Quick start

### 1. Run the gateway server

```bash
cd server
cp .env.example .env
# Edit .env — set EMC RPC creds and your receiving address
npm install
npm start
```

Server listens on `:4020` by default. Protect any endpoint with the middleware:

```js
const { app, x402 } = require('./server');

app.get('/api/expensive-thing', x402(), (req, res) => {
  res.json({ paid: true, sub: req.sub });
});
```

### 2. Open the web UI

```bash
open ui/index.html
```

Or serve it on any static host. The UI is a single self-contained HTML file — no build step.

The playground walks through all three RPC calls with:
- A 3-button sequence (`mkchap` → `mktx` → `accept`) that locks/greys per step
- A tutorial callout updating per stage
- A "Use real EMC payments" toggle that fires real fetch to your gateway
- A sticky console showing the full session log
- A `⟳ Full round` wizard that auto-loops through non-winners until a win

### 3. Read the spec

`specs/schemes/randpay/scheme_randpay.md` is the scheme overview.  
`specs/schemes/randpay/scheme_randpay_emc.md` is the EMC chain implementation — written to the exact format used by `scheme_exact_evm.md` in the x402 foundation repo, ready to PR.

## Submitting to the x402 foundation

Per their [CONTRIBUTING.md](https://github.com/x402-foundation/x402/blob/main/CONTRIBUTING.md), new schemes follow a 3-PR workflow. This repo prepares **PR 1 — specification only**:

1. **Open an issue first** at https://github.com/x402-foundation/x402/issues/new — paste `docs/PR_ISSUE_BODY.md` as the body
2. Fork `x402-foundation/x402`
3. Drop both spec files into `specs/schemes/randpay/`
4. Open a PR titled: `spec: add randpay scheme — probabilistic micropayment on Emercoin`

Reference implementation (PR 2) and additional SDK ports (PR 3) follow after spec approval.

## Prior art attribution

`randpay` is the work of **Oleg Khovayko** (handle: hack51), Emercoin CTO. The three-RPC protocol was implemented in `emercoind` years before the x402 specification existed. This repository's contribution is the *x402-compliance translation* of that protocol — not the protocol itself.

## License

Apache 2.0 — see [LICENSE](./LICENSE).

The `randpay` protocol is part of Emercoin core, licensed under its own terms at https://github.com/emercoin/emercoin.

## References

- [x402 specification](https://github.com/x402-foundation/x402)
- [Emercoin](https://emercoin.com)
- [emercoind source](https://github.com/emercoin/emercoin)
- [PrivateNess Network](https://privateness.network)
