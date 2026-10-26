// Tiny static server for local preview: node tools/serve.mjs [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const port = +process.argv[2] || 5197;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream' };
http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0].split('#')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root)) { s.writeHead(403); return s.end(); }
  fs.stat(f, (e, st) => { if (e || !st.isFile()) { s.writeHead(404); return s.end('not found'); }
    s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(s); });
}).listen(port, () => console.log('rift on http://localhost:' + port));
