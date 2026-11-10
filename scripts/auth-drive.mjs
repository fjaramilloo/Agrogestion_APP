import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentialsPath = path.join(__dirname, 'google-oauth-credentials.json');
const tokenPath = path.join(__dirname, 'google-oauth-token.json');

if (!fs.existsSync(credentialsPath)) {
  console.error('❌ No se encontró scripts/google-oauth-credentials.json');
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}`;

const oauth2Client = new google.auth.OAuth2(
  credentials.client_id,
  credentials.client_secret,
  REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/drive.file'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: scopes
});

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.query.code) {
      const code = parsedUrl.query.code;
      console.log('📥 Código recibido de Google. Obteniendo tokens...');

      const { tokens } = await oauth2Client.getToken(code);
      fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #10B981;">🎉 ¡Autorización Exitosa!</h1>
          <p style="font-size: 18px; color: #374151;">AgroGestión ya tiene permiso para subir los backups a tu Google Drive.</p>
          <p style="color: #6B7280;">Ya puedes cerrar esta pestaña del navegador y volver a la terminal.</p>
        </div>
      `);

      console.log('✅ Tokens guardados en scripts/google-oauth-token.json');
      console.log('🎉 ¡Autorización completada con éxito!');

      server.close();
      process.exit(0);
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('No se recibió código de autorización.');
    }
  } catch (err) {
    console.error('❌ Error al obtener token:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error al procesar la autenticación: ' + err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\n======================================================');
  console.log('🔐 AUTORIZACIÓN DE GOOGLE DRIVE');
  console.log('======================================================');
  console.log('\n👉 Si tu navegador no se abrió automáticamente, abre este enlace:\n');
  console.log(authUrl);
  console.log('\n⏳ Esperando autorización en el navegador...');

  // Intentar abrir el navegador automáticamente en Mac
  exec(`open "${authUrl}"`, (err) => {
    // Si falla open, el usuario tiene la URL en consola
  });
});
