const { ipcMain } = require('electron');
const { PrismaClient } = require('../database/generated');
const { convertToKg, convertFromKg, BAG_TO_KG } = require('./unitConverter.js');

const prisma = new PrismaClient();

/** True when inventory purchase was paid by main branch (IPC may send bool, 1, or string). */
function isPaidByMainBranch(payload) {
  const v = payload?.paidByMainBranch ?? payload?.mainBranchPaid ?? payload?.paymentSource;
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    return s === 'true' || s === '1' || s === 'on' || s === 'main_branch';
  }
  return false;
}

/** Sum batch stock (stored in kg) and express in the product's selling unit for alerts/UI. */
function stockInProductUnit(product, batches) {
  const totalKg = (batches || []).reduce((sum, b) => sum + b.quantity, 0);
  const unit = (product.unit || 'kg').toLowerCase();
  if (unit === 'bag') return totalKg / BAG_TO_KG;
  if (unit === 'gram' || unit === 'g') return totalKg * 1000;
  return totalKg;
}

// Global actions mapper
ipcMain.handle('db-action', async (event, payload) => {
  const action = payload?.action;
  const data = payload?.data ?? {};

  try {
    switch (action) {
      // --- Phase 1: Dashboard ---
      case 'get-dashboard-summary': return await getDashboardSummary();
      case 'get-recent-transactions': return await getRecentTransactions();
      case 'get-low-stock-alerts': return await getLowStockAlerts();

      // --- Phase 2: Catalog & Stock ---
      case 'get-products': return await getProducts();
      case 'create-product': return await createProduct(data);
      case 'get-product-details': return await getProductDetails(data.productId);
      case 'get-suppliers': return await getSuppliers();
      case 'create-supplier': return await createSupplier(data);
      case 'create-purchase': return await createPurchase(data);
      case 'adjust-stock': return await adjustStock(data);
      case 'get-batches': return await getBatches();

      // --- Phase 3: Customers & Khata Ledger ---
      case 'get-customers': return await getCustomers();
      case 'create-customer': return await createCustomer(data);
      case 'get-customer-ledger': return await getCustomerLedger(data.customerId);
      case 'receive-customer-payment': return await receiveCustomerPayment(data);

      // --- Phase 4: POS Sales Billing ---
      case 'create-sale': return await createSale(data);
      case 'get-sale-by-invoice': return await getSaleByInvoice(data);

      // --- Phase 5: Wanda Manufacturing Recipes ---
      case 'get-recipes': return await getRecipes();
      case 'create-recipe': return await createRecipe(data);
      case 'execute-production': return await executeProduction(data);

      // --- Phase 6: Main Branch Payables Ledger ---
      case 'get-branch-transactions': return await getBranchTransactions();
      case 'create-branch-transaction': return await createBranchTransaction(data);

      // --- Phase 7: Operational Expenses ---
      case 'get-expenses': return await getExpenses();
      case 'create-expense': return await createExpense(data);
      case 'update-expense': return await updateExpense(data);
      case 'delete-expense': return await deleteExpense(data);
      case 'update-customer': return await updateCustomer(data);
      case 'delete-customer': return await deleteCustomer(data);
      case 'update-product': return await updateProduct(data);
      case 'delete-product': return await deleteProduct(data);
      case 'delete-sale': return await deleteSale(data);
      case 'delete-ledger-entry': return await deleteLedgerEntry(data);
      case 'delete-batch': return await deleteBatch(data);
      case 'update-recipe': return await updateRecipe(data);
      case 'delete-recipe': return await deleteRecipe(data);
      case 'create-sale-addons': return await createSaleAddons(data);
      case 'get-partner-withdrawals': return await getPartnerWithdrawals(data);
      case 'create-partner-withdrawal': return await createPartnerWithdrawal(data);
      case 'delete-partner-withdrawal': return await deletePartnerWithdrawal(data);
      case 'get-daily-profit': return await getDailyProfit();

      // --- Cash Box ---
      case 'cash-box-deposit': return await cashBoxDeposit(data);
      case 'cash-box-withdraw': return await cashBoxWithdraw(data);
      case 'get-cash-box-balance': return await getCashBoxBalance();
      case 'get-cash-box-transactions': return await getCashBoxTransactions();

      // --- Phase 8: Consolidated P&L Reports ---
      case 'get-reports-data': return await getReportsData(data);

      // System Reset
      case 'reset-database': return await resetDatabase();

      default:
        throw new Error(`Unhandled action: ${action}`);
    }
  } catch (error) {
    console.error(`[IPC DB Action Error] Action '${action}' failed:`, error);
    return { success: false, error: error.message };
  }
});

// --- Phase 1 & 2: Main Controllers ---
// (Already implemented above - kept standard for operations)

async function getDashboardSummary() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const salesToday = await prisma.sale.aggregate({
    _sum: { netAmount: true },
    where: { saleDate: { gte: today, lt: tomorrow } }
  });

  const todaySales = salesToday._sum.netAmount || 0.0;

  // Today's cash = all Cash Box deposits (sale payments + Khata payments)
  const cbDepositsToday = await prisma.cashBox.aggregate({
    _sum: { amount: true },
    where: { type: 'DEPOSIT', date: { gte: today, lt: tomorrow } }
  });
  const todayCash = cbDepositsToday._sum.amount || 0.0;

  const customerBalanceSum = await prisma.customer.aggregate({
    _sum: { balance: true }
  });
  const pendingCustomerBalances = customerBalanceSum._sum.balance || 0.0;

  const lastBranchTx = await prisma.mainBranchTransaction.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  const mainBranchPayable = lastBranchTx ? lastBranchTx.runningPayable : 0.0;

  // Get all sale items for COGS (cumulative)
  const allSaleItems = await prisma.saleItem.findMany({
    select: { quantity: true, costPrice: true }
  });
  let totalCOGS = 0.0;
  allSaleItems.forEach(item => {
    totalCOGS += item.quantity * item.costPrice;
  });

  // Get all addon totals to exclude from gross profit
  const allAddons = await prisma.saleAddon.findMany({
    select: { amount: true }
  });
  const totalAddons = allAddons.reduce((s, a) => s + a.amount, 0);

  const salesAggregate = await prisma.sale.aggregate({
    _sum: { discount: true, netAmount: true }
  });
  const netSalesRevenue = salesAggregate._sum.netAmount || 0.0;

  // Gross profit = sales revenue (excl addons) - COGS
  const revenueExAddons = netSalesRevenue - totalAddons;
  const grossProfit = revenueExAddons - totalCOGS;

  const expensesSum = await prisma.expense.aggregate({
    _sum: { amount: true }
  });
  const totalExpenses = expensesSum._sum.amount || 0.0;
  const netProfit = grossProfit - totalExpenses;

  const allProducts = await prisma.product.findMany({
    include: { batches: true }
  });

  let lowStockCount = 0;
  allProducts.forEach(prod => {
    const currentStock = stockInProductUnit(prod, prod.batches);
    if (currentStock <= prod.lowStockAlert) {
      lowStockCount++;
    }
  });

  const chartSales = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);

    const daySales = await prisma.sale.aggregate({
      _sum: { netAmount: true },
      where: { saleDate: { gte: d, lte: endOfDay } }
    });

    chartSales.push({
      date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      amount: daySales._sum.netAmount || 0.0
    });
  }

  // Get Cash Box balance
  const lastCb = await prisma.cashBox.findFirst({ orderBy: { createdAt: 'desc' } });
  const cashBoxBalance = lastCb ? lastCb.runningBalance : 0.0;

  // ---- Daily profit (today's revenue - today's COGS) ----
  const todaySaleItems = await prisma.saleItem.findMany({
    where: { sale: { saleDate: { gte: today, lt: tomorrow } } },
    select: { quantity: true, sellingPrice: true, costPrice: true }
  });
  let todayRevenue = 0, todayCOGS = 0;
  for (const item of todaySaleItems) {
    todayRevenue += item.quantity * item.sellingPrice;
    todayCOGS += item.quantity * item.costPrice;
  }
  const todayGrossProfit = todayRevenue - todayCOGS;

  const todayExpAgg = await prisma.expense.aggregate({
    _sum: { amount: true },
    where: { date: { gte: today, lt: tomorrow } }
  });
  const todayExpTotal = todayExpAgg._sum.amount || 0;
  const todayNetProfit = todayGrossProfit - todayExpTotal;

  return {
    success: true,
    data: {
      todaySales,
      todayCash,
      pendingCustomerBalances,
      mainBranchPayable,
      grossProfit,
      netProfit,
      lowStockCount,
      chartSales,
      cashBoxBalance,
      todayGrossProfit,
      todayNetProfit
    }
  };
}

