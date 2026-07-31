// Minimal static server for measuring a built dist/.
// Gzips text assets (as Render/nginx would) so CDP transferSize reflects
// realistic over-the-wire bytes. Images are served as-is: re-compressing
// already-compressed formats would distort the image-bytes measurement.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map', '.txt']);

/**
 * @param {string} root  directory to serve (a dist/ folder)
 * @param {number} port
 * @param {{apiProxy?: string}} [opts] optional origin to proxy /api and /uploads to
 */
export function startStatic(root, port, opts = {}) {
  const server = http.createServer((req, res) => {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { urlPath = req.url.split('?')[0]; }

    // Proxy backend calls so the SPA behaves as in production.
    if (opts.apiProxy && (urlPath.startsWith('/api') || urlPath.startsWith('/uploads'))) {
      const target = new URL(req.url, opts.apiProxy);
      const proxyReq = http.request(
        { hostname: target.hostname, port: target.port, path: target.pathname + target.search,
          method: req.method, headers: { ...req.headers, host: target.host } },
        (pRes) => { res.writeHead(pRes.statusCode || 502, pRes.headers); pRes.pipe(res); },
      );
      proxyReq.on('error', () => { res.writeHead(502).end('proxy error'); });
      req.pipe(proxyReq);
      return;
    }

    let filePath = path.join(root, urlPath);
    // Contain traversal.
    if (!path.resolve(filePath).startsWith(path.resolve(root))) {
      res.writeHead(403).end('forbidden');
      return;
    }

    let stat = null;
    try { stat = fs.statSync(filePath); } catch { /* fallthrough */ }
    if (stat?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      try { stat = fs.statSync(filePath); } catch { stat = null; }
    }
    // SPA history fallback: unknown non-asset path -> index.html
    if (!stat) {
      if (path.extname(urlPath)) { res.writeHead(404).end('not found'); return; }
      filePath = path.join(root, 'index.html');
      try { stat = fs.statSync(filePath); } catch { res.writeHead(404).end('no index'); return; }
    }

    const ext = path.extname(filePath).toLowerCase();
    const body = fs.readFileSync(filePath);
    const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // No caching: every measured run must re-fetch, so transfer bytes are real.
      'Cache-Control': 'no-store',
    };

    if (wantsGzip && COMPRESSIBLE.has(ext) && body.length > 0) {
      const gz = zlib.gzipSync(body, { level: 6 });
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = String(gz.length);
      headers['X-Uncompressed-Length'] = String(body.length);
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : gz);
    } else {
      headers['Content-Length'] = String(body.length);
      headers['X-Uncompressed-Length'] = String(body.length);
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
