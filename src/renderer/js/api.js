/**
 * API Wrapper - Integrates UI components with whitelisted IPC calls to the main process.
 */

const API = {
  /**
   * Helper to perform database actions
   * @param {string} action
   * @param {object} [data]
   * @returns {Promise<any>}
   */
  async dbAction(action, data = {}) {
    if (!window.api || !window.api.invoke) {
      console.error("[API Error] Secure window.api context bridge is not available.");
      return { success: false, error: "System context bridge offline" };
    }
    return await window.api.invoke('db-action', { action, data });
  },

  // --- Phase 1: Dashboard Operations ---
  async getDashboardSummary() {
    return await this.dbAction('get-dashboard-summary');
  },

  async getRecentTransactions() {
    return await this.dbAction('get-recent-transactions');
  },

  async getLowStockAlerts() {
    return await this.dbAction('get-low-stock-alerts');
  },

  // --- Phase 2: Product & Supplier Operations ---
  async getProducts() {
    return await this.dbAction('get-products');
  },

  async createProduct(payload) {
    return await this.dbAction('create-product', payload);
  },

  async getProductDetails(productId) {
    return await this.dbAction('get-product-details', { productId });
  },

  async getSuppliers() {
    return await this.dbAction('get-suppliers');
  },

  async createSupplier(payload) {
    return await this.dbAction('create-supplier', payload);
  },

  async createPurchase(payload) {
    return await this.dbAction('create-purchase', payload);
  },

  async adjustStock(payload) {
    return await this.dbAction('adjust-stock', payload);
  },

  async getBatches() {
    return await this.dbAction('get-batches');
  },

  // --- Phase 3: Customers & Khata Ledger ---
  async getCustomers() {
    return await this.dbAction('get-customers');
  },

  async createCustomer(payload) {
    return await this.dbAction('create-customer', payload);
  },

  async getCustomerLedger(customerId) {
    return await this.dbAction('get-customer-ledger', { customerId });
  },

  async receiveCustomerPayment(payload) {
    return await this.dbAction('receive-customer-payment', payload);
  },

  // --- Phase 4: POS Sales Billing ---
  async createSale(payload) {
    return await this.dbAction('create-sale', payload);
  },

  async getSaleByInvoice(invoiceNumber) {
    return await this.dbAction('get-sale-by-invoice', { invoiceNumber });
  },

  // --- Phase 5: Wanda Manufacturing Recipes ---
  async getRecipes() {
    return await this.dbAction('get-recipes');
  },

  async createRecipe(payload) {
    return await this.dbAction('create-recipe', payload);
  },

  async executeProduction(payload) {
    return await this.dbAction('execute-production', payload);
  },

  // --- Phase 6: Main Branch Payables Accounting ---
  async getBranchTransactions() {
    return await this.dbAction('get-branch-transactions');
  },

  async createBranchTransaction(payload) {
    return await this.dbAction('create-branch-transaction', payload);
  },

  // --- Phase 7: Operational Expenses ---
  async getExpenses() {
    return await this.dbAction('get-expenses');
  },

  async createExpense(payload) {
    return await this.dbAction('create-expense', payload);
  },
  async updateCustomer(payload) {
    return await this.dbAction('update-customer', payload);
  },
  async deleteCustomer(payload) {
    return await this.dbAction('delete-customer', payload);
  },
  async updateProduct(payload) {
    return await this.dbAction('update-product', payload);
  },
  async deleteProduct(payload) {
    return await this.dbAction('delete-product', payload);
  },
  async deleteSale(payload) {
    return await this.dbAction('delete-sale', payload);
  },
  async deleteLedgerEntry(payload) {
    return await this.dbAction('delete-ledger-entry', payload);
  },
  async deleteBatch(payload) {
    return await this.dbAction('delete-batch', payload);
  },
  async updateRecipe(payload) {
    return await this.dbAction('update-recipe', payload);
  },
  async deleteRecipe(payload) {
    return await this.dbAction('delete-recipe', payload);
  },
  async updateExpense(payload) {
    return await this.dbAction('update-expense', payload);
  },
  async deleteExpense(payload) {
    return await this.dbAction('delete-expense', payload);
  },
  async createSaleAddons(payload) {
    return await this.dbAction('create-sale-addons', payload);
  },
  async getPartnerWithdrawals() {
    return await this.dbAction('get-partner-withdrawals');
  },
  async createPartnerWithdrawal(payload) {
    return await this.dbAction('create-partner-withdrawal', payload);
  },
  async deletePartnerWithdrawal(payload) {
    return await this.dbAction('delete-partner-withdrawal', payload);
  },
  async getDailyProfit() {
    return await this.dbAction('get-daily-profit');
  },

  // --- Cash Box ---
  async cashBoxDeposit(payload) {
    return await this.dbAction('cash-box-deposit', payload);
  },

  async cashBoxWithdraw(payload) {
    return await this.dbAction('cash-box-withdraw', payload);
  },

  async getCashBoxBalance() {
    return await this.dbAction('get-cash-box-balance');
  },

  async getCashBoxTransactions() {
    return await this.dbAction('get-cash-box-transactions');
  },

  // --- Phase 8: Reports & Settings ---
  async getReportsData(filters = {}) {
    return await this.dbAction('get-reports-data', filters);
  },

  async resetDatabase() {
    return await this.dbAction('reset-database');
  }
};

export default API;