async function getRecentTransactions() {
  const sales = await prisma.sale.findMany({
    take: 50,
    orderBy: { saleDate: 'desc' },
    include: { customer: { select: { name: true } } }
  });

  const recentTxs = sales.map(s => ({
    id: s.id,
    type: 'Sale',
    reference: s.invoiceNumber,
    party: s.customer ? s.customer.name : 'Cash Customer',
    amount: s.netAmount,
    date: s.saleDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    status: s.paidAmount >= s.netAmount ? 'Fully Paid' : (s.paidAmount > 0 ? 'Partially Paid' : 'Unpaid'),
    colorClass: s.paidAmount >= s.netAmount ? 'text-green-500 bg-green-500/10' : (s.paidAmount > 0 ? 'text-yellow-500 bg-yellow-500/10' : 'text-red-500 bg-red-500/10')
  }));

  return { success: true, data: recentTxs };
}

async function getSaleByInvoice(data) {
  const { invoiceNumber } = data;
  if (!invoiceNumber) return { success: false, error: "Invoice number required" };
  try {
    const sale = await prisma.sale.findUnique({
      where: { invoiceNumber },
      include: {
        customer: { select: { name: true, phone: true, address: true } },
        saleItems: { include: { product: { select: { name: true } } } },
        saleAddons: true
      }
    });
    if (!sale) return { success: false, error: "Sale not found" };
    return { success: true, data: sale };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getLowStockAlerts() {
  const allProducts = await prisma.product.findMany({
    include: { batches: true }
  });

  const alerts = [];
  allProducts.forEach(prod => {
    const currentStock = stockInProductUnit(prod, prod.batches);
    if (currentStock <= prod.lowStockAlert) {
      alerts.push({
        id: prod.id,
        name: prod.name,
        sku: prod.sku || 'N/A',
        category: prod.category,
        currentStock,
        alertLimit: prod.lowStockAlert,
        unit: prod.unit
      });
    }
  });

  return { success: true, data: alerts };
}

async function getProducts() {
  const products = await prisma.product.findMany({
    include: { batches: { select: { quantity: true, costPrice: true } } },
    orderBy: { name: 'asc' }
  });

  const enrichedProducts = products.map(p => {
    const totalStock = p.batches.reduce((sum, b) => sum + b.quantity, 0);
    const totalValue = p.batches.reduce((sum, b) => sum + (b.quantity * b.costPrice), 0);
    const avgCostPrice = totalStock > 0 ? (totalValue / totalStock) : 0.0;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku || 'N/A',
      category: p.category,
      type: p.type,
      unit: p.unit,
      defaultPrice: p.defaultPrice,
      loyalPrice: p.loyalPrice,
      lowStockAlert: p.lowStockAlert,
      totalStock,
      avgCostPrice,
      createdAt: p.createdAt
    };
  });

  return { success: true, data: enrichedProducts };
}

async function createProduct(payload) {
  const { name, sku, category, type, unit, defaultPrice, loyalPrice, lowStockAlert } = payload;
  if (!name) return { success: false, error: "Product Name is required" };

  if (sku) {
    const existing = await prisma.product.findUnique({ where: { sku: sku.trim() } });
    if (existing) return { success: false, error: `Product with SKU '${sku}' already exists.` };
  }

  const newProduct = await prisma.product.create({
    data: {
      name: name.trim(),
      sku: sku ? sku.trim() : null,
      category: category || "Other",
      type: type || "RAW_MATERIAL",
      unit: unit || "kg",
      defaultPrice: parseFloat(defaultPrice) || 0.0,
      loyalPrice: parseFloat(loyalPrice) || 0.0,
      lowStockAlert: parseFloat(lowStockAlert) || 0.0
    }
  });
  return { success: true, data: newProduct };
}

async function getProductDetails(productId) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      batches: {
        orderBy: { createdAt: 'desc' },
        include: { supplier: { select: { name: true } } }
      },
      stockMovements: {
        orderBy: { createdAt: 'desc' },
        take: 20
      }
    }
  });
  if (!product) return { success: false, error: "Product not found" };
  return { success: true, data: product };
}

async function getSuppliers() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  return { success: true, data: suppliers };
}

async function createSupplier(payload) {
  const { name, phone, address, initialBalance } = payload;
  if (!name) return { success: false, error: "Supplier Name is required" };

  const supplier = await prisma.supplier.create({
    data: {
      name: name.trim(),
      phone: phone ? phone.trim() : null,
      address: address ? address.trim() : null,
      balance: parseFloat(initialBalance) || 0.0
    }
  });
  return { success: true, data: supplier };
}

