import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { createProduct, createPurchase, createCustomer } from './helpers/seed.js';
import { checkCashBoxConsistency } from './helpers/seed.js';

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

describe('Cash Box — Running Balance & Transaction Integrity', () => {

  test('deposit increases running balance', async () => {
    const r = await H.cashBoxDeposit({ amount: 10000, description: 'Initial deposit' });
    expect(r.success).toBe(true);
    expect(r.data.runningBalance).toBe(10000);

    const r2 = await H.cashBoxDeposit({ amount: 5000, description: 'Second deposit' });
    expect(r2.success).toBe(true);
    expect(r2.data.runningBalance).toBe(15000);

    const balance = await H.getCashBoxBalance();
    expect(balance.success).toBe(true);
    expect(balance.data.balance).toBe(15000);

    const check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
  });

  test('withdraw decreases running balance', async () => {
    await H.cashBoxDeposit({ amount: 20000, description: 'Deposit' });

    const r = await H.cashBoxWithdraw({ amount: 8000, description: 'Withdrawal' });
    expect(r.success).toBe(true);
    expect(r.data.runningBalance).toBe(12000);

    const check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
  });

  test('prevent withdrawal exceeding balance', async () => {
    await H.cashBoxDeposit({ amount: 5000, description: 'Deposit' });

    const r = await H.cashBoxWithdraw({ amount: 10000, description: 'Over-withdraw' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Insufficient Cash Box/i);

    // Balance unchanged
    const balance = await H.getCashBoxBalance();
    expect(balance.data.balance).toBe(5000);

    const check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
  });

  test('CASH sale creates deposit in cash box', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `CB-SALE-${Date.now()}`,
      discount: 0,
      netAmount: 5000,
      paidAmount: 5000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    // Cash box should have a DEPOSIT for the sale
    const cbEntries = await H.prisma.cashBox.findMany({
      where: { referenceType: 'SALE', referenceId: saleR.data.id }
    });
    expect(cbEntries.length).toBe(1);
    expect(cbEntries[0].type).toBe('DEPOSIT');
    expect(cbEntries[0].amount).toBe(5000);

    const check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
  });

  test('delete CASH sale reverses cash box deposit correctly', async () => {
    // Seed some unrelated prior cash box entries to test balance chain
    await H.cashBoxDeposit({ amount: 10000, description: 'Prior deposit 1' });
    await H.cashBoxDeposit({ amount: 5000, description: 'Prior deposit 2' });

    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Balance: 15000
    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `CB-DEL-${Date.now()}`,
      discount: 0,
      netAmount: 8000,
      paidAmount: 8000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 80, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    // Another unrelated deposit after the sale
    await H.cashBoxDeposit({ amount: 3000, description: 'After sale deposit' });

    // Balance before delete: 15000 + 8000 + 3000 = 26000
    let check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
    expect(check.finalBalance).toBe(26000);

    // Delete the sale
    const del = await H.deleteSale({ id: saleR.data.id });
    expect(del.success).toBe(true);

    // After reversal: 15000 (prior) + 3000 (after) - 8000 (reversal) = 10000
    check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
    expect(check.finalBalance).toBe(10000);

    // No SALE reference entries should remain
    const saleCbEntries = await H.prisma.cashBox.findMany({
      where: { referenceType: 'SALE' }
    });
    expect(saleCbEntries.length).toBe(0);
  });

  test('khata payment creates cash box deposit', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Create CREDIT sale
    await H.createSale({
      customerId: cust.id, invoiceNumber: `KHATA-CB-${Date.now()}`,
      netAmount: 10000, paidAmount: 0, paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 100, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    // Receive payment
    const pay = await H.receiveCustomerPayment({
      customerId: cust.id,
      amount: 4000,
      description: 'Khata payment'
    });
    expect(pay.success).toBe(true);

    // Cash Box should have a DEPOSIT for KHATA_PAYMENT
    const cbEntry = await H.prisma.cashBox.findFirst({
      where: { referenceType: 'KHATA_PAYMENT', referenceId: cust.id }
    });
    expect(cbEntry).not.toBeNull();
    expect(cbEntry.type).toBe('DEPOSIT');
    expect(cbEntry.amount).toBe(4000);

    const check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
  });

  test('deposit, sale, withdrawal sequence maintains consistent balances', async () => {
    await H.cashBoxDeposit({ amount: 50000, description: 'Opening' });

    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 200, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Sale 1
    const s1 = await H.createSale({
      customerId: null, invoiceNumber: `SEQ-1-${Date.now()}`,
      netAmount: 12000, paidAmount: 12000, paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 120, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(s1.success).toBe(true);

    // Withdrawal
    await H.cashBoxWithdraw({ amount: 10000, description: 'Expenses' });

    // Sale 2
    const s2 = await H.createSale({
      customerId: null, invoiceNumber: `SEQ-2-${Date.now()}`,
      netAmount: 5000, paidAmount: 5000, paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(s2.success).toBe(true);

    // Expected: 50000 + 12000 - 10000 + 5000 = 57000
    let check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
    expect(check.finalBalance).toBe(57000);

    // Delete sale 1
    await H.deleteSale({ id: s1.data.id });

    // After reversal: 50000 - 10000 + 5000 - 12000 = 33000
    check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
    expect(check.finalBalance).toBe(33000);
  });

  test('running balance chain survives complex interleaved operations', async () => {
    // Multiple deposits
    await H.cashBoxDeposit({ amount: 1000, description: 'D1' });
    await H.cashBoxDeposit({ amount: 2000, description: 'D2' });

    // Withdrawal
    await H.cashBoxWithdraw({ amount: 500, description: 'W1' });

    // Balance: 1000 + 2000 - 500 = 2500
    let check = await checkCashBoxConsistency(H.prisma);
    expect(check.finalBalance).toBe(2500);

    // More deposits
    await H.cashBoxDeposit({ amount: 3000, description: 'D3' });
    await H.cashBoxDeposit({ amount: 4000, description: 'D4' });

    // More withdrawals
    await H.cashBoxWithdraw({ amount: 1000, description: 'W2' });
    await H.cashBoxWithdraw({ amount: 500, description: 'W3' });

    // Balance: 2500 + 3000 + 4000 - 1000 - 500 = 8000
    check = await checkCashBoxConsistency(H.prisma);
    expect(check.valid).toBe(true);
    expect(check.finalBalance).toBe(8000);
  });
});
