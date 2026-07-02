import http from 'k6/http';
import { check, sleep } from 'k6';

// Read API URL from environment variable, default to local if not provided
const API_BASE_URL = __ENV.API_URL || 'http://localhost:8000/api';

export const options = {
  // Simulate a gradual ramp-up to 500 virtual users (VUs)
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 VUs in 30s
    { duration: '1m', target: 200 },  // Ramp up to 200 VUs over 1m
    { duration: '1m', target: 500 },  // Ramp up to 500 VUs over 1m
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    // 95% of requests must complete below 500ms
    http_req_duration: ['p(95)<500'],
    // Less than 1% of requests can fail
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // 1. Check Health (Basic ping)
  const healthRes = http.get(`${API_BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  // 2. Fetch Leaderboard (Heavy read query)
  // This tests our index configurations and database connection pooling
  const leaderboardRes = http.get(`${API_BASE_URL}/student/leaderboard?period=all_time&limit=50`);
  check(leaderboardRes, {
    'leaderboard status is 200': (r) => r.status === 200,
  });

  // Simulate user reading the page before making the next request
  sleep(Math.random() * 2 + 1); // sleep between 1 and 3 seconds
}