async function createPurchase(payload) {
  const {
    supplierId,
    invoiceNumber,
    purchaseDate,
    totalAmount,
    paidAmount,
    items,
    paidByMainBranch,
    mainBranchAmount
  } = payload;
  if (!items || items.length === 0) return { success: false, error: "Cannot submit purchase with empty items." };

  const total = parseFloat(totalAmount) || 0.0;
  const paid = parseFloat(paidAmount) || 0.0;
  const mbPaid = isPaidByMainBranch(payload);
  const mbAmount = mbPaid ? (parseFloat(mainBranchAmount) || total) : 0.0;
  if (mbPaid && mbAmount <= 0) {
    return { success: false, error: "Enter the amount main branch paid for this purchase." };
  }
  if (mbPaid && mbAmount > total) {
    return { success: false, error: "Main branch amount cannot exceed invoice total." };
  }

  // Amount still owed to supplier (shop's direct liability)
  const balanceOwed = Math.max(0, total - paid - (mbPaid ? mbAmount : 0));

  try {
    const transactionResult = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          supplierId: supplierId || null,
          invoiceNumber: invoiceNumber ? invoiceNumber.trim() : null,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          totalAmount: total,
          paidAmount: paid + (mbPaid ? mbAmount : 0),
          paymentStatus: (paid + (mbPaid ? mbAmount : 0)) >= total ? "PAID" : ((paid + mbAmount) > 0 ? "PARTIAL" : "UNPAID")
        }
      });

      for (const item of items) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (!prod) throw new Error(`Product not found: ${item.productId}`);

        const isBag = (item.unit || '').toLowerCase() === 'bag';
        const qtyInKg = isBag ? item.quantity * BAG_TO_KG : item.quantity;
        const costPricePerKg = isBag ? (item.costPrice / BAG_TO_KG) : item.costPrice;

        const cleanName = prod.name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
        const rand = Math.floor(100 + Math.random() * 900);
        const batchNo = `BAT-${cleanName}-${Date.now().toString().slice(-6)}-${rand}`;

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: item.productId,
            quantity: item.quantity,
            costPrice: item.costPrice,
            unit: item.unit
          }
        });

        const newBatch = await tx.productBatch.create({
          data: {
            productId: item.productId,
            batchNumber: batchNo,
            quantity: qtyInKg,
            initialQuantity: qtyInKg,
            costPrice: costPricePerKg,
            supplierId: supplierId || null,
            purchaseId: purchase.id
          }
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: newBatch.id,
            type: "PURCHASE",
            quantity: qtyInKg,
            unit: "kg",
            description: `Stock intake via Invoice: ${invoiceNumber || 'N/A'}`
          }
        });
      }

      if (supplierId && balanceOwed > 0) {
        await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: balanceOwed } }
        });
      }

      // Main branch paid supplier on our behalf — shop owes head office
      if (mbPaid) {
        const lastTx = await tx.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
        const currentPayable = lastTx ? lastTx.runningPayable : 0.0;
        const invLabel = invoiceNumber ? `invoice ${invoiceNumber.trim()}` : `purchase #${purchase.id.slice(0, 8)}`;
        await tx.mainBranchTransaction.create({
          data: {
            type: "PAYABLE_INCREASE",
            amount: mbAmount,
            description: `Main branch paid supplier (${invLabel}) — stock intake`,
            runningPayable: currentPayable + mbAmount,
            referencePurchaseId: purchase.id,
            date: purchaseDate ? new Date(purchaseDate) : new Date()
          }
        });
      }

      return purchase;
    });

    return { success: true, data: transactionResult };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function adjustStock(payload) {
  const { productId, batchId, quantityDifference, unit, description } = payload;
  const diff = parseFloat(quantityDifference);
  if (isNaN(diff) || diff === 0) return { success: false, error: "Adjustment quantity must be non-zero." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.productBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new Error("Product batch not found.");

      const isBag = (unit || '').toLowerCase() === 'bag';
      const diffInKg = isBag ? diff * BAG_TO_KG : diff;

      const newQty = batch.quantity + diffInKg;
      if (newQty < 0) throw new Error(`Insufficient stock in batch.`);

      const updatedBatch = await tx.productBatch.update({
        where: { id: batchId },
        data: { quantity: newQty }
      });

      await tx.stockMovement.create({
        data: {
          productId,
          batchId,
          type: "ADJUSTMENT",
          quantity: diffInKg,
          unit: "kg",
          description: description || "Manual stock adjustment"
        }
      });
      return updatedBatch;
    });
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getBatches() {
  const batches = await prisma.productBatch.findMany({
    include: {
      product: { select: { name: true, unit: true } },
      supplier: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  return { success: true, data: batches };
}

// --- Phase 3: Customer & Khata API ---

async function getCustomers() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: 'asc' }
  });
  return { success: true, data: customers };
}

async function createCustomer(payload) {
  const { name, phone, address, isLoyal, isMainBranchCustomer, initialBalance } = payload;
  if (!name) return { success: false, error: "Customer Name is required" };

  const balance = parseFloat(initialBalance) || 0.0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: name.trim(),
          phone: phone ? phone.trim() : null,
          address: address ? address.trim() : null,
          isLoyal: !!isLoyal,
          isMainBranchCustomer: !!isMainBranchCustomer,
          balance: balance
        }
      });

      // Log initial debit if balance owes
      if (balance > 0) {
        await tx.ledgerEntry.create({
          data: {
            customerId: customer.id,
            description: "Initial Outstanding Balance",
            type: "DEBIT",
            amount: balance,
            runningBalance: balance
          }
        });
      }

      return customer;
    });
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getCustomerLedger(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId }
  });
  if (!customer) return { success: false, error: "Customer not found" };

  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: { customerId },
    orderBy: { date: 'asc' }
  });

  return {
    success: true,
    data: {
      customer,
      ledger: ledgerEntries
    }
  };
}

