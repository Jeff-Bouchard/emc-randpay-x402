#!/usr/bin/env node
/**
 * x402 randpay client
 *
 * Speaks the real x402 protocol:
 *   - Hit the resource
 *   - 402 → extract chap → randpay_mktx → retry with X-Payment
 *   - 402 again (non-winner) → fresh chap is in the response → retry
 *   - 200 → save X-Sub-Token → done
 *
 * Usage:
 *   node client.js [plan]         — subscribe and probe /api/status
 *   node client.js status <token> — check existing subscription
 *
 * Requires emercoin-cli in PATH with a funded wallet.
 */

'use strict';

const { execSync } = require('child_process');

const BASE  = process.env.X402_URL || 'http://127.0.0.1:4020';
const PLAN  = process.argv[2] === 'status' ? null : (process.argv[2] || '7d');
const TOKEN = process.argv[2] === 'status' ? process.argv[3] : null;
const MAX   = 30; // max randpay attempts before giving up

function emcCli(...args) {
  const cmd = `emercoin-cli ${args.map(a => `"${a}"`).join(' ')}`;
  process.stdout.write(`  $ ${cmd}\n`);
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Core: fetch resource, handle x402 automatically ──────────────────────────

async function x402Fetch(url, opts = {}, plan = '7d') {
  const headers = { ...(opts.headers || {}) };
  let attempts  = 0;

  while (attempts < MAX) {
    const r = await fetch(url, { ...opts, headers });

    if (r.status !== 402) return r; // 200, 401, 500, etc — caller handles

    const body = await r.json().catch(() => ({}));
    const challenge = body.challenge;

    if (!challenge?.chap) {
      throw new Error(`402 with no CHAP: ${JSON.stringify(body)}`);
    }

    attempts++;
    const { chap, timeout, winner } = { winner: body.winner, ...challenge };

    if (attempts === 1 || winner === false) {
      process.stdout.write(`\n  [attempt ${attempts}] 402 — calling randpay_mktx\n`);
    }

    let rawtx;
    try {
      rawtx = emcCli('randpay_mktx', chap, String(timeout));
    } catch (err) {
      throw new Error(`randpay_mktx failed: ${err.message}`);
    }

    headers['X-Payment'] = rawtx;
    headers['X-Payment-Plan'] = plan; // carried via query in real req — see below
    await sleep(200);
  }

  throw new Error(`x402: exceeded ${MAX} attempts (persistent non-winner?)`);
}

// ── Subscribe: hit /api/status, follow x402, capture token ───────────────────

async function subscribe(plan) {
  console.log(`\n── Subscribing (${plan}) via x402 ──────────────────`);
  const url = `${BASE}/api/status?plan=${plan}`;

  let r;
  try {
    r = await x402Fetch(url, {}, plan);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }

  const token   = r.headers.get('x-sub-token');
  const expires = r.headers.get('x-sub-expires');
  const body    = await r.json().catch(() => null);

  if (r.status === 200) {
    console.log('\n  ✓ Subscription active');
    if (token) {
      console.log(`  X-Sub-Token   : ${token}`);
      console.log(`  X-Sub-Plan    : ${r.headers.get('x-sub-plan')}`);
      console.log(`  X-Sub-Expires : ${expires ? new Date(parseInt(expires)).toISOString() : 'n/a'}`);
      console.log('\n  export X402_TOKEN="' + token + '"');
    }
    if (body) {
      console.log('\n  Status response:');
      console.log('  ' + JSON.stringify(body, null, 2).replace(/\n/g, '\n  '));
    }
    return token;
  }

  console.error('Unexpected status', r.status, body);
  process.exit(1);
}

// ── Check existing token ──────────────────────────────────────────────────────

async function checkStatus(token) {
  console.log('\n── Checking subscription ───────────────────────────');
  const r = await fetch(`${BASE}/api/status`, {
    headers: { 'X-Sub-Token': token },
  });
  const body = await r.json().catch(() => null);
  if (r.status !== 200) {
    console.log('Status:', r.status, body);
    return;
  }
  const remain_h = (body.ms_remain / 3600000).toFixed(1);
  console.log(`  Plan     : ${body.plan}`);
  console.log(`  Expires  : ${new Date(body.expires_at).toISOString()}`);
  console.log(`  Remaining: ${remain_h}h`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  if (TOKEN) {
    await checkStatus(TOKEN);
  } else {
    if (!['7d', '30d'].includes(PLAN)) {
      console.error('Usage: node client.js <7d|30d>');
      console.error('       node client.js status <token>');
      process.exit(1);
    }
    await subscribe(PLAN);
  }
})();
