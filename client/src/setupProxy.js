const { createProxyMiddleware } = require('http-proxy-middleware');

const target = process.env.REACT_APP_PROXY_TARGET || 'http://localhost:5000';
const domesticTarget = process.env.REACT_APP_DOMESTIC_API_TARGET || 'http://localhost:5009';

module.exports = function (app) {
  // REST API proxy
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );

  // Domestic LMS API proxy (forwards to domestic-server on port 5009)
  app.use(
    '/domestic-api',
    createProxyMiddleware({
      target: domesticTarget,
      changeOrigin: true,
    })
  );

  // Socket.IO proxy (LMS lead-system real-time events)
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
    })
  );
};