async function receiveCustomerPayment(payload) {
  const { customerId, amount, date, description } = payload;
  const payVal = parseFloat(amount) || 0.0;
  if (payVal <= 0) return { success: false, error: "Payment amount must be greater than zero." };

  try {
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new Error("Customer not found");

      const newBalance = customer.balance - payVal;

      await tx.customer.update({
        where: { id: customerId },
        data: { balance: newBalance }
      });

      await tx.ledgerEntry.create({
        data: {
          customerId,
          date: date ? new Date(date) : new Date(),
          description: description || "Cash payment received",
          type: "CREDIT",
          amount: payVal,
          runningBalance: newBalance
        }
      });

      // Deposit to Cash Box
      const lastCb = await tx.cashBox.findFirst({ orderBy: { createdAt: 'desc' } });
      const prevCbBal = lastCb ? lastCb.runningBalance : 0.0;
      await tx.cashBox.create({
        data: {
          type: 'DEPOSIT',
          amount: payVal,
          description: `Khata payment from ${customer.name}: ${description || `Rs.${payVal.toLocaleString()}`}`,
          referenceType: 'KHATA_PAYMENT',
          referenceId: customerId,
          runningBalance: prevCbBal + payVal
        }
      });
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- CashBox Handlers ---

async function cashBoxDeposit(data) {
  const { amount, description, referenceType, referenceId } = data;
  if (!amount || amount <= 0) return { success: false, error: "Deposit amount must be positive" };
  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.cashBox.findFirst({ orderBy: { createdAt: 'desc' } });
      const prevBal = last ? last.runningBalance : 0.0;
      const entry = await tx.cashBox.create({
        data: {
          type: 'DEPOSIT',
          amount: parseFloat(amount),
          description: description || 'Cash deposit',
          referenceType: referenceType || null,
          referenceId: referenceId || null,
          runningBalance: prevBal + parseFloat(amount)
        }
      });
      return { success: true, data: entry };
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function cashBoxWithdraw(data) {
  const { amount, description, referenceType, referenceId } = data;
  if (!amount || amount <= 0) return { success: false, error: "Withdrawal amount must be positive" };
  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.cashBox.findFirst({ orderBy: { createdAt: 'desc' } });
      const prevBal = last ? last.runningBalance : 0.0;
      if (prevBal < parseFloat(amount)) {
        return { success: false, error: `Insufficient Cash Box balance. Available: ${prevBal}` };
      }
      const entry = await tx.cashBox.create({
        data: {
          type: 'WITHDRAWAL',
          amount: parseFloat(amount),
          description: description || 'Cash withdrawal',
          referenceType: referenceType || null,
          referenceId: referenceId || null,
          runningBalance: prevBal - parseFloat(amount)
        }
      });
      return { success: true, data: entry };
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getCashBoxBalance() {
  try {
    const last = await prisma.cashBox.findFirst({ orderBy: { createdAt: 'desc' } });
    const balance = last ? last.runningBalance : 0.0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const todayDeposits = await prisma.cashBox.aggregate({
      _sum: { amount: true },
      where: { type: 'DEPOSIT', date: { gte: today, lt: tomorrow } }
    });
    const todayWithdrawals = await prisma.cashBox.aggregate({
      _sum: { amount: true },
      where: { type: 'WITHDRAWAL', date: { gte: today, lt: tomorrow } }
    });
    return {
      success: true,
      data: {
        balance,
        todayDeposits: todayDeposits._sum.amount || 0,
        todayWithdrawals: todayWithdrawals._sum.amount || 0
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getCashBoxTransactions() {
  try {
    const txs = await prisma.cashBox.findMany({ orderBy: { date: 'desc' }, take: 50 });
    return { success: true, data: txs };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- Phase 4: POS Sales Billing (FIFO Costing Engine) ---

async function createSale(payload) {
  const { customerId, invoiceNumber, discount, netAmount, paidAmount, paymentMethod, items, addons } = payload;
  if (!items || items.length === 0) return { success: false, error: "Sale must contain items." };

  const disc = parseFloat(discount) || 0.0;
  const net = parseFloat(netAmount) || 0.0;
  const paid = parseFloat(paidAmount) || 0.0;

  const addonsTotal = (addons || []).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const saleRevenueExAddons = net - addonsTotal;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Sale Header
      const sale = await tx.sale.create({
        data: {
          customerId: customerId || null,
          invoiceNumber,
          totalAmount: items.reduce((sum, i) => sum + (i.quantity * i.sellingPrice), 0),
          discount: disc,
          netAmount: net,
          paidAmount: paid,
          paymentMethod,
          isMainBranchSettled: paymentMethod === 'MAIN_BRANCH'
        }
      });

      const productNames = [];

      // 2. Deduct from user-selected batch (no auto FIFO)
      for (const item of items) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (!prod) throw new Error(`Product not found: ${item.productId}`);

        if (!item.batchId) {
          throw new Error(`Select which stock batch to sell for '${prod.name}'.`);
        }

        const isBag = (item.unit || '').toLowerCase() === 'bag';
        const saleQtyInKg = isBag ? item.quantity * BAG_TO_KG : item.quantity;
        const lineQtyDisplay = isBag ? (saleQtyInKg / BAG_TO_KG) : saleQtyInKg;
        productNames.push(`${prod.name} (${lineQtyDisplay} ${item.unit})`);

        const batch = await tx.productBatch.findUnique({ where: { id: item.batchId } });
        if (!batch || batch.productId !== item.productId) {
          throw new Error(`Invalid stock batch selected for '${prod.name}'.`);
        }
        if (batch.quantity < saleQtyInKg) {
          const avail = isBag ? (batch.quantity / BAG_TO_KG) : batch.quantity;
          throw new Error(`Insufficient stock in batch ${batch.batchNumber}. Available: ${avail.toFixed(2)} ${item.unit}`);
        }

        await tx.productBatch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: saleQtyInKg } }
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: batch.id,
            type: "SALE",
            quantity: -saleQtyInKg,
            unit: "kg",
            description: `Sold invoice: ${invoiceNumber} (batch ${batch.batchNumber})`
          }
        });

        const lineQty = isBag ? (saleQtyInKg / BAG_TO_KG) : saleQtyInKg;
        const lineCost = isBag ? (batch.costPrice * BAG_TO_KG) : batch.costPrice;

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            batchId: batch.id,
            quantity: lineQty,
            sellingPrice: item.sellingPrice,
            costPrice: lineCost,
            unit: item.unit
          }
        });
      }

      // Save addons
      const addonNames = [];
      if (addons && Array.isArray(addons) && addons.length > 0) {
        for (const a of addons) {
          await tx.saleAddon.create({
            data: {
              saleId: sale.id,
              title: a.name || 'Extra Charge',
              amount: parseFloat(a.amount) || 0
            }
          });
          if (a.name) addonNames.push(`${a.name} (Rs.${parseFloat(a.amount).toLocaleString()})`);
        }
      }

      // Build description for audit trail
      const descParts = [];
      if (productNames.length > 0) descParts.push(`Items: ${productNames.join(', ')}`);
      if (addonNames.length > 0) descParts.push(`Addons: ${addonNames.join(', ')}`);
      const fullDescription = descParts.length > 0 ? descParts.join(' | ') : `Invoice ${invoiceNumber}`;

      const isCashOrBank = paymentMethod === 'CASH' || paymentMethod === 'BANK';

      // 3. Khata/Credit handling for customers
      if (customerId) {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });

        if (paymentMethod === 'CREDIT') {
          // CREDIT: DEBIT full netAmount to Khata, paidAmount goes to Cash Box
          const postSaleBal = customer.balance + net;
          await tx.customer.update({
            where: { id: customerId },
            data: { balance: postSaleBal }
          });
          await tx.ledgerEntry.create({
            data: {
              customerId,
              description: fullDescription,
              type: "DEBIT",
              amount: net,
              runningBalance: postSaleBal,
              saleId: sale.id
            }
          });
        } else if (isCashOrBank) {
          // CASH/BANK with a customer: informational ledger entry, no balance change
          await tx.ledgerEntry.create({
            data: {
              customerId,
              description: `${paymentMethod === 'CASH' ? 'Cash' : 'Bank'} sale: ${fullDescription}`,
              type: "SALE",
              amount: net,
              runningBalance: customer.balance,
              saleId: sale.id
            }
          });
        }
      } else if (isCashOrBank) {
        // CASH/BANK without customer: general audit ledger entry (no customerId)
        await tx.ledgerEntry.create({
          data: {
            customerId: null,
            description: `Cash sale ${invoiceNumber}: ${fullDescription}`,
            type: "SALE",
            amount: net,
            runningBalance: 0,
            saleId: sale.id
          }
        });
      }

      // 4. Cash Box deposit for CASH/BANK payments
      if (isCashOrBank && paid > 0) {
        const lastCb = await tx.cashBox.findFirst({ orderBy: { createdAt: 'desc' } });
        const prevBal = lastCb ? lastCb.runningBalance : 0.0;
        await tx.cashBox.create({
          data: {
            type: 'DEPOSIT',
            amount: paid,
            description: `Sale ${invoiceNumber} - ${paymentMethod === 'CASH' ? 'Cash' : 'Bank'} payment received`,
            referenceType: 'SALE',
            referenceId: sale.id,
            runningBalance: prevBal + paid
          }
        });
      }

      // 5. Main Branch adjustments
      if (paymentMethod === 'MAIN_BRANCH') {
        const lastTx = await tx.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
        const currentPayable = lastTx ? lastTx.runningPayable : 0.0;
        const newPayable = currentPayable - net;

        await tx.mainBranchTransaction.create({
          data: {
            type: "PAYABLE_DECREASE",
            amount: net,
            description: `Sale to branch customer. Payment adjusted to payables. Inv: ${invoiceNumber}`,
            runningPayable: newPayable,
            referenceSaleId: sale.id,
            date: new Date()
          }
        });
      }

      return sale;
    });

    return { success: true, data: result };
  } catch (err) {
    console.error('[Transaction Failed] Sale invoice rolled back:', err);
    return { success: false, error: err.message };
  }
}

