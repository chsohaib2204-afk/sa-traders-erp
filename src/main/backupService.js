/**
 * Local + Cloud Backup & Restore System.
 *
 * Full-database JSON snapshots saved locally alongside the SQLite database.
 * When SUPABASE_URL and SUPABASE_ANON_KEY are configured, also uploads to
 * Supabase Storage ("backups" bucket) for off-site disaster recovery.
 *
 * Does NOT interact with the SyncQueue system — runs independently.
 */
try { require('dotenv').config({ path: require('path').join(__dirname, '../../.env') }); } catch {}

const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('../database/generated');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'backups';

const prisma = new PrismaClient();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    const WebSocket = require('ws');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { transport: WebSocket },
    });
  } catch (e) {
    console.warn('[BackupService] Supabase init skipped:', e.message);
  }
}

// ─── Local backup directory (derived from DATABASE_URL) ──
function getLocalBackupDir() {
  const dbUrl = process.env.DATABASE_URL || '';
  const filePath = dbUrl.replace(/^file:/i, '').replace(/\\/g, '/');
  const dbDir = path.dirname(filePath);
  const backupDir = path.join(dbDir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

// ─── Helpers ────────────────────────────────────────────

function formatBackupName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `BACKUP_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function backupFileName(name) {
  return `${name}.json`;
}

function parseBackupName(fileName) {
  return fileName.replace(/\.json$/, '');
}

/**
 * Walk through a plain object and convert any ISO-8601 date string
 * back to a native Date so Prisma receives the correct type.
 */
function reviveDates(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const isoPat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = (typeof v === 'string' && isoPat.test(v)) ? new Date(v) : v;
  }
  return out;
}

// ─── Full snapshot (read all models) ────────────────────

async function readFullSnapshot() {
  const [
    customers, products, productBatches,
    suppliers, purchases, purchaseItems,
    sales, saleItems, saleAddons, ledgerEntries,
    recipes, recipeItems, productions, productionItems,
    expenses, mainBranchTransactions,
    stockMovements, cashBox, partnerWithdrawals, syncQueue,
  ] = await Promise.all([
    prisma.customer.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.product.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.productBatch.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.supplier.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.purchase.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.purchaseItem.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.sale.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.saleItem.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.saleAddon.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.ledgerEntry.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.recipe.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.recipeItem.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.production.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.productionItem.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.expense.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.mainBranchTransaction.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.stockMovement.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.cashBox.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.partnerWithdrawal.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.syncQueue.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: {
      customers, products, productBatches,
      suppliers, purchases, purchaseItems,
      sales, saleItems, saleAddons, ledgerEntries,
      recipes, recipeItems, productions, productionItems,
      expenses, mainBranchTransactions,
      stockMovements, cashBox, partnerWithdrawals,
      syncQueue,
    },
  };
}

// ─── Clear all tables (safe FK order) ───────────────────

async function clearAllTables(tx) {
  await tx.syncQueue.deleteMany();
  await tx.stockMovement.deleteMany();
  await tx.productionItem.deleteMany();
  await tx.production.deleteMany();
  await tx.recipeItem.deleteMany();
  await tx.recipe.deleteMany();
  await tx.saleAddon.deleteMany();
  await tx.saleItem.deleteMany();
  await tx.sale.deleteMany();
  await tx.ledgerEntry.deleteMany();
  await tx.purchaseItem.deleteMany();
  await tx.purchase.deleteMany();
  await tx.productBatch.deleteMany();
  await tx.product.deleteMany();
  await tx.customer.deleteMany();
  await tx.supplier.deleteMany();
  await tx.expense.deleteMany();
  await tx.mainBranchTransaction.deleteMany();
  await tx.cashBox.deleteMany();
  await tx.partnerWithdrawal.deleteMany();
}

// ─── Restore one table (bulk inserts, preserving IDs) ───

async function restoreTable(tx, model, rows) {
  for (const raw of rows) {
    await tx[model].create({ data: reviveDates(raw) });
  }
}

// ─── Local backup operations ────────────────────────────

function getLocalMetadata(backupDir) {
  const items = [];
  try {
    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(backupDir, file);
      const stat = fs.statSync(filePath);
      items.push({
        id: parseBackupName(file),
        backupName: parseBackupName(file),
        createdAt: stat.mtime.toISOString(),
        localPath: filePath,
      });
    }
  } catch {}
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return items;
}

async function createLocalBackup() {
  try {
    const snapshot = await readFullSnapshot();
    const backupDir = getLocalBackupDir();
    const backupName = formatBackupName();
    const filePath = path.join(backupDir, backupFileName(backupName));
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`[BackupService] Local backup saved: ${filePath}`);
    return { success: true, data: { id: backupName, backupName, createdAt: new Date().toISOString() } };
  } catch (err) {
    console.error('[BackupService] Local backup failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function restoreLocalBackup(backupId) {
  const backupDir = getLocalBackupDir();
  const filePath = path.join(backupDir, backupFileName(backupId));
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `Backup '${backupId}' not found locally.` };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const snapshot = JSON.parse(raw);
    const t = snapshot.tables;

    await prisma.$transaction(async (tx) => {
      await clearAllTables(tx);
      await restoreTable(tx, 'customer', t.customers || []);
      await restoreTable(tx, 'supplier', t.suppliers || []);
      await restoreTable(tx, 'product', t.products || []);
      await restoreTable(tx, 'expense', t.expenses || []);
      await restoreTable(tx, 'cashBox', t.cashBox || []);
      await restoreTable(tx, 'partnerWithdrawal', t.partnerWithdrawals || []);
      await restoreTable(tx, 'mainBranchTransaction', t.mainBranchTransactions || []);
      await restoreTable(tx, 'purchase', t.purchases || []);
      await restoreTable(tx, 'recipe', t.recipes || []);
      await restoreTable(tx, 'production', t.productions || []);
      await restoreTable(tx, 'productBatch', t.productBatches || []);
      await restoreTable(tx, 'purchaseItem', t.purchaseItems || []);
      await restoreTable(tx, 'recipeItem', t.recipeItems || []);
      await restoreTable(tx, 'sale', t.sales || []);
      await restoreTable(tx, 'productionItem', t.productionItems || []);
      await restoreTable(tx, 'saleItem', t.saleItems || []);
      await restoreTable(tx, 'saleAddon', t.saleAddons || []);
      await restoreTable(tx, 'ledgerEntry', t.ledgerEntries || []);
      await restoreTable(tx, 'stockMovement', t.stockMovements || []);
      await restoreTable(tx, 'syncQueue', t.syncQueue || []);
    });

    return { success: true, data: { backupName: backupId, restoredAt: new Date().toISOString() } };
  } catch (err) {
    console.error('[BackupService] Local restore failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function listLocalBackups() {
  const backupDir = getLocalBackupDir();
  const items = getLocalMetadata(backupDir);
  return { success: true, data: items };
}

async function deleteOldLocalBackups(maxCount) {
  const backupDir = getLocalBackupDir();
  const items = getLocalMetadata(backupDir);
  if (items.length <= maxCount) return;
  for (const item of items.slice(maxCount)) {
    try {
      fs.unlinkSync(item.localPath);
    } catch {}
  }
}

// ─── Cloud (Supabase) helpers ────────────────────────────

const BUCKET_NOT_FOUND = /bucket.*not found|does not exist|not found/i;
const RLS_ERROR = /violates row-level security|permission denied/i;

function isBucketNotFound(err) {
  return BUCKET_NOT_FOUND.test(err.message || '') || BUCKET_NOT_FOUND.test(err.error || '');
}

function isRlsError(err) {
  return RLS_ERROR.test(err.message || '') || RLS_ERROR.test(err.error || '');
}

function storageSetupGuide() {
  return 'Create a "backups" bucket in Supabase Dashboard → Storage → New Bucket, then add an RLS policy allowing anon upload/select.';
}

async function createCloudBackup() {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const snapshot = await readFullSnapshot();
    const backupName = formatBackupName();
    const fileName = backupFileName(backupName);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });

    const { error } = await supabase.storage.from(BUCKET).upload(fileName, blob, {
      contentType: 'application/json',
      upsert: false,
    });

    if (error) {
      if (isBucketNotFound(error)) {
        return { success: false, error: `Supabase Storage bucket "${BUCKET}" not found. ${storageSetupGuide()}` };
      }
      if (isRlsError(error)) {
        return { success: false, error: `Permission denied uploading to "${BUCKET}". ${storageSetupGuide()}` };
      }
      if (error.message?.includes('already exists')) {
        const retryName = `${backupName}_${Date.now()}`;
        const retryFile = backupFileName(retryName);
        const { error: retryError } = await supabase.storage.from(BUCKET).upload(retryFile, blob, {
          contentType: 'application/json',
        });
        if (retryError) return { success: false, error: retryError.message };
        return { success: true, data: { id: retryName, backupName: retryName, createdAt: new Date().toISOString() } };
      }
      return { success: false, error: error.message };
    }

    return { success: true, data: { id: backupName, backupName, createdAt: new Date().toISOString() } };
  } catch (err) {
    console.error('[BackupService] Cloud backup failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function restoreCloudBackup(backupId) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const fileName = backupFileName(backupId);
    const { data: fileData, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(fileName);

    if (dlError) {
      if (isBucketNotFound(dlError)) {
        return { success: false, error: `Supabase Storage bucket "${BUCKET}" not found. ${storageSetupGuide()}` };
      }
      return { success: false, error: dlError.message };
    }
    if (!fileData) return { success: false, error: 'Backup not found' };

    const text = await fileData.text();
    const snapshot = JSON.parse(text);
    const t = snapshot.tables;

    await prisma.$transaction(async (tx) => {
      await clearAllTables(tx);
      await restoreTable(tx, 'customer', t.customers || []);
      await restoreTable(tx, 'supplier', t.suppliers || []);
      await restoreTable(tx, 'product', t.products || []);
      await restoreTable(tx, 'expense', t.expenses || []);
      await restoreTable(tx, 'cashBox', t.cashBox || []);
      await restoreTable(tx, 'partnerWithdrawal', t.partnerWithdrawals || []);
      await restoreTable(tx, 'mainBranchTransaction', t.mainBranchTransactions || []);
      await restoreTable(tx, 'purchase', t.purchases || []);
      await restoreTable(tx, 'recipe', t.recipes || []);
      await restoreTable(tx, 'production', t.productions || []);
      await restoreTable(tx, 'productBatch', t.productBatches || []);
      await restoreTable(tx, 'purchaseItem', t.purchaseItems || []);
      await restoreTable(tx, 'recipeItem', t.recipeItems || []);
      await restoreTable(tx, 'sale', t.sales || []);
      await restoreTable(tx, 'productionItem', t.productionItems || []);
      await restoreTable(tx, 'saleItem', t.saleItems || []);
      await restoreTable(tx, 'saleAddon', t.saleAddons || []);
      await restoreTable(tx, 'ledgerEntry', t.ledgerEntries || []);
      await restoreTable(tx, 'stockMovement', t.stockMovements || []);
      await restoreTable(tx, 'syncQueue', t.syncQueue || []);
    });

    return { success: true, data: { backupName: backupId, restoredAt: new Date().toISOString() } };
  } catch (err) {
    console.error('[BackupService] Cloud restore failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function listCloudBackups() {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { data, error } = await supabase.storage.from(BUCKET).list('', {
      sortBy: { column: 'created_at', order: 'desc' },
    });

    if (error) {
      if (isBucketNotFound(error)) {
        return { success: false, error: `Supabase Storage bucket "${BUCKET}" not found. ${storageSetupGuide()}` };
      }
      return { success: false, error: error.message };
    }

    const backups = (data || [])
      .filter((f) => f.name?.endsWith('.json'))
      .map((f) => ({
        id: parseBackupName(f.name),
        backupName: parseBackupName(f.name),
        createdAt: f.created_at,
      }));

    return { success: true, data: backups };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteCloudBackup(fileName) {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([fileName]);
  if (error) console.warn('[BackupService] Failed to delete cloud backup:', error.message);
}

const MAX_BACKUPS = 30;

async function cleanupOldCloudBackups() {
  if (!supabase) return;

  const listResult = await listCloudBackups();
  if (!listResult.success) {
    console.warn('[BackupService] Retention: could not list cloud backups:', listResult.error);
    return;
  }

  const backups = listResult.data;
  if (backups.length <= MAX_BACKUPS) return;

  const toDelete = backups.slice(MAX_BACKUPS);
  for (const b of toDelete) {
    await deleteCloudBackup(backupFileName(b.id));
  }
}

// ─── Public API (auto-fallback: local → Supabase) ───────

async function createFullBackup() {
  // Always save locally
  const localResult = await createLocalBackup();
  if (!localResult.success) return localResult;

  // Also attempt cloud if Supabase is configured (non-blocking)
  if (supabase) {
    createCloudBackup().then((cloudResult) => {
      if (!cloudResult.success) {
        console.warn('[BackupService] Cloud backup skipped:', cloudResult.error);
      }
    }).catch(() => {});
  }

  return localResult;
}

async function restoreFromBackup(backupId) {
  // Try local first, then cloud
  const localResult = await restoreLocalBackup(backupId);
  if (localResult.success) return localResult;

  if (supabase) {
    return await restoreCloudBackup(backupId);
  }

  return localResult;
}

async function listBackups() {
  // Merge local + cloud lists
  const localResult = await listLocalBackups();
  const localBackups = localResult.success ? (localResult.data || []) : [];

  let cloudBackups = [];
  if (supabase) {
    const cloudResult = await listCloudBackups();
    if (cloudResult.success) cloudBackups = cloudResult.data || [];
  }

  // Merge by id (local overrides cloud for same name)
  const merged = {};
  for (const b of cloudBackups) merged[b.id] = { ...b, source: 'cloud' };
  for (const b of localBackups) merged[b.id] = { ...b, source: 'local' };

  const all = Object.values(merged).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { success: true, data: all };
}

async function cleanupOldBackups() {
  await deleteOldLocalBackups(MAX_BACKUPS);
  await cleanupOldCloudBackups();
}

module.exports = { createFullBackup, restoreFromBackup, listBackups, cleanupOldBackups };
