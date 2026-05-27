import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { createProduct, createPurchase, createCustomer, createSale as seedSale } from './helpers/seed.js';
import { checkCustomerLedgerConsistency, checkCashBoxConsistency, findNegativeStock } from './helpers/seed.js';


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

describe('Customer Khata — Balance & Ledger Integrity', () => {

  test('creates a customer with initial balance', async () => {
    const cust = await createCustomer(H, { initialBalance: 5000 });
    expect(cust.balance).toBe(5000);

    const ledger = await H.prisma.ledgerEntry.findMany({ where: { customerId: cust.id } });
    expect(ledger.length).toBe(1);
    expect(ledger[0].type).toBe('DEBIT');
    expect(ledger[0].amount).toBe(5000);
    expect(ledger[0].runningBalance).toBe(5000);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('CREDIT sale increases customer balance', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    const sale = await H.createSale({
      customerId: cust.id,
      invoiceNumber: `CRD-${Date.now()}`,
      discount: 0,
      netAmount: 5000,
      paidAmount: 0,
      paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(sale.success).toBe(true);

    const updated = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(updated.balance).toBe(5000);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('partial payment reduces customer balance correctly', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    await H.createSale({
      customerId: cust.id,
      invoiceNumber: `CRD1-${Date.now()}`,
      discount: 0,
      netAmount: 10000,
      paidAmount: 0,
      paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 100, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    // Partial payment of 3000
    const pay = await H.receiveCustomerPayment({
      customerId: cust.id,
      amount: 3000,
      description: 'Partial payment'
    });
    expect(pay.success).toBe(true);

    const updated = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(updated.balance).toBe(7000);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('full payment brings balance to zero', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 50, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    await H.createSale({
      customerId: cust.id,
      invoiceNumber: `CRD2-${Date.now()}`,
      discount: 0,
      netAmount: 5000,
      paidAmount: 0,
      paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    await H.receiveCustomerPayment({ customerId: cust.id, amount: 5000, description: 'Full payment' });

    const updated = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(updated.balance).toBe(0);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('overpayment results in negative balance (advance)', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 50, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    await H.createSale({
      customerId: cust.id,
      invoiceNumber: `CRD3-${Date.now()}`,
      discount: 0,
      netAmount: 3000,
      paidAmount: 0,
      paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 30, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    await H.receiveCustomerPayment({ customerId: cust.id, amount: 5000, description: 'Overpayment' });

    const updated = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(updated.balance).toBe(-2000);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('deleting CREDIT sale reverses balance correctly', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    const saleR = await H.createSale({
      customerId: cust.id,
      invoiceNumber: `DEL-SALE-${Date.now()}`,
      discount: 0,
      netAmount: 5000,
      paidAmount: 0,
      paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    expect((await H.prisma.customer.findUnique({ where: { id: cust.id } })).balance).toBe(5000);

    const del = await H.deleteSale({ id: saleR.data.id });
    expect(del.success).toBe(true);

    const updated = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(updated.balance).toBe(0);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('deleting a payment (ledger entry) reverses balance correctly', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    await H.createSale({
      customerId: cust.id,
      invoiceNumber: `PAY-DEL-${Date.now()}`,
      discount: 0,
      netAmount: 8000,
      paidAmount: 0,
      paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 80, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    const pay = await H.receiveCustomerPayment({ customerId: cust.id, amount: 3000, description: 'Test payment' });
    expect(pay.success).toBe(true);
    expect((await H.prisma.customer.findUnique({ where: { id: cust.id } })).balance).toBe(5000);

    // Find the CREDIT ledger entry for this payment
    const ledgerEntries = await H.prisma.ledgerEntry.findMany({
      where: { customerId: cust.id, type: 'CREDIT' }
    });
    expect(ledgerEntries.length).toBe(1);

    const del = await H.deleteLedgerEntry({ id: ledgerEntries[0].id });
    expect(del.success).toBe(true);

    const updated = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(updated.balance).toBe(8000);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('multiple credit sales and payments maintain correct running balance', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 500, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    const sale1 = await H.createSale({
      customerId: cust.id, invoiceNumber: `MULTI1-${Date.now()}`,
      netAmount: 5000, paidAmount: 0, paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(sale1.success).toBe(true);

    await H.receiveCustomerPayment({ customerId: cust.id, amount: 2000, description: 'First pay' });
    expect((await H.prisma.customer.findUnique({ where: { id: cust.id } })).balance).toBe(3000);

    const sale2 = await H.createSale({
      customerId: cust.id, invoiceNumber: `MULTI2-${Date.now()}`,
      netAmount: 3000, paidAmount: 0, paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 30, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(sale2.success).toBe(true);
    expect((await H.prisma.customer.findUnique({ where: { id: cust.id } })).balance).toBe(6000);

    await H.receiveCustomerPayment({ customerId: cust.id, amount: 6000, description: 'Final pay' });
    expect((await H.prisma.customer.findUnique({ where: { id: cust.id } })).balance).toBe(0);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('CASH sale to customer does NOT affect balance', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    const saleR = await H.createSale({
      customerId: cust.id,
      invoiceNumber: `CASH-CUST-${Date.now()}`,
      discount: 0,
      netAmount: 5000,
      paidAmount: 5000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    const updated = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(updated.balance).toBe(0);

    const check = await checkCustomerLedgerConsistency(H.prisma, cust.id);
    expect(check.valid).toBe(true);
  });

  test('deleting a non-customer CASH sale does not error', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `CASH-NC-${Date.now()}`,
      discount: 0,
      netAmount: 2000,
      paidAmount: 2000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 20, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    const del = await H.deleteSale({ id: saleR.data.id });
    expect(del.success).toBe(true);
  });

  test('delete customer cascades ledger entries and nullifies sales', async () => {
    const cust = await createCustomer(H);
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, { product: prod, items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }] });
    const batch = purchase.batches[0];

    await H.createSale({
      customerId: cust.id, invoiceNumber: `DEL-CUST-1-${Date.now()}`,
      netAmount: 3000, paidAmount: 0, paymentMethod: 'CREDIT',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 30, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    const del = await H.deleteCustomer({ id: cust.id });
    expect(del.success).toBe(true);

    const ledgerCount = await H.prisma.ledgerEntry.count({ where: { customerId: cust.id } });
    expect(ledgerCount).toBe(0);

    const custCheck = await H.prisma.customer.findUnique({ where: { id: cust.id } });
    expect(custCheck).toBeNull();
  });
});