// --- Phase 5: Wanda Manufacturing Recipes ---

async function getRecipes() {
  const recipes = await prisma.recipe.findMany({
    include: {
      product: { select: { name: true, unit: true, defaultPrice: true, loyalPrice: true } },
      recipeItems: { include: { product: { select: { name: true, unit: true } } } }
    }
  });
  return { success: true, data: recipes };
}

async function createRecipe(payload) {
  const { productId, name, items } = payload;

  if (!productId) {
    return { success: false, error: "Select the finished product this recipe produces." };
  }
  if (!items || items.length === 0) {
    return { success: false, error: "Add at least one raw ingredient to the formula." };
  }

  const validItems = items.filter(i => i.productId && parseFloat(i.quantity) > 0);
  if (validItems.length === 0) {
    return { success: false, error: "Each ingredient needs a raw material and quantity greater than zero." };
  }

  const outputProduct = await prisma.product.findUnique({ where: { id: productId } });
  if (!outputProduct) {
    return { success: false, error: "Selected output product was not found." };
  }

  // Auto-calculate total formula weight from ingredient quantities (all in kg)
  const totalWeightKg = validItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);

  if (totalWeightKg <= 0) {
    return { success: false, error: "Total ingredient weight must be greater than zero." };
  }

  try {
    const recipe = await prisma.recipe.create({
      data: {
        productId,
        name: name || "Formula Mix Recipe",
        outputQuantity: totalWeightKg,
        recipeItems: {
          create: validItems.map(item => ({
            productId: item.productId,
            quantity: parseFloat(item.quantity) || 0.0,
            unit: "kg"
          }))
        }
      }
    });
    return { success: true, data: recipe };
  } catch (err) {
    if (err.code === 'P2002') {
      return { success: false, error: "This product already has a recipe. Edit or delete the existing formula first." };
    }
    return { success: false, error: err.message };
  }
}

async function executeProduction(payload) {
  const { productId, quantityProduced, recipeId, extraCost } = payload;
  const qtyProduced = parseFloat(quantityProduced) || 0.0;
  if (qtyProduced <= 0) return { success: false, error: "Production quantity must be positive." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.findUnique({
        where: { id: recipeId },
        include: { recipeItems: true }
      });
      if (!recipe) throw new Error("Wanda Recipe mixing formula not found.");

      let totalIngredientsCost = 0.0;

      const scaleFactor = qtyProduced / recipe.outputQuantity;

      // 1. Loop and deduct recipe ingredients FIFO style
      for (const ing of recipe.recipeItems) {
        const totalNeededKg = ing.quantity * scaleFactor;

        // Fetch active stock batches of ingredient
        const activeBatches = await tx.productBatch.findMany({
          where: { productId: ing.productId, quantity: { gt: 0 } },
          orderBy: { createdAt: 'asc' }
        });

        // Verify stock
        const availableKg = activeBatches.reduce((sum, b) => sum + b.quantity, 0);
        if (availableKg < totalNeededKg) {
          const ingProd = await tx.product.findUnique({ where: { id: ing.productId } });
          throw new Error(`Insufficient raw ingredient stock for '${ingProd.name}'. Needed: ${totalNeededKg} kg, Available: ${availableKg} kg.`);
        }

        let remaining = totalNeededKg;

        for (const batch of activeBatches) {
          if (remaining <= 0) break;

          const taken = Math.min(batch.quantity, remaining);
          remaining -= taken;

          // Decrement batch levels
          await tx.productBatch.update({
            where: { id: batch.id },
            data: { quantity: { decrement: taken } }
          });

          // Log movement
          await tx.stockMovement.create({
            data: {
              productId: ing.productId,
              batchId: batch.id,
              type: "PRODUCTION_CONSUMPTION",
              quantity: -taken,
              unit: "kg",
              description: `Consumed in production mix for Recipe: ${recipe.name}`
            }
          });

          // Accumulate actual ingredient purchase cost
          totalIngredientsCost += taken * batch.costPrice;
        }
      }

      // 2. Calculate actual costing per produced unit
      const extraCostVal = parseFloat(extraCost) || 0;
      const ingredientCost = totalIngredientsCost;
      const totalCost = ingredientCost + extraCostVal;
      const costPerKg = totalCost / qtyProduced;

      // 3. Create manufactured batch (always store in KG)
      const targetProd = await tx.product.findUnique({ where: { id: productId } });
      const cleanName = targetProd.name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
      const batchNo = `BAT-MFG-${cleanName}-${Date.now().toString().slice(-6)}`;

      const isBagProduct = targetProd.unit === 'bag';
      const sellingPricePerKg = isBagProduct ? (targetProd.defaultPrice / BAG_TO_KG) : targetProd.defaultPrice;

      // Create manufactured product batch (quantity in kg always)
      const newBatch = await tx.productBatch.create({
        data: {
          productId,
          batchNumber: batchNo,
          quantity: qtyProduced,
          initialQuantity: qtyProduced,
          costPrice: costPerKg
        }
      });

      // Log positive production stock movements
      await tx.stockMovement.create({
        data: {
          productId,
          batchId: newBatch.id,
          type: "PRODUCTION_OUTPUT",
          quantity: qtyProduced,
          unit: "kg",
          description: `Produced recipe: ${recipe.name}`
        }
      });

      // 4. Create Production mixing log
      const production = await tx.production.create({
        data: {
          productId,
          recipeId,
          batchNumber: batchNo,
          quantityProduced: qtyProduced,
          ingredientCost: ingredientCost,
          extraCost: extraCostVal,
          totalCost: totalCost,
          costPerUnit: costPerKg,
          sellingPricePerKg: sellingPricePerKg
        }
      });

      // Log consumed items details
      for (const ing of recipe.recipeItems) {
        await tx.productionItem.create({
          data: {
            productionId: production.id,
            productId: ing.productId,
            batchId: newBatch.id,
            quantityConsumed: ing.quantity * scaleFactor,
            costPrice: costPerKg
          }
        });
      }

      return production;
    });

    return { success: true, data: result };
  } catch (err) {
    console.error('[Production Fail] Mixing run rolled back:', err);
    return { success: false, error: err.message };
  }
}

