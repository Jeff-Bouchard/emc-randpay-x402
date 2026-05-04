/**
 * x402 — Emercoin randpay payment gateway
 *
 * HTTP 402 Payment Required IS the protocol.
 * The 402 response carries the CHAP. Client pays, retries with rawtx.
 *
 * Flow:
 *   1. Client hits /api/*                     → 402  { chap, plan, ... }
 *   2. Client: randpay_mktx "<chap>" <timeout> → rawtx
 *   3. Client retries /api/*  X-Payment: <rawtx>
 *      Server: randpay_accept rawtx
 *      → 200 (winner, sub activated, X-Sub-Token issued)
 *      → 402 (non-winner, fresh CHAP included — retry again)
 *
 * Once a subscription token is active, X-Sub-Token replaces X-Payment.
 * Service always open for the duration of the plan.
 */

'use strict';

const express = require('express');
const http    = require('http');
const crypto  = require('crypto');

// ── EMC RPC ───────────────────────────────────────────────────────────────────

const RPC = {
  host: process.env.EMC_HOST || '127.0.0.1',
  port: parseInt(process.env.EMC_PORT || '6662'),
  auth: Buffer.from(
    `${process.env.EMC_USER || 'emc'}:${process.env.EMC_PASS || 'changeme'}`
  ).toString('base64'),
};

async function rpc(method, params = []) {
  const body = JSON.stringify({ jsonrpc: '1.1', id: 'x402', method, params });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: RPC.host, port: RPC.port, method: 'POST', path: '/',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization':  `Basic ${RPC.auth}`,
        },
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(raw);
            if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; return reject(e); }
            resolve(j.result);
          } catch { reject(new Error(`RPC parse: ${raw.slice(0, 80)}`)); }
        });
      }
    );
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Plans ─────────────────────────────────────────────────────────────────────

const PLANS = {
  '7d': {
    label:   '7-day',
    days:    7,
    amount:  parseFloat(process.env.PRICE_7D  || '0.05000000'),
    risk:    parseFloat(process.env.RISK_7D   || '10'),
    timeout: parseInt(process.env.TIMEOUT_7D  || '300'),
    ttl_ms:  7 * 24 * 60 * 60 * 1000,
  },
  '30d': {
    label:   '30-day',
    days:    30,
    amount:  parseFloat(process.env.PRICE_30D || '0.15000000'),
    risk:    parseFloat(process.env.RISK_30D  || '33'),
    timeout: parseInt(process.env.TIMEOUT_30D || '300'),
    ttl_ms:  30 * 24 * 60 * 60 * 1000,
  },
};

// Default plan for unauthenticated requests (can be overridden via ?plan=30d)
const DEFAULT_PLAN = '7d';

// ── Subscription store ────────────────────────────────────────────────────────

const SUBS = new Map();

function issueSub(plan_key, identity) {
  const plan       = PLANS[plan_key];
  const token      = crypto.randomBytes(24).toString('hex');
  const issued_at  = Date.now();
  const expires_at = issued_at + plan.ttl_ms;
  const sub = { token, plan: plan_key, label: plan.label, issued_at, expires_at, identity: identity || null };
  SUBS.set(token, sub);
  setTimeout(() => SUBS.delete(token), plan.ttl_ms);
  return sub;
}

// ── Build a 402 challenge ─────────────────────────────────────────────────────

async function makeChallenge(plan_key) {
  const plan = PLANS[plan_key];
  const chap = await rpc('randpay_mkchap', [plan.amount, plan.risk, plan.timeout]);
  return {
    version:    'x402/1.0',
    scheme:     'EMC-randpay',
    plan:       plan_key,
    label:      plan.label,
    amount:     plan.amount.toFixed(8),
    currency:   'EMC',
    risk:       plan.risk,
    timeout:    plan.timeout,
    chap,
    client_cmd: `emercoin-cli randpay_mktx "${chap}" ${plan.timeout}`,
    instructions: [
      `1. Run: emercoin-cli randpay_mktx "${chap}" ${plan.timeout}`,
      '2. Retry this request with header:  X-Payment: <rawtx output>',
      '   On 402 again (non-winner): a fresh chap is included — repeat step 1–2.',
      '   On 200: save X-Sub-Token for subsequent requests.',
    ],
  };
}

