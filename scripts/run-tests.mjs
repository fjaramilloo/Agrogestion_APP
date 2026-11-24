import { build } from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(process.cwd());
const testDir = join(root, 'tests');
const outDir = '/tmp/agrogestion-test-dist';

const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.ts') || name.endsWith('.test.js'))
  .map((name) => join(testDir, name));

if (testFiles.length === 0) {
  console.error('No se encontraron archivos de prueba en tests/');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints: testFiles,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  sourcemap: false,
  logLevel: 'silent',
});

const builtFiles = readdirSync(outDir)
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => join(outDir, name));

const result = spawnSync(process.execPath, ['--test', ...builtFiles], {
  stdio: 'inherit',
  env: { ...process.env, TZ: 'America/Bogota' },
});

rmSync(outDir, { recursive: true, force: true });
process.exit(result.status ?? 1);
