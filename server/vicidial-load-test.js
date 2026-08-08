/**
 * Vicidial API Load Test Script
 * Tests how many requests/second the /api/vicidial/call-data endpoint can handle
 * 
 * Usage: node vicidial-load-test.js
 * 
 * Simulates real-world Vicidial traffic patterns:
 *   - 30K-60K calls/day = ~20-40 calls/min average, ~80/min peak
 *   - Tests burst scenarios up to 500 concurrent requests
 */

const http = require('http');

const API_URL = 'http://localhost:5000/api/vicidial/call-data';
const parsed = new URL(API_URL);

// Generate a random test payload string
function generatePayload(index) {
  const agentIds = ['AGENT001', 'AGENT002', 'AGENT003', 'AGENT004', 'AGENT005', 'AGENT006', 'AGENT007', 'AGENT008', 'AGENT009', 'AGENT010'];
  const callTypes = ['inbound', 'outbound'];
  const campaigns = ['SALES', 'COLLECTIONS', 'SUPPORT', 'RETENTION', 'OUTBOUND_SALES'];
  const firstNames = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
  const lastNames = ['Doe', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Moore'];

  const agentId = agentIds[index % agentIds.length];
  const callType = callTypes[Math.floor(Math.random() * callTypes.length)];
  const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const phone = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const callId = `VC${Date.now()}${index}`;

  return `agent_id=${agentId}&phone_number=${phone}&call_type=${callType}&first_name=${firstName}&last_name=${lastName}&campaign=${campaign}&call_id=${callId}`;
}

// Send a single request and track timing
function sendRequest(index) {
  return new Promise((resolve) => {
    const payload = generatePayload(index);
    const startTime = Date.now();

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 5000,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          index,
          status: res.statusCode,
          duration,
          success: res.statusCode === 200,
        });
      });
    });

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        index,
        status: 0,
        duration,
        success: false,
        error: err.message,
      });
    });

    req.write(payload);
    req.end();
  });
}

// Run a batch of concurrent requests
async function runBatch(count, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label} — ${count} concurrent requests`);
  console.log('='.repeat(60));

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < count; i++) {
    promises.push(sendRequest(i));
  }

  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  // Calculate stats
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const durations = results.map(r => r.duration);
  const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const p95Index = Math.floor(durations.length * 0.95);
  const sortedDurations = durations.sort((a, b) => a - b);
  const p95 = sortedDurations[p95Index] || maxDuration;
  const rps = Math.round((count / totalTime) * 1000);

  // Status code breakdown
  const statusCodes = {};
  results.forEach(r => {
    statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
  });

  console.log(`\nResults:`);
  console.log(`  Total requests:   ${count}`);
  console.log(`  Successful:       ${successful} (${Math.round(successful/count*100)}%)`);
  console.log(`  Failed:           ${failed}`);
  console.log(`  Total time:       ${totalTime}ms`);
  console.log(`  Requests/sec:     ${rps}`);
  console.log(`  Avg latency:      ${avgDuration}ms`);
  console.log(`  Min latency:      ${minDuration}ms`);
  console.log(`  Max latency:      ${maxDuration}ms`);
  console.log(`  P95 latency:      ${p95}ms`);
  console.log(`  Status codes:     ${JSON.stringify(statusCodes)}`);

  // Rate limit check
  if (statusCodes[429]) {
    console.log(`  ⚠️  ${statusCodes[429]} requests were rate-limited (429)`);
  }

  return { count, successful, failed, totalTime, rps, avgDuration, maxDuration, p95 };
}

// Sustained throughput test — send X requests per second for Y seconds
async function sustainedTest(rps, durationSec) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUSTAINED TEST: ${rps} req/sec for ${durationSec} seconds`);
  console.log('='.repeat(60));

  const results = [];
  const startTime = Date.now();
  const interval = 1000 / rps;
  let index = 0;

  for (let sec = 0; sec < durationSec; sec++) {
    const batchPromises = [];
    for (let i = 0; i < rps; i++) {
      batchPromises.push(sendRequest(index++));
    }
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    const successful = batchResults.filter(r => r.success).length;
    const avgMs = Math.round(batchResults.reduce((a, r) => a + r.duration, 0) / batchResults.length);
    process.stdout.write(`  Second ${sec + 1}/${durationSec}: ${successful}/${rps} OK, avg ${avgMs}ms\n`);
  }

  const totalTime = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const avgDuration = Math.round(results.reduce((a, r) => a + r.duration, 0) / results.length);

  console.log(`\nSustained Results:`);
  console.log(`  Total requests:   ${results.length}`);
  console.log(`  Successful:       ${successful} (${Math.round(successful/results.length*100)}%)`);
  console.log(`  Failed:           ${failed}`);
  console.log(`  Total time:       ${totalTime}ms`);
  console.log(`  Avg latency:      ${avgDuration}ms`);
  console.log(`  Effective RPS:    ${Math.round(results.length / totalTime * 1000)}`);
}

// Main test runner
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       VICIDIAL API LOAD TEST — /api/vicidial/call-data  ║');
  console.log('║       Target: 30K-60K calls/day (20-80 calls/min)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // First check if server is up
  console.log('\nChecking server...');
  const healthCheck = await sendRequest(0);
  if (!healthCheck.success && healthCheck.status === 0) {
    console.error('\n❌ Server is not running! Start it with: cd server && npm run dev');
    process.exit(1);
  }
  console.log(`✅ Server is responding (${healthCheck.duration}ms)\n`);

  // Test 1: Small burst (normal traffic)
  await runBatch(10, 'Light load — 10 concurrent');

  // Test 2: Medium burst
  await runBatch(50, 'Medium load — 50 concurrent');

  // Test 3: Heavy burst (peak scenario)
  await runBatch(100, 'Heavy load — 100 concurrent');

  // Test 4: Stress test
  await runBatch(200, 'Stress test — 200 concurrent');

  // Test 5: Extreme stress
  await runBatch(500, 'Extreme stress — 500 concurrent');

  // Test 6: Sustained throughput (simulating 80 calls/min = ~1.3/sec for 10 sec)
  await sustainedTest(2, 10);

  // Test 7: Sustained high throughput (10/sec for 10 sec = 100 total)
  await sustainedTest(10, 10);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    TEST COMPLETE                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\nSummary for Vicidial traffic (30K-60K calls/day):');
  console.log('  Average: ~40 calls/min = 0.67 calls/sec');
  console.log('  Peak:    ~80 calls/min = 1.33 calls/sec');
  console.log('  If all tests above show >95% success rate, your server can handle it.\n');
}

main().catch(console.error);
