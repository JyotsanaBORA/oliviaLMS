import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Import configuration
const config = JSON.parse(open('../config.js').replace('module.exports = ', ''));

// Test scenario configuration
export const options = {
  vus: config.SCENARIOS.MODERATE_LOAD.vus,
  duration: config.SCENARIOS.MODERATE_LOAD.duration,
  thresholds: {
    'http_req_duration': [`p(95)<${config.THRESHOLDS.P95_DURATION}`],
    'http_req_failed': [`rate<${config.THRESHOLDS.ERROR_RATE}`],
    'http_req_duration{name:login}': [`p(95)<500`],
    'http_req_duration{name:leads_list}': [`p(95)<1000`],
    'http_req_duration{name:leads_create}': [`p(95)<1500`],
    'http_req_duration{name:leads_update}': [`p(95)<1000`],
  },
  tags: {
    test_type: 'comprehensive_api',
    environment: 'test'
  }
};

// Test accounts and sample data
const testAccounts = new SharedArray('accounts', function () {
  return [
    config.TEST_ACCOUNTS.ADMIN,
    config.TEST_ACCOUNTS.AGENT1,
    config.TEST_ACCOUNTS.AGENT2
  ];
});

const sampleLeads = new SharedArray('leads', function () {
  return config.SAMPLE_LEADS;
});

// Helper function to generate unique test data
function generateTestLead(userIndex, iteration) {
  const baseLead = sampleLeads[iteration % sampleLeads.length];
  const timestamp = Date.now();
  const uniqueId = `${userIndex}_${iteration}_${timestamp}`;
  
  return {
    ...baseLead,
    name: `${baseLead.name} ${uniqueId}`,
    email: `test_${uniqueId}@loadtest.com`,
    phone: `+1555${String(Math.floor(Math.random() * 1000000)).padStart(7, '0')}`,
    notes: `Load test lead created at ${new Date().toISOString()}`
  };
}

// Authentication helper
function authenticate(baseUrl, account) {
  const loginPayload = JSON.stringify({
    email: account.email,
    password: account.password
  });
  
  const loginParams = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' }
  };
  
  const response = http.post(`${baseUrl}/api/auth/login`, loginPayload, loginParams);
  
  if (response.status !== 200) {
    console.error(`Authentication failed for ${account.email}:`, response.body);
    return null;
  }
  
  const data = JSON.parse(response.body);
  return {
    token: data.data.token,
    user: data.data.user
  };
}

