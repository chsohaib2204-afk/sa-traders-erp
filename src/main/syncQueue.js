/**
 * Offline-first Sync Queue — logs every CREATE / UPDATE / DELETE
 * into the SyncQueue table so changes can be pushed to a cloud
 * backend later.
 *
 * Every mutation is wrapped WITH the caller's Prisma transaction (tx)
 * to guarantee atomicity: either the business write + sync entry both
 * commit, or both roll back.
 *
 * If the SyncQueue table is missing or a write fails, the error is
 * logged silently and the business operation still succeeds — the app
 * continues in offline-only mode.
 */

/**
 * Enqueue a sync entry inside an existing Prisma transaction.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} tableName  — logical table name (e.g. "sale", "customer")
 * @param {string} recordId   — primary key of the changed row
 * @param {'CREATE'|'UPDATE'|'DELETE'} operation
 * @param {object} payload    — full snapshot for CREATE/UPDATE, {id} for DELETE
 */
async function enqueueSync(tx, tableName, recordId, operation, payload) {
  try {
    await tx.syncQueue.create({
      data: {
        tableName,
        recordId,
        operation,
        payload: JSON.stringify(payload),
        status: 'PENDING',
      },
    });
  } catch (err) {
    console.warn(`[SyncQueue] Failed to enqueue ${operation} on ${tableName}: ${err.message}`);
  }
}

async function createWithSync(prisma, tableName, createFn) {
  return await prisma.$transaction(async (tx) => {
    const record = await createFn(tx);
    await enqueueSync(tx, tableName, record.id, 'CREATE', record);
    return { record, syncId: record.id };
  });
}

async function updateWithSync(prisma, tableName, updateFn) {
  return await prisma.$transaction(async (tx) => {
    const record = await updateFn(tx);
    await enqueueSync(tx, tableName, record.id, 'UPDATE', record);
    return { record, syncId: record.id };
  });
}

async function deleteWithSync(prisma, tableName, beforeDeleteFn, deleteFn) {
  return await prisma.$transaction(async (tx) => {
    const record = await beforeDeleteFn(tx);
    await deleteFn(tx);
    await enqueueSync(tx, tableName, record.id, 'DELETE', record);
    return { deletedId: record.id };
  });
}

module.exports = {
  enqueueSync,
  createWithSync,
  updateWithSync,
  deleteWithSync,
};