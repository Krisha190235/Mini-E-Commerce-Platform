import http from 'http';

const req = http.request(
  { hostname: 'localhost', port: process.env.PORT || 3000, path: '/health', method: 'GET' },
  res => process.exit(res.statusCode === 200 ? 0 : 1)
);

req.on('error', () => process.exit(1));
req.end();