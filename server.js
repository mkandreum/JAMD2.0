const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');
const SMTP_FILE = path.join(DATA_DIR, 'smtp.json');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
if (!fs.existsSync(SMTP_FILE)) {
  fs.writeFileSync(SMTP_FILE, JSON.stringify({ host: 'smtp.gmail.com', port: 587, user: '', pass: '', to: '' }, null, 2), 'utf-8');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function checkAuth(headers) {
  const auth = headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return false;
  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const [user, pass] = decoded.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ── SMTP email sender (via nodemailer, same as NixxyToxic) ── */
function sendEmail(config, subject, message) {
  const { host, port, user, pass, to } = config;
  const isSSL = port == 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: isSSL,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  const fromAddress = user.includes('@') ? user : 'noreply@xyonplatforms.com';

  return transporter.sendMail({
    from: `"XyonPlatforms" <${fromAddress}>`,
    to,
    subject,
    html: message.replace(/\n/g, '<br>')
  });
}

/* ── HTTP server ────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // API: Login
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { user, pass } = JSON.parse(body);
        if (user === ADMIN_USER && pass === ADMIN_PASS) {
          const token = Buffer.from(`${user}:${pass}`).toString('base64');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Credenciales incorrectas' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      }
    });
    return;
  }

  // API: Get projects
  if (pathname === '/api/projects' && req.method === 'GET') {
    if (!checkAuth(req.headers)) {
      res.writeHead(401); res.end(JSON.stringify({ success: false }));
      return;
    }
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false }));
    }
    return;
  }

  // API: Save projects
  if (pathname === '/api/projects' && req.method === 'POST') {
    if (!checkAuth(req.headers)) {
      res.writeHead(401); res.end(JSON.stringify({ success: false }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        fs.writeFileSync(DATA_FILE, body, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      }
    });
    return;
  }

  // API: Get SMTP config
  if (pathname === '/api/config/smtp' && req.method === 'GET') {
    if (!checkAuth(req.headers)) {
      res.writeHead(401); res.end(JSON.stringify({ success: false }));
      return;
    }
    try {
      const data = fs.readFileSync(SMTP_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false }));
    }
    return;
  }

  // API: Save SMTP config
  if (pathname === '/api/config/smtp' && req.method === 'POST') {
    if (!checkAuth(req.headers)) {
      res.writeHead(401); res.end(JSON.stringify({ success: false }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        fs.writeFileSync(SMTP_FILE, body, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      }
    });
    return;
  }

  // API: Contact form
  if (pathname === '/api/contact' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { name, email, phone, message } = JSON.parse(body);
        if (!name || !email || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Faltan campos requeridos' }));
          return;
        }
        const smtpData = JSON.parse(fs.readFileSync(SMTP_FILE, 'utf-8'));
        if (!smtpData.host || !smtpData.user || !smtpData.pass || !smtpData.to) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'SMTP no configurado' }));
          return;
        }
        const subject = `Nuevo contacto de ${name} - XyonPlatforms`;
        const bodyText = `Nombre: ${name}\nEmail: ${email}\nTeléfono: ${phone || 'No especificado'}\n\nMensaje:\n${message}`;
        await sendEmail(smtpData, subject, bodyText);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Mensaje enviado correctamente' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: e.message }));
      }
    });
    return;
  }

  // API: Upload screenshot
  if (pathname === '/api/upload' && req.method === 'POST') {
    if (!checkAuth(req.headers)) {
      res.writeHead(401); res.end(JSON.stringify({ success: false }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filename, data } = JSON.parse(body);
        if (!filename || !data) throw new Error('Missing filename or data');
        const ext = path.extname(filename) || '.png';
        const uniqueName = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
        const filePath = path.join(SCREENSHOTS_DIR, uniqueName);
        const base64Data = data.includes(',') ? data.split(',')[1] : data;
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, url: '/screenshots/' + uniqueName }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: e.message }));
      }
    });
    return;
  }

  // Serve screenshots
  if (pathname.startsWith('/screenshots/')) {
    const fileName = path.basename(pathname);
    const filePath = path.join(SCREENSHOTS_DIR, fileName);
    if (!filePath.startsWith(SCREENSHOTS_DIR)) {
      res.writeHead(403); res.end('Forbidden');
      return;
    }
    serveFile(res, filePath);
    return;
  }

  // Serve static files
  let filePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  filePath = path.join(__dirname, filePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`✓ JAMD Desarrollos IA corriendo en http://0.0.0.0:${PORT}`);
  console.log(`  Admin: ${ADMIN_USER}`);
});
