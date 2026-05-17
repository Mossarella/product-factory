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

function createProductFolders(productDir) {
  fs.mkdirSync(productDir, { recursive: true });
  PRODUCT_SLOTS.forEach(slot => {
    fs.mkdirSync(path.join(productDir, 'assets', slot), { recursive: true });
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method   = req.method;

  // GET /products — list all products
  if (method === 'GET' && pathname === '/products') {
    let dirs = [];
    try {
      fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
      dirs = fs.readdirSync(PRODUCTS_DIR)
        .filter(f => fs.statSync(path.join(PRODUCTS_DIR, f)).isDirectory());
    } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dirs));
    return;
  }

  // POST /products — create new product
  if (method === 'POST' && pathname === '/products') {
    const body = JSON.parse(await readBody(req));
    const name = (body.name || '').trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
    if (!name) { res.writeHead(400); res.end('Bad name'); return; }
    const productDir = path.join(PRODUCTS_DIR, name);
    createProductFolders(productDir);
    const config = { name, description: '', states: ['Neutral'], notes: '' };
    const configPath = path.join(productDir, 'product.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // GET /products/:name/config
  const configGet = method === 'GET' && pathname.match(/^\/products\/([^/]+)\/config$/);
  if (configGet) {
    try {
      const data = fs.readFileSync(path.join(PRODUCTS_DIR, configGet[1], 'product.json'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (_) { res.writeHead(404); res.end(); }
    return;
  }

  // POST /products/:name/config — save
  const configPost = method === 'POST' && pathname.match(/^\/products\/([^/]+)\/config$/);
  if (configPost) {
    const body = await readBody(req);
    fs.writeFileSync(path.join(PRODUCTS_DIR, configPost[1], 'product.json'), body);
    res.writeHead(200); res.end();
    return;
  }

  // GET /products/:name/slot/:slot — per-product asset
  const productSlot = method === 'GET' && pathname.match(/^\/products\/([^/]+)\/slot\/([^/]+)$/);
  if (productSlot) {
    serveSlot(path.join(PRODUCTS_DIR, productSlot[1], 'assets', productSlot[2]), res);
    return;
  }

  // GET /slot/:name — global assets (thank-you-image, how-to-use)
  const globalSlot = method === 'GET' && pathname.match(/^\/slot\/([^/]+)$/);
  if (globalSlot) {
    serveSlot(path.join(ROOT, 'assets', globalSlot[1]), res);
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
