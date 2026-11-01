// A tiny static file server for dist/ (preview, capture, tests). serve({dir, port, base}) → {url, close}.
// `base` mounts the site under a sub-path (e.g. /Typewriter-Teardown/) to test GitHub Pages behaviour.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.ico': 'image/x-icon'};

export function serve({dir, port = 0, base = '/'} = {}) {
  const root = path.resolve(dir);
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!u.startsWith(base)) {
      res.writeHead(404);
      return res.end('not found');
    }
    u = u.slice(base.length - 1);
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(root, u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store'});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) =>
    srv.listen(port, '127.0.0.1', () => {
      const p = srv.address().port;
      resolve({url: `http://127.0.0.1:${p}${base}`, port: p, close: () => new Promise((r) => srv.close(r))});
    }),
  );
}
