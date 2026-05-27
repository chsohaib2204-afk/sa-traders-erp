import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { createProduct, createPurchase, createSale as seedSale } from './helpers/seed.js';
import { findNegativeStock } from './helpers/seed.js';

const __filename = new URL(import.meta.url).pathname;
let dbPath, H;

beforeAll(async () => {
  dbPath = setupTestDb(__filename);
  H = await import('../src/main/ipcHandlers');
});

afterAll(() => {
  teardownTestDb(dbPath);
});

beforeEach(async () => {
  await H.resetDatabase();
});

describe('Stock System — Quantity & Movement Integrity', () => {

  test('purchase adds stock and logs movement', async () => {
    const prod = await createProduct(H);
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });

    expect(purchase.batches.length).toBe(1);
    expect(purchase.batches[0].quantity).toBe(100);
    expect(purchase.batches[0].initialQuantity).toBe(100);
    expect(purchase.batches[0].costPrice).toBe(50);

    const movements = await H.prisma.stockMovement.findMany({
      where: { productId: prod.id }
    });
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('PURCHASE');
    expect(movements[0].quantity).toBe(100);
  });

  test('sale reduces stock and logs movement', async () => {
    const prod = await createProduct(H, { defaultPrice: 120 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `STK-SALE1-${Date.now()}`,
      discount: 0,
      netAmount: 6000,
      paidAmount: 6000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 120, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    const updatedBatch = await H.prisma.productBatch.findUnique({ where: { id: batch.id } });
    expect(updatedBatch.quantity).toBe(50);

    const movements = await H.prisma.stockMovement.findMany({
      where: { productId: prod.id },
      orderBy: { createdAt: 'asc' }
    });
    expect(movements.length).toBe(2);
    expect(movements[0].type).toBe('PURCHASE');
    expect(movements[0].quantity).toBe(100);
    expect(movements[1].type).toBe('SALE');
    expect(movements[1].quantity).toBe(-50);

    const negatives = await findNegativeStock(H.prisma);
    expect(negatives.length).toBe(0);
  });

  test('delete sale restores stock and creates reversal movement', async () => {
    const prod = await createProduct(H, { defaultPrice: 120 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `STK-DEL1-${Date.now()}`,
      discount: 0,
      netAmount: 3600,
      paidAmount: 3600,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 30, sellingPrice: 120, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    const del = await H.deleteSale({ id: saleR.data.id });
    expect(del.success).toBe(true);

    // Stock restored
    const restoredBatch = await H.prisma.productBatch.findUnique({ where: { id: batch.id } });
    expect(restoredBatch.quantity).toBe(100);

    // Movement audit: original SALE deleted, SALE_REVERSAL created
    const movements = await H.prisma.stockMovement.findMany({
      where: { productId: prod.id },
      orderBy: { createdAt: 'asc' }
    });
    const reversals = movements.filter(m => m.type === 'SALE_REVERSAL');
    expect(reversals.length).toBe(1);
    expect(reversals[0].quantity).toBe(30);

    const originalSales = movements.filter(m => m.type === 'SALE');
    expect(originalSales.length).toBe(0);

    const negatives = await findNegativeStock(H.prisma);
    expect(negatives.length).toBe(0);
  });

  test('prevent selling more stock than available', async () => {
    const prod = await createProduct(H, { defaultPrice: 120 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 20, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `OVER-SELL-${Date.now()}`,
      discount: 0,
      netAmount: 5000,
      paidAmount: 5000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    // Should fail - insufficient stock
    expect(saleR.success).toBe(false);
    expect(saleR.error).toMatch(/Insufficient stock/i);

    // Batch quantity unchanged
    const batchCheck = await H.prisma.productBatch.findUnique({ where: { id: batch.id } });
    expect(batchCheck.quantity).toBe(20);
  });

  test('stock adjustment adds stock and logs movement', async () => {
    const prod = await createProduct(H);
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 50, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    const adj = await H.adjustStock({
      productId: prod.id,
      batchId: batch.id,
      quantityDifference: 30,
      unit: 'kg',
      description: 'Manual stock addition'
    });
    expect(adj.success).toBe(true);

    const updatedBatch = await H.prisma.productBatch.findUnique({ where: { id: batch.id } });
    expect(updatedBatch.quantity).toBe(80);

    const movement = await H.prisma.stockMovement.findFirst({
      where: { productId: prod.id, type: 'ADJUSTMENT' }
    });
    expect(movement).not.toBeNull();
    expect(movement.quantity).toBe(30);
  });

  test('stock adjustment (negative) reduces stock', async () => {
    const prod = await createProduct(H);
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 50, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    const adj = await H.adjustStock({
      productId: prod.id,
      batchId: batch.id,
      quantityDifference: -20,
      unit: 'kg',
      description: 'Adjustment out'
    });
    expect(adj.success).toBe(true);

    const updatedBatch = await H.prisma.productBatch.findUnique({ where: { id: batch.id } });
    expect(updatedBatch.quantity).toBe(30);
  });

  test('prevent reducing stock below zero via adjustment', async () => {
    const prod = await createProduct(H);
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 10, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    const adj = await H.adjustStock({
      productId: prod.id,
      batchId: batch.id,
      quantityDifference: -50,
      unit: 'kg',
      description: 'Should fail'
    });
    expect(adj.success).toBe(false);
    expect(adj.error).toMatch(/Insufficient stock/i);

    const batchCheck = await H.prisma.productBatch.findUnique({ where: { id: batch.id } });
    expect(batchCheck.quantity).toBe(10);
  });

  test('multiple batches of same product track stock independently', async () => {
    const prod = await createProduct(H);

    // Purchase batch 1
    const pur1 = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch1 = pur1.batches[0];

    // Purchase batch 2 at different cost
    const pur2 = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 200, costPrice: 45, unit: 'kg' }]
    });
    const batch2 = pur2.batches[0];

    // Sell from batch 1
    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `MULTI-BATCH-${Date.now()}`,
      discount: 0,
      netAmount: 6000,
      paidAmount: 6000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch1.id, quantity: 60, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    const b1 = await H.prisma.productBatch.findUnique({ where: { id: batch1.id } });
    const b2 = await H.prisma.productBatch.findUnique({ where: { id: batch2.id } });
    expect(b1.quantity).toBe(40);
    expect(b2.quantity).toBe(200);

    const negatives = await findNegativeStock(H.prisma);
    expect(negatives.length).toBe(0);
  });

  test('delete batch reverses production consumption', async () => {
    // Create ingredient
    const ing = await createProduct(H, { name: 'Ingredient', sku: `ING-${Date.now()}`, defaultPrice: 30 });
    const pur = await createPurchase(H, {
      product: ing,
      items: [{ productId: ing.id, quantity: 100, costPrice: 20, unit: 'kg' }]
    });
    const ingBatch = pur.batches[0];

    // Create finished product
    const finished = await createProduct(H, {
      name: 'Finished', sku: `FIN-${Date.now()}`,
      category: 'Manufactured', type: 'MANUFACTURED', defaultPrice: 200
    });

    // Create recipe linking them
    const recipeR = await H.createRecipe({
      productId: finished.id,
      name: 'Test Recipe',
      items: [{ productId: ing.id, quantity: 10, unit: 'kg' }]
    });
    expect(recipeR.success).toBe(true);

    // Execute production
    const prodR = await H.executeProduction({
      productId: finished.id,
      quantityProduced: 10,
      recipeId: recipeR.data.id,
      extraCost: 0
    });
    expect(prodR.success).toBe(true);

    // ProductionItem links to source batch
    const prodItems = await H.prisma.productionItem.findMany({
      where: { productionId: prodR.data.id }
    });
    expect(prodItems.length).toBe(1);
    expect(prodItems[0].batchId).toBe(ingBatch.id);

    // Delete the ingredient batch
    const del = await H.deleteBatch({ id: ingBatch.id });
    expect(del.success).toBe(true);

    // Stock movement should exist for reversal
    const movements = await H.prisma.stockMovement.findMany({
      where: { productId: ing.id, type: 'PRODUCTION_CONSUMPTION_REVERSAL' }
    });
    expect(movements.length).toBe(1);

    const negatives = await findNegativeStock(H.prisma);
    expect(negatives.length).toBe(0);
  });

  test('bag unit product purchase and sale convert correctly', async () => {
    const prod = await createProduct(H, {
      defaultPrice: 4000,
      unit: 'bag'
    });

    // Purchase 5 bags at 2000 per bag
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 5, costPrice: 2000, unit: 'bag' }]
    });
    const batch = purchase.batches[0];
    // Batch stores in kg internally: 5 bags * 40 kg/bag = 200 kg
    expect(batch.quantity).toBe(200);

    // Sell 2 bags
    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `BAG-SALE-${Date.now()}`,
      discount: 0,
      netAmount: 8000,
      paidAmount: 8000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 2, sellingPrice: 4000, costPrice: 2000, unit: 'bag' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    // Remaining: 3 bags = 120 kg
    const updatedBatch = await H.prisma.productBatch.findUnique({ where: { id: batch.id } });
    expect(updatedBatch.quantity).toBe(120);
  });
});
