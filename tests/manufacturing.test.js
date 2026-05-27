import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { createProduct, createPurchase } from './helpers/seed.js';
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

describe('Manufacturing — Recipe, Production Cost & Stock Integrity', () => {

  test('create recipe with single ingredient', async () => {
    const ing = await createProduct(H, { name: 'Ing-1', sku: `ING1-${Date.now()}`, defaultPrice: 30 });
    const finished = await createProduct(H, {
      name: 'Prod-A', sku: `PROD-A-${Date.now()}`,
      category: 'Manufactured', type: 'MANUFACTURED', defaultPrice: 200
    });

    const r = await H.createRecipe({
      productId: finished.id,
      name: 'Formula A',
      items: [{ productId: ing.id, quantity: 40, unit: 'kg' }]
    });
    expect(r.success).toBe(true);
    expect(r.data.outputQuantity).toBe(40);
  });

  test('execute production deducts ingredients and creates finished batch', async () => {
    const ing = await createProduct(H, { defaultPrice: 30 });
    const purchase = await createPurchase(H, {
      product: ing,
      items: [{ productId: ing.id, quantity: 100, costPrice: 20, unit: 'kg' }]
    });
    const ingBatch = purchase.batches[0];

    const finished = await createProduct(H, {
      name: 'Prod-B', sku: `PROD-B-${Date.now()}`,
      category: 'Manufactured', type: 'MANUFACTURED', defaultPrice: 200
    });

    const recipeR = await H.createRecipe({
      productId: finished.id,
      name: 'Formula B',
      items: [{ productId: ing.id, quantity: 10, unit: 'kg' }]
    });
    expect(recipeR.success).toBe(true);

    // Produce 20 kg (scale factor = 2)
    const prodR = await H.executeProduction({
      productId: finished.id,
      quantityProduced: 20,
      recipeId: recipeR.data.id,
      extraCost: 50
    });
    expect(prodR.success).toBe(true);

    // Ingredient deducted: 10 * 2 = 20 kg
    const updatedIng = await H.prisma.productBatch.findUnique({ where: { id: ingBatch.id } });
    expect(updatedIng.quantity).toBe(80);

    // Finished goods batch created with 20 kg
    const finBatch = await H.prisma.productBatch.findFirst({
      where: { productId: finished.id }
    });
    expect(finBatch).not.toBeNull();
    expect(finBatch.quantity).toBe(20);
    expect(finBatch.initialQuantity).toBe(20);

    // ingredientCost = 20 kg * 20 Rs/kg = 400
    // extraCost = 50
    // totalCost = 450
    // costPerKg = 450 / 20 = 22.5
    const production = await H.prisma.production.findUnique({
      where: { id: prodR.data.id }
    });
    expect(production.ingredientCost).toBe(400);
    expect(production.extraCost).toBe(50);
    expect(production.totalCost).toBe(450);
    expect(production.costPerUnit).toBe(22.5);

    // ProductionItem references source batch
    const prodItems = await H.prisma.productionItem.findMany({
      where: { productionId: prodR.data.id }
    });
    expect(prodItems.length).toBe(1);
    expect(prodItems[0].batchId).toBe(ingBatch.id);
    expect(prodItems[0].quantityConsumed).toBe(20);
    expect(prodItems[0].costPrice).toBe(20);

    // Stock movements recorded
    const movements = await H.prisma.stockMovement.findMany({
      where: { productId: ing.id, type: 'PRODUCTION_CONSUMPTION' }
    });
    expect(movements.length).toBe(1);
    expect(movements[0].quantity).toBe(-20);

    const outMovements = await H.prisma.stockMovement.findMany({
      where: { productId: finished.id, type: 'PRODUCTION_OUTPUT' }
    });
    expect(outMovements.length).toBe(1);
    expect(outMovements[0].quantity).toBe(20);
  });

  test('FIFO batch consumption: oldest batches used first', async () => {
    const ing = await createProduct(H, { name: 'FIFO-Ing', sku: `FIFO-${Date.now()}`, defaultPrice: 30 });

    // Purchase batch 1: 100kg @ 20/kg (old)
    const pur1 = await createPurchase(H, {
      product: ing,
      items: [{ productId: ing.id, quantity: 100, costPrice: 20, unit: 'kg' }]
    });

    // Purchase batch 2: 100kg @ 25/kg (newer)
    const pur2 = await createPurchase(H, {
      product: ing,
      items: [{ productId: ing.id, quantity: 100, costPrice: 25, unit: 'kg' }]
    });

    const finished = await createProduct(H, {
      name: 'FIFO-Prod', sku: `FIFO-PROD-${Date.now()}`,
      category: 'Manufactured', type: 'MANUFACTURED', defaultPrice: 200
    });

    const recipeR = await H.createRecipe({
      productId: finished.id,
      name: 'FIFO Recipe',
      items: [{ productId: ing.id, quantity: 60, unit: 'kg' }]
    });
    expect(recipeR.success).toBe(true);

    // Produce 60 kg — this should consume from batch 1 first (FIFO)
    const prodR = await H.executeProduction({
      productId: finished.id,
      quantityProduced: 60,
      recipeId: recipeR.data.id,
      extraCost: 0
    });
    expect(prodR.success).toBe(true);

    // Batch 1: 100 - 60 = 40
    const b1 = await H.prisma.productBatch.findUnique({ where: { id: pur1.batches[0].id } });
    expect(b1.quantity).toBe(40);

    // Batch 2: untouched
    const b2 = await H.prisma.productBatch.findUnique({ where: { id: pur2.batches[0].id } });
    expect(b2.quantity).toBe(100);

    // ingredientCost = 60 * 20 = 1200 (from batch 1)
    const production = await H.prisma.production.findUnique({ where: { id: prodR.data.id } });
    expect(production.ingredientCost).toBe(1200);
    expect(production.costPerUnit).toBe(20);

    // ProductionItem references batch 1
    const prodItems = await H.prisma.productionItem.findMany({
      where: { productionId: prodR.data.id }
    });
    expect(prodItems.length).toBe(1);
    expect(prodItems[0].batchId).toBe(pur1.batches[0].id);
    expect(prodItems[0].costPrice).toBe(20);

    // Now produce another 70 kg — should consume remaining batch 1 (40kg) then batch 2 (30kg)
    const prodR2 = await H.executeProduction({
      productId: finished.id,
      quantityProduced: 70,
      recipeId: recipeR.data.id,
      extraCost: 0
    });
    expect(prodR2.success).toBe(true);

    const b1After = await H.prisma.productBatch.findUnique({ where: { id: pur1.batches[0].id } });
    expect(b1After.quantity).toBe(0);

    const b2After = await H.prisma.productBatch.findUnique({ where: { id: pur2.batches[0].id } });
    expect(b2After.quantity).toBe(70);

    // ingredientCost = 40*20 + 30*25 = 800 + 750 = 1550
    const prod2 = await H.prisma.production.findUnique({ where: { id: prodR2.data.id } });
    expect(prod2.ingredientCost).toBe(1550);
    expect(prod2.costPerUnit).toBeCloseTo(22.14, 1);

    // Two production items for this run (from two batches)
    const prodItems2 = await H.prisma.productionItem.findMany({
      where: { productionId: prodR2.data.id },
      orderBy: { createdAt: 'asc' }
    });
    expect(prodItems2.length).toBe(2);
    expect(prodItems2[0].batchId).toBe(pur1.batches[0].id);
    expect(prodItems2[0].quantityConsumed).toBe(40);
    expect(prodItems2[0].costPrice).toBe(20);
    expect(prodItems2[1].batchId).toBe(pur2.batches[0].id);
    expect(prodItems2[1].quantityConsumed).toBe(30);
    expect(prodItems2[1].costPrice).toBe(25);
  });

  test('insufficient ingredient stock prevents production', async () => {
    const ing = await createProduct(H, { defaultPrice: 30 });
    // Only 10kg in stock
    await createPurchase(H, {
      product: ing,
      items: [{ productId: ing.id, quantity: 10, costPrice: 20, unit: 'kg' }]
    });

    const finished = await createProduct(H, {
      name: 'Fail-Prod', sku: `FAIL-PROD-${Date.now()}`,
      category: 'Manufactured', type: 'MANUFACTURED', defaultPrice: 200
    });

    const recipeR = await H.createRecipe({
      productId: finished.id,
      name: 'Fail Recipe',
      items: [{ productId: ing.id, quantity: 20, unit: 'kg' }]
    });
    expect(recipeR.success).toBe(true);

    // Needs 20 kg but only has 10
    const prodR = await H.executeProduction({
      productId: finished.id,
      quantityProduced: 20,
      recipeId: recipeR.data.id,
      extraCost: 0
    });
    expect(prodR.success).toBe(false);
    expect(prodR.error).toMatch(/Insufficient/i);
  });

  test('blended costing with extra costs', async () => {
    const ing1 = await createProduct(H, { name: 'Ing-A', sku: `ING-A-${Date.now()}`, defaultPrice: 20 });
    const ing2 = await createProduct(H, { name: 'Ing-B', sku: `ING-B-${Date.now()}`, defaultPrice: 40 });

    // Purchase ing1: 100kg @ 10/kg
    await createPurchase(H, {
      product: ing1,
      items: [{ productId: ing1.id, quantity: 100, costPrice: 10, unit: 'kg' }]
    });

    // Purchase ing2: 100kg @ 30/kg
    const pur2 = await createPurchase(H, {
      product: ing2,
      items: [{ productId: ing2.id, quantity: 100, costPrice: 30, unit: 'kg' }]
    });

    const finished = await createProduct(H, {
      name: 'Blend-Prod', sku: `BLEND-${Date.now()}`,
      category: 'Manufactured', type: 'MANUFACTURED', defaultPrice: 200
    });

    // Recipe: 30 kg ing1 + 20 kg ing2 = 50 kg output
    const recipeR = await H.createRecipe({
      productId: finished.id,
      name: 'Blend Recipe',
      items: [
        { productId: ing1.id, quantity: 30, unit: 'kg' },
        { productId: ing2.id, quantity: 20, unit: 'kg' }
      ]
    });
    expect(recipeR.success).toBe(true);

    // Produce 100 kg (scale factor = 2)
    const prodR = await H.executeProduction({
      productId: finished.id,
      quantityProduced: 100,
      recipeId: recipeR.data.id,
      extraCost: 100
    });
    expect(prodR.success).toBe(true);

    const prod = await H.prisma.production.findUnique({ where: { id: prodR.data.id } });
    // ing1: 60 kg * 10 = 600
    // ing2: 40 kg * 30 = 1200
    // ingredientCost = 1800
    // extraCost = 100
    // totalCost = 1900
    // costPerKg = 19
    expect(prod.ingredientCost).toBe(1800);
    expect(prod.extraCost).toBe(100);
    expect(prod.totalCost).toBe(1900);
    expect(prod.costPerUnit).toBe(19);

    // Two production items (one per ingredient)
    const prodItems = await H.prisma.productionItem.findMany({
      where: { productionId: prodR.data.id },
      orderBy: { createdAt: 'asc' }
    });
    expect(prodItems.length).toBe(2);

    const negatives = await findNegativeStock(H.prisma);
    expect(negatives.length).toBe(0);
  });

  test('sell manufactured product with correct COGS', async () => {
    const ing = await createProduct(H, { defaultPrice: 30 });
    await createPurchase(H, {
      product: ing,
      items: [{ productId: ing.id, quantity: 100, costPrice: 20, unit: 'kg' }]
    });

    const finished = await createProduct(H, {
      name: 'Sell-Prod', sku: `SELL-${Date.now()}`,
      category: 'Manufactured', type: 'MANUFACTURED', defaultPrice: 300
    });

    const recipeR = await H.createRecipe({
      productId: finished.id,
      name: 'Sell Recipe',
      items: [{ productId: ing.id, quantity: 10, unit: 'kg' }]
    });

    // Produce 50 kg (cost: 50kg * 20 = 1000 ingredient, +50 extra = 1050 total, 21/kg)
    const prodR = await H.executeProduction({
      productId: finished.id,
      quantityProduced: 50,
      recipeId: recipeR.data.id,
      extraCost: 50
    });
    expect(prodR.success).toBe(true);

    // Sell 20 kg at 300/kg
    const finBatch = await H.prisma.productBatch.findFirst({
      where: { productId: finished.id }
    });

    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `MFG-SALE-${Date.now()}`,
      discount: 0,
      netAmount: 6000,
      paidAmount: 6000,
      paymentMethod: 'CASH',
      items: [{ productId: finished.id, batchId: finBatch.id, quantity: 20, sellingPrice: 300, costPrice: 21, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    // SaleItem captured costPrice = 21 (manufactured cost per kg)
    const saleItem = await H.prisma.saleItem.findFirst({
      where: { saleId: saleR.data.id }
    });
    expect(saleItem.costPrice).toBe(21);

    // Remaining finished stock: 30 kg
    const remBatch = await H.prisma.productBatch.findUnique({ where: { id: finBatch.id } });
    expect(remBatch.quantity).toBe(30);
  });
});
