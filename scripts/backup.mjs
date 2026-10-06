import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import pg from 'pg';

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

const env = loadEnv();
const projectRef = 'attusafghupkdkjkmxkd';

async function runBackup() {
  let password = process.env.SUPABASE_DB_PASSWORD || env.SUPABASE_DB_PASSWORD;

  if (!password) {
    password = await promptPassword('🔑 Ingresa la contraseña de tu base de datos Supabase: ');
  }

  const encodedPassword = encodeURIComponent(password);
  const host = `db.${projectRef}.supabase.co`;

  console.log(`\n🚀 Conectando a Supabase PostgreSQL (${host})...`);

  const client = new Client({
    host,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
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
    const filename = `backup_agrogestion_${dateStr}_${timeStr}.json`;
    const filePath = path.join(backupsDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log('\n======================================================');
    console.log(`🎉 ¡BACKUP COMPLETADO EXITOSAMENTE!`);
    console.log(`📁 Guardado en: backups/${filename}`);
    console.log(`📊 Total tablas: ${tables.length} | Registros respaldados: ${totalRegistros}`);
    console.log('======================================================\n');
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
