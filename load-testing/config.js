// Load Testing Configuration
// This file contains all settings to ensure we don't affect production data

module.exports = {
  // Base URL for the API
  BASE_URL: 'http://localhost:5000',
  
  // Test credentials - IMPORTANT: These should be test accounts only!
  // Create these accounts in your test database before running tests
  TEST_ACCOUNTS: {
    ADMIN: {
      email: 'testadmin@testorg.com',
      password: 'TestAdmin123!'
    },
    AGENT1: {
      email: 'testagent1@testorg.com', 
      password: 'TestAgent123!'
    },
    AGENT2: {
      email: 'testagent2@testorg.com',
      password: 'TestAgent123!'
    },
    SUPERADMIN: {
      email: 'testsuperadmin@test.com',
      password: 'TestSuper123!'
    }
  },

  // Test data for creating leads
  SAMPLE_LEADS: [
    {
      name: 'Test Lead 1',
      email: 'testlead1@example.com',
      phone: '+12345678901',
      status: 'new',
      source: 'test-source',
      notes: 'Load test generated lead'
    },
    {
      name: 'Test Lead 2', 
      email: 'testlead2@example.com',
      phone: '+12345678902',
      status: 'qualified',
      source: 'test-source',
      notes: 'Load test generated lead'
    },
    {
      name: 'Test Lead 3',
      email: 'testlead3@example.com',
      phone: '+12345678903', 
      status: 'contacted',
      source: 'test-source',
      notes: 'Load test generated lead'
    }
  ],

  // Performance thresholds
  THRESHOLDS: {
    // 95% of requests should complete within 1 second
    P95_DURATION: 1000,
    // Less than 1% error rate
    ERROR_RATE: 0.01,
    // Maximum response time for any request
    MAX_DURATION: 5000
  },

  // Load test scenarios
  SCENARIOS: {
    SMOKE_TEST: {
      vus: 5,
      duration: '30s',
      description: 'Basic smoke test with 5 virtual users'
    },
    LIGHT_LOAD: {
      vus: 25,
      duration: '2m',
      description: 'Light load test with 25 virtual users'
    },
    MODERATE_LOAD: {
      vus: 50,
      duration: '3m',
      description: 'Moderate load test with 50 virtual users'
    },
    HEAVY_LOAD: {
      vus: 100,
      duration: '5m',
      description: 'Heavy load test with 100 virtual users'
    },
    RAMP_TEST: {
      stages: [
        { duration: '1m', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '2m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '1m', target: 0 }
      ],
      description: 'Ramping test to find capacity limits'
    }
  },

  // Test endpoints to validate
  ENDPOINTS: {
    AUTH: {
      LOGIN: '/api/auth/login',
      ME: '/api/auth/me',
      AGENTS: '/api/auth/agents'
    },
    LEADS: {
      LIST: '/api/leads',
      CREATE: '/api/leads',
      UPDATE: '/api/leads/{id}',
      DELETE: '/api/leads/{id}'
    },
    ORGANIZATIONS: {
      LIST: '/api/organizations'
    }
  },

  // Safety settings
  SAFETY: {
    // Always use test database
    REQUIRE_TEST_ENV: true,
    // Don't run destructive operations in production
    AVOID_DESTRUCTIVE_OPS: true,
    // Maximum number of test leads to create
    MAX_TEST_LEADS: 1000
  }
};