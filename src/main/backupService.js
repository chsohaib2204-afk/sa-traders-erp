/**
 * Cloud Backup + Restore System.
 *
 * Full-database JSON snapshots uploaded to Supabase Storage ("backups" bucket).
 * Does NOT interact with the SyncQueue system — runs independently
 * for disaster recovery purposes only.
 *
 * Why Storage instead of a DB table?
 *   - No DDL / CREATE TABLE needed — buckets are managed objects
 *   - Snapshots are large JSON blobs, ideal for object storage
 *   - Upload / download never hits schema cache
 *
 * ⚠️  One-time setup in Supabase Dashboard (< 30 sec):
 *     1. Go to Storage → New Bucket → name = "backups", public = OFF
 *     2. Click the "backups" bucket → Policies → New Policy →
 *        "Allow all operations" (or tailor INSERT / SELECT / DELETE for anon)
 *     3. Optionally add "Allow anon to upload" with a USING check of true
 */
try { require('dotenv').config({ path: require('path').join(__dirname, '../../.env') }); } catch {} // optional

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

// ─── Helpers ────────────────────────────────────────────

function formatBackupName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `AUTO_BACKUP_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
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

// ─── Public API ─────────────────────────────────────────

/**
 * Create a full backup of the local SQLite database, upload to Supabase Storage.
 * No database tables required — uses the "backups" Storage bucket.
 */
async function createFullBackup() {
  if (!supabase) return { success: false, error: 'Supabase not configured — check SUPABASE_URL and SUPABASE_ANON_KEY in .env' };

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
    console.error('[BackupService] Backup failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Restore the full database from a cloud backup stored in Supabase Storage.
 *
 * 1. Download snapshot JSON from the "backups" bucket
 * 2. Clear ALL local tables
 * 3. Re-insert every record preserving original IDs
 *
 * ⚠️  This is destructive — all current data is replaced.
 */
async function restoreFromBackup(backupId) {
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

      // 1. Tables with NO foreign keys (independent)
      await restoreTable(tx, 'customer', t.customers || []);
      await restoreTable(tx, 'supplier', t.suppliers || []);
      await restoreTable(tx, 'product', t.products || []);
      await restoreTable(tx, 'expense', t.expenses || []);
      await restoreTable(tx, 'cashBox', t.cashBox || []);
      await restoreTable(tx, 'partnerWithdrawal', t.partnerWithdrawals || []);
      await restoreTable(tx, 'mainBranchTransaction', t.mainBranchTransactions || []);

      // 2. Tables that depend ONLY on the above
      await restoreTable(tx, 'purchase', t.purchases || []);            // FK: supplier
      await restoreTable(tx, 'recipe', t.recipes || []);                // FK: product
      await restoreTable(tx, 'production', t.productions || []);        // no declared FK

      // 3. Tables that depend on group 2 parents
      await restoreTable(tx, 'productBatch', t.productBatches || []);   // FK: product, supplier, purchase
      await restoreTable(tx, 'purchaseItem', t.purchaseItems || []);    // FK: purchase, product
      await restoreTable(tx, 'recipeItem', t.recipeItems || []);        // FK: recipe, product
      await restoreTable(tx, 'sale', t.sales || []);                    // FK: customer

      // 4. Tables that depend on group 3 parents (or earlier)
      await restoreTable(tx, 'productionItem', t.productionItems || []); // FK: production, product, batch
      await restoreTable(tx, 'saleItem', t.saleItems || []);             // FK: sale, product, batch
      await restoreTable(tx, 'saleAddon', t.saleAddons || []);           // FK: sale
      await restoreTable(tx, 'ledgerEntry', t.ledgerEntries || []);      // FK: customer, sale
      await restoreTable(tx, 'stockMovement', t.stockMovements || []);   // FK: product, batch

      // 5. SyncQueue (no external FKs)
      await restoreTable(tx, 'syncQueue', t.syncQueue || []);
    });

    return { success: true, data: { backupName: backupId, restoredAt: new Date().toISOString() } };
  } catch (err) {
    console.error('[BackupService] Restore failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * List all available backups from Supabase Storage.
 */
async function listBackups() {
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

const MAX_BACKUPS = 30;

/**
 * Delete a single backup file from Supabase Storage.
 */
async function deleteBackup(fileName) {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([fileName]);
  if (error) console.warn('[BackupService] Failed to delete backup:', error.message);
}

/**
 * Enforce retention policy — keep only the newest MAX_BACKUPS backups.
 * Must be called AFTER a successful backup so the just-created backup
 * is always preserved.
 */
async function cleanupOldBackups() {
  if (!supabase) return;

  const listResult = await listBackups();
  if (!listResult.success) {
    console.warn('[BackupService] Retention: could not list backups:', listResult.error);
    return;
  }

  const backups = listResult.data;
  if (backups.length <= MAX_BACKUPS) return;

  // listBackups returns newest-first, so excess are at the tail
  const toDelete = backups.slice(MAX_BACKUPS);

  for (const b of toDelete) {
    await deleteBackup(backupFileName(b.id));
  }

}


module.exports = { createFullBackup, restoreFromBackup, listBackups, cleanupOldBackups };
