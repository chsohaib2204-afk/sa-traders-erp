import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { createProduct, createPurchase, createCustomer, createSale as seedSale, createExpense } from './helpers/seed.js';

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

describe('Dashboard — Summary, Profit & Report Accuracy', () => {

  test('dashboard summary with no data returns zeros', async () => {
    const summary = await H.getDashboardSummary();
    expect(summary.success).toBe(true);
    expect(summary.data.todaySales).toBe(0);
    expect(summary.data.todayCash).toBe(0);
    expect(summary.data.pendingCustomerBalances).toBe(0);
    expect(summary.data.mainBranchPayable).toBe(0);
    expect(summary.data.grossProfit).toBe(0);
    expect(summary.data.netProfit).toBe(0);
    expect(summary.data.cashBoxBalance).toBe(0);
    expect(summary.data.todayGrossProfit).toBe(0);
    expect(summary.data.todayNetProfit).toBe(0);
    expect(summary.data.lowStockCount).toBe(0);
    expect(summary.data.chartSales.length).toBe(7);
  });

  test('summary reflects cash sales revenue', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 200, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Sale of 100 kg at 100/kg = 10000, COGS = 100 * 50 = 5000
    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `DASH-SALE-${Date.now()}`,
      discount: 0,
      netAmount: 10000,
      paidAmount: 10000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 100, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });
    expect(saleR.success).toBe(true);

    const summary = await H.getDashboardSummary();
    expect(summary.success).toBe(true);
    // todaySales = sum of netAmount for today's sales
    expect(summary.data.todaySales).toBe(10000);
    // todayCash = Cash Box deposits today
    expect(summary.data.todayCash).toBe(10000);
    // todayGrossProfit = 100 * 100 - 100 * 50 = 5000
    expect(summary.data.todayGrossProfit).toBe(5000);
    // cashBoxBalance = sale deposit
    expect(summary.data.cashBoxBalance).toBe(10000);
  });

  test('summary with expense shows net profit deduction', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    await H.createSale({
      customerId: null,
      invoiceNumber: `DASH-EXP-${Date.now()}`,
      discount: 0,
      netAmount: 5000,
      paidAmount: 5000,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    // Add a today-expense of 1000
    await H.createExpense({
      category: 'SALARY',
      amount: 1000,
      description: 'Worker salary',
      date: new Date().toISOString()
    });

    const summary = await H.getDashboardSummary();
    // todayGrossProfit = 50*100 - 50*50 = 2500
    expect(summary.data.todayGrossProfit).toBe(2500);
    // todayNetProfit = 2500 - 1000 = 1500
    expect(summary.data.todayNetProfit).toBe(1500);
  });

  test('cumulative gross profit includes all historical sales', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 300, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Sale today: 100 kg
    await H.createSale({
      customerId: null, invoiceNumber: `CUM-1-${Date.now()}`,
      netAmount: 10000, paidAmount: 10000, paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 100, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    const summary = await H.getDashboardSummary();
    // The cumulative gross profit should equal today's gross profit since there's only one sale
    expect(summary.data.todayGrossProfit).toBe(5000);
    // cumulative = netSalesRevenue - totalCOGS (all historical)
    // netSalesRevenue = 10000, totalCOGS = 5000, grossProfit = 5000
    expect(summary.data.grossProfit).toBe(5000);
  });

  test('daily profit with addons excludes addons from gross profit', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Sale: 50 kg * 100 = 5000, with 500 addon
    const saleR = await H.createSale({
      customerId: null,
      invoiceNumber: `ADDON-${Date.now()}`,
      discount: 0,
      netAmount: 5500,
      paidAmount: 5500,
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: [{ name: 'Delivery', amount: 500 }]
    });
    expect(saleR.success).toBe(true);

    const summary = await H.getDashboardSummary();
    // todayGrossProfit = 5000 - 2500 = 2500 (addons excluded from revenue)
    expect(summary.data.todayGrossProfit).toBe(2500);
    expect(summary.data.todaySales).toBe(5500);
    expect(summary.data.todayCash).toBe(5500);
  });

  test('customer balance appears in pending balances', async () => {
    const cust1 = await H.createCustomer({ name: 'Cust-Pending-1', phone: '0300-0000001', initialBalance: 5000 });
    expect(cust1.success).toBe(true);

    const summary = await H.getDashboardSummary();
    expect(summary.data.pendingCustomerBalances).toBe(5000);

    const cust2 = await H.createCustomer({ name: 'Cust-Pending-2', phone: '0300-0000002', initialBalance: 3000 });
    expect(cust2.success).toBe(true);

    const summary2 = await H.getDashboardSummary();
    expect(summary2.data.pendingCustomerBalances).toBe(8000);
  });

  test('low stock count reflects products below threshold', async () => {
    // Product with lowStockAlert = 10, initially 0 stock (no batches)
    const prod1 = await H.createProduct({ name: 'Low-1', sku: `LOW1-${Date.now()}`, lowStockAlert: 10 });
    expect(prod1.success).toBe(true);

    const prod2 = await H.createProduct({ name: 'Low-2', sku: `LOW2-${Date.now()}`, lowStockAlert: 20, defaultPrice: 80 });
    expect(prod2.success).toBe(true);

    // No batches — stock = 0 for both
    const summary1 = await H.getDashboardSummary();
    expect(summary1.data.lowStockCount).toBe(2);

    // Add stock to prod1
    await createPurchase(H, {
      product: prod1.data,
      items: [{ productId: prod1.data.id, quantity: 50, costPrice: 20, unit: 'kg' }]
    });

    const summary2 = await H.getDashboardSummary();
    // prod1: 50 >= 10 → not low
    // prod2: 0 < 20 → low
    expect(summary2.data.lowStockCount).toBe(1);
  });

  test('chart sales data covers 7 days', async () => {
    const prod = await createProduct(H, { defaultPrice: 100 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    await H.createSale({
      customerId: null, invoiceNumber: `CHART-${Date.now()}`,
      netAmount: 5000, paidAmount: 5000, paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 100, costPrice: 50, unit: 'kg' }],
      addons: []
    });

    const summary = await H.getDashboardSummary();
    expect(summary.data.chartSales.length).toBe(7);
    // At least one entry with non-zero amount
    const nonZero = summary.data.chartSales.filter(d => d.amount > 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(1);
  });

  test('getDailyProfit returns correct data', async () => {
    const prod = await createProduct(H, { defaultPrice: 200 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 100, costPrice: 80, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Today sale: 30 kg at 200/kg = 6000, COGS = 30*80 = 2400
    await H.createSale({
      customerId: null, invoiceNumber: `DP-${Date.now()}`,
      netAmount: 6000, paidAmount: 6000, paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 30, sellingPrice: 200, costPrice: 80, unit: 'kg' }],
      addons: []
    });

    // Expense today: 500
    await H.createExpense({ category: 'TRANSPORT', amount: 500, date: new Date().toISOString() });

    const dp = await H.getDailyProfit();
    expect(dp.success).toBe(true);
    expect(dp.data.todaySales).toBe(6000);
    expect(dp.data.todayGrossProfit).toBe(3600);
    expect(dp.data.todayNetProfit).toBe(3100);
    expect(dp.data.todayExpenses).toBe(500);
  });

  test('reports data computes correct totals', async () => {
    const prod = await createProduct(H, { defaultPrice: 150 });
    const purchase = await createPurchase(H, {
      product: prod,
      items: [{ productId: prod.id, quantity: 200, costPrice: 60, unit: 'kg' }]
    });
    const batch = purchase.batches[0];

    // Sale 1: 50 kg at 150/kg
    await H.createSale({
      customerId: null, invoiceNumber: `RPT-1-${Date.now()}`,
      netAmount: 7500, paidAmount: 7500, paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 50, sellingPrice: 150, costPrice: 60, unit: 'kg' }],
      addons: []
    });

    // Sale 2: 30 kg at 150/kg
    await H.createSale({
      customerId: null, invoiceNumber: `RPT-2-${Date.now()}`,
      netAmount: 4500, paidAmount: 4500, paymentMethod: 'CASH',
      items: [{ productId: prod.id, batchId: batch.id, quantity: 30, sellingPrice: 150, costPrice: 60, unit: 'kg' }],
      addons: []
    });

    // Expense: 2000
    await H.createExpense({ category: 'ELECTRICITY', amount: 2000, date: new Date().toISOString() });

    const rpt = await H.getReportsData({});
    expect(rpt.success).toBe(true);
    // totalSalesRevenue = 50*150 + 30*150 = 12000
    expect(rpt.data.totalSalesRevenue).toBe(12000);
    // COGS = 50*60 + 30*60 = 4800
    expect(rpt.data.cogs).toBe(4800);
    // netRevenue = 7500 + 4500 = 12000
    expect(rpt.data.netRevenue).toBe(12000);
    // grossProfit = 12000 - 4800 = 7200
    expect(rpt.data.grossProfit).toBe(7200);
    // totalExpenses = 2000
    expect(rpt.data.totalExpenses).toBe(2000);
    // netProfit = 7200 - 2000 = 5200
    expect(rpt.data.netProfit).toBe(5200);
  });
});
