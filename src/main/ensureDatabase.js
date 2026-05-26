const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('../database/generated');

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
      await prisma.$executeRawUnsafe(stmt + ';');
    }

    // Migration: add new columns that may not exist in older databases
    const migrations = [
      `ALTER TABLE "Production" ADD COLUMN "ingredientCost" REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE "Production" ADD COLUMN "extraCost" REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE "Production" ADD COLUMN "sellingPricePerKg" REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE "SaleAddon" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "PartnerWithdrawal" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
    ];
    for (const migration of migrations) {
      try {
        await prisma.$executeRawUnsafe(migration);
      } catch (e) {
        // Column already exists — safe to ignore
      }
    }

    console.log('[ERP] Database schema ensured (all tables up-to-date).');
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { ensureDatabaseSchema };
