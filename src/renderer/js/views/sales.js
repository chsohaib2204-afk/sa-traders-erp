import BaseView from './baseView.js';
import API from '../api.js';
import Converter, { BAG_TO_KG } from '../utils/unitConverter.js';

export default class SalesView extends BaseView {
  constructor() {
    super();
    this.customers = [];
    this.products = [];
    this.batches = [];
    this.invoiceNo = '';
    this.selectedCustomerId = '';
    this.paymentMethod = 'CASH'; // 'CASH' | 'CREDIT' | 'BANK' | 'MAIN_BRANCH'
    
    // POS Items rows — batchId chosen by user (no auto FIFO)
    this.saleRows = [{ productId: '', batchId: '', quantity: 1, sellingPrice: 0, unit: 'bag', priceType: 'default', subtotal: 0 }];
    this.discount = 0;
  }

  async preRender() {
    const custRes = await API.getCustomers();
    const prodRes = await API.getProducts();
    const batchRes = await API.getBatches();

    if (custRes.success) this.customers = custRes.data;
    if (prodRes.success) this.products = prodRes.data;
    if (batchRes.success) this.batches = batchRes.data;

    // Generate dynamic professional invoice number
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.invoiceNo = `INV-2026-${rand}`;
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
            <h1 class="text-2xl font-bold text-slate-100">Point of Sale Invoicing</h1>
            <p class="text-sm text-slate-400">Select which stock batch to sell when prices differ</p>
          </div>
          <div class="px-4 py-2 bg-darkbg-800 border border-slate-700/30 rounded-lg text-slate-300 font-mono text-sm font-semibold">
            Invoice: <span class="text-brand-400 font-bold">${this.invoiceNo}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- POS Items Panel -->
          <div class="lg:col-span-2 space-y-6">
            <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-5">
              <h3 class="text-base font-bold text-slate-100 pb-3 border-b border-slate-700/40">Invoice Billing Details</h3>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Customer Select -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Billing Customer</label>
                  <select id="sale-customer" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    <option value="">-- Standard Cash Customer --</option>
                    ${this.customers.map(c => `<option value="${c.id}" ${this.selectedCustomerId === c.id ? 'selected' : ''}>${c.name} (${c.isLoyal ? 'Loyal' : 'Regular'} | Bal: ${formatPKR(c.balance)})</option>`).join('')}
                  </select>
                </div>

                <!-- Payment Method -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Payment Method / Terms</label>
                  <select id="sale-pay-method" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    <option value="CASH" ${this.paymentMethod === 'CASH' ? 'selected' : ''}>Instant Cash Settlement</option>
                    <option value="CREDIT" ${this.paymentMethod === 'CREDIT' ? 'selected' : ''}>Add to Khata Credit Account</option>
                    <option value="BANK" ${this.paymentMethod === 'BANK' ? 'selected' : ''}>Bank Transfer / Check</option>
                    <option value="MAIN_BRANCH" ${this.paymentMethod === 'MAIN_BRANCH' ? 'selected' : ''}>Branch Tagged (Settled by Head Office)</option>
                  </select>
                </div>
              </div>

              <!-- POS Table -->
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Invoice Line Items</label>
                  <button id="btn-add-item-row" class="text-xs text-brand-400 font-bold hover:underline flex items-center gap-1">
                    + Add Product Line
                  </button>
                </div>

                <div class="border border-slate-700/30 rounded-xl overflow-hidden bg-darkbg-900/10">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr class="bg-darkbg-900/40 border-b border-slate-700/40 text-slate-400 font-bold uppercase tracking-wider">
                        <th class="py-3 px-3">Product</th>
                        <th class="py-3 px-3">Stock Batch *</th>
                        <th class="py-3 px-3">Unit</th>
                        <th class="py-3 px-3">Qty</th>
                        <th class="py-3 px-3">Price</th>
                        <th class="py-3 px-3">Rate</th>
                        <th class="py-3 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody id="sale-rows-container" class="divide-y divide-slate-700/30">
                      <!-- Dynamic Injected POS rows -->
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Checkout Panel -->
          <div class="space-y-6">
            <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-5">
              <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Invoicing Totals</h3>

              <div class="space-y-3.5 text-sm">
                <div class="flex justify-between text-slate-400">
                  <span>Gross Subtotal:</span>
                  <span id="pos-gross" class="font-bold text-slate-200">Rs. 0</span>
                </div>

                <div class="space-y-1.5 pt-1">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Add Invoice Discount (Rs.)</label>
                  <input type="number" id="pos-discount" value="0" min="0" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none transition-active">
                </div>

                <div class="flex justify-between text-base font-bold text-slate-100 pt-2 border-t border-slate-700/40">
                  <span>Net Payable Amount:</span>
                  <span id="pos-net" class="text-emerald-400">Rs. 0</span>
                </div>

                <!-- Instant Received Payments -->
                <div class="space-y-1.5 pt-3 border-t border-slate-700/40">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Paid/Received Cash (Rs.)</label>
                  <input type="number" id="pos-received" value="0" min="0" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none transition-active">
                </div>

                <div class="flex justify-between text-xs text-slate-400">
                  <span>Owed balance added to Khata:</span>
                  <span id="pos-unpaid" class="font-bold text-rose-400">Rs. 0</span>
                </div>
              </div>

              <div id="pos-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold leading-relaxed animate-pulse"></div>

              <button id="btn-checkout-sale" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/5 transition-active">
                Save & Post POS Invoice
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.setupPOSForm();
  }

