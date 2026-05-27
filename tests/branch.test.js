import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { createProduct, createPurchase, createCustomer } from './helpers/seed.js';

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

describe('Main Branch Ledger — Payable Tracking Integrity', () => {

  test('purchase paid by main branch increases running payable', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const supplier = await H.createSupplier({ name: 'MainSupp-1' });
    expect(supplier.success).toBe(true);

    const purchase = await H.createPurchase({
      supplierId: supplier.data.id,
      invoiceNumber: `BR-PUR-${Date.now()}`,
      purchaseDate: new Date().toISOString(),
      totalAmount: 50000,
      paidAmount: 50000,
      items: [{ productId: prod.id, quantity: 500, costPrice: 100, unit: 'kg' }],
      paidByMainBranch: true,
      mainBranchAmount: 50000
    });
    expect(purchase.success).toBe(true);

    const branchTx = await H.prisma.mainBranchTransaction.findFirst({
      where: { referencePurchaseId: purchase.data.id }
    });
    expect(branchTx).not.toBeNull();
    expect(branchTx.type).toBe('PAYABLE_INCREASE');
    expect(branchTx.amount).toBe(50000);
    expect(branchTx.runningPayable).toBe(50000);
  });

  test('multiple branch purchases accumulate payable', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const supplier = await H.createSupplier({ name: 'MainSupp-2' });
    expect(supplier.success).toBe(true);

    // Purchase 1: 30000
    const pur1 = await H.createPurchase({
      supplierId: supplier.data.id,
      invoiceNumber: `BR-PUR1-${Date.now()}`,
      purchaseDate: new Date().toISOString(),
      totalAmount: 30000,
      paidAmount: 30000,
      items: [{ productId: prod.id, quantity: 300, costPrice: 100, unit: 'kg' }],
      paidByMainBranch: true,
      mainBranchAmount: 30000
    });
    expect(pur1.success).toBe(true);

    // purchase 2: 20000
    const pur2 = await H.createPurchase({
      supplierId: supplier.data.id,
      invoiceNumber: `BR-PUR2-${Date.now()}`,
      purchaseDate: new Date().toISOString(),
      totalAmount: 20000,
      paidAmount: 20000,
      items: [{ productId: prod.id, quantity: 200, costPrice: 100, unit: 'kg' }],
      paidByMainBranch: true,
      mainBranchAmount: 20000
    });
    expect(pur2.success).toBe(true);

    const latestTx = await H.prisma.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(latestTx.runningPayable).toBe(50000);
  });

  test('main branch customer sale decreases payable', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const supplier = await H.createSupplier({ name: 'MainSupp-3' });
    expect(supplier.success).toBe(true);

    // First, create a branch-paid purchase (payable 40000)
    await H.createPurchase({
      supplierId: supplier.data.id,
      invoiceNumber: `BR-PUR3-${Date.now()}`,
      purchaseDate: new Date().toISOString(),
      totalAmount: 40000,
      paidAmount: 40000,
      items: [{ productId: prod.id, quantity: 400, costPrice: 100, unit: 'kg' }],
      paidByMainBranch: true,
      mainBranchAmount: 40000
    });

    // Now create a main branch customer
    const cust = await createCustomer(H, { isMainBranchCustomer: true });

    // Create a sale to main branch customer
    const batch = await H.prisma.productBatch.findFirst({ where: { productId: prod.id } });
    const saleR = await H.createSale({
      customerId: cust.id,
      invoiceNumber: `BR-SALE-${Date.now()}`,
      discount: 0,
      netAmount: 15000,
      paidAmount: 0,
      paymentMethod: 'MAIN_BRANCH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 150, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    // Payable should decrease: 40000 - 15000 = 25000
    const latestTx = await H.prisma.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(latestTx.type).toBe('PAYABLE_DECREASE');
    expect(latestTx.amount).toBe(15000);
    expect(latestTx.runningPayable).toBe(25000);
  });

  test('delete main branch sale reverses payable correctly', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const supplier = await H.createSupplier({ name: 'MainSupp-4' });
    expect(supplier.success).toBe(true);

    // Purchase: 50000 payable
    await H.createPurchase({
      supplierId: supplier.data.id,
      invoiceNumber: `BR-PUR4-${Date.now()}`,
      purchaseDate: new Date().toISOString(),
      totalAmount: 50000,
      paidAmount: 50000,
      items: [{ productId: prod.id, quantity: 500, costPrice: 100, unit: 'kg' }],
      paidByMainBranch: true,
      mainBranchAmount: 50000
    });

    const cust = await createCustomer(H, { isMainBranchCustomer: true });
    const batch = await H.prisma.productBatch.findFirst({ where: { productId: prod.id } });

    // Sale: payable 50000 - 20000 = 30000
    const saleR = await H.createSale({
      customerId: cust.id,
      invoiceNumber: `BR-SALE-DEL-${Date.now()}`,
      discount: 0,
      netAmount: 20000,
      paidAmount: 0,
      paymentMethod: 'MAIN_BRANCH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 200, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    let latestTx = await H.prisma.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(latestTx.runningPayable).toBe(30000);

    // Delete sale — payable should go back to 50000
    const del = await H.deleteSale({ id: saleR.data.id });
    expect(del.success).toBe(true);

    latestTx = await H.prisma.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(latestTx.type).toBe('PAYABLE_INCREASE');
    expect(latestTx.amount).toBe(20000);
    expect(latestTx.referenceSaleId).toBe(saleR.data.id);
    expect(latestTx.runningPayable).toBe(50000);
  });

  test('manual branch transaction updates payable', async () => {
    const tx1 = await H.createBranchTransaction({
      type: 'PAYABLE_INCREASE',
      amount: 25000,
      description: 'Manual increase'
    });
    expect(tx1.success).toBe(true);
    expect(tx1.data.runningPayable).toBe(25000);

    const tx2 = await H.createBranchTransaction({
      type: 'PAYABLE_DECREASE',
      amount: 10000,
      description: 'Manual decrease'
    });
    expect(tx2.success).toBe(true);
    expect(tx2.data.runningPayable).toBe(15000);
  });
});
