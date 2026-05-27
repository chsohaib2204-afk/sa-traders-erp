/**
 * Production-grade offline → online sync engine.
 *
 * Reads PENDING (and FAILED) SyncQueue records from local SQLite
 * and pushes them to the Supabase SyncQueue table.
 *
 * Runs as a background interval in the Electron main process.
 * Does NOT modify business logic or SyncQueue creation — it only
 * reads existing SyncQueue rows and updates their status.
 */
try { require('dotenv').config({ path: require('path').join(__dirname, '../../.env') }); } catch {} // optional

const { PrismaClient } = require('../database/generated');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const prisma = new PrismaClient();
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    const WebSocket = require('ws');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { transport: WebSocket },
    });
  } catch (initErr) {
    console.warn('[SyncService] Supabase init skipped:', initErr.message);
  }
}

/** Guard against overlapping sync cycles. */
let running = false;

/**
 * Quick connectivity check — a lightweight head request to Supabase.
 * Returns false if the network is unreachable.
 */
async function isOnline() {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('SyncQueue')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Main sync cycle.
 *
 * 1. Fetch up to 20 PENDING + FAILED records (oldest first).
 * 2. Push each to Supabase.
 * 3. On success → status = SYNCED.
 * 4. On data failure → status = FAILED (retried next cycle).
 * 5. On network failure → leave as-is (retried next cycle).
 */
async function syncPendingQueue() {
  if (running || !supabase) return;
  running = true;

  try {
    if (!(await isOnline())) return;

    let records;
    try {
      records = await prisma.syncQueue.findMany({
        where: { status: { in: ['PENDING', 'FAILED'] } },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: 20,
      });
    } catch (dbErr) {
      console.warn('[SyncService] DB not ready:', dbErr.message);
      return;
    }

    if (records.length === 0) return;

    for (const record of records) {
      try {
        const { error } = await supabase.from('SyncQueue').insert({
          id: record.id,
          tableName: record.tableName,
          recordId: record.recordId,
          operation: record.operation,
          payload: record.payload,
          status: record.status,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        });

        if (!error) {
          await prisma.syncQueue.update({
            where: { id: record.id },
            data: { status: 'SYNCED' },
          });
        } else {
          // Unique violation → already synced from a previous cycle
          if (error.code === '23505') {
            await prisma.syncQueue.update({
              where: { id: record.id },
              data: { status: 'SYNCED' },
            });
          } else if (error.code && String(error.code).startsWith('P')) {
            // Prisma/Postgres data error — mark as FAILED
            console.error(`[SyncService] FAILED ${record.id.slice(0, 8)}: ${error.message}`);
            await prisma.syncQueue.update({
              where: { id: record.id },
              data: { status: 'FAILED' },
            });
          }
          // Network-level errors (no code, or HTTP errors) → leave as PENDING, retry later
        }
      } catch (err) {
        // Network or transient error — leave status unchanged, retry next cycle
        console.warn(`[SyncService] Transient error for ${record.id.slice(0, 8)}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[SyncService] Cycle error:', err.message);
  } finally {
    running = false;
  }
}

/**
 * Start the background sync loop.
 * Runs syncPendingQueue every 15 seconds.
 */
function startSyncService() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('[SyncService] Disabled — SUPABASE_URL or SUPABASE_ANON_KEY not configured');
    return;
  }
  console.log('[SyncService] Started — background sync every 15s');
  setInterval(syncPendingQueue, 15000);
  // Run immediately on start
  syncPendingQueue();
}

module.exports = { syncPendingQueue, startSyncService };
