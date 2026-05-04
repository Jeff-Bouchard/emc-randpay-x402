# Zero-Trust Randpay Test Suite

This test suite provides **zero-trust validation** of the EMC Randpay implementation. No mocking, no assumptions - only real API calls and cryptographic validation.

## 🛡️ What It Tests

### Server-Side Validation
- ✅ Server health and responsiveness
- ✅ CHAP generation (cryptographic uniqueness)
- ✅ Risk parameter accuracy (10, 33 values)
- ✅ Payment API structure (402/204 responses)
- ✅ Actual win rate statistics (vs theoretical)

### Frontend-Side Validation  
- ✅ Configuration values match server
- ✅ Risk chips have correct denominators
- ✅ **NO Math.random() anywhere**
- ✅ Tutorial system functionality
- ✅ UI parameter consistency

### End-to-End Validation
- ✅ Full round simulation
- ✅ CHAP uniqueness across requests
- ✅ Proper response headers
- ✅ Statistical win rate validation

## 🚀 Running Tests

```bash
# Start server first (in server/ directory)
npm start

# Run zero-trust test suite (in test/ directory)
npm test

# Or run directly
node randpay-e2e.test.js
```

## 📊 Test Coverage

1. **Server Health** - Basic connectivity
2. **CHAP Generation** - Cryptographic uniqueness 
3. **CHAP Uniqueness** - No duplicates across 10+ requests
4. **Payment API** - Proper 402/204 structure
5. **Risk Validation** - Statistical win rates match 1/N probability
6. **Frontend Config** - No Math.random(), correct values
7. **Server Config** - Correct risk denominators
8. **Full Simulation** - Complete round trip

## 🔍 Zero-Trust Principles

- **No Mocking**: All tests hit real APIs
- **No Assumptions**: Validates actual behavior
- **Statistical Validation**: Checks win rates over 100 attempts
- **Cryptographic Verification**: Ensures CHAP uniqueness
- **Configuration Audit**: Validates frontend/server consistency

## 📈 Expected Results

For risk=10 (1 in 10):
- Win rate: ~10% (±5% tolerance)
- Expected wins: ~10 per 100 attempts

For risk=33 (1 in 33):  
- Win rate: ~3% (±1.5% tolerance)
- Expected wins: ~3 per 100 attempts

## 🚨 Failure Modes

If tests fail:
1. **Server not running** - Start with `npm start`
2. **Wrong risk values** - Check server.js PLANS config
3. **Math.random() present** - Remove any fake probability
4. **CHAP duplicates** - Server entropy issue
5. **Win rate off** - Risk parameter bug

## 🎯 Trust But Verify

This suite ensures Randpay works exactly as specified - no fake randomness, no incorrect probabilities, no configuration mismatches.
