import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import zlib from 'zlib';
import pg from 'pg';
import { google } from 'googleapis';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  const env = {};
  for (const file of envFiles) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...rest] = trimmed.split('=');
          const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
          if (!env[key.trim()]) env[key.trim()] = val;
        }
      });
    }
  }
  return env;
}

function promptPassword(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(promptText, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getGoogleAuthClient() {
  const credentialsPath = path.join(__dirname, 'google-oauth-credentials.json');
  const tokenPath = path.join(__dirname, 'google-oauth-token.json');

  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (fs.existsSync(credentialsPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
      clientId = clientId || creds.client_id;
      clientSecret = clientSecret || creds.client_secret;
    } catch (e) {
      console.warn('⚠️ Error al leer credentials:', e.message);
    }
  }

  if (fs.existsSync(tokenPath)) {
    try {
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      refreshToken = refreshToken || token.refresh_token;
    } catch (e) {
      console.warn('⚠️ Error al leer token:', e.message);
    }
  }

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

async function uploadToGoogleDrive(filePath, filename, folderId, authClient) {
  console.log(`\n☁️  Subiendo backup a Google Drive...`);
  console.log(`📂 Carpeta destino ID: ${folderId}`);

  const drive = google.drive({ version: 'v3', auth: authClient });

  const fileMetadata = {
    name: filename,
    parents: [folderId]
  };

  const media = {
    mimeType: 'application/gzip',
    body: fs.createReadStream(filePath)
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink, size'
  });

  const fileSizeMB = (parseInt(response.data.size || '0', 10) / (1024 * 1024)).toFixed(2);
  console.log('✅ ¡Archivo subido exitosamente a Google Drive!');
  console.log(`📄 Nombre: ${response.data.name}`);
  console.log(`🆔 File ID: ${response.data.id}`);
  console.log(`📦 Tamaño en Drive: ${fileSizeMB} MB`);
  if (response.data.webViewLink) {
    console.log(`🔗 Enlace en Drive: ${response.data.webViewLink}`);
  }
}

const env = loadEnv();
const projectRef = 'attusafghupkdkjkmxkd';

// Usamos el pooler oficial IPv4 de Supabase para compatibilidad total (Mac + GitHub Actions)
const defaultHost = 'aws-1-us-east-1.pooler.supabase.com';
const defaultPort = 5432;
const defaultUser = `postgres.${projectRef}`;

async function runBackup() {
  let password = process.env.SUPABASE_DB_PASSWORD || env.SUPABASE_DB_PASSWORD;

  if (!password) {
    password = await promptPassword('🔑 Ingresa la contraseña de tu base de datos Supabase: ');
  }

  const host = process.env.SUPABASE_DB_HOST || defaultHost;
  const port = parseInt(process.env.SUPABASE_DB_PORT || String(defaultPort), 10);
  const user = process.env.SUPABASE_DB_USER || (host.includes('pooler.supabase.com') ? defaultUser : 'postgres');

  console.log(`\n🚀 Conectando a Supabase PostgreSQL (${host}:${port} como ${user})...`);

  const client = new Client({
    host,
    port,
    database: 'postgres',
    user,
    password: password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ ¡Conexión exitosa a la base de datos!\n');

    const backupsDir = path.join(projectRoot, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Obtener todas las tablas de public
    const tablesRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);

    const tables = tablesRes.rows.map(r => r.tablename);
    console.log(`📋 Respaldando ${tables.length} tablas de AgroGestión...\n`);

    const backupData = {
      metadata: {
        fecha: new Date().toISOString(),
        proyecto: projectRef,
        app: 'AgroGestión',
        version: '1.0'
      },
      tables: {}
    };

    let totalRegistros = 0;

    for (const table of tables) {
      try {
        const res = await client.query(`SELECT * FROM public."${table}"`);
        backupData.tables[table] = res.rows;
        totalRegistros += res.rows.length;
        console.log(`  ✅ ${table.padEnd(28)}: ${String(res.rows.length).padStart(4)} registros`);
      } catch (err) {
        console.warn(`  ⚠️ Error al leer ${table}:`, err.message);
      }
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const baseFilename = `backup_agrogestion_${dateStr}_${timeStr}`;

    // 1. Guardar JSON original
    const jsonFilename = `${baseFilename}.json`;
    const jsonFilePath = path.join(backupsDir, jsonFilename);
    const jsonString = JSON.stringify(backupData, null, 2);
    fs.writeFileSync(jsonFilePath, jsonString, 'utf-8');

    // 2. Comprimir con Gzip para reducir espacio (9 MB -> ~0.8 MB)
    const gzFilename = `${baseFilename}.json.gz`;
    const gzFilePath = path.join(backupsDir, gzFilename);
    const gzippedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
    fs.writeFileSync(gzFilePath, gzippedBuffer);

    const jsonSizeMB = (fs.statSync(jsonFilePath).size / (1024 * 1024)).toFixed(2);
    const gzSizeMB = (fs.statSync(gzFilePath).size / (1024 * 1024)).toFixed(2);

    console.log('\n======================================================');
    console.log(`🎉 ¡BACKUP LOCAL GENERADO CON ÉXITO!`);
    console.log(`📁 JSON: backups/${jsonFilename} (${jsonSizeMB} MB)`);
    console.log(`📦 GZIP: backups/${gzFilename} (${gzSizeMB} MB - comprimido 90%)`);
    console.log(`📊 Total tablas: ${tables.length} | Registros: ${totalRegistros}`);
    console.log('======================================================');

    // 3. Subir a Google Drive
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || env.GOOGLE_DRIVE_FOLDER_ID;
    const authClient = getGoogleAuthClient();

    if (folderId && authClient) {
      try {
        await uploadToGoogleDrive(gzFilePath, gzFilename, folderId, authClient);
      } catch (driveErr) {
        console.error('❌ Error al subir a Google Drive:', driveErr.message);
      }
    } else {
      console.log('\nℹ️ Para subir a Google Drive, asegúrate de tener configurado GOOGLE_DRIVE_FOLDER_ID y autorizar OAuth.');
    }

  } catch (err) {
    if (err.message.includes('password authentication failed')) {
      console.error('❌ Error: Contraseña incorrecta para el usuario "postgres".');
      console.error('💡 Puedes restablecerla en: https://supabase.com/dashboard/project/attusafghupkdkjkmxkd/settings/database\n');
    } else {
      console.error('❌ Error durante el backup:', err.message);
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runBackup();
