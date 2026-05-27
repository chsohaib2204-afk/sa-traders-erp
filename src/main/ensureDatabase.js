const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('../database/generated');

const REQUIRED_TABLES = [
  'Product', 'ProductBatch', 'Customer', 'LedgerEntry', 'Supplier',
  'Purchase', 'PurchaseItem', 'Sale', 'SaleItem', 'Recipe',
  'RecipeItem', 'Production', 'ProductionItem', 'Expense',
  'MainBranchTransaction', 'StockMovement', 'SaleAddon',
  'CashBox', 'PartnerWithdrawal', 'SyncQueue',
];

async function ensureDatabaseSchema() {
  const prisma = new PrismaClient();

  try {
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');

    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt + ';');
      } catch (err) {
        // If it's a "table already exists" error, that's fine
        if (!err.message?.includes('already exists')) {
          console.warn('[DB Bootstrap] Statement warning:', err.message.slice(0, 120));
        }
      }
    }

    const migrations = [
      // SyncQueue might not have updatedAt in older schema.sql
      `ALTER TABLE "SyncQueue" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      // Production columns added later
      `ALTER TABLE "Production" ADD COLUMN "ingredientCost" REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE "Production" ADD COLUMN "extraCost" REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE "Production" ADD COLUMN "sellingPricePerKg" REAL NOT NULL DEFAULT 0`,
      // createdAt columns added later
      `ALTER TABLE "SaleAddon" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "PartnerWithdrawal" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "CashBox" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      // updatedAt columns added later
      `ALTER TABLE "StockMovement" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "CashBox" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "SaleAddon" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "PartnerWithdrawal" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      // SyncQueue.status default
      `ALTER TABLE "SyncQueue" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING'`,
    ];

    for (const migration of migrations) {
      try {
        await prisma.$executeRawUnsafe(migration);
      } catch {
        // Column already exists — safe to ignore
      }
    }

    const missing = await verifyTables(prisma);
    if (missing.length > 0) {
      console.error('[DB Bootstrap] Missing tables after init:', missing.join(', '));
    } else {
      console.log('[ERP] Database schema ensured — all tables up-to-date.');
    }

    return { success: true, tablesCreated: statements.length, missingTables: missing };
  } catch (err) {
    console.error('[DB Bootstrap] Fatal error:', err.message);
    return { success: false, error: err.message };
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyTables(prisma) {
  const missing = [];
  for (const table of REQUIRED_TABLES) {
    try {
      await prisma.$queryRawUnsafe(`SELECT count(*) FROM "${table}"`);
    } catch {
      missing.push(table);
    }
  }
  return missing;
}

module.exports = { ensureDatabaseSchema };