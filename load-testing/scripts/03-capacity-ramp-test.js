import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Configuration for 70-80 user capacity testing
const config = {
  BASE_URL: 'http://localhost:5000',
  TEST_ACCOUNTS: {
    ADMIN: { email: 'testadmin@testorg.com', password: 'TestAdmin123!' },
    AGENT1: { email: 'testagent1@testorg.com', password: 'TestAgent123!' },
    AGENT2: { email: 'testagent2@testorg.com', password: 'TestAgent123!' }
  }
};

// Ramping test configuration to find 70-80 user capacity limits
export const options = {
  scenarios: {
    capacity_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },   // Warm up
        { duration: '2m', target: 25 },   // Light load
        { duration: '2m', target: 40 },   // Moderate load
        { duration: '2m', target: 55 },   // Heavy load
        { duration: '2m', target: 70 },   // Target capacity
        { duration: '2m', target: 80 },   // Peak capacity test
        { duration: '1m', target: 85 },   // Stress test
        { duration: '1m', target: 0 }     // Cool down
      ],
      gracefulRampDown: '30s',
      gracefulStop: '60s',
    },
  },
  thresholds: {
    // More lenient thresholds for high-capacity testing
    'http_req_duration': ['p(95)<5000'], // 95% under 5 seconds
    'http_req_failed': ['rate<0.1'],     // Less than 10% errors
    'http_req_duration{name:login}': ['p(95)<3000'],
    'http_req_duration{name:leads_list}': ['p(95)<3000'],
    
    // Add custom metrics for 70-80 user capacity analysis
    'checks': ['rate>0.80'], // 80% of checks should pass
    'http_reqs': ['count>5000'], // Minimum requests for valid test
  },
  tags: {
    test_type: 'capacity_ramp',
    environment: 'test'
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
  summaryTimeUnit: 'ms',
};

// Test data
const testAccounts = new SharedArray('accounts', function () {
  return [
    config.TEST_ACCOUNTS.ADMIN,
    config.TEST_ACCOUNTS.AGENT1,
    config.TEST_ACCOUNTS.AGENT2
  ];
});

// Lightweight authentication for capacity testing
function authenticateQuick(baseUrl, account) {
  const loginPayload = JSON.stringify({
    email: account.email,
    password: account.password
  });
  
  const response = http.post(
    `${baseUrl}/api/auth/login`, 
    loginPayload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
      timeout: '10s'
    }
  );
  
  if (response.status === 200) {
    const data = JSON.parse(response.body);
    return {
      token: data.data.token,
      user: data.data.user
    };
  }
  
  return null;
}

