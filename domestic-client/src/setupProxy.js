// src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/domestic-api',
    createProxyMiddleware({
      target: 'http://localhost:5009',
      changeOrigin: true,
    })
  );
};
