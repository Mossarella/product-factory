const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.txt':  'text/plain',
};

http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // /slot/<name> → serve first file found in assets/<name>/
  const slot = pathname.match(/^\/slot\/([^/]+)$/);
  if (slot) {
    const dir = path.join(ROOT, 'assets', slot[1]);
    let files;
    try { files = fs.readdirSync(dir).filter(f => !f.startsWith('.')); }
    catch (_) { files = []; }
    if (!files.length) { res.writeHead(404); res.end(); return; }
    const file = path.join(dir, files[0]);
    const ext  = path.extname(files[0]).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  // static files
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, () => console.log(`Product Factory → http://localhost:${PORT}`));