// Main test function
export default function () {
  const baseUrl = config.BASE_URL;
  const userIndex = __VU; // Virtual User index
  const iteration = __ITER; // Iteration number
  
  // Select account based on VU index for consistent distribution
  const account = testAccounts[userIndex % testAccounts.length];
  
  // Authenticate
  const auth = authenticate(baseUrl, account);
  if (!auth) {
    console.error(`Skipping iteration for VU ${userIndex} - authentication failed`);
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${auth.token}`,
    'Content-Type': 'application/json'
  };
  
  console.log(`VU ${userIndex} (${auth.user.role}): Starting API test iteration ${iteration}`);
  
  // Test 1: List Leads (Read operation)
  const leadsListResponse = http.get(
    `${baseUrl}/api/leads?page=1&limit=20`, 
    { 
      headers,
      tags: { name: 'leads_list' }
    }
  );
  
  check(leadsListResponse, {
    'Leads list status 200': (r) => r.status === 200,
    'Leads list has data structure': (r) => {
      const body = JSON.parse(r.body || '{}');
      return body.success && Array.isArray(body.data);
    },
    'Leads list response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  sleep(0.5); // Small delay between operations
  
  // Test 2: Create Lead (Write operation) - Only for agents and admins
  let createdLeadId = null;
  if (['agent1', 'agent2', 'admin'].includes(auth.user.role)) {
    const newLead = generateTestLead(userIndex, iteration);
    const createPayload = JSON.stringify(newLead);
    
    const createResponse = http.post(
      `${baseUrl}/api/leads`,
      createPayload,
      { 
        headers,
        tags: { name: 'leads_create' }
      }
    );
    
    const createSuccess = check(createResponse, {
      'Lead create status 201': (r) => r.status === 201,
      'Lead create has ID': (r) => {
        const body = JSON.parse(r.body || '{}');
        return body.success && body.data && body.data._id;
      },
      'Lead create response time < 2s': (r) => r.timings.duration < 2000,
    });
    
    if (createSuccess) {
      const createData = JSON.parse(createResponse.body);
      createdLeadId = createData.data._id;
      console.log(`VU ${userIndex}: Created lead ${createdLeadId}`);
    }
  }
  
  sleep(0.5);
  
  // Test 3: Update Lead (If we created one)
  if (createdLeadId && ['agent1', 'agent2', 'admin'].includes(auth.user.role)) {
    const updatePayload = JSON.stringify({
      status: 'contacted',
      notes: `Updated by load test VU ${userIndex} at ${new Date().toISOString()}`
    });
    
    const updateResponse = http.put(
      `${baseUrl}/api/leads/${createdLeadId}`,
      updatePayload,
      { 
        headers,
        tags: { name: 'leads_update' }
      }
    );
    
    check(updateResponse, {
      'Lead update status 200': (r) => r.status === 200,
      'Lead update successful': (r) => {
        const body = JSON.parse(r.body || '{}');
        return body.success === true;
      },
      'Lead update response time < 1s': (r) => r.timings.duration < 1000,
    });
  }
  
  sleep(0.5);
  
  // Test 4: Get Lead Details (If we have a lead ID)
  if (createdLeadId) {
    const detailResponse = http.get(
      `${baseUrl}/api/leads/${createdLeadId}`,
      { 
        headers,
        tags: { name: 'leads_detail' }
      }
    );
    
    check(detailResponse, {
      'Lead detail status 200': (r) => r.status === 200,
      'Lead detail has data': (r) => {
        const body = JSON.parse(r.body || '{}');
        return body.success && body.data && body.data._id === createdLeadId;
      }
    });
  }
  
  sleep(0.5);
  
  // Test 5: Organizations List (For admins)
  if (['admin', 'superadmin'].includes(auth.user.role)) {
    const orgsResponse = http.get(
      `${baseUrl}/api/organizations`,
      { 
        headers,
        tags: { name: 'organizations_list' }
      }
    );
    
    check(orgsResponse, {
      'Organizations list accessible': (r) => r.status === 200 || r.status === 403,
      'Organizations response time < 1s': (r) => r.timings.duration < 1000,
    });
  }
  
  sleep(0.5);
  
  // Test 6: Agents List (For admins)
  if (['admin', 'superadmin'].includes(auth.user.role)) {
    const agentsResponse = http.get(
      `${baseUrl}/api/auth/agents`,
      { 
        headers,
        tags: { name: 'agents_list' }
      }
    );
    
    check(agentsResponse, {
      'Agents list accessible': (r) => r.status === 200 || r.status === 403,
      'Agents response time < 1s': (r) => r.timings.duration < 1000,
    });
  }
  
  // Simulate user think time (2-5 seconds)
  sleep(Math.random() * 3 + 2);
}

// Setup function
export function setup() {
  console.log('🚀 Starting Comprehensive API Load Test');
  console.log(`Base URL: ${config.BASE_URL}`);
  console.log(`Test Duration: ${config.SCENARIOS.MODERATE_LOAD.duration}`);
  console.log(`Virtual Users: ${config.SCENARIOS.MODERATE_LOAD.vus}`);
  console.log(`Test Accounts: ${testAccounts.length}`);
  console.log(`Sample Leads: ${sampleLeads.length}`);
  
  // Test server connectivity
  const healthCheck = http.get(config.BASE_URL);
  if (healthCheck.status !== 200 && healthCheck.status !== 404) {
    throw new Error(`Server not accessible at ${config.BASE_URL}. Status: ${healthCheck.status}`);
  }
  
  // Test authentication with first account
  const testAuth = authenticate(config.BASE_URL, testAccounts[0]);
  if (!testAuth) {
    throw new Error(`Test authentication failed with account: ${testAccounts[0].email}`);
  }
  
  console.log('✅ Pre-test validation successful');
  console.log(`✅ Test authentication successful for ${testAccounts[0].email}`);
  
  return { startTime: Date.now() };
}

// Teardown function
export function teardown(data) {
  const duration = ((Date.now() - data.startTime) / 1000).toFixed(2);
  console.log('🏁 Comprehensive API Load Test Complete');
  console.log(`Total test duration: ${duration} seconds`);
  
  // Note: In a real scenario, you might want to clean up test data here
  console.log('💡 Note: Test leads created during this test remain in the database');
  console.log('💡 You may want to clean them up manually or create a cleanup script');
}