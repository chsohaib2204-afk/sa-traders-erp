/**
 * Seed data factories for ERP test suite.
 * Each function creates test entities via handler functions and returns the created data.
 * All prices/costs are in rupees, quantities in kg unless otherwise noted.
 */

/** Create a product with default test values */
export async function createProduct(H, overrides = {}) {
  const r = await H.createProduct({
    name: `Test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'Raw Material',
    type: 'RAW_MATERIAL',
    unit: 'kg',
    defaultPrice: 100,
    loyalPrice: 90,
    lowStockAlert: 10,
    ...overrides
  });
  if (!r.success) throw new Error(`createProduct failed: ${r.error}`);
  return r.data;
}

/** Create a supplier with default test values */
export async function createSupplier(H, overrides = {}) {
  const r = await H.createSupplier({
    name: `Supplier-${Date.now()}`,
    phone: '0300-0000000',
    address: 'Test Address',
    ...overrides
  });
  if (!r.success) throw new Error(`createSupplier failed: ${r.error}`);
  return r.data;
}

/**
 * Create a purchase with items, returning the purchase with batches.
 * items: [{ productId, quantity, costPrice, unit }]
 */
export async function createPurchase(H, overrides = {}) {
  const supplier = overrides.supplier || await createSupplier(H);
  const items = overrides.items || [];
  if (items.length === 0) {
    const prod = overrides.product || await createProduct(H, { name: `PurProd-${Date.now()}`, sku: `PUR-${Date.now()}` });
    items.push({ productId: prod.id, quantity: 100, costPrice: 50, unit: 'kg' });
  }
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
  const r = await H.createPurchase({
    supplierId: supplier.id,
    invoiceNumber: `INV-PUR-${Date.now()}`,
    purchaseDate: new Date().toISOString(),
    totalAmount,
    paidAmount: totalAmount,
    items,
    paidByMainBranch: false,
    mainBranchAmount: 0,
    ...overrides
  });
  if (!r.success) throw new Error(`createPurchase failed: ${r.error}`);
  const purchase = await H.prisma.purchase.findUnique({
    where: { id: r.data.id },
    include: { batches: true, purchaseItems: true }
  });
  return purchase;
}

/** Create a customer with default test values */
export async function createCustomer(H, overrides = {}) {
  const r = await H.createCustomer({
    name: `Customer-${Date.now()}`,
    phone: '0301-0000000',
    address: 'Test Customer Address',
    isLoyal: false,
    isMainBranchCustomer: false,
    initialBalance: 0,
    ...overrides
  });
  if (!r.success) throw new Error(`createCustomer failed: ${r.error}`);
  return r.data;
}

/**
 * Create a simple sale (CASH payment).
 * items: [{ productId, batchId, quantity, sellingPrice, costPrice, unit }]
 */
export async function createSale(H, overrides = {}) {
  const items = overrides.items || [];
  if (items.length === 0) throw new Error('createSale requires items');

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.sellingPrice, 0);
  const r = await H.createSale({
    customerId: null,
    invoiceNumber: `INV-SALE-${Date.now()}`,
    discount: 0,
    netAmount: totalAmount,
    paidAmount: totalAmount,
    paymentMethod: 'CASH',
    items,
    addons: [],
    ...overrides
  });
  if (!r.success) throw new Error(`createSale failed: ${r.error}`);
  return r.data;
}

/** Create a recipe with items for a product */
export async function createRecipe(H, { productId, items } = {}) {
  if (!productId) throw new Error('createRecipe requires productId');
  if (!items || items.length === 0) throw new Error('createRecipe requires items');
  const r = await H.createRecipe({
    productId,
    name: 'Test Recipe',
    items
  });
  if (!r.success) throw new Error(`createRecipe failed: ${r.error}`);
  return r.data;
}

/** Create an expense */
export async function createExpense(H, overrides = {}) {
  const r = await H.createExpense({
    category: 'SALARY',
    amount: 1000,
    description: 'Test expense',
    date: new Date().toISOString(),
    ...overrides
  });
  if (!r.success) throw new Error(`createExpense failed: ${r.error}`);
  return r.data;
}

/** Recalculate cash box running balance from scratch and compare with stored values */
export async function checkCashBoxConsistency(prisma) {
  const entries = await prisma.cashBox.findMany({ orderBy: { createdAt: 'asc' } });
  let runningBal = 0;
  const errors = [];
  for (const entry of entries) {
    runningBal += entry.type === 'DEPOSIT' ? entry.amount : -entry.amount;
    if (Math.abs(entry.runningBalance - runningBal) > 0.001) {
      errors.push({
        id: entry.id,
        type: entry.type,
        amount: entry.amount,
        stored: entry.runningBalance,
        calculated: runningBal
      });
    }
  }
  return { valid: errors.length === 0, errors, finalBalance: runningBal };
}

/** Return list of negative-stock batches */
export async function findNegativeStock(prisma) {
  return prisma.productBatch.findMany({ where: { quantity: { lt: 0 } } });
}

/** Verify customer balance matches ledger running balance */
export async function checkCustomerLedgerConsistency(prisma, customerId) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  const ledger = await prisma.ledgerEntry.findMany({
    where: { customerId },
    orderBy: { createdAt: 'asc' }
  });
  let calcBalance = 0;
  const errors = [];
  for (const entry of ledger) {
    if (entry.type === 'DEBIT') calcBalance += entry.amount;
    else if (entry.type === 'CREDIT') calcBalance -= entry.amount;
    if (Math.abs(entry.runningBalance - calcBalance) > 0.001) {
      errors.push({
        id: entry.id,
        type: entry.type,
        stored: entry.runningBalance,
        calculated: calcBalance
      });
    }
  }
  return {
    valid: errors.length === 0 && (customer ? Math.abs(customer.balance - calcBalance) <= 0.001 : true),
    customerBalance: customer ? customer.balance : null,
    calculatedBalance: calcBalance,
    errors,
    ledgerEntryCount: ledger.length
  };
}
