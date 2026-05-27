import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_DIR = path.resolve(__dirname, '../tmp');
const PROJECT_ROOT = path.resolve(__dirname, '../../');

export function setupTestDb(testFilePath) {
  const dbName = path.basename(testFilePath).replace(/\.test\.js$/, '') + '.sqlite';
  const dbPath = path.join(TMP_DIR, dbName);

  // Remove old DB if exists
  try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
  try {
    const journal = dbPath + '-journal';
    if (fs.existsSync(journal)) fs.unlinkSync(journal);
  } catch {}
  try {
    const wal = dbPath + '-wal';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
  } catch {}

  // Set environment for this process
  process.env.DATABASE_URL = `file:${dbPath}`;

  // Push schema to test DB
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe'
  });

  return dbPath;
}

export function teardownTestDb(dbPath) {
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  } catch {}
  try {
    const wal = dbPath + '-wal';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
  } catch {}
  try {
    const journal = dbPath + '-journal';
    if (fs.existsSync(journal)) fs.unlinkSync(journal);
  } catch {}
}
