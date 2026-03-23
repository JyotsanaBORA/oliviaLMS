import http from 'k6/http';
import { check, sleep } from 'k6';

// Simple realistic test configuration
export const options = {
  vus: 3,           // Only 3 virtual users to avoid rate limiting
  duration: '60s',  // Run for 1 minute
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
    'http_req_failed': ['rate<0.1'],
  }
};

// Single test account to avoid triggering rate limits
const TEST_ACCOUNT = {
  email: 'testadmin@testorg.com',
  password: 'TestAdmin123!'
};

export default function () {
  const baseUrl = 'http://localhost:5000';
  
  // Only login once per iteration, with longer delays
  console.log(`VU ${__VU}: Starting realistic test iteration ${__ITER}`);
  
  // Login with a single account (less frequent to avoid rate limiting)
  const loginPayload = JSON.stringify({
    email: TEST_ACCOUNT.email,
    password: TEST_ACCOUNT.password
  });
  
  const loginResponse = http.post(
    `${baseUrl}/api/auth/login`, 
    loginPayload,
    { 
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s'
    }
  );
  
  const loginSuccess = check(loginResponse, {
    'Login status is 200': (r) => r.status === 200,
    'Login response time < 3s': (r) => r.timings.duration < 3000,
  });
  
  if (!loginSuccess) {
    console.log(`VU ${__VU}: Login failed with status ${loginResponse.status}: ${loginResponse.body}`);
    sleep(10); // Long pause if login fails
    return;
  }
  
  let token = '';
  try {
    const loginData = JSON.parse(loginResponse.body);
    token = loginData.data.token;
    console.log(`VU ${__VU}: Login successful, got token`);
  } catch (e) {
    console.log(`VU ${__VU}: Failed to parse login response: ${e}`);
    sleep(5);
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  // Simulate realistic user behavior with delays between actions
  sleep(2); // User thinks for 2 seconds
  
  // Fetch leads list (common operation)
  const leadsResponse = http.get(
    `${baseUrl}/api/leads?page=1&limit=20`,
    { headers, timeout: '10s' }
  );
  
  check(leadsResponse, {
    'Leads list status 200': (r) => r.status === 200,
    'Leads list response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  sleep(3); // User reviews the list
  
  // Get user profile
  const profileResponse = http.get(
    `${baseUrl}/api/auth/me`,
    { headers, timeout: '5s' }
  );
  
  check(profileResponse, {
    'Profile status 200': (r) => r.status === 200,
    'Profile response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  sleep(2); // User looks at profile
  
  // If admin, check agents list
  const agentsResponse = http.get(
    `${baseUrl}/api/auth/agents`,
    { headers, timeout: '10s' }
  );
  
  check(agentsResponse, {
    'Agents endpoint accessible': (r) => r.status === 200 || r.status === 403,
    'Agents response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  // Simulate realistic user session duration (5-10 seconds between major actions)
  sleep(Math.random() * 5 + 5);
}

export function setup() {
  console.log('🚀 Starting Realistic Load Test');
  console.log('This test simulates real user behavior with proper delays');
  console.log('Duration: 60 seconds with 3 virtual users');
  return {};
}

export function teardown(data) {
  console.log('🏁 Realistic Load Test Complete');
  console.log('This represents realistic concurrent user load');
}