// ── x402 middleware ───────────────────────────────────────────────────────────

function x402(options = {}) {
  return async (req, res, next) => {
    const plan_key = req.query.plan && PLANS[req.query.plan]
      ? req.query.plan
      : DEFAULT_PLAN;

    // ── Path A: active subscription token ────────────────────────────────────
    const sub_token = req.headers['x-sub-token'];
    if (sub_token) {
      const sub = SUBS.get(sub_token);
      if (sub && Date.now() < sub.expires_at) {
        req.sub = sub;
        return next();
      }
      // expired or invalid — fall through to payment challenge
    }

    // ── Path B: payment rawtx present — attempt randpay_accept ───────────────
    const rawtx = req.headers['x-payment'];
    if (rawtx) {
      let accepted;
      try {
        accepted = await rpc('randpay_accept', [rawtx]);
      } catch (err) {
        return res.status(402).json({
          error:   'randpay_accept rejected',
          reason:  err.message,
          // fresh challenge so client can retry without a separate request
          challenge: await makeChallenge(plan_key).catch(() => null),
        });
      }

      if (!accepted) {
        // Non-winning ticket — embed fresh CHAP so client can retry in one step
        let challenge;
        try { challenge = await makeChallenge(plan_key); } catch (_) {}
        return res.status(402).json({
          error:     'non-winning ticket',
          winner:    false,
          challenge,           // ready to use immediately — no extra round-trip
        });
      }

      // Winner — activate subscription, proceed to handler
      const identity = req.headers['x-identity'] || null;
      const sub = issueSub(plan_key, identity);
      req.sub = sub;

      // Attach sub token to response — client saves it
      res.set('X-Sub-Token',   sub.token);
      res.set('X-Sub-Plan',    sub.plan);
      res.set('X-Sub-Expires', sub.expires_at.toString());
      return next();
    }

    // ── Path C: no credentials at all — issue 402 challenge ──────────────────
    let challenge;
    try {
      challenge = await makeChallenge(plan_key);
    } catch (err) {
      return res.status(502).json({ error: `randpay_mkchap: ${err.message}` });
    }

    res.status(402).json({ challenge });
  };
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
// Serve static frontend files
app.use(express.static('../ui'));

// All /api/* routes — x402 middleware gates entry
app.use('/api', x402());

// Service handlers — mount here, payment is already settled above
app.get('/api/status', (req, res) => {
  res.json({
    active:     true,
    plan:       req.sub.label,
    expires_at: req.sub.expires_at,
    ms_remain:  req.sub.expires_at - Date.now(),
    identity:   req.sub.identity,
  });
});

// app.post('/api/infer',   (req, res) => { ... });
// app.get('/api/resolve',  (req, res) => { ... });

// ── Info ──────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.json({
  protocol: 'x402',
  scheme:   'EMC-randpay',
  plans: Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, {
    amount:  p.amount.toFixed(8) + ' EMC',
    risk:    p.risk,
    days:    p.days,
    timeout: p.timeout + 's',
  }])),
  flow: [
    '1. GET /api/*                                → 402 { challenge: { chap, ... } }',
    '2. emercoin-cli randpay_mktx "<chap>" <t>    → rawtx',
    '3. GET /api/*  X-Payment: <rawtx>            → 200 X-Sub-Token (winner)',
    '                                             → 402 fresh chap  (non-winner, retry step 2)',
    '4. GET /api/*  X-Sub-Token: <token>          → 200 (open for plan duration)',
  ],
}));

const PORT = process.env.PORT || 4020;
app.listen(PORT, () => {
  console.log(`x402 randpay listening :${PORT}`);
  Object.entries(PLANS).forEach(([k, p]) =>
    console.log(`  ${k.padEnd(4)}: ${p.amount.toFixed(8)} EMC  risk=${p.risk}  timeout=${p.timeout}s`)
  );
});

module.exports = { app, x402 };
