import BaseView from './baseView.js';
import API from '../api.js';
import Converter from '../utils/unitConverter.js';

export default class InventoryView extends BaseView {
  constructor() {
    super();
    this.batches = [];
    this.products = [];
    this.suppliers = [];
    this.activeTab = 'batches'; // 'batches' | 'purchase' | 'adjust'
    
    // Purchase Form State
    this.purchaseRows = [{ productId: '', quantity: 1, costPrice: 0, unit: 'kg', subtotal: 0 }];
  }

  async preRender() {
    const batchesRes = await API.getBatches();
    const productsRes = await API.getProducts();
    const suppliersRes = await API.getSuppliers();

    if (batchesRes.success) this.batches = batchesRes.data;
    if (productsRes.success) this.products = productsRes.data;
    if (suppliersRes.success) this.suppliers = suppliersRes.data;
  }

  render() {
    const formatPKR = (num) => {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0
      }).format(num).replace('PKR', 'Rs.');
    };

    return `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold text-slate-100">Stock & Intake Management</h1>
            <p class="text-sm text-slate-400">Track active FIFO batches, record purchases, and run stock audits</p>
          </div>
        </div>

        <!-- Sub Tab Navigation -->
        <div class="border-b border-slate-700/40 flex gap-6">
          <button id="tab-batches" class="pb-3 text-sm font-semibold border-b-2 transition-active ${
            this.activeTab === 'batches' ? 'border-brand-500 text-brand-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }">Active FIFO Batches</button>
          <button id="tab-purchase" class="pb-3 text-sm font-semibold border-b-2 transition-active ${
            this.activeTab === 'purchase' ? 'border-brand-500 text-brand-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }">Intake Purchases (Invoice)</button>
          <button id="tab-adjust" class="pb-3 text-sm font-semibold border-b-2 transition-active ${
            this.activeTab === 'adjust' ? 'border-brand-500 text-brand-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }">Manual Adjust Stock</button>
        </div>

        <!-- Tab Contents viewport -->
        <div id="inventory-viewport" class="transition-all duration-150">
          ${this.renderActiveTab(formatPKR)}
        </div>
      </div>
    `;
  }

  renderActiveTab(formatPKR) {
    if (this.activeTab === 'batches') {
      return this.renderBatchesTab(formatPKR);
    } else if (this.activeTab === 'purchase') {
      return this.renderPurchaseTab(formatPKR);
    } else if (this.activeTab === 'adjust') {
      return this.renderAdjustTab();
    }
  }

  renderBatchesTab(formatPKR) {
    return `
      <div class="bg-darkbg-800 border border-slate-700/30 rounded-xl overflow-hidden">
        <div class="p-5 border-b border-slate-700/30 flex justify-between bg-darkbg-900/10">
          <h3 class="text-sm font-bold text-slate-200">Active Batches in Store</h3>
          <span class="text-xs text-slate-400">Total: ${this.batches.length} active batches</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-slate-700/60 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-darkbg-900/40">
                <th class="py-3.5 px-6">Batch Number</th>
                <th class="py-3.5 px-6">Product</th>
                <th class="py-3.5 px-6">Cost Price</th>
                <th class="py-3.5 px-6">Remaining Qty</th>
                <th class="py-3.5 px-6">Supplier</th>
                <th class="py-3.5 px-6">Received Date</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-700/30 text-sm text-slate-300">
              ${this.batches.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-12 text-center text-slate-500">No active batches logged yet.</td>
                </tr>
              ` : this.batches.map(b => {
                const displayQty = Converter.formatQty(b.quantity, b.product.unit);
                const displayCost = b.product.unit === 'bag' ? formatPKR(b.costPrice * 40) + ' /bag' : formatPKR(b.costPrice) + ' /kg';
                const formattedDate = new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                return `
                  <tr class="hover:bg-slate-700/10 transition-colors">
                    <td class="py-3.5 px-6 font-mono text-brand-400 font-medium">${b.batchNumber}</td>
                    <td class="py-3.5 px-6 font-bold text-slate-200">${b.product.name}</td>
                    <td class="py-3.5 px-6 font-semibold text-sky-400">${displayCost}</td>
                    <td class="py-3.5 px-6 font-bold ${b.quantity <= 0 ? 'text-slate-500' : 'text-slate-200'}">${displayQty}</td>
                    <td class="py-3.5 px-6 text-slate-400">${b.supplier ? b.supplier.name : 'Internal Production'}</td>
                    <td class="py-3.5 px-6 text-xs text-slate-500">${formattedDate}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderPurchaseTab(formatPKR) {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Form Left -->
        <div class="lg:col-span-2 space-y-6">
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-5">
            <h3 class="text-base font-bold text-slate-100 pb-3 border-b border-slate-700/40">Log Supplier Purchase Invoice</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Invoice No -->
              <div class="space-y-1.5">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Invoice Number</label>
                <input type="text" id="pur-invoice-no" placeholder="e.g. INV-9988" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none text-sm transition-active">
              </div>

              <!-- Supplier -->
              <div class="space-y-1.5">
                <div class="flex justify-between items-center">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Supplier</label>
                  <button id="btn-quick-supplier" class="text-[10px] text-brand-400 font-bold hover:underline">Quick Add</button>
                </div>
                <select id="pur-supplier" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                  <option value="">-- Select Supplier --</option>
                  ${this.suppliers.map(s => `<option value="${s.id}">${s.name} (Bal: ${formatPKR(s.balance)})</option>`).join('')}
                </select>
              </div>

              <!-- Date -->
              <div class="space-y-1.5">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Purchase Date</label>
                <input type="date" id="pur-date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
              </div>
            </div>

            <!-- Dynamic Purchase Items rows -->
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Invoice Line Items</label>
                <button id="btn-add-row" class="text-xs text-brand-400 font-bold hover:underline flex items-center gap-1">
                  + Add Item Row
                </button>
              </div>

              <div class="border border-slate-700/30 rounded-xl overflow-hidden">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="bg-darkbg-900/40 border-b border-slate-700/40 text-slate-400 font-bold uppercase tracking-wider">
                      <th class="py-3 px-4 w-5/12">Product</th>
                      <th class="py-3 px-4 w-2/12">Unit</th>
                      <th class="py-3 px-4 w-2/12">Quantity</th>
                      <th class="py-3 px-4 w-2/12">Cost / Unit</th>
                      <th class="py-3 px-4 w-1/12 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody id="purchase-rows-container" class="divide-y divide-slate-700/30">
                    <!-- Injected rows -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Calculations Right -->
        <div class="space-y-6">
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Checkout Summary</h3>

            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between text-slate-400">
                <span>Items Subtotal:</span>
                <span id="summary-subtotal" class="font-bold text-slate-200">Rs. 0</span>
              </div>
              <div class="flex justify-between text-slate-400 border-b border-slate-700/40 pb-3">
                <span>Total Items Count:</span>
                <span id="summary-count" class="font-bold text-slate-200">0</span>
              </div>

              <div class="flex justify-between text-base font-bold text-slate-100 pt-2">
                <span>Payable Amount:</span>
                <span id="summary-total" class="text-brand-400">Rs. 0</span>
              </div>
            </div>

            <!-- Payments Inputs -->
            <div class="space-y-3 pt-3 border-t border-slate-700/40">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="pur-main-branch" class="w-4 h-4 rounded border-slate-600 text-brand-500 focus:ring-brand-500 bg-darkbg-900">
                <span class="text-xs font-semibold text-slate-300">Payment made by Main Branch (we owe head office)</span>
              </label>

              <div id="pur-mb-amount-wrap" class="space-y-1.5 hidden">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Amount Main Branch Paid (Rs.)</label>
                <input type="number" id="pur-mb-amount" value="0" min="0" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none transition-active">
              </div>

              <div class="space-y-1.5">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Paid by Us (Rs.)</label>
                <input type="number" id="pur-paid-amount" value="0" min="0" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none transition-active">
              </div>

              <div class="space-y-1.5">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Still Owed to Supplier</label>
                <div id="pur-owed-amount" class="w-full px-4 py-2.5 bg-darkbg-900/50 border border-slate-700 rounded-lg text-rose-400 text-sm font-bold">
                  Rs. 0
                </div>
              </div>
            </div>

            <div id="purchase-error" class="hidden text-xs text-rose-500 p-3 bg-rose-500/10 rounded-lg border border-rose-500/10 font-semibold leading-relaxed"></div>

            <button id="btn-submit-purchase" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/10 transition-active">
              Save Purchase Invoice
            </button>
          </div>
        </div>

        <!-- Supplier Modal popover -->
        <div id="modal-supplier" class="fixed inset-0 z-50 overflow-y-auto hidden">
          <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
            <div id="sup-overlay" class="fixed inset-0 bg-darkbg-900/60 backdrop-blur-sm transition-opacity"></div>
            
            <div class="inline-block align-middle bg-darkbg-800 rounded-xl text-left border border-slate-700/30 overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-md sm:w-full">
              <div class="px-6 py-4 bg-darkbg-900/40 border-b border-slate-700/30 flex justify-between items-center">
                <h3 class="text-sm font-bold text-slate-100">Add New Supplier Profile</h3>
                <button id="sup-close" class="text-slate-400 hover:text-slate-200">
                  <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <form id="form-supplier" class="p-6 space-y-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Supplier Name *</label>
                  <input type="text" name="sup-name" required placeholder="e.g. Sargodha Grain Traders" class="w-full px-4 py-2 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Phone Number</label>
                  <input type="text" name="sup-phone" placeholder="e.g. 0300-1234567" class="w-full px-4 py-2 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Address</label>
                  <input type="text" name="sup-address" placeholder="e.g. Grain Market, Sargodha" class="w-full px-4 py-2 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Initial Balance Owed (Rs.)</label>
                  <input type="number" name="sup-balance" value="0" class="w-full px-4 py-2 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
                </div>
                <div id="sup-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-2 border border-rose-500/10 rounded font-semibold"></div>
                <div class="pt-3 border-t border-slate-700/40 flex justify-end gap-2">
                  <button type="button" id="btn-cancel-sup" class="px-4 py-2 bg-slate-700 text-slate-300 rounded text-xs font-semibold">Cancel</button>
                  <button type="submit" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded text-xs font-bold">Save Supplier</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderAdjustTab() {
    return `
      <div class="max-w-xl mx-auto p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-5">
        <h3 class="text-base font-bold text-slate-100 pb-3 border-b border-slate-700/40">Record Manual Stock Adjustment</h3>
        
        <form id="form-adjustment" class="space-y-4">
          <!-- Select Product -->
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Product</label>
            <select id="adj-product" required class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
              <option value="">-- Choose Product --</option>
              ${this.products.map(p => `<option value="${p.id}" data-unit="${p.unit}">${p.name} (Stock: ${Converter.formatQty(p.totalStock, p.unit)})</option>`).join('')}
            </select>
          </div>

          <!-- Select Batch (Dynamically Loaded) -->
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Select Stock Batch</label>
            <select id="adj-batch" required disabled class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 disabled:opacity-50 focus:border-brand-500 focus:outline-none text-sm transition-active">
              <option value="">-- Choose Product First --</option>
            </select>
          </div>

          <!-- Adjustment Qty & Unit -->
          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-2 space-y-1.5">
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Adjustment Amount</label>
              <input type="number" step="any" id="adj-qty" required placeholder="Negative for spill, positive for find" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none transition-active">
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Unit</label>
              <div id="adj-unit-display" class="w-full px-4 py-2.5 bg-darkbg-900/60 border border-slate-700 rounded-lg text-slate-400 text-sm font-semibold select-none">
                kg
              </div>
            </div>
          </div>

          <!-- Description Reason -->
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Reason / Audit Justification *</label>
            <input type="text" id="adj-reason" required placeholder="e.g. Spillage during transport, Rat damage bag #2" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
          </div>

          <div id="adj-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold leading-relaxed"></div>

          <button type="submit" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/5 transition-active">
            Execute Adjustment
          </button>
        </form>
      </div>
    `;
  }

  async postRender() {
    this.setupTabsNavigation();

    if (this.activeTab === 'purchase') {
      this.setupPurchaseForm();
    } else if (this.activeTab === 'adjust') {
      this.setupAdjustmentForm();
    }
  }

  setupTabsNavigation() {
    const bindTab = (id, tabName) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', async () => {
          this.activeTab = tabName;
          await this.mount(this.container);
        });
      }
    };

    bindTab('tab-batches', 'batches');
    bindTab('tab-purchase', 'purchase');
    bindTab('tab-adjust', 'adjust');
  }

  // --- Purchase Builder Form Logic ---
  setupPurchaseForm() {
    const rowsContainer = document.getElementById('purchase-rows-container');
    const btnAddRow = document.getElementById('btn-add-row');
    const inputPaid = document.getElementById('pur-paid-amount');
    const chkMainBranch = document.getElementById('pur-main-branch');
    const mbAmountWrap = document.getElementById('pur-mb-amount-wrap');
    const inputMbAmount = document.getElementById('pur-mb-amount');
    const btnSubmit = document.getElementById('btn-submit-purchase');
    const btnSupplierQuick = document.getElementById('btn-quick-supplier');

    const updateCalculations = () => {
      let subtotal = 0;
      let itemsCount = 0;

      this.purchaseRows.forEach(row => {
        subtotal += row.subtotal;
        if (row.productId) itemsCount++;
      });

      document.getElementById('summary-subtotal').innerText = `Rs. ${subtotal.toLocaleString()}`;
      document.getElementById('summary-total').innerText = `Rs. ${subtotal.toLocaleString()}`;
      document.getElementById('summary-count').innerText = itemsCount;

      const paid = parseFloat(inputPaid.value) || 0.0;
      const mbPaid = chkMainBranch.checked;
      let mbAmount = mbPaid ? (parseFloat(inputMbAmount.value) || subtotal) : 0;
      if (mbPaid && !inputMbAmount.dataset.touched) {
        inputMbAmount.value = subtotal;
        mbAmount = subtotal;
      }
      const owed = Math.max(0, subtotal - paid - mbAmount);

      const owedDiv = document.getElementById('pur-owed-amount');
      owedDiv.innerText = `Rs. ${owed.toLocaleString()}`;
      if (owed > 0) {
        owedDiv.classList.remove('text-slate-300', 'text-green-400');
        owedDiv.classList.add('text-rose-400');
      } else {
        owedDiv.classList.remove('text-rose-400');
        owedDiv.classList.add('text-green-400');
      }
    };

    chkMainBranch.addEventListener('change', () => {
      mbAmountWrap.classList.toggle('hidden', !chkMainBranch.checked);
      if (chkMainBranch.checked) {
        let subtotal = 0;
        this.purchaseRows.forEach(row => { subtotal += row.subtotal; });
        inputMbAmount.value = subtotal;
        delete inputMbAmount.dataset.touched;
      }
      updateCalculations();
    });
    inputMbAmount.addEventListener('input', () => {
      inputMbAmount.dataset.touched = '1';
      updateCalculations();
    });

    const renderRows = () => {
      rowsContainer.innerHTML = this.purchaseRows.map((row, index) => {
        return `
          <tr class="hover:bg-slate-700/10 transition-colors">
            <td class="py-3 px-4">
              <select data-row-idx="${index}" data-field="productId" class="w-full px-2.5 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:border-brand-500 focus:outline-none">
                <option value="">-- Choose Product --</option>
                ${this.products.map(p => `<option value="${p.id}" ${row.productId === p.id ? 'selected' : ''}>${p.name} (${p.sku})</option>`).join('')}
              </select>
            </td>
            <td class="py-3 px-4">
              <select data-row-idx="${index}" data-field="unit" class="w-full px-2.5 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:border-brand-500 focus:outline-none">
                <option value="kg" ${row.unit === 'kg' ? 'selected' : ''}>kg</option>
                <option value="bag" ${row.unit === 'bag' ? 'selected' : ''}>bag (40kg)</option>
              </select>
            </td>
            <td class="py-3 px-4">
              <input type="number" step="any" min="0.1" value="${row.quantity}" data-row-idx="${index}" data-field="quantity" class="w-full px-2.5 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:border-brand-500 focus:outline-none font-bold">
            </td>
            <td class="py-3 px-4">
              <input type="number" step="any" min="0" value="${row.costPrice}" data-row-idx="${index}" data-field="costPrice" class="w-full px-2.5 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:border-brand-500 focus:outline-none font-bold">
            </td>
            <td class="py-3 px-4 text-right font-bold text-slate-200 pr-4">
              Rs. ${row.subtotal.toLocaleString()}
            </td>
          </tr>
        `;
      }).join('');
      
      // Hook up change events
      const selectors = rowsContainer.querySelectorAll('[data-row-idx]');
      selectors.forEach(el => {
        el.addEventListener('change', (e) => {
          const idx = parseInt(e.target.getAttribute('data-row-idx'));
          const field = e.target.getAttribute('data-field');
          const val = e.target.value;

          if (field === 'productId') {
            this.purchaseRows[idx].productId = val;
            // Autofill unit based on product standard if needed
            const prod = this.products.find(p => p.id === val);
            if (prod) {
              this.purchaseRows[idx].unit = prod.unit;
            }
          } else if (field === 'unit') {
            this.purchaseRows[idx].unit = val;
          } else if (field === 'quantity') {
            this.purchaseRows[idx].quantity = parseFloat(val) || 0.0;
          } else if (field === 'costPrice') {
            this.purchaseRows[idx].costPrice = parseFloat(val) || 0.0;
          }

          // Recalculate row subtotal
          this.purchaseRows[idx].subtotal = this.purchaseRows[idx].quantity * this.purchaseRows[idx].costPrice;
          
          renderRows();
          updateCalculations();
        });
      });
    };

    btnAddRow.addEventListener('click', () => {
      this.purchaseRows.push({ productId: '', quantity: 1, costPrice: 0, unit: 'kg', subtotal: 0 });
      renderRows();
      updateCalculations();
    });

    inputPaid.addEventListener('input', updateCalculations);

    // Dynamic Selections setup
    renderRows();
    updateCalculations();

    // Supplier Quick Modal Logic
    this.setupQuickSupplierModal(btnSupplierQuick);

    // Save Invoicing Transaction
    btnSubmit.addEventListener('click', async () => {
      const errDiv = document.getElementById('purchase-error');
      errDiv.classList.add('hidden');

      const invoiceNumber = document.getElementById('pur-invoice-no').value;
      const supplierId = document.getElementById('pur-supplier').value;
      const purchaseDate = document.getElementById('pur-date').value;
      const paidAmount = parseFloat(inputPaid.value) || 0.0;

      // Filter empty rows
      const validItems = this.purchaseRows.filter(row => row.productId && row.quantity > 0 && row.costPrice > 0);
      if (validItems.length === 0) {
        errDiv.innerText = "Please complete at least one item row with product, quantity, and cost price.";
        errDiv.classList.remove('hidden');
        return;
      }

      const totalAmount = validItems.reduce((sum, item) => sum + item.subtotal, 0);

      const paidByMainBranch = chkMainBranch && chkMainBranch.checked;
      const mainBranchAmount = paidByMainBranch ? (parseFloat(inputMbAmount.value) || totalAmount) : 0;

      if (paidByMainBranch && mainBranchAmount <= 0) {
        errDiv.innerText = "Enter the amount main branch paid for this purchase.";
        errDiv.classList.remove('hidden');
        return;
      }

      const payload = {
        supplierId: supplierId || null,
        invoiceNumber,
        purchaseDate,
        totalAmount,
        paidAmount,
        paidByMainBranch: paidByMainBranch,
        mainBranchPaid: paidByMainBranch,
        paymentSource: paidByMainBranch ? 'MAIN_BRANCH' : 'SHOP',
        mainBranchAmount,
        items: validItems.map(row => ({
          productId: row.productId,
          quantity: row.quantity,
          costPrice: row.costPrice,
          unit: row.unit
        }))
      };

      btnSubmit.disabled = true;
      btnSubmit.innerText = "Saving Transaction...";

      const res = await API.createPurchase(payload);
      if (res.success) {
        // Reset and jump to active batches tab
        this.purchaseRows = [{ productId: '', quantity: 1, costPrice: 0, unit: 'kg', subtotal: 0 }];
        this.activeTab = 'batches';
        await this.mount(this.container);
      } else {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "Save Purchase Invoice";
        errDiv.innerText = res.error || "Failed to submit purchase.";
        errDiv.classList.remove('hidden');
      }
    });
  }

  setupQuickSupplierModal(triggerBtn) {
    const modal = document.getElementById('modal-supplier');
    const overlay = document.getElementById('sup-overlay');
    const closeBtn = document.getElementById('sup-close');
    const cancelBtn = document.getElementById('btn-cancel-sup');
    const form = document.getElementById('form-supplier');
    const errDiv = document.getElementById('sup-error');

    const open = () => {
      modal.classList.remove('hidden');
    };

    const close = () => {
      modal.classList.add('hidden');
      form.reset();
      errDiv.classList.add('hidden');
    };

    triggerBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      const formData = new FormData(form);
      const name = formData.get('sup-name');
      const phone = formData.get('sup-phone') || '';
      const address = formData.get('sup-address') || '';
      const initialBalance = parseFloat(formData.get('sup-balance')) || 0.0;

      if (!name) return;

      const res = await API.createSupplier({ name, phone, address, initialBalance });
      if (res.success) {
        // Reload list and update purchase supplier dropdown selection
        const suppliersRes = await API.getSuppliers();
        if (suppliersRes.success) {
          this.suppliers = suppliersRes.data;
          
          // Re-render supplier dropdown in background
          const selectEl = document.getElementById('pur-supplier');
          const selectedVal = res.data.id;
          
          selectEl.innerHTML = `
            <option value="">-- Select Supplier --</option>
            ${this.suppliers.map(s => `<option value="${s.id}" ${s.id === selectedVal ? 'selected' : ''}>${s.name} (Bal: Rs. ${s.balance})</option>`).join('')}
          `;
        }
        close();
      } else {
        errDiv.innerText = res.error || "Failed to add supplier.";
        errDiv.classList.remove('hidden');
      }
    });
  }

  // --- Manual Adjustment Logic ---
  setupAdjustmentForm() {
    const selectProd = document.getElementById('adj-product');
    const selectBatch = document.getElementById('adj-batch');
    const labelUnit = document.getElementById('adj-unit-display');
    const form = document.getElementById('form-adjustment');
    const errDiv = document.getElementById('adj-error');

    selectProd.addEventListener('change', async (e) => {
      const prodId = e.target.value;
      selectBatch.innerHTML = '<option value="">-- Loading Batches --</option>';
      selectBatch.disabled = true;
      labelUnit.innerText = 'kg';

      if (!prodId) {
        selectBatch.innerHTML = '<option value="">-- Choose Product First --</option>';
        return;
      }

      // Update unit label display
      const selectedOption = selectProd.options[selectProd.selectedIndex];
      const unit = selectedOption.getAttribute('data-unit') || 'kg';
      labelUnit.innerText = unit;

      // Fetch detail batches
      const res = await API.getProductDetails(prodId);
      if (res.success && res.data.batches) {
        const activeBatches = res.data.batches.filter(b => b.quantity > 0);
        if (activeBatches.length === 0) {
          selectBatch.innerHTML = '<option value="">No active batches for this product</option>';
        } else {
          selectBatch.innerHTML = `
            <option value="">-- Choose Batch --</option>
            ${activeBatches.map(b => `<option value="${b.id}">Batch: ${b.batchNumber} (Stock: ${Converter.formatQty(b.quantity, unit)})</option>`).join('')}
          `;
          selectBatch.disabled = false;
        }
      } else {
        selectBatch.innerHTML = '<option value="">Error loading batches</option>';
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      const productId = selectProd.value;
      const batchId = selectBatch.value;
      const quantityDifference = parseFloat(document.getElementById('adj-qty').value);
      const unit = labelUnit.innerText;
      const description = document.getElementById('adj-reason').value;

      if (!productId || !batchId || isNaN(quantityDifference) || quantityDifference === 0 || !description) {
        errDiv.innerText = "Please complete all fields with a valid adjustment weight.";
        errDiv.classList.remove('hidden');
        return;
      }

      const res = await API.adjustStock({ productId, batchId, quantityDifference, unit, description });
      if (res.success) {
        // Reset and jump to batches list
        this.activeTab = 'batches';
        await this.mount(this.container);
      } else {
        errDiv.innerText = res.error || "Adjustment transaction failed.";
        errDiv.classList.remove('hidden');
      }
    });
  }
}
