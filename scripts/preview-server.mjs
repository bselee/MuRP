import { createServer } from 'http';
import { resolve } from 'path';
import sirv from 'sirv';

const distDir = resolve('dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const serve = sirv(distDir, {
  single: true,
  dev: false,
  etag: true,
  maxAge: 31536000,
});

const server = createServer((req, res) => {
  serve(req, res);
});

server.listen(port, host, () => {
  console.log(`[preview] serving ${distDir} at http://${host}:${port} (SPA fallback enabled)`);
});
