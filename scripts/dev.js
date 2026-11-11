import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from '../api/auth.js';
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/account.html': ['account.html', 'text/html'], '/account.js': ['account.js', 'text/javascript'], '/account.css': ['account.css', 'text/css'] };
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/auth') {
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => res.end(JSON.stringify(data));
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 4096) { res.statusCode = 413; return res.end('{}'); }
    }
    try { req.body = body ? JSON.parse(body) : {}; } catch { res.statusCode = 400; return res.end('{}'); }
    return handler(req, res);
  }
  if (!files[path]) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', files[path][1]);
  res.end(await readFile(files[path][0]));
}).listen(3000, '0.0.0.0', () => console.log('WristWise development server listening on port 3000'));