// --- Phase 6: Main Branch Payables Accounting ---

async function getBranchTransactions() {
  const txs = await prisma.mainBranchTransaction.findMany({
    orderBy: { createdAt: 'desc' }
  });

  const purchaseIds = txs.map(t => t.referencePurchaseId).filter(Boolean);
  const saleIds = txs.map(t => t.referenceSaleId).filter(Boolean);

  const purchases = purchaseIds.length
    ? await prisma.purchase.findMany({
        where: { id: { in: purchaseIds } },
        include: { supplier: { select: { name: true } } }
      })
    : [];

  const sales = saleIds.length
    ? await prisma.sale.findMany({
        where: { id: { in: saleIds } },
        select: { id: true, invoiceNumber: true }
      })
    : [];

  const purchaseMap = Object.fromEntries(purchases.map(p => [p.id, p]));
  const saleMap = Object.fromEntries(sales.map(s => [s.id, s]));

  const enriched = txs.map(t => ({
    ...t,
    source: t.referencePurchaseId ? 'PURCHASE' : (t.referenceSaleId ? 'SALE' : 'MANUAL'),
    purchase: t.referencePurchaseId ? purchaseMap[t.referencePurchaseId] : null,
    sale: t.referenceSaleId ? saleMap[t.referenceSaleId] : null
  }));

  return { success: true, data: enriched };
}

async function createBranchTransaction(payload) {
  const { type, amount, description } = payload;
  const val = parseFloat(amount) || 0.0;
  if (val <= 0) return { success: false, error: "Transaction amount must be positive." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lastTx = await tx.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
      const currentPayable = lastTx ? lastTx.runningPayable : 0.0;

      const newPayable = type === 'PAYABLE_INCREASE' 
        ? currentPayable + val 
        : currentPayable - val;

      const branchTx = await tx.mainBranchTransaction.create({
        data: {
          type,
          amount: val,
          description: description || "Main branch adjustment",
          runningPayable: newPayable,
          date: new Date()
        }
      });
      return branchTx;
    });
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- Phase 7: Expenses ---

async function getExpenses() {
  const expenses = await prisma.expense.findMany({
    orderBy: { date: 'desc' }
  });
  return { success: true, data: expenses };
}

async function createExpense(payload) {
  const { category, amount, description, date } = payload;
  const val = parseFloat(amount) || 0.0;
  if (val <= 0) return { success: false, error: "Expense amount must be positive" };

  const exp = await prisma.expense.create({
    data: {
      category,
      amount: val,
      description: description || "Daily factory expense",
      date: date ? new Date(date) : new Date()
    }
  });
  return { success: true, data: exp };
}

// --- Phase 8: Consolidated P&L Reports ---

async function getReportsData(filters) {
  // Pulls sales, expenses, and computes P&L metrics over time
  const sales = await prisma.sale.findMany({
    include: { saleItems: true }
  });

  const expenses = await prisma.expense.findMany();

  // Aggregate margins
  let totalSalesRevenue = 0.0;
  let totalCOGS = 0.0;

  sales.forEach(s => {
    s.saleItems.forEach(item => {
      totalSalesRevenue += item.quantity * item.sellingPrice;
      totalCOGS += item.quantity * item.costPrice;
    });
  });

  const salesAggregate = await prisma.sale.aggregate({
    _sum: { discount: true, netAmount: true }
  });
  const netRevenue = salesAggregate._sum.netAmount || 0.0;
  const grossProfit = netRevenue - totalCOGS;

  const totalExp = expenses.reduce((sum, e) => sum + e.amount, 0.0);
  const netProfit = grossProfit - totalExp;

  // Expense grouping by categories
  const categoryExp = {};
  expenses.forEach(e => {
    categoryExp[e.category] = (categoryExp[e.category] || 0) + e.amount;
  });

  const expenseBreakdown = Object.keys(categoryExp).map(cat => ({
    category: cat,
    amount: categoryExp[cat]
  }));

  return {
    success: true,
    data: {
      totalSalesRevenue,
      cogs: totalCOGS,
      netRevenue,
      grossProfit,
      totalExpenses: totalExp,
      netProfit,
      expenseBreakdown
    }
  };
}

// --- Edit & Delete Handlers ---