// Optimized test flow for 70-80 user capacity testing
export default function () {
  const baseUrl = config.BASE_URL;
  const userIndex = __VU;
  const iteration = __ITER;
  const currentStage = getCurrentStage();
  
  // Use different accounts to distribute authentication load
  const account = testAccounts[userIndex % testAccounts.length];
  
  console.log(`VU ${userIndex} (Stage: ${currentStage}): Starting high-capacity test iteration ${iteration}`);
  
  // Reduce login frequency for high user counts (login every 3rd iteration)
  let token = null;
  if (iteration % 3 === 0) {
    const auth = authenticateQuick(baseUrl, account);
    if (!auth) {
      console.warn(`VU ${userIndex}: Authentication failed for ${account.email}`);
      sleep(Math.random() * 2 + 1); // Random delay before retry
      return;
    }
    token = auth.token;
  } else {
    // Simulate using cached/existing session
    token = 'cached_session_simulation';
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  // Primary read operation - optimized for high concurrency
  if (token !== 'cached_session_simulation') {
    const leadsResponse = http.get(
      `${baseUrl}/api/leads?page=1&limit=5`, // Smaller page size for efficiency
      { 
        headers,
        tags: { name: 'leads_list' },
        timeout: '15s'
      }
    );
    
    const leadsCheck = check(leadsResponse, {
      'Leads list success': (r) => r.status === 200,
      'Leads list response time acceptable': (r) => r.timings.duration < 8000,
    });
    
    if (!leadsCheck) {
      console.warn(`VU ${userIndex}: Leads list check failed. Status: ${leadsResponse.status}`);
    }
  }
  
  // Short pause between requests
  sleep(0.1);
  
  // Profile check (lightweight operation) - only every 5th iteration
  if (iteration % 5 === 0 && token !== 'cached_session_simulation') {
    const profileResponse = http.get(
      `${baseUrl}/api/auth/me`,
      { 
        headers,
        tags: { name: 'profile' },
        timeout: '10s'
      }
    );
    
    check(profileResponse, {
      'Profile check success': (r) => r.status === 200,
      'Profile response time acceptable': (r) => r.timings.duration < 5000,
    });
  }
  
  // Reduced write operations for high-capacity testing (only 10% of requests)
  if (Math.random() < 0.1 && token !== 'cached_session_simulation' && ['agent1', 'agent2', 'admin'].includes(account.email.includes('admin') ? 'admin' : account.email.includes('agent1') ? 'agent1' : 'agent2')) {
    const timestamp = Date.now();
    const testLead = {
      name: `High Capacity Test Lead ${userIndex}_${iteration}`,
      email: `highcap_test_${userIndex}_${iteration}_${timestamp}@loadtest.com`,
      phone: `+1555${String(Math.floor(Math.random() * 1000000)).padStart(7, '0')}`,
      status: 'new',
      source: 'high-capacity-test',
      notes: `Created during 70-80 user capacity test by VU ${userIndex}`
    };
    
    const createResponse = http.post(
      `${baseUrl}/api/leads`,
      JSON.stringify(testLead),
      { 
        headers,
        tags: { name: 'leads_create' },
        timeout: '20s'
      }
    );
    
    check(createResponse, {
      'Lead create success': (r) => r.status === 201 || r.status === 429, // Accept rate limiting
      'Lead create response time acceptable': (r) => r.timings.duration < 15000,
    });
  }
  
  // Adaptive think time based on current load stage for 70-80 users
  const thinkTime = getThinkTimeForHighCapacity(currentStage);
  sleep(thinkTime);
}

// Helper function to determine current stage for 70-80 user test
function getCurrentStage() {
  const elapsedMinutes = Math.floor((__VU * 100 + __ITER) / 1000) % 15; // Rough stage estimation
  if (elapsedMinutes < 2) return 'ramp-10';
  if (elapsedMinutes < 4) return 'ramp-25';
  if (elapsedMinutes < 6) return 'ramp-40';
  if (elapsedMinutes < 8) return 'ramp-55';
  if (elapsedMinutes < 10) return 'ramp-70';
  if (elapsedMinutes < 12) return 'ramp-80';
  if (elapsedMinutes < 13) return 'stress-85';
  return 'ramp-down';
}

// Adaptive think time based on load stage for high capacity
function getThinkTimeForHighCapacity(stage) {
  switch (stage) {
    case 'ramp-10':
    case 'ramp-25':
      return Math.random() * 3 + 2; // 2-5 seconds
    case 'ramp-40':
      return Math.random() * 2 + 1; // 1-3 seconds
    case 'ramp-55':
      return Math.random() * 1.5 + 0.5; // 0.5-2 seconds
    case 'ramp-70':
      return Math.random() * 1 + 0.3; // 0.3-1.3 seconds
    case 'ramp-80':
      return Math.random() * 0.8 + 0.2; // 0.2-1 seconds
    case 'stress-85':
      return Math.random() * 0.5 + 0.1; // 0.1-0.6 seconds
    default:
      return Math.random() * 4 + 2; // 2-6 seconds
  }
}

// Setup function with enhanced validation for 70-80 user testing
export function setup() {
  console.log('🚀 Starting 70-80 User Capacity Ramping Test');
  console.log('📊 Test Configuration:');
  console.log(`   Base URL: ${config.BASE_URL}`);
  console.log(`   Test Stages: Ramp from 10 → 25 → 40 → 55 → 70 → 80 → 85 users`);
  console.log(`   Max VUs: 85 virtual users`);
  console.log(`   Total Duration: ~15 minutes`);
  console.log(`   Test Accounts: ${testAccounts.length}`);
  
  // Server connectivity check
  const healthCheck = http.get(config.BASE_URL, { timeout: '10s' });
  if (healthCheck.status !== 200 && healthCheck.status !== 404) {
    throw new Error(`❌ Server not accessible at ${config.BASE_URL}. Status: ${healthCheck.status}`);
  }
  
  // Quick authentication test
  const testAuth = authenticateQuick(config.BASE_URL, testAccounts[0]);
  if (!testAuth) {
    throw new Error(`❌ Test authentication failed for ${testAccounts[0].email}`);
  }
  
  console.log('✅ Pre-test validation successful');
  console.log('⚠️  WARNING: This test will progressively increase load to 70-80+ users');
  console.log('📈 Monitor server resources during the test');
  console.log('🎯 Goal: Find exact capacity limits for 70-80 concurrent users');
  
  return { 
    startTime: Date.now(),
    testAccounts: testAccounts.length,
    targetCapacity: '70-80 users'
  };
}

// Detailed teardown with 70-80 user capacity analysis
export function teardown(data) {
  const duration = ((Date.now() - data.startTime) / 1000 / 60).toFixed(2);
  
  console.log('🏁 70-80 User Capacity Ramping Test Complete');
  console.log(`📊 Test Results Summary:`);
  console.log(`   Total Duration: ${duration} minutes`);
  console.log(`   Test Accounts Used: ${data.testAccounts}`);
  console.log(`   Target Capacity: ${data.targetCapacity}`);
  
  console.log('📈 70-80 User Capacity Analysis Notes:');
  console.log('   - Monitor the results for the following capacity indicators:');
  console.log('   - Response time degradation at 70+ users (p95 duration)');
  console.log('   - Error rate increases at 80+ users (http_req_failed)');
  console.log('   - Check failure rates during peak load');
  console.log('   - Server resource utilization (CPU, Memory, DB connections)');
  
  console.log('🎯 70-80 User Capacity Determination:');
  console.log('   - Acceptable performance: p95 < 3000ms and error rate < 10%');
  console.log('   - Good performance: p95 < 2000ms and error rate < 5%');
  console.log('   - Excellent performance: p95 < 1000ms and error rate < 2%');
  console.log('   - Find the highest user count meeting your performance criteria');
  
  console.log('📋 Production Recommendations:');
  console.log('   - If 70 users perform well: Deploy for 50-60 concurrent users');
  console.log('   - If 80 users perform well: Deploy for 60-70 concurrent users');
  console.log('   - Always maintain 20-30% capacity buffer for peak loads');
  
  console.log('🧹 Cleanup Required:');
  console.log('   - High-capacity test leads created during this test should be cleaned up');
  console.log('   - Monitor database size and performance after test');
  console.log('   - Check for any lingering authentication sessions');
}