# Contributing

Thanks for your interest. This repo carries three things: a scheme spec, a reference server, and an interactive UI. Each has different contribution surface.

## Reporting issues

Please use GitHub issues. For protocol-level questions or scheme semantics, file directly against the spec files in `specs/`. For server bugs, file against `server/`. For UI bugs, file against `ui/`.

## Specification changes

The files in `specs/schemes/randpay/` are written to match the format used by the x402 foundation. Changes here should be coordinated with the upstream PR — please tag the relevant maintainers and reference the foundation issue.

The scheme has prior art attribution to **Oleg Khovayko**. PRs that change the protocol semantics are out of scope; PRs that improve clarity, add examples, or correct errors in the x402 translation layer are welcome.

## Server changes

The reference server in `server/` should remain a small, readable, single-file gateway. PRs adding scope (databases, queue systems, caching layers) belong in a separate package, not here.

```bash
cd server
npm install
npm start
```

## UI changes

The UI in `ui/index.html` is intentionally a single self-contained HTML file. No build step. PRs that add a build pipeline will be declined unless they preserve the "open in browser" property.

## Submitting changes

1. Fork the repo
2. Create a branch named `feature/my-thing` or `fix/the-bug`
3. Make your change
4. Open a PR with a descriptive title

Sign your commits if possible.

## License

By contributing, you agree your contributions will be licensed under Apache 2.0.