async function updateCustomer(data) {
  const { id, name, phone, address, isLoyal, isMainBranchCustomer } = data;
  if (!id || !name) return { success: false, error: "Customer ID and Name are required" };
  try {
    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: name.trim(),
        phone: phone || null,
        address: address || null,
        isLoyal: !!isLoyal,
        isMainBranchCustomer: !!isMainBranchCustomer
      }
    });
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteCustomer(data) {
  const { id } = data;
  if (!id) return { success: false, error: "Customer ID is required" };
  try {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return { success: false, error: "Customer not found." };

    // LedgerEntry has onDelete: Cascade, so entries auto-delete with customer
    // Sale has onDelete: SetNull on customerId, so sales are unlinked automatically
    await prisma.customer.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateProduct(data) {
  const { id, name, sku, category, type, unit, defaultPrice, loyalPrice, lowStockAlert } = data;
  if (!id || !name) return { success: false, error: "Product ID and Name are required" };
  try {
    if (sku) {
      const existing = await prisma.product.findFirst({ where: { sku: sku.trim(), NOT: { id } } });
      if (existing) return { success: false, error: `SKU '${sku}' already in use` };
    }
    const updated = await prisma.product.update({
      where: { id },
      data: {
        name: name.trim(),
        sku: sku || null,
        category: category || "Other",
        type: type || "RAW_MATERIAL",
        unit: unit || "kg",
        defaultPrice: parseFloat(defaultPrice) || 0.0,
        loyalPrice: parseFloat(loyalPrice) || 0.0,
        lowStockAlert: parseFloat(lowStockAlert) || 0.0
      }
    });
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteProduct(data) {
  const { id } = data;
  if (!id) return { success: false, error: "Product ID is required" };
  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return { success: false, error: "Product not found." };

    const batchCount = await prisma.productBatch.count({ where: { productId: id } });
    if (batchCount > 0) return { success: false, error: "Cannot delete product with existing stock batches. Remove batches first." };

    const saleCount = await prisma.saleItem.count({ where: { productId: id } });
    if (saleCount > 0) return { success: false, error: "Cannot delete product linked to sale records." };

    const purchaseCount = await prisma.purchaseItem.count({ where: { productId: id } });
    if (purchaseCount > 0) return { success: false, error: "Cannot delete product linked to purchase records." };

    const recipeCount = await prisma.recipeItem.count({ where: { productId: id } });
    if (recipeCount > 0) return { success: false, error: "Cannot delete product used in manufacturing recipes." };

    await prisma.product.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteSale(data) {
  const { id, invoiceNumber } = data;
  const saleId = id || invoiceNumber;
  const whereClause = id ? { id: saleId } : { invoiceNumber: saleId };
  if (!saleId) return { success: false, error: "Sale ID or Invoice Number is required" };
  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: whereClause, include: { saleItems: true } });
      if (!sale) throw new Error("Sale not found");

      // Restore stock to batches
      for (const item of sale.saleItems) {
        if (item.batchId) {
          const isBag = item.unit === 'bag';
          const qtyInKg = isBag ? item.quantity * BAG_TO_KG : item.quantity;
          await tx.productBatch.update({
            where: { id: item.batchId },
            data: { quantity: { increment: qtyInKg } }
          });
        }
      }

      // Reverse customer ledger entries
      if (sale.customerId) {
        const ledgerEntries = await tx.ledgerEntry.findMany({ where: { saleId: sale.id }, orderBy: { createdAt: 'asc' } });
        for (const entry of ledgerEntries) {
          if (entry.type === 'DEBIT') {
            await tx.customer.update({
              where: { id: sale.customerId },
              data: { balance: { decrement: entry.amount } }
            });
          } else if (entry.type === 'CREDIT') {
            await tx.customer.update({
              where: { id: sale.customerId },
              data: { balance: { increment: entry.amount } }
            });
          }
        }
        await tx.ledgerEntry.deleteMany({ where: { saleId: sale.id } });
      } else {
        // Non-customer sales: delete ledger entries
        await tx.ledgerEntry.deleteMany({ where: { saleId: sale.id } });
      }

      // Reverse Cash Box entries for this sale
      const cbEntries = await tx.cashBox.findMany({ where: { referenceType: 'SALE', referenceId: sale.id }, orderBy: { createdAt: 'asc' } });
      if (cbEntries.length > 0) {
        for (const cb of cbEntries) {
          // Remove the deposit and recalculate balances
          const lastBefore = await tx.cashBox.findFirst({
            where: { createdAt: { lt: cb.createdAt } },
            orderBy: { createdAt: 'desc' }
          });
          const balBefore = lastBefore ? lastBefore.runningBalance : 0.0;
          // Create reversal entry
          await tx.cashBox.create({
            data: {
              type: 'WITHDRAWAL',
              amount: cb.amount,
              description: `Reversal of sale ${sale.invoiceNumber}`,
              referenceType: 'SALE_REVERSAL',
              referenceId: sale.id,
              runningBalance: balBefore
            }
          });
        }
        // Delete original Cash Box entries
        await tx.cashBox.deleteMany({ where: { referenceType: 'SALE', referenceId: sale.id } });
      }

      // Reverse main branch transactions
      if (sale.paymentMethod === 'MAIN_BRANCH') {
        const lastTx = await tx.mainBranchTransaction.findFirst({ orderBy: { createdAt: 'desc' } });
        const currentPayable = lastTx ? lastTx.runningPayable : 0.0;
        await tx.mainBranchTransaction.create({
          data: {
            type: "PAYABLE_INCREASE",
            amount: sale.netAmount,
            description: `Reversal of sale ${sale.invoiceNumber}`,
            runningPayable: currentPayable + sale.netAmount
          }
        });
      }

      // Delete sale items and stock movements
      await tx.stockMovement.deleteMany({
        where: { type: "SALE", description: { contains: sale.invoiceNumber } }
      });
      await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
      await tx.saleAddon.deleteMany({ where: { saleId: sale.id } });
      await tx.sale.delete({ where: { id: sale.id } });
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteLedgerEntry(data) {
  const { id } = data;
  if (!id) return { success: false, error: "Entry ID is required" };
  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.ledgerEntry.findUnique({ where: { id } });
      if (!entry) throw new Error("Ledger entry not found");

      // Reverse balance effect on customer if customer still exists
      if (entry.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: entry.customerId } });
        if (customer) {
          const balanceAdjustment = entry.type === 'DEBIT' ? -entry.amount : entry.amount;
          await tx.customer.update({
            where: { id: entry.customerId },
            data: { balance: { increment: balanceAdjustment } }
          });
        }
      }

      await tx.ledgerEntry.delete({ where: { id } });

      // Recalculate running balances for remaining entries
      if (entry.customerId) {
        const remaining = await tx.ledgerEntry.findMany({
          where: { customerId: entry.customerId },
          orderBy: { date: 'asc', createdAt: 'asc' }
        });
        let runningBal = 0;
        for (const rem of remaining) {
          runningBal += rem.type === 'DEBIT' ? rem.amount : -rem.amount;
          await tx.ledgerEntry.update({ where: { id: rem.id }, data: { runningBalance: runningBal } });
        }
      }
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteBatch(data) {
  const { id } = data;
  if (!id) return { success: false, error: "Batch ID is required" };
  try {
    const batch = await prisma.productBatch.findUnique({ where: { id } });
    if (!batch) return { success: false, error: "Batch not found" };

    const saleItemCount = await prisma.saleItem.count({ where: { batchId: id } });
    if (saleItemCount > 0) {
      return { success: false, error: "Cannot delete batch linked to sale records. Delete the sale invoices first." };
    }

    await prisma.$transaction(async (tx) => {
      // Reverse any production consumption that used this batch as ingredient
      const prodItems = await tx.productionItem.findMany({ where: { batchId: id } });
      for (const pi of prodItems) {
        // Restore consumed quantity back to this batch
        await tx.productBatch.update({
          where: { id },
          data: { quantity: { increment: pi.quantityConsumed } }
        });
        // Create reversal stock movement
        await tx.stockMovement.create({
          data: {
            productId: pi.productId,
            batchId: id,
            type: "PRODUCTION_CONSUMPTION_REVERSAL",
            quantity: pi.quantityConsumed,
            unit: "kg",
            description: `Reversed consumption: batch ${batch.batchNumber} deleted`
          }
        });
        // Remove the production item link
        await tx.productionItem.delete({ where: { id: pi.id } });
      }

      await tx.stockMovement.deleteMany({ where: { batchId: id } });
      await tx.productBatch.delete({ where: { id } });
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateRecipe(data) {
  const { id, name, items } = data;
  if (!id) return { success: false, error: "Recipe ID is required" };
  try {
    const updateData = {};
    if (name) updateData.name = name;
    if (items && items.length > 0) {
      const validItems = items.filter(i => i.productId && parseFloat(i.quantity) > 0);
      const totalWeightKg = validItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);
      updateData.outputQuantity = totalWeightKg > 0 ? totalWeightKg : 1;

      // Delete existing items and recreate
      await prisma.recipeItem.deleteMany({ where: { recipeId: id } });
      await prisma.recipe.update({
        where: { id },
        data: {
          ...updateData,
          recipeItems: {
            create: validItems.map(item => ({
              productId: item.productId,
              quantity: parseFloat(item.quantity) || 0,
              unit: "kg"
            }))
          }
        }
      });
    } else {
      await prisma.recipe.update({ where: { id }, data: updateData });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteRecipe(data) {
  const { id } = data;
  if (!id) return { success: false, error: "Recipe ID is required" };
  try {
    const recipe = await prisma.recipe.findUnique({ where: { id } });
    if (!recipe) return { success: false, error: "Recipe not found." };
    const prodCount = await prisma.production.count({ where: { recipeId: id } });
    if (prodCount > 0) {
      await prisma.production.updateMany({ where: { recipeId: id }, data: { recipeId: null } });
    }
    await prisma.recipeItem.deleteMany({ where: { recipeId: id } });
    await prisma.recipe.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateExpense(data) {
  const { id, category, amount, description, date } = data;
  if (!id) return { success: false, error: "Expense ID is required" };
  try {
    const updated = await prisma.expense.update({
      where: { id },
      data: {
        category: category || undefined,
        amount: amount ? parseFloat(amount) : undefined,
        description: description !== undefined ? description : undefined,
        date: date ? new Date(date) : undefined
      }
    });
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteExpense(data) {
  const { id } = data;
  if (!id) return { success: false, error: "Expense ID is required" };
  try {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Expense not found." };
    await prisma.expense.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- Extra Addons ---

async function createSaleAddons(data) {
  const { saleId, addons } = data;
  if (!saleId || !addons || !Array.isArray(addons)) return { success: false, error: "Sale ID and addons array required" };
  try {
    const created = [];
    for (const addon of addons) {
      const a = await prisma.saleAddon.create({
        data: {
          saleId,
          title: addon.title || "Extra Charge",
          amount: parseFloat(addon.amount) || 0
        }
      });
      created.push(a);
    }
    return { success: true, data: created };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- Partner Withdrawals ---

async function getPartnerWithdrawals() {
  try {
    const withdrawals = await prisma.partnerWithdrawal.findMany({ orderBy: { createdAt: 'desc' } });
    return { success: true, data: withdrawals };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function createPartnerWithdrawal(data) {
  const { partnerName, amount, note } = data;
  if (!partnerName || !amount) return { success: false, error: "Partner name and amount required" };
  try {
    const w = await prisma.partnerWithdrawal.create({
      data: {
        partnerName,
        amount: parseFloat(amount),
        note: note || null
      }
    });
    return { success: true, data: w };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deletePartnerWithdrawal(data) {
  const { id } = data;
  if (!id) return { success: false, error: "ID required" };
  try {
    const existing = await prisma.partnerWithdrawal.findUnique({ where: { id } });
    if (!existing) return { success: false, error: "Withdrawal not found." };
    await prisma.partnerWithdrawal.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- Daily Profit ---

async function getDailyProfit() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const todaySales = await prisma.sale.aggregate({
      _sum: { netAmount: true, discount: true },
      where: { saleDate: { gte: today, lt: tomorrow } }
    });

    const todaySaleItems = await prisma.saleItem.findMany({
      where: { sale: { saleDate: { gte: today, lt: tomorrow } } },
      select: { quantity: true, sellingPrice: true, costPrice: true, saleId: true }
    });

    let todayRevenue = 0;
    let todayCOGS = 0;
    for (const item of todaySaleItems) {
      todayRevenue += item.quantity * item.sellingPrice;
      todayCOGS += item.quantity * item.costPrice;
    }

    const todayExpenses = await prisma.expense.aggregate({
      _sum: { amount: true },
      where: { date: { gte: today, lt: tomorrow } }
    });

    const salesTotal = todaySales._sum.netAmount || 0;
    const grossProfit = todayRevenue - todayCOGS;

    console.log(`[DailyProfit] rev=${todayRevenue} cogs=${todayCOGS} gross=${grossProfit} sales=${salesTotal} items=${todaySaleItems.length}`);
    const expensesTotal = todayExpenses._sum.amount || 0;
    const netProfit = grossProfit - expensesTotal;

    const sohaibTotal = await prisma.partnerWithdrawal.aggregate({
      _sum: { amount: true },
      where: { partnerName: { contains: 'sohaib', mode: 'insensitive' } }
    });
    const tayyabTotal = await prisma.partnerWithdrawal.aggregate({
      _sum: { amount: true },
      where: { partnerName: { contains: 'tayyab', mode: 'insensitive' } }
    });
    const aqibTotal = await prisma.partnerWithdrawal.aggregate({
      _sum: { amount: true },
      where: { partnerName: { contains: 'aqib', mode: 'insensitive' } }
    });

    return {
      success: true,
      data: {
        todaySales: salesTotal,
        todayGrossProfit: grossProfit,
        todayNetProfit: netProfit,
        todayExpenses: expensesTotal,
        sohaibWithdrawn: sohaibTotal._sum.amount || 0,
        tayyabWithdrawn: tayyabTotal._sum.amount || 0,
        aqibWithdrawn: aqibTotal._sum.amount || 0
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Reset Database Utility
async function resetDatabase() {
  try {
    await prisma.$transaction([
      prisma.stockMovement.deleteMany(),
      prisma.productionItem.deleteMany(),
      prisma.production.deleteMany(),
      prisma.recipeItem.deleteMany(),
      prisma.recipe.deleteMany(),
      prisma.saleItem.deleteMany(),
      prisma.ledgerEntry.deleteMany(),
      prisma.sale.deleteMany(),
      prisma.purchaseItem.deleteMany(),
      prisma.productBatch.deleteMany(),
      prisma.purchase.deleteMany(),
      prisma.product.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.supplier.deleteMany(),
      prisma.expense.deleteMany(),
      prisma.mainBranchTransaction.deleteMany(),
      prisma.saleAddon.deleteMany(),
      prisma.partnerWithdrawal.deleteMany(),
      prisma.cashBox.deleteMany()
    ]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
