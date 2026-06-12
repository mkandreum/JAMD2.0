const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');
const SMTP_FILE = path.join(DATA_DIR, 'smtp.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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

/* ── SMTP email sender (zero deps) ──────────────────────────── */
function sendEmail(config, fromName, fromEmail, subject, message) {
  const { host, port, user, pass, to } = config;
  const isSSL = port == 465;

  return new Promise((resolve, reject) => {
    let step = 0, buffer = '', activeSocket, upgraded = false, ehloLines = [];

    function send(d) { activeSocket.write(d + '\r\n'); }

    function handleLine(line) {
      try {
        if (line.length < 4) return;
        const code = parseInt(line.substring(0, 3));
        const isLast = line[3] === ' ';
        if (code >= 400) { reject(new Error(`SMTP ${code}: ${line}`)); return; }

        if (step === 1 && !isLast) { ehloLines.push(line); return; }
        if (step === 1 && isLast) {
          ehloLines.push(line);
          if (!upgraded && !isSSL && ehloLines.some(l => /STARTTLS/i.test(l))) {
            buffer = ''; send('STARTTLS'); step = 2; ehloLines = [];
            return;
          }
          send('AUTH LOGIN'); step = 3; ehloLines = []; return;
        }

        switch (step) {
          case 0: send('EHLO localhost'); step = 1; break;
          case 2:
            activeSocket = tls.connect({ socket: activeSocket, rejectUnauthorized: false }, () => {
              upgraded = true; buffer = ''; ehloLines = []; send('EHLO localhost'); step = 1;
            });
            activeSocket.on('data', onData);
            activeSocket.on('error', reject);
            break;
          case 3: send(Buffer.from(user).toString('base64')); step = 4; break;
          case 4: send(Buffer.from(pass).toString('base64')); step = 5; break;
          case 5: send(`MAIL FROM:<${user}>`); step = 6; break;
          case 6: send(`RCPT TO:<${to}>`); step = 7; break;
          case 7: send('DATA'); step = 8; break;
          case 8:
            send([
              `From: "${fromName}" <${fromEmail}>`,
              `To: <${to}>`,
              `Subject: ${subject}`,
              'MIME-Version: 1.0',
              'Content-Type: text/plain; charset=UTF-8',
              'Content-Transfer-Encoding: 7bit',
              '',
              message,
              '.',
            ].join('\r\n'));
            step = 9; break;
          case 9: send('QUIT'); setTimeout(resolve, 500); break;
        }
      } catch (e) { reject(e); }
    }

    function onData(data) {
      buffer += data.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';
      for (const l of lines) handleLine(l);
    }

    if (isSSL) {
      activeSocket = tls.connect(port, host, { rejectUnauthorized: false }, () => handleLine('220 '));
    } else {
      activeSocket = net.connect(port, host);
    }
    activeSocket.on('data', onData);
    activeSocket.on('error', reject);
    activeSocket.setTimeout(15000, () => { reject(new Error('SMTP timeout')); activeSocket.destroy(); });
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
        await sendEmail(smtpData, name, email, subject, bodyText);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Mensaje enviado correctamente' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: e.message }));
      }
    });
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
