import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Configuration - inline for k6 compatibility
const config = {
  BASE_URL: 'http://localhost:5000',
  TEST_ACCOUNTS: {
    ADMIN: { email: 'testadmin@testorg.com', password: 'TestAdmin123!' },
    AGENT1: { email: 'testagent1@testorg.com', password: 'TestAgent123!' },
    AGENT2: { email: 'testagent2@testorg.com', password: 'TestAgent123!' }
  },
  THRESHOLDS: {
    P95_DURATION: 1000,
    ERROR_RATE: 0.01,
    MAX_DURATION: 5000
  },
  SCENARIOS: {
    SMOKE_TEST: { vus: 5, duration: '30s' }
  }
};

// Test scenario configuration
export const options = {
  vus: config.SCENARIOS.SMOKE_TEST.vus,
  duration: config.SCENARIOS.SMOKE_TEST.duration,
  thresholds: {
    // 95% of requests should complete within 1 second
    'http_req_duration': [`p(95)<${config.THRESHOLDS.P95_DURATION}`],
    // Less than 1% error rate
    'http_req_failed': [`rate<${config.THRESHOLDS.ERROR_RATE}`],
    // All requests should complete within 5 seconds
    'http_req_duration{name:login}': [`max<${config.THRESHOLDS.MAX_DURATION}`],
    'http_req_duration{name:profile}': [`max<${config.THRESHOLDS.MAX_DURATION}`],
  },
  tags: {
    test_type: 'authentication',
    environment: 'test'
  }
};

// Test accounts shared across all virtual users
const testAccounts = new SharedArray('accounts', function () {
  return [
    config.TEST_ACCOUNTS.ADMIN,
    config.TEST_ACCOUNTS.AGENT1,
    config.TEST_ACCOUNTS.AGENT2
  ];
});

// Main test function - runs for each virtual user
export default function () {
  const baseUrl = config.BASE_URL;
  
  // Select a random test account
  const account = testAccounts[Math.floor(Math.random() * testAccounts.length)];
  
  console.log(`Testing authentication with account: ${account.email}`);
  
  // Test 1: Login
  const loginPayload = JSON.stringify({
    email: account.email,
    password: account.password
  });
  
  const loginParams = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: {
      name: 'login'
    }
  };
  
  const loginResponse = http.post(
    `${baseUrl}/api/auth/login`, 
    loginPayload, 
    loginParams
  );
  
  // Validate login response
  const loginSuccess = check(loginResponse, {
    'Login status is 200': (r) => r.status === 200,
    'Login response has token': (r) => {
      const body = JSON.parse(r.body || '{}');
      return body.success === true && body.data && body.data.token;
    },
    'Login response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  if (!loginSuccess) {
    console.error(`Login failed for ${account.email}:`, loginResponse.body);
    return;
  }
  
  // Extract token from response
  const loginData = JSON.parse(loginResponse.body);
  const token = loginData.data.token;
  const userId = loginData.data.user._id;
  
  console.log(`Login successful for ${account.email}, user ID: ${userId}`);
  
  // Test 2: Get current user profile
  const profileParams = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    tags: {
      name: 'profile'
    }
  };
  
  const profileResponse = http.get(
    `${baseUrl}/api/auth/me`,
    profileParams
  );
  
  // Validate profile response
  check(profileResponse, {
    'Profile status is 200': (r) => r.status === 200,
    'Profile response has user data': (r) => {
      const body = JSON.parse(r.body || '{}');
      return body.success === true && body.data && body.data.user;
    },
    'Profile response time < 1s': (r) => r.timings.duration < 1000,
    'Profile user ID matches login': (r) => {
      const body = JSON.parse(r.body || '{}');
      return body.data && body.data.user._id === userId;
    }
  });
  
  // Test 3: Test protected endpoint (only for admin/superadmin)
  if (account.email.includes('admin')) {
    const agentsResponse = http.get(
      `${baseUrl}/api/auth/agents`,
      profileParams
    );
    
    check(agentsResponse, {
      'Agents endpoint accessible by admin': (r) => r.status === 200 || r.status === 403,
      'Agents response time < 2s': (r) => r.timings.duration < 2000,
    });
  }
  
  // Simulate user think time between requests (1-3 seconds)
  sleep(Math.random() * 2 + 1);
}

// Setup function - runs once before the test
export function setup() {
  console.log('🚀 Starting Authentication Load Test');
  console.log(`Base URL: ${config.BASE_URL}`);
  console.log(`Test Duration: ${config.SCENARIOS.SMOKE_TEST.duration}`);
  console.log(`Virtual Users: ${config.SCENARIOS.SMOKE_TEST.vus}`);
  console.log(`Test Accounts: ${testAccounts.length}`);
  
  // Verify server is accessible
  const healthCheck = http.get(config.BASE_URL);
  if (healthCheck.status !== 200 && healthCheck.status !== 404) {
    throw new Error(`Server not accessible at ${config.BASE_URL}. Status: ${healthCheck.status}`);
  }
  
  console.log('✅ Server accessibility verified');
  return {};
}

// Teardown function - runs once after the test
export function teardown(data) {
  console.log('🏁 Authentication Load Test Complete');
}