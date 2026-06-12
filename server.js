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

function autoReplyHtml(name) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#0b0b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif}
  @media only screen and (max-width:600px){
    .wrapper{padding:20px 12px!important}
    .card{padding:32px 20px!important;border-radius:16px!important}
    .card-header{padding:0 0 20px!important}
    .logo-box{width:48px!important;height:48px!important}
    .logo-text{font-size:24px!important}
    h1{font-size:22px!important}
    .summary{padding:16px 20px!important}
    .footer{padding:0!important}
  }
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b14">
  <tr><td align="center" class="wrapper" style="padding:48px 24px">
    <table width="600" cellpadding="0" cellspacing="0" class="card" style="width:100%;max-width:600px;background:linear-gradient(160deg,#12121f 0%,#1a1a2e 100%);border-radius:24px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)">
      <tr><td class="card-header" style="padding:48px 48px 0" align="center">
        <table cellpadding="0" cellspacing="0"><tr><td align="center">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#6366f1 0%,#a855f7 50%,#ec4899 100%);display:inline-block;vertical-align:middle" align="center" valign="middle">
              <span class="logo-text" style="display:block;font-size:28px;font-weight:800;color:#fff;line-height:56px;font-family:Arial,Helvetica,sans-serif">X</span>
            </td>
            <td style="padding-left:14px;vertical-align:middle">
              <p style="margin:0;font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;line-height:1.2">XyonPlatforms</p>
              <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:0.5px;font-weight:500">JAMD Desarrollos IA</p>
            </td>
          </tr></table>
          <div style="width:48px;height:2px;background:linear-gradient(90deg,#6366f1,#a855f7);border-radius:1px;margin:24px auto 0"></div>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:32px 48px" align="center">
        <h1 style="margin:0;font-size:28px;font-weight:700;color:#f1f5f9;letter-spacing:-0.5px;line-height:1.3">¡Gracias por escribirnos,<br>${name}!</h1>
        <p style="margin:16px 0 0;font-size:15px;color:#94a3b8;line-height:1.7">Hemos recibido tu mensaje correctamente. Nuestro equipo lo revisará y te responderemos a la mayor brevedad posible.</p>
      </td></tr>
      <tr><td style="padding:0 48px">
        <table width="100%" cellpadding="0" cellspacing="0" class="summary" style="background:rgba(255,255,255,0.03);border-radius:14px;padding:24px;border:1px solid rgba(255,255,255,0.06)">
          <tr><td align="center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="1.5" style="display:block;margin:0 auto 12px"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.7;font-style:italic">«Nos pondremos en contacto contigo en las próximas horas para hablar de tu proyecto.»</p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="footer" style="padding:32px 48px 40px" align="center">
        <div style="width:48px;height:2px;background:linear-gradient(90deg,#6366f1,#a855f7);border-radius:1px;margin:0 auto 20px"></div>
        <p style="margin:0;font-size:13px;color:#334155;font-weight:600">XyonPlatforms · Desarrollo tecnológico de JAMD Desarrollos IA</p>
        <p style="margin:8px 0 0;font-size:12px;color:#1e293b">Este mensaje fue generado automáticamente. No respondas a este correo.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
        // Auto-reply to visitor
        const autoSubject = `Gracias por contactarnos, ${name} - XyonPlatforms`;
        await sendEmail({ ...smtpData, to: email }, autoSubject, autoReplyHtml(name));
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
