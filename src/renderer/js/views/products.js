import BaseView from './baseView.js';
import API from '../api.js';
import Converter from '../utils/unitConverter.js';

export default class ProductsView extends BaseView {
  constructor() {
    super();
    this.products = [];
    this.selectedProduct = null;
  }

  async preRender() {
    const res = await API.getProducts();
    if (res.success) {
      this.products = res.data;
    }
  }

  render() {
    // Currency Formatter
    const formatPKR = (num) => {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0
      }).format(num).replace('PKR', 'Rs.');
    };

    return `
      <div class="space-y-6 relative">
        <!-- Header Actions -->
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold text-slate-100">Product Catalog</h1>
            <p class="text-sm text-slate-400">Manage feed brands, raw ingredients, and oils</p>
          </div>
          <button id="btn-add-product" class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-xl font-semibold shadow-md shadow-brand-500/10 flex items-center gap-2 transition-active">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            Add Product
          </button>
        </div>

        <!-- Catalog List Grid / Table -->
        <div class="bg-darkbg-800 border border-slate-700/30 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-700/60 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-darkbg-900/40">
                  <th class="py-4 px-6">SKU Code</th>
                  <th class="py-4 px-6">Product Name</th>
                  <th class="py-4 px-6">Category</th>
                  <th class="py-4 px-6">Inventory stock</th>
                  <th class="py-4 px-6">Avg Cost (PKR)</th>
                  <th class="py-4 px-6">Selling Price</th>
                  <th class="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/30 text-sm text-slate-300">
                ${this.products.length === 0 ? `
                  <tr>
                    <td colspan="7" class="py-12 text-center text-slate-500">
                      <svg class="w-12 h-12 opacity-30 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                      No products created in database yet.
                    </td>
                  </tr>
                ` : this.products.map(p => {
                  // totalStock from API is always in kg; alert threshold is in product unit
                  const stockInUnit = Converter.convertFromBase(p.totalStock, p.unit);
                  const isLow = stockInUnit <= p.lowStockAlert;
                  const totalStockDisplay = Converter.formatQty(p.totalStock, p.unit);
                  
                  return `
                    <tr class="hover:bg-slate-700/10 transition-colors">
                      <td class="py-4 px-6 font-mono text-slate-400 font-medium">${p.sku}</td>
                      <td class="py-4 px-6 font-bold text-slate-200">
                        ${p.name}
                        ${isLow ? `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/10">Low Stock</span>` : ''}
                      </td>
                      <td class="py-4 px-6">
                        <span class="px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                          p.type === 'MANUFACTURED' 
                            ? 'bg-brand-500/10 text-brand-400 border border-brand-500/10' 
                            : 'bg-sky-500/10 text-sky-400 border border-sky-500/10'
                        }">
                          ${p.category}
                        </span>
                      </td>
                      <td class="py-4 px-6 font-bold ${isLow ? 'text-rose-400' : 'text-slate-200'}">
                        ${totalStockDisplay}
                      </td>
                      <td class="py-4 px-6 font-medium">${p.avgCostPrice > 0 ? formatPKR(p.avgCostPrice) : '--'}</td>
                      <td class="py-4 px-6 font-semibold text-emerald-400">
                        ${formatPKR(p.defaultPrice)}
                        <span class="block text-[10px] text-slate-500">Loyal: ${formatPKR(p.loyalPrice)}</span>
                      </td>
                      <td class="py-4 px-6 text-right">
                        <button data-detail-id="${p.id}" class="px-3.5 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-600/30 transition-active">
                          View Batches
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- --- DYNAMIC MODALS & DRAWERS (DOM Manipulated) --- -->

        <!-- Side Drawer: Add Product Form -->
        <div id="drawer-add-product" class="fixed inset-0 z-50 overflow-hidden hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div class="absolute inset-0 overflow-hidden">
            <!-- Overlay background -->
            <div id="drawer-overlay" class="absolute inset-0 bg-darkbg-900/60 backdrop-blur-sm transition-opacity duration-300 opacity-0"></div>
            
            <div class="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div id="drawer-panel" class="pointer-events-auto w-screen max-w-md transform transition-transform duration-300 translate-x-full">
                <div class="flex h-full flex-col bg-darkbg-800 border-l border-slate-700/30 shadow-2xl">
                  <div class="h-16 px-6 border-b border-slate-700/30 flex items-center justify-between bg-darkbg-900/20">
                    <h2 class="text-md font-bold text-slate-100">Add New Product Catalog</h2>
                    <button id="drawer-close" class="text-slate-400 hover:text-slate-200 focus:outline-none">
                      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>

                  <form id="form-product" class="flex-grow overflow-y-auto p-6 space-y-5">
                    <!-- Name -->
                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Product Name *</label>
                      <input type="text" name="name" required placeholder="e.g. Wanda Supreme Super" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <!-- SKU -->
                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">SKU Code / Barcode</label>
                      <input type="text" name="sku" placeholder="e.g. MFG-WANDA-001 (Optional)" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <!-- Row Category & Type -->
                    <div class="grid grid-cols-2 gap-4">
                      <div class="space-y-1.5">
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Category</label>
                        <select name="category" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                          <option value="Wanda">Wanda</option>
                          <option value="Raw Material">Raw Material</option>
                          <option value="Oil">Oil</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div class="space-y-1.5">
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Production Type</label>
                        <select name="type" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                          <option value="RAW_MATERIAL">Raw Material</option>
                          <option value="MANUFACTURED">Manufactured</option>
                          <option value="TRADING">Trading / Resell</option>
                        </select>
                      </div>
                    </div>

                    <!-- Main Unit -->
                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Measuring Unit</label>
                      <select name="unit" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                        <option value="kg">Kilogram (kg)</option>
                        <option value="bag">Bag (40 kg)</option>
                        <option value="gram">Gram (g)</option>
                      </select>
                    </div>

                    <!-- Row Prices -->
                    <div class="grid grid-cols-2 gap-4">
                      <div class="space-y-1.5">
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Default Price *</label>
                        <input type="number" step="any" name="defaultPrice" required min="0" placeholder="Selling Price (PKR)" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                      </div>
                      <div class="space-y-1.5">
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Loyal Cust Price *</label>
                        <input type="number" step="any" name="loyalPrice" required min="0" placeholder="Discount price (PKR)" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                      </div>
                    </div>

                    <!-- Low Stock Alert -->
                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Low Stock Alert Level</label>
                      <input type="number" step="any" name="lowStockAlert" value="50" min="0" placeholder="Alert threshold (in kg/bag)" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <div id="product-form-error" class="hidden text-xs text-rose-500 p-3 bg-rose-500/10 rounded-lg border border-rose-500/10 font-semibold leading-relaxed"></div>

                    <!-- Submit Footer -->
                    <div class="pt-4 border-t border-slate-700/40 flex justify-end gap-3">
                      <button type="button" id="btn-cancel-drawer" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-semibold transition-active">Cancel</button>
                      <button type="submit" class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg text-sm font-bold shadow-lg shadow-brand-500/5 transition-active">Save Product</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Modal: Product Details & Batches view -->
        <div id="modal-details" class="fixed inset-0 z-50 overflow-y-auto hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <!-- Modal Background -->
            <div id="modal-overlay" class="fixed inset-0 bg-darkbg-900/60 backdrop-blur-sm transition-opacity duration-300 opacity-0"></div>

            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <!-- Modal Content Card -->
            <div id="modal-card" class="inline-block align-middle bg-darkbg-800 rounded-2xl text-left border border-slate-700/30 overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full translate-y-4 opacity-0 duration-300">
              <div class="px-6 py-4 bg-darkbg-900/40 border-b border-slate-700/30 flex justify-between items-center">
                <div>
                  <h3 id="modal-product-title" class="text-base font-bold text-slate-100">Product Stocks & Batch ledger</h3>
                  <span id="modal-product-sku" class="text-[11px] font-mono text-slate-400">SKU: --</span>
                </div>
                <button id="modal-close" class="text-slate-400 hover:text-slate-200 focus:outline-none">
                  <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <!-- Main Details Tabs Layout -->
              <div class="p-6 space-y-6">
                <!-- Aggregate Stats Cards -->
                <div class="grid grid-cols-3 gap-4">
                  <div class="p-4 bg-darkbg-900/50 border border-slate-700/40 rounded-xl">
                    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Total Current Stock</span>
                    <span id="detail-total-stock" class="text-lg font-bold text-slate-200 mt-1 block">0.0 kg</span>
                  </div>
                  <div class="p-4 bg-darkbg-900/50 border border-slate-700/40 rounded-xl">
                    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Low Stock Limit</span>
                    <span id="detail-low-limit" class="text-lg font-bold text-slate-200 mt-1 block">0.0 kg</span>
                  </div>
                  <div class="p-4 bg-darkbg-900/50 border border-slate-700/40 rounded-xl">
                    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Default Selling Price</span>
                    <span id="detail-selling-price" class="text-lg font-bold text-emerald-400 mt-1 block">Rs. 0.0</span>
                  </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <!-- Left: Batch list -->
                  <div class="space-y-3">
                    <div class="flex justify-between items-center">
                      <h4 class="text-sm font-bold text-slate-300">Active Stock Batches (FIFO List)</h4>
                      <span class="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Oldest first is sold</span>
                    </div>
                    <div class="border border-slate-700/40 rounded-xl overflow-hidden bg-darkbg-900/20 max-h-[220px] overflow-y-auto">
                      <table class="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr class="bg-darkbg-900/40 border-b border-slate-700/40 text-slate-400 font-semibold uppercase tracking-wider">
                            <th class="py-2.5 px-4">Batch Code</th>
                            <th class="py-2.5 px-4">Remaining</th>
                            <th class="py-2.5 px-4">Cost Price</th>
                            <th class="py-2.5 px-4">Vendor</th>
                          </tr>
                        </thead>
                        <tbody id="detail-batches-body" class="divide-y divide-slate-700/30 text-slate-300">
                          <!-- Injected dynamic rows -->
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Right: Recent movement audits -->
                  <div class="space-y-3">
                    <h4 class="text-sm font-bold text-slate-300">Stock Movements History Ledger</h4>
                    <div class="border border-slate-700/40 rounded-xl overflow-hidden bg-darkbg-900/20 max-h-[220px] overflow-y-auto">
                      <table class="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr class="bg-darkbg-900/40 border-b border-slate-700/40 text-slate-400 font-semibold uppercase tracking-wider">
                            <th class="py-2.5 px-4">Date</th>
                            <th class="py-2.5 px-4">Type</th>
                            <th class="py-2.5 px-4 text-right">Adjustment</th>
                            <th class="py-2.5 px-4">Description</th>
                          </tr>
                        </thead>
                        <tbody id="detail-movements-body" class="divide-y divide-slate-700/30 text-slate-300">
                          <!-- Injected dynamic movements -->
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div class="px-6 py-4 bg-darkbg-900/40 border-t border-slate-700/30 flex justify-end">
                <button id="modal-btn-close" class="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-xs font-semibold transition-active">Close details</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.setupAddProductDrawer();
    this.setupDetailsModal();
  }

  setupAddProductDrawer() {
    const btnAdd = document.getElementById('btn-add-product');
    const btnCancel = document.getElementById('btn-cancel-drawer');
    const btnClose = document.getElementById('drawer-close');
    const drawer = document.getElementById('drawer-add-product');
    const overlay = document.getElementById('drawer-overlay');
    const panel = document.getElementById('drawer-panel');
    const form = document.getElementById('form-product');
    const errDiv = document.getElementById('product-form-error');

    const openDrawer = () => {
      drawer.classList.remove('hidden');
      setTimeout(() => {
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
      }, 50);
    };

    const closeDrawer = () => {
      overlay.classList.remove('opacity-100');
      overlay.classList.add('opacity-0');
      panel.classList.remove('translate-x-0');
      panel.classList.add('translate-x-full');
      setTimeout(() => {
        drawer.classList.add('hidden');
        form.reset();
        errDiv.classList.add('hidden');
      }, 300);
    };

    btnAdd.addEventListener('click', openDrawer);
    btnCancel.addEventListener('click', closeDrawer);
    btnClose.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    // Form Submission with IPC Client calls
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      const formData = new FormData(form);
      const payload = {
        name: formData.get('name'),
        sku: formData.get('sku') || null,
        category: formData.get('category'),
        type: formData.get('type'),
        unit: formData.get('unit'),
        defaultPrice: parseFloat(formData.get('defaultPrice')) || 0.0,
        loyalPrice: parseFloat(formData.get('loyalPrice')) || 0.0,
        lowStockAlert: parseFloat(formData.get('lowStockAlert')) || 0.0
      };

      // Inline validation
      if (payload.defaultPrice < 0 || payload.loyalPrice < 0) {
        errDiv.innerText = "Prices cannot be negative values.";
        errDiv.classList.remove('hidden');
        return;
      }

      if (!payload.name) {
        errDiv.innerText = "Product Name is required.";
        errDiv.classList.remove('hidden');
        return;
      }

      const res = await API.createProduct(payload);
      if (res.success) {
        // Reload products view
        closeDrawer();
        await this.mount(this.container);
      } else {
        errDiv.innerText = res.error || "Failed to create product.";
        errDiv.classList.remove('hidden');
      }
    });
  }

  setupDetailsModal() {
    const modal = document.getElementById('modal-details');
    const overlay = document.getElementById('modal-overlay');
    const card = document.getElementById('modal-card');
    const closeBtn = document.getElementById('modal-close');
    const bottomCloseBtn = document.getElementById('modal-btn-close');

    const formatPKR = (num) => {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0
      }).format(num).replace('PKR', 'Rs.');
    };

    const openModal = async (productId) => {
      const res = await API.getProductDetails(productId);
      if (!res.success) {
        alert(res.error || "Failed to load product batches.");
        return;
      }

      const product = res.data;
      this.selectedProduct = product;

      // Calculate total stock
      const totalStock = product.batches.reduce((sum, b) => sum + b.quantity, 0);

      // Inject values
      document.getElementById('modal-product-title').innerText = `${product.name} (Batch Inventory)`;
      document.getElementById('modal-product-sku').innerText = `SKU Code: ${product.sku || 'N/A'} | Base Unit: ${product.unit}`;
      document.getElementById('detail-total-stock').innerText = Converter.formatQty(totalStock, product.unit);
      document.getElementById('detail-low-limit').innerText = `${product.lowStockAlert} ${product.unit}`;
      document.getElementById('detail-selling-price').innerText = formatPKR(product.defaultPrice);

      // Render batches table rows
      const batchesBody = document.getElementById('detail-batches-body');
      if (product.batches.length === 0) {
        batchesBody.innerHTML = `
          <tr>
            <td colspan="4" class="py-4 text-center text-slate-500 text-xs">No active stock batches in system</td>
          </tr>
        `;
      } else {
        // Sort oldest batches first for clear FIFO view
        const sortedBatches = [...product.batches].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
        batchesBody.innerHTML = sortedBatches.map(b => `
          <tr class="hover:bg-slate-700/20">
            <td class="py-2.5 px-4 font-mono font-medium">${b.batchNumber}</td>
            <td class="py-2.5 px-4 font-semibold ${b.quantity <= 0 ? 'text-slate-500' : 'text-slate-200'}">
              ${Converter.formatQty(b.quantity, product.unit)}
            </td>
            <td class="py-2.5 px-4 font-semibold text-sky-400">
              ${product.unit === 'bag' ? formatPKR(b.costPrice * 40) + ' /bag' : formatPKR(b.costPrice) + ' /kg'}
            </td>
            <td class="py-2.5 px-4 text-slate-400">${b.supplier ? b.supplier.name : 'Mill Produced'}</td>
          </tr>
        `).join('');
      }

      // Render stock movements table rows
      const movementsBody = document.getElementById('detail-movements-body');
      if (product.stockMovements.length === 0) {
        movementsBody.innerHTML = `
          <tr>
            <td colspan="4" class="py-4 text-center text-slate-500 text-xs">No movements logged yet</td>
          </tr>
        `;
      } else {
        movementsBody.innerHTML = product.stockMovements.map(m => {
          const formattedDate = new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const isPositive = m.quantity > 0;
          
          // Display movement qty converted appropriately to match original unit choice
          const displayQty = product.unit === 'bag' ? (m.quantity / 40.0) : m.quantity;
          const displaySymbol = isPositive ? '+' : '';
          const qtyClass = isPositive ? 'text-green-400 font-bold' : 'text-rose-400 font-bold';

          return `
            <tr class="hover:bg-slate-700/20">
              <td class="py-2.5 px-4 text-[10px] text-slate-400">${formattedDate}</td>
              <td class="py-2.5 px-4">
                <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  m.type === 'PURCHASE' ? 'bg-sky-500/10 text-sky-400' :
                  m.type === 'SALE' ? 'bg-brand-500/10 text-brand-400' :
                  m.type === 'PRODUCTION_OUTPUT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'
                }">
                  ${m.type}
                </span>
              </td>
              <td class="py-2.5 px-4 text-right ${qtyClass}">${displaySymbol}${displayQty.toFixed(1)} ${product.unit}</td>
              <td class="py-2.5 px-4 text-[10px] text-slate-400 max-w-[120px] truncate" title="${m.description}">${m.description || 'N/A'}</td>
            </tr>
          `;
        }).join('');
      }

      // Trigger animation classes
      modal.classList.remove('hidden');
      setTimeout(() => {
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        card.classList.remove('translate-y-4', 'opacity-0');
        card.classList.add('translate-y-0', 'opacity-100');
      }, 50);
    };

    const closeModal = () => {
      overlay.classList.remove('opacity-100');
      overlay.classList.add('opacity-0');
      card.classList.remove('translate-y-0', 'opacity-100');
      card.classList.add('translate-y-4', 'opacity-0');
      setTimeout(() => {
        modal.classList.add('hidden');
        this.selectedProduct = null;
      }, 300);
    };

    // Attach click listeners to data buttons using delegation
    this.container.addEventListener('click', (e) => {
      const target = e.target.closest('[data-detail-id]');
      if (target) {
        const id = target.getAttribute('data-detail-id');
        openModal(id);
      }
    });

    closeBtn.addEventListener('click', closeModal);
    bottomCloseBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
  }
}