  setupPOSForm() {
    const selectCust = document.getElementById('sale-customer');
    const selectMethod = document.getElementById('sale-pay-method');
    const rowsContainer = document.getElementById('sale-rows-container');
    const btnAddRow = document.getElementById('btn-add-item-row');
    const inputDiscount = document.getElementById('pos-discount');
    const inputReceived = document.getElementById('pos-received');
    const btnCheckout = document.getElementById('btn-checkout-sale');

    const getBatchesForProduct = (productId) => {
      return this.batches.filter(b => b.productId === productId && b.quantity > 0);
    };

    const formatBatchCost = (batch, productUnit) => {
      const u = Converter.normalizeUnit(productUnit);
      const cost = u === 'bag' ? batch.costPrice * BAG_TO_KG : batch.costPrice;
      return `Cost: Rs.${Math.round(cost).toLocaleString()}/${u}`;
    };

    const pickDefaultBatch = (row) => {
      const available = getBatchesForProduct(row.productId);
      if (available.length === 1) {
        row.batchId = available[0].id;
      } else {
        row.batchId = '';
      }
    };

    const applyRowPrice = (row) => {
      const prod = this.products.find(p => p.id === row.productId);
      if (!prod) return;

      if (row.priceType === 'manual') {
        return;
      }

      const catalogPrice = Converter.getCatalogPrice(prod, row.priceType);
      row.sellingPrice = Converter.getPriceForSaleUnit(catalogPrice, prod.unit, row.unit);
      row.subtotal = row.quantity * row.sellingPrice;
    };

    const updateInvoicingTotals = () => {
      let gross = 0;
      this.saleRows.forEach(row => {
        gross += row.subtotal;
      });

      document.getElementById('pos-gross').innerText = `Rs. ${gross.toLocaleString()}`;

      const disc = parseFloat(inputDiscount.value) || 0.0;
      const net = Math.max(0, gross - disc);
      document.getElementById('pos-net').innerText = `Rs. ${net.toLocaleString()}`;

      const received = parseFloat(inputReceived.value) || 0.0;
      const unpaid = Math.max(0, net - received);

      const unpaidEl = document.getElementById('pos-unpaid');
      unpaidEl.innerText = `Rs. ${unpaid.toLocaleString()}`;
      if (unpaid > 0) {
        unpaidEl.classList.remove('text-green-400');
        unpaidEl.classList.add('text-rose-400');
      } else {
        unpaidEl.classList.remove('text-rose-400');
        unpaidEl.classList.add('text-green-400');
      }
    };

    const renderPOSRows = () => {
      rowsContainer.innerHTML = this.saleRows.map((row, index) => {
        const prod = this.products.find(p => p.id === row.productId);
        const productBatches = row.productId ? getBatchesForProduct(row.productId) : [];

        const batchOptions = productBatches.length === 0
          ? `<option value="">-- No stock batches --</option>`
          : `<option value="">-- Select batch --</option>` + productBatches.map(b => {
              const qtyLabel = prod ? Converter.formatQty(b.quantity, prod.unit) : `${b.quantity} kg`;
              const costLabel = prod ? formatBatchCost(b, prod.unit) : '';
              return `<option value="${b.id}" ${row.batchId === b.id ? 'selected' : ''}>${b.batchNumber} · ${qtyLabel} left · ${costLabel}</option>`;
            }).join('');

        return `
          <tr class="hover:bg-slate-700/10">
            <td class="py-3 px-3">
              <select data-row-idx="${index}" data-field="productId" class="w-full px-2 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-brand-500">
                <option value="">-- Choose Product --</option>
                ${this.products.map(p => {
                  const stockDisplay = Converter.formatQty(p.totalStock, p.unit);
                  return `<option value="${p.id}" ${row.productId === p.id ? 'selected' : ''}>${p.name} (Stock: ${stockDisplay})</option>`;
                }).join('')}
              </select>
            </td>
            <td class="py-3 px-3">
              <select data-row-idx="${index}" data-field="batchId" class="w-full px-2 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-brand-500 ${!row.batchId && row.productId ? 'border-amber-500/50' : ''}">
                ${batchOptions}
              </select>
            </td>
            <td class="py-3 px-3">
              <select data-row-idx="${index}" data-field="unit" class="w-full px-2 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-brand-500">
                <option value="kg" ${row.unit === 'kg' ? 'selected' : ''}>kg</option>
                <option value="bag" ${row.unit === 'bag' ? 'selected' : ''}>bag (40kg)</option>
                <option value="gram" ${row.unit === 'gram' ? 'selected' : ''}>gram</option>
              </select>
            </td>
            <td class="py-3 px-3">
              <input type="number" step="any" min="0.1" value="${row.quantity}" data-row-idx="${index}" data-field="quantity" class="w-full px-2 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs text-center font-bold focus:outline-none focus:border-brand-500">
            </td>
            <td class="py-3 px-3">
              <select data-row-idx="${index}" data-field="priceType" class="w-full px-2 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-brand-500">
                <option value="default" ${row.priceType === 'default' ? 'selected' : ''}>Default Price</option>
                <option value="loyal" ${row.priceType === 'loyal' ? 'selected' : ''}>Loyal Customer</option>
                <option value="manual" ${row.priceType === 'manual' ? 'selected' : ''}>Manual Override</option>
              </select>
            </td>
            <td class="py-3 px-3">
              <input type="number" step="any" min="0" value="${row.sellingPrice}" data-row-idx="${index}" data-field="sellingPrice" ${row.priceType !== 'manual' ? 'readonly disabled' : ''} class="w-full px-2 py-1.5 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs font-bold focus:outline-none focus:border-brand-500 disabled:opacity-60">
              <span class="text-[10px] text-slate-500 block mt-0.5">per ${row.unit || 'unit'}</span>
            </td>
            <td class="py-3 px-3 text-right pr-3 font-bold text-slate-200">
              Rs. ${row.subtotal.toLocaleString()}
            </td>
          </tr>
        `;
      }).join('');

      // Hook up change bindings
      const inputs = rowsContainer.querySelectorAll('[data-row-idx]');
      inputs.forEach(el => {
        el.addEventListener('change', (e) => {
          const idx = parseInt(e.target.getAttribute('data-row-idx'));
          const field = e.target.getAttribute('data-field');
          const val = e.target.value;

          const row = this.saleRows[idx];

          if (field === 'productId') {
            row.productId = val;
            row.batchId = '';
            const prod = this.products.find(p => p.id === val);
            if (prod) {
              row.unit = Converter.normalizeUnit(prod.unit);
              const isLoyalCust = selectCust.selectedIndex > 0 && this.customers.find(c => c.id === selectCust.value)?.isLoyal;
              row.priceType = isLoyalCust ? 'loyal' : 'default';
              pickDefaultBatch(row);
              applyRowPrice(row);
            }
          } else if (field === 'batchId') {
            row.batchId = val;
          } else if (field === 'unit') {
            const prevUnit = row.unit;
            row.unit = Converter.normalizeUnit(val);
            const prod = this.products.find(p => p.id === row.productId);
            if (prod) {
              if (row.priceType === 'manual') {
                row.sellingPrice = Converter.getPriceForSaleUnit(row.sellingPrice, prevUnit, row.unit);
              } else {
                applyRowPrice(row);
              }
            }
          } else if (field === 'quantity') {
            row.quantity = parseFloat(val) || 0.0;
          } else if (field === 'priceType') {
            row.priceType = val;
            if (val === 'manual') {
              // keep current rate; user can edit
            } else {
              applyRowPrice(row);
            }
          } else if (field === 'sellingPrice') {
            row.sellingPrice = parseFloat(val) || 0.0;
            row.priceType = 'manual';
          }

          row.subtotal = row.quantity * row.sellingPrice;
          
          renderPOSRows();
          updateInvoicingTotals();
        });
      });
    };

    btnAddRow.addEventListener('click', () => {
      this.saleRows.push({ productId: '', batchId: '', quantity: 1, sellingPrice: 0, unit: 'bag', priceType: 'default', subtotal: 0 });
      renderPOSRows();
      updateInvoicingTotals();
    });

    inputDiscount.addEventListener('input', updateInvoicingTotals);
    inputReceived.addEventListener('input', updateInvoicingTotals);

    // Adjust price options automatically when customer is changed
    selectCust.addEventListener('change', () => {
      this.selectedCustomerId = selectCust.value;
      const isLoyalCust = selectCust.selectedIndex > 0 && this.customers.find(c => c.id === selectCust.value)?.isLoyal;
      
      this.saleRows.forEach(row => {
        if (row.productId && row.priceType !== 'manual') {
          row.priceType = isLoyalCust ? 'loyal' : 'default';
          applyRowPrice(row);
        }
      });

      // Update payment option automatically. If Credit account is chosen but customer is cash, trigger warning
      if (!this.selectedCustomerId) {
        selectMethod.value = 'CASH';
        this.paymentMethod = 'CASH';
      }

      renderPOSRows();
      updateInvoicingTotals();
    });

    selectMethod.addEventListener('change', (e) => {
      this.paymentMethod = e.target.value;
      if (this.paymentMethod === 'CREDIT' && !this.selectedCustomerId) {
        alert("Please select a registered customer to add sales to their Credit Khata.");
        selectMethod.value = 'CASH';
        this.paymentMethod = 'CASH';
      }
      
      // Auto fill paid amount for full cash checks
      if (this.paymentMethod === 'CASH') {
        let gross = this.saleRows.reduce((sum, r) => sum + r.subtotal, 0);
        let disc = parseFloat(inputDiscount.value) || 0.0;
        inputReceived.value = Math.max(0, gross - disc);
      } else if (this.paymentMethod === 'CREDIT') {
        inputReceived.value = 0;
      }
      updateInvoicingTotals();
    });

    renderPOSRows();
    updateInvoicingTotals();

    // Submit checkout
    btnCheckout.addEventListener('click', async () => {
      const errDiv = document.getElementById('pos-error');
      errDiv.classList.add('hidden');

      const customerId = selectCust.value;
      const paymentMethod = selectMethod.value;
      const discount = parseFloat(inputDiscount.value) || 0.0;
      const netAmount = this.saleRows.reduce((sum, r) => sum + r.subtotal, 0) - discount;
      const paidAmount = parseFloat(inputReceived.value) || 0.0;

      const validItems = this.saleRows.filter(row => row.productId && row.batchId && row.quantity > 0 && row.sellingPrice > 0);
      if (validItems.length === 0) {
        const missingBatch = this.saleRows.some(r => r.productId && !r.batchId);
        errDiv.innerText = missingBatch
          ? "Select which stock batch to sell for each product line."
          : "Invoice must contain at least one valid product line.";
        errDiv.classList.remove('hidden');
        return;
      }

      // Check credit selections
      if (paymentMethod === 'CREDIT' && !customerId) {
        errDiv.innerText = "Please select a Customer for Credit Khata invoicing.";
        errDiv.classList.remove('hidden');
        return;
      }

      const payload = {
        customerId: customerId || null,
        invoiceNumber: this.invoiceNo,
        discount,
        netAmount,
        paidAmount,
        paymentMethod,
        items: validItems.map(row => ({
          productId: row.productId,
          batchId: row.batchId,
          quantity: row.quantity,
          sellingPrice: row.sellingPrice,
          unit: row.unit
        }))
      };

      btnCheckout.disabled = true;
      btnCheckout.innerText = "Processing checkout...";

      const res = await API.createSale(payload);
      if (res.success) {
        // Redirect to dashboard view
        const dashboardTab = document.querySelector('[data-view="dashboard"]');
        if (dashboardTab) {
          dashboardTab.click();
        }
      } else {
        btnCheckout.disabled = false;
        btnCheckout.innerText = "Save & Post POS Invoice";
        errDiv.innerText = res.error || "Failed to process POS checkout.";
        errDiv.classList.remove('hidden');
      }
    });
  }
}
