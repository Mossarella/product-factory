const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT         = 3000;
const ROOT         = __dirname;
const PRODUCTS_DIR = path.join(ROOT, 'products');

const PRODUCT_SLOTS = [
  'etsy-hero', 'etsy-expressions', 'etsy-files',
  'etsy-preview', 'etsy-detail', 'etsy-branding',
];

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
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.txt':  'text/plain',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function serveSlot(dir, res) {
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => !f.startsWith('.')); } catch (_) {}
  if (!files.length) { res.writeHead(404); res.end(); return; }
  const file = path.join(dir, files[0]);
  const ext  = path.extname(files[0]).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function createProductFolders(name) {
  const productDir = path.join(PRODUCTS_DIR, name);
  fs.mkdirSync(productDir, { recursive: true });
  PRODUCT_SLOTS.forEach(slot => {
    fs.mkdirSync(path.join(productDir, 'assets', slot), { recursive: true });
  });
  return productDir;
}

async function handle(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;
  const method   = req.method;

  console.log(`${method} ${pathname}`);

  // ── GET /products ────────────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/products') {
    fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
    const dirs = fs.readdirSync(PRODUCTS_DIR)
      .filter(f => fs.statSync(path.join(PRODUCTS_DIR, f)).isDirectory());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dirs));
    return;
  }

  // ── POST /products ───────────────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/products') {
    const raw  = await readBody(req);
    const body = JSON.parse(raw);
    const name = (body.name || '').trim().replace(/[^\w\- ]/g, '');
    if (!name) { res.writeHead(400); res.end('Bad name'); return; }

    const productDir  = createProductFolders(name);
    const configPath  = path.join(productDir, 'product.json');
    const config      = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : { name, description: '', states: ['Neutral'], notes: '', contact: '' };

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    console.log(`Created product: ${name} → ${productDir}`);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // ── GET /products/:name/config ───────────────────────────────────────────────
  const configGetM = pathname.match(/^\/products\/([^/]+)\/config$/);
  if (method === 'GET' && configGetM) {
    const configPath = path.join(PRODUCTS_DIR, configGetM[1], 'product.json');
    if (!fs.existsSync(configPath)) { res.writeHead(404); res.end('Not found'); return; }
    const data = fs.readFileSync(configPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
    return;
  }

  // ── POST /products/:name/config ──────────────────────────────────────────────
  const configPostM = pathname.match(/^\/products\/([^/]+)\/config$/);
  if (method === 'POST' && configPostM) {
    const configPath = path.join(PRODUCTS_DIR, configPostM[1], 'product.json');
    const body = await readBody(req);
    fs.writeFileSync(configPath, body);
    console.log(`Saved config: ${configPostM[1]}`);
    res.writeHead(200); res.end();
    return;
  }

  // ── GET /products/:name/slot/:slot ───────────────────────────────────────────
  const productSlotM = pathname.match(/^\/products\/([^/]+)\/slot\/([^/]+)$/);
  if (method === 'GET' && productSlotM) {
    serveSlot(path.join(PRODUCTS_DIR, productSlotM[1], 'assets', productSlotM[2]), res);
    return;
  }

  // ── GET /slot/:name — global assets ─────────────────────────────────────────
  const globalSlotM = pathname.match(/^\/slot\/([^/]+)$/);
  if (method === 'GET' && globalSlotM) {
    serveSlot(path.join(ROOT, 'assets', globalSlotM[1]), res);
    return;
  }

  // ── static files ─────────────────────────────────────────────────────────────
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; } // path traversal guard
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server error: ${err.message}`);
    }
  }
}).listen(PORT, () => {
  console.log(`Product Factory → http://localhost:${PORT}`);
  console.log(`Products dir    → ${PRODUCTS_DIR}`);
});
