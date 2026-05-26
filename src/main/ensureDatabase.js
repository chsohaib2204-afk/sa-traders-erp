const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('../database/generated');

async function ensureDatabaseSchema() {
  const prisma = new PrismaClient();

  try {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='Product'`
    );

    if (Array.isArray(tables) && tables.length > 0) {
      return;
    }

    console.log('[ERP] Database has no schema — applying schema...');

    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');

    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt + ';');
    }

    console.log('[ERP] Database schema applied successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { ensureDatabaseSchema };
