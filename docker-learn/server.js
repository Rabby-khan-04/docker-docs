// The smallest useful Node.js HTTP server. No dependencies on purpose:
// every Docker chapter uses this exact file so you only ever have to
// remember one program.
'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT || 3000);
const APP_NAME = process.env.APP_NAME || 'docker-learn';
const APP_ENV = process.env.APP_ENV || 'development';

function handler(req, res) {
  const routes = {
    '/': () => ({
      name: APP_NAME,
      env: APP_ENV,
      // The container id makes it obvious which container answered the request.
      container: process.env.HOSTNAME || 'unknown',
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
    }),
    '/health': () => ({ status: 'ok' }),
    '/env': () => process.env,
  };

  const path = req.url.split('?')[0];
  const build = routes[path];

  if (!build) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found', path }));
    return;
  }

  const body = JSON.stringify(build(), null, 2);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(body);
}

http.createServer(handler).listen(PORT, '0.0.0.0', () => {
  console.log(`[${APP_NAME}] listening on http://0.0.0.0:${PORT} (env=${APP_ENV})`);
});