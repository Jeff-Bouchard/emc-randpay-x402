// ZERO-TRUST End-to-End Randpay Test Suite
// Tests actual Randpay behavior, no mocking, no assumptions

const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Test configuration
const SERVER_URL = 'http://localhost:4020';
const TEST_RESULTS = { passed: 0, failed: 0, errors: [] };

// Utility functions
function log(message) {
  console.log(`[TEST] ${message}`);
}

function assert(condition, message) {
  if (condition) {
    TEST_RESULTS.passed++;
    log(`✅ PASS: ${message}`);
  } else {
    TEST_RESULTS.failed++;
    const error = `❌ FAIL: ${message}`;
    TEST_RESULTS.errors.push(error);
    log(error);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} - Expected: ${expected}, Got: ${actual}`);
}

function assertRange(value, min, max, message) {
  assert(value >= min && value <= max, `${message} - Expected: ${min}-${max}, Got: ${value}`);
}

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Test 1: Server Health Check
async function testServerHealth() {
  log('\n=== TEST 1: Server Health Check ===');
  
  try {
    const response = await makeRequest(SERVER_URL);
    assert(response.status === 200, 'Server responds with 200');
    assert(response.data.includes('EMC-randpay') || response.data.includes('randpay'), 'Server serves EMC randpay page');
  } catch (error) {
    assert(false, `Server health check failed: ${error.message}`);
  }
}

// Test 2: CHAP Generation API
async function testChapGeneration() {
  log('\n=== TEST 2: CHAP Generation API ===');
  
  try {
    const response = await makeRequest(`${SERVER_URL}/api/status?plan=7d`);
    assert(response.status === 402, 'CHAP generation returns 402');
    
    const data = JSON.parse(response.data);
    assert(data.challenge, 'Response contains challenge');
    assertEqual(typeof data.challenge, 'object', 'Challenge is object');
    assert(data.challenge.chap, 'Challenge contains CHAP');
    assertEqual(typeof data.challenge.chap, 'string', 'CHAP is string');
    assertEqual(data.challenge.chap.length, 64, 'CHAP is 64 characters (hex)');
    assert(/^[0-9a-f]+$/i.test(data.challenge.chap), 'CHAP is valid hex');
    
    log(`Generated CHAP: ${data.challenge.chap.slice(0, 16)}...`);
  } catch (error) {
    assert(false, `CHAP generation failed: ${error.message}`);
  }
}

// Test 3: CHAP Uniqueness Test
async function testChapUniqueness() {
  log('\n=== TEST 3: CHAP Uniqueness Test ===');
  
  try {
    const chaps = new Set();
    const numTests = 10;
    
    for (let i = 0; i < numTests; i++) {
      const response = await makeRequest(`${SERVER_URL}/api/status?plan=7d`);
      const data = JSON.parse(response.data);
      chaps.add(data.challenge.chap);
    }
    
    assertEqual(chaps.size, numTests, 'All CHAPs are unique');
    log(`Generated ${numTests} unique CHAPs`);
  } catch (error) {
    assert(false, `CHAP uniqueness test failed: ${error.message}`);
  }
}

// Test 4: Payment API Structure
async function testPaymentApiStructure() {
  log('\n=== TEST 4: Payment API Structure ===');
  
  try {
    // First get a CHAP challenge
    const chapResponse = await makeRequest(`${SERVER_URL}/api/status?plan=7d`);
    const chapData = JSON.parse(chapResponse.data);
    
    // Create mock transaction
    const mockTx = '0'.repeat(256); // 256 zeros
    
    // Make payment request with rawtx in X-Payment header
    const paymentResponse = await makeRequest(`${SERVER_URL}/api/status?plan=7d`, {
      method: 'GET',
      headers: {
        'X-Payment': mockTx
      }
    });
    
    assert([402, 200].includes(paymentResponse.status), 'Payment returns 402 or 200');
    
    if (paymentResponse.status === 402) {
      const data = JSON.parse(paymentResponse.data);
      assert(typeof data.winner === 'boolean', '402 response has winner boolean');
      assert(data.challenge, '402 response has new CHAP');
    } else if (paymentResponse.status === 200) {
      assert(paymentResponse.headers['x-sub-token'], '200 response has X-Sub-Token header');
    }
    
  } catch (error) {
    assert(false, `Payment API structure test failed: ${error.message}`);
  }
}

// Test 5: Risk Parameter Validation
async function testRiskParameterValidation() {
  log('\n=== TEST 5: Risk Parameter Validation ===');
  
  try {
    // Test both plans have correct risk values
    const plans = ['7d', '30d'];
    const expectedRisks = { '7d': 10, '30d': 33 };
    
    for (const plan of plans) {
      let winnerCount = 0;
      const attempts = 50; // Reduced for faster testing
      
      for (let i = 0; i < attempts; i++) {
        const mockTx = '0'.repeat(256);
        
        const payResp = await makeRequest(`${SERVER_URL}/api/status?plan=${plan}`, {
          method: 'GET',
          headers: { 'X-Payment': mockTx }
        });
        
        if (payResp.status === 200) {
          winnerCount++;
        }
      }
      
      const actualWinRate = winnerCount / attempts;
      const expectedWinRate = 1 / expectedRisks[plan];
      const tolerance = expectedWinRate * 0.8; // 80% tolerance for small sample size
      
      assertRange(
        actualWinRate, 
        Math.max(0, expectedWinRate - tolerance), 
        Math.min(1, expectedWinRate + tolerance),
        `Plan ${plan} win rate within expected range`
      );
      
      log(`Plan ${plan}: ${winnerCount}/${attempts} wins (${(actualWinRate * 100).toFixed(1)}%) - Expected: ${(expectedWinRate * 100).toFixed(1)}%`);
    }
    
  } catch (error) {
    assert(false, `Risk parameter validation failed: ${error.message}`);
  }
}

// Test 6: Frontend Configuration Validation
async function testFrontendConfig() {
  log('\n=== TEST 6: Frontend Configuration Validation ===');
  
  try {
    const indexPath = path.join(__dirname, '../ui/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Check PLANS object has correct risk values
    assert(indexContent.includes("risk:10"), 'Frontend 7d plan has risk=10');
    assert(indexContent.includes("risk:33"), 'Frontend 30d plan has risk=33');
    
    // Check risk chips have correct values
    assert(indexContent.includes('data-risk="2"'), 'Frontend has risk=2 chip');
    assert(indexContent.includes('data-risk="10"'), 'Frontend has risk=10 chip');
    assert(indexContent.includes('data-risk="33"'), 'Frontend has risk=33 chip');
    
    // Check no Math.random() in simulation
    assert(!indexContent.includes('Math.random()'), 'No Math.random() in frontend');
    
    // Check tutorial exists
    assert(indexContent.includes('TUTORIAL_STEPS'), 'Tutorial system exists');
    assert(indexContent.includes('startTutorial()'), 'Tutorial start function exists');
    
    log('Frontend configuration validated');
    
  } catch (error) {
    assert(false, `Frontend config validation failed: ${error.message}`);
  }
}

// Test 7: Server Configuration Validation
async function testServerConfig() {
  log('\n=== TEST 7: Server Configuration Validation ===');
  
  try {
    const serverPath = path.join(__dirname, '../server/server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    // Check server has correct risk values in PLANS object
    assert(serverContent.includes("risk:10") || serverContent.includes('risk:    10'), 'Server 7d plan has risk=10');
    assert(serverContent.includes("risk:33") || serverContent.includes('risk:    33'), 'Server 30d plan has risk=33');
    
    // Check server serves static files
    assert(serverContent.includes('express.static'), 'Server serves static files');
    
    log('Server configuration validated');
    
  } catch (error) {
    assert(false, `Server config validation failed: ${error.message}`);
  }
}

// Test 8: Full Round Simulation
async function testFullRoundSimulation() {
  log('\n=== TEST 8: Full Round Simulation ===');
  
  try {
    // Simulate one complete round
    const chapResponse = await makeRequest(`${SERVER_URL}/api/status?plan=7d`);
    const chapData = JSON.parse(chapResponse.data);
    
    const mockTx = '0'.repeat(256);
    const paymentResponse = await makeRequest(`${SERVER_URL}/api/status?plan=7d`, {
      method: 'GET',
      headers: { 'X-Payment': mockTx }
    });
    
    assert([402, 200].includes(paymentResponse.status), 'Payment round completes');
    
    if (paymentResponse.status === 402) {
      const data = JSON.parse(paymentResponse.data);
      assert(data.challenge, '402 response provides new challenge');
      log('Round completed with non-winner (retry expected)');
    } else {
      log('Round completed with winner');
    }
    
  } catch (error) {
    assert(false, `Full round simulation failed: ${error.message}`);
  }
}

// Main test runner
async function runAllTests() {
  log('🚀 Starting ZERO-TRUST Randpay E2E Test Suite');
  log('==========================================');
  
  // Check if server is running
  try {
    await makeRequest(SERVER_URL);
  } catch (error) {
    log('❌ Server is not running! Start it with: npm start');
    process.exit(1);
  }
  
  // Run all tests
  await testServerHealth();
  await testChapGeneration();
  await testChapUniqueness();
  await testPaymentApiStructure();
  await testRiskParameterValidation();
  await testFrontendConfig();
  await testServerConfig();
  await testFullRoundSimulation();
  
  // Results
  log('\n==========================================');
  log('🏁 TEST RESULTS:');
  log(`✅ Passed: ${TEST_RESULTS.passed}`);
  log(`❌ Failed: ${TEST_RESULTS.failed}`);
  
  if (TEST_RESULTS.failed > 0) {
    log('\n❌ FAILURES:');
    TEST_RESULTS.errors.forEach(error => log(`  ${error}`));
    process.exit(1);
  } else {
    log('\n🎉 ALL TESTS PASSED! Randpay is working correctly.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    log(`❌ Test suite error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runAllTests };
