// Debug actual API responses
const http = require('http');

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

async function debugAPI() {
  console.log('🔍 DEBUGGING API RESPONSES\n');
  
  try {
    // Test 1: Server health
    console.log('=== SERVER HEALTH ===');
    const health = await makeRequest('http://localhost:4020');
    console.log('Status:', health.status);
    console.log('Headers:', Object.keys(health.headers));
    console.log('Data length:', health.data.length);
    console.log('Data preview:', health.data.slice(0, 200));
    
    // Test 2: CHAP generation
    console.log('\n=== CHAP GENERATION ===');
    const chap = await makeRequest('http://localhost:4020/api/status?plan=7d');
    console.log('Status:', chap.status);
    console.log('Headers:', Object.keys(chap.headers));
    console.log('Data:', chap.data);
    
    if (chap.status === 402) {
      try {
        const parsed = JSON.parse(chap.data);
        console.log('Parsed:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('JSON parse error:', e.message);
      }
    }
    
    // Test 3: Payment attempt
    console.log('\n=== PAYMENT ATTEMPT ===');
    const payment = await makeRequest('http://localhost:4020/api/status?plan=7d', {
      method: 'GET',
      headers: {
        'X-Payment': '0'.repeat(256)
      }
    });
    console.log('Status:', payment.status);
    console.log('Headers:', Object.keys(payment.headers));
    console.log('Data:', payment.data);
    
    if (payment.status === 402) {
      try {
        const parsed = JSON.parse(payment.data);
        console.log('Parsed:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('JSON parse error:', e.message);
      }
    }
    
  } catch (error) {
    console.error('Debug error:', error.message);
  }
}

debugAPI();
