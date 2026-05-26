import BaseView from './baseView.js';
import API from '../api.js';
import Converter from '../utils/unitConverter.js';

export default class ManufacturingView extends BaseView {
  constructor() {
    super();
    this.recipes = [];
    this.products = [];
    this.activeTab = 'recipes'; // 'recipes' | 'mix'
    
    // Recipe Builder Form State
    this.recipeRows = [{ productId: '', quantity: 1, unit: 'kg' }];
  }

  async preRender() {
    const recRes = await API.getRecipes();
    const prodRes = await API.getProducts();

    if (recRes.success) this.recipes = recRes.data;
    if (prodRes.success) this.products = prodRes.data;
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
            <h1 class="text-2xl font-bold text-slate-100">Wanda Manufacturing</h1>
            <p class="text-sm text-slate-400">Design mixing recipes, run batch productions, and audit production costs</p>
          </div>
        </div>

        <!-- Sub Tabs -->
        <div class="border-b border-slate-700/40 flex gap-6">
          <button id="tab-recipes" class="pb-3 text-sm font-semibold border-b-2 transition-active ${
            this.activeTab === 'recipes' ? 'border-brand-500 text-brand-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }">Mixing Recipe Formulas</button>
          <button id="tab-mix" class="pb-3 text-sm font-semibold border-b-2 transition-active ${
            this.activeTab === 'mix' ? 'border-brand-500 text-brand-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }">Run Mixer Production</button>
        </div>

        <div id="mfg-viewport">
          ${this.renderActiveTab(formatPKR)}
        </div>
      </div>
    `;
  }

  renderActiveTab(formatPKR) {
    if (this.activeTab === 'recipes') {
      return this.renderRecipesTab();
    } else {
      return this.renderMixTab(formatPKR);
    }
  }

  getOutputProducts() {
    return this.products.filter(p => p.type === 'MANUFACTURED' || p.type === 'TRADING');
  }

  renderRecipesTab() {
    const outputProducts = this.getOutputProducts();

    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center bg-darkbg-800 border border-slate-700/30 p-5 rounded-xl">
          <span class="text-xs text-slate-400">Formula mixes currently registered: ${this.recipes.length}</span>
          <button id="btn-add-recipe" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-active">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            Add Mix Formula
          </button>
        </div>

        <!-- Recipe Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${this.recipes.length === 0 ? `
            <div class="col-span-2 py-12 text-center text-slate-500 border border-dashed border-slate-700/40 rounded-xl">No recipe formulas configured.</div>
          ` : this.recipes.map(r => `
            <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4 hover:border-brand-500/20 transition-active">
              <div class="flex justify-between items-start pb-3 border-b border-slate-700/45">
                <div>
                  <h3 class="font-bold text-slate-200 text-base">${r.name}</h3>
                  <span class="text-[10px] font-semibold text-brand-400 uppercase tracking-widest mt-1 inline-block">Manufactures: ${r.product.name}</span>
                </div>
                <div class="px-2.5 py-1 bg-darkbg-900/50 border border-slate-700 rounded text-slate-300 text-xs font-bold">
                  Yield: ${r.outputQuantity} ${r.product.unit}
                </div>
              </div>

              <!-- Ingredients ratios list -->
              <div class="space-y-2">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Mixing Ratio Ingredients</h4>
                <div class="divide-y divide-slate-700/20 text-xs text-slate-300">
                  ${r.recipeItems.map(item => `
                    <div class="py-2 flex justify-between">
                      <span>${item.product.name}</span>
                      <span class="font-bold text-slate-200">${item.quantity} ${item.unit}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Drawer: Add Recipe -->
        <div id="drawer-add-recipe" class="fixed inset-0 z-50 overflow-hidden hidden" role="dialog" aria-modal="true">
          <div class="absolute inset-0 overflow-hidden">
            <div id="drawer-overlay" class="absolute inset-0 bg-darkbg-900/60 backdrop-blur-sm transition-opacity duration-300 opacity-0"></div>
            
            <div class="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div id="drawer-panel" class="pointer-events-auto w-screen max-w-md transform transition-transform duration-300 translate-x-full">
                <div class="flex h-full flex-col bg-darkbg-800 border-l border-slate-700/30 shadow-2xl">
                  <div class="h-16 px-6 border-b border-slate-700/30 flex items-center justify-between bg-darkbg-900/20">
                    <h2 class="text-md font-bold text-slate-100">Add Wanda Mixing Formula</h2>
                    <button id="drawer-close" class="text-slate-400 hover:text-slate-200">
                      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>

                  <form id="form-recipe" class="flex-grow overflow-y-auto p-6 space-y-5">
                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Formula Name *</label>
                      <input type="text" name="rec-name" required placeholder="e.g. Supreme Mixing Formula" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <!-- Target Product expected -->
                    <div class="grid grid-cols-2 gap-4">
                      <div class="space-y-1.5">
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Target Product Made *</label>
                        <select id="rec-target-product" required class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                          <option value="">-- Select finished product --</option>
                          ${outputProducts.map(p => `<option value="${p.id}" data-unit="${p.unit}">${p.name} (${p.unit})</option>`).join('')}
                        </select>
                        ${outputProducts.length === 0 ? `
                          <p class="text-[11px] text-amber-400/90">Add a product with type Manufactured or Trading in Products first.</p>
                        ` : ''}
                      </div>
                      <div class="space-y-1.5">
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Output Yield Amount</label>
                        <div class="flex gap-2">
                          <input type="number" step="any" name="rec-yield" value="1" min="1" class="w-full px-3 py-2 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
                          <div id="rec-yield-unit" class="px-3 py-2.5 bg-darkbg-900 border border-slate-700 text-slate-400 rounded-lg text-xs font-bold select-none">bag</div>
                        </div>
                      </div>
                    </div>

                    <!-- Dynamic Recipe Mixing Items -->
                    <div class="space-y-3">
                      <div class="flex justify-between items-center">
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Mixing Ingredients *</label>
                        <button id="btn-add-recipe-row" type="button" class="text-xs text-brand-400 font-bold hover:underline">+ Add Raw Item</button>
                      </div>

                      <div class="border border-slate-700/30 rounded-xl overflow-hidden">
                        <table class="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr class="bg-darkbg-900/40 border-b border-slate-700/40 text-slate-400 font-semibold uppercase tracking-wider">
                              <th class="py-2.5 px-4 w-7/12">Raw Material</th>
                              <th class="py-2.5 px-4 w-5/12 text-right">Qty (kg) Needed</th>
                            </tr>
                          </thead>
                          <tbody id="recipe-rows-container" class="divide-y divide-slate-700/30">
                            <!-- Injected raw rows -->
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div id="recipe-form-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold leading-relaxed"></div>

                    <!-- Submit -->
                    <div class="pt-4 border-t border-slate-700/40 flex justify-end gap-3">
                      <button type="button" id="btn-cancel-recipe" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-semibold transition-active">Cancel</button>
                      <button type="submit" class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg text-sm font-bold shadow-lg shadow-brand-500/5 transition-active">Save Recipe</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderMixTab(formatPKR) {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Mixer Setup Left -->
        <div class="lg:col-span-2 space-y-6">
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-5">
            <h3 class="text-base font-bold text-slate-100 pb-3 border-b border-slate-700/40">Load Wanda Mixer Batch</h3>
            
            <div class="space-y-4">
              <!-- Select Recipe -->
              <div class="space-y-1.5">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Mixing Recipe Formula</label>
                <select id="mix-recipe" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 font-semibold focus:border-brand-500 focus:outline-none text-sm transition-active">
                  <option value="">-- Choose Mix Formula --</option>
                  ${this.recipes.map(r => `<option value="${r.id}">${r.name} (Produces: ${r.product.name})</option>`).join('')}
                </select>
              </div>

              <!-- Output Quantity to Produce -->
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Expected Produced Yield</label>
                  <input type="number" step="any" min="1" id="mix-qty" value="10" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-brand-500 focus:outline-none text-sm transition-active">
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Output Unit Type</label>
                  <div id="mix-unit" class="w-full px-4 py-2.5 bg-darkbg-900/60 border border-slate-700 rounded-lg text-slate-400 text-sm font-semibold select-none">
                    bag
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Live Stock Analyzer Right -->
        <div class="space-y-6">
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Live Mixing Stock Analyzer</h3>
            
            <div id="mixer-analyzer-body" class="space-y-3.5 max-h-[220px] overflow-y-auto pr-1">
              <div class="text-xs text-slate-500 py-6 text-center">Select a Recipe mix formula to analyze ingredient stocks</div>
            </div>

            <div id="mixer-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold leading-relaxed animate-pulse"></div>

            <button id="btn-execute-mixer" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/10 transition-active">
              Mix & Execute Production Batch
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.setupTabsNavigation();

    if (this.activeTab === 'recipes') {
      this.setupRecipesForm();
    } else {
      this.setupMixerForm();
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
    bindTab('tab-recipes', 'recipes');
    bindTab('tab-mix', 'mix');
  }

  // --- Recipe Builder Logic ---
  setupRecipesForm() {
    const triggerBtn = document.getElementById('btn-add-recipe');
    const drawer = document.getElementById('drawer-add-recipe');
    const overlay = document.getElementById('drawer-overlay');
    const panel = document.getElementById('drawer-panel');
    const closeBtn = document.getElementById('drawer-close');
    const cancelBtn = document.getElementById('btn-cancel-recipe');
    
    const selectTarget = document.getElementById('rec-target-product');
    const labelYieldUnit = document.getElementById('rec-yield-unit');
    const rowsContainer = document.getElementById('recipe-rows-container');
    const btnAddRow = document.getElementById('btn-add-recipe-row');
    const form = document.getElementById('form-recipe');
    const errDiv = document.getElementById('recipe-form-error');

    const open = () => {
      drawer.classList.remove('hidden');
      setTimeout(() => {
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
      }, 50);
    };

    const close = () => {
      overlay.classList.remove('opacity-100');
      overlay.classList.add('opacity-0');
      panel.classList.remove('translate-x-0');
      panel.classList.add('translate-x-full');
      setTimeout(() => {
        drawer.classList.add('hidden');
        form.reset();
        errDiv.classList.add('hidden');
        this.recipeRows = [{ productId: '', quantity: 1, unit: 'kg' }];
      }, 300);
    };

    if (triggerBtn) triggerBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);

    const syncRecipeRowsFromDom = () => {
      rowsContainer.querySelectorAll('[data-row-idx]').forEach(el => {
        const idx = parseInt(el.getAttribute('data-row-idx'), 10);
        const field = el.getAttribute('data-field');
        if (field === 'productId') this.recipeRows[idx].productId = el.value;
        if (field === 'quantity') this.recipeRows[idx].quantity = parseFloat(el.value) || 0;
      });
    };

    const updateYieldUnitLabel = () => {
      const selected = selectTarget.options[selectTarget.selectedIndex];
      labelYieldUnit.innerText = selected?.getAttribute('data-unit') || 'kg';
    };

    selectTarget.addEventListener('change', updateYieldUnitLabel);
    updateYieldUnitLabel();

    const renderRows = () => {
      rowsContainer.innerHTML = this.recipeRows.map((row, index) => `
        <tr class="hover:bg-slate-700/10">
          <td class="py-2.5 px-4">
            <select data-row-idx="${index}" data-field="productId" class="w-full px-2 py-1 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-brand-500">
              <option value="">-- Choose Raw Material --</option>
              ${this.products.filter(p => p.type === 'RAW_MATERIAL').map(p => `<option value="${p.id}" ${row.productId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </td>
          <td class="py-2.5 px-4">
            <input type="number" step="any" min="0.001" value="${row.quantity}" data-row-idx="${index}" data-field="quantity" class="w-full px-2 py-1 bg-darkbg-900 border border-slate-700 rounded text-slate-100 text-xs font-bold text-center focus:outline-none focus:border-brand-500">
          </td>
        </tr>
      `).join('');

      // Add change listeners
      const inputs = rowsContainer.querySelectorAll('[data-row-idx]');
      const onRowInput = (e) => {
        const idx = parseInt(e.target.getAttribute('data-row-idx'), 10);
        const field = e.target.getAttribute('data-field');
        const val = e.target.value;

        if (field === 'productId') {
          this.recipeRows[idx].productId = val;
        } else if (field === 'quantity') {
          this.recipeRows[idx].quantity = parseFloat(val) || 0.0;
        }
      };

      inputs.forEach(el => {
        el.addEventListener('change', onRowInput);
        el.addEventListener('input', onRowInput);
      });
    };

    btnAddRow.addEventListener('click', () => {
      this.recipeRows.push({ productId: '', quantity: 1, unit: 'kg' });
      renderRows();
    });

    renderRows();

    // Submit Recipe Mix
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      syncRecipeRowsFromDom();

      const formData = new FormData(form);
      const name = (formData.get('rec-name') || '').toString().trim();
      const productId = selectTarget.value;
      const outputQuantity = parseFloat(formData.get('rec-yield')) || 1.0;

      if (!name) {
        errDiv.innerText = "Formula name is required.";
        errDiv.classList.remove('hidden');
        return;
      }
      if (!productId) {
        errDiv.innerText = "Select the finished product this recipe produces.";
        errDiv.classList.remove('hidden');
        return;
      }

      const validItems = this.recipeRows
        .filter(r => r.productId && r.quantity > 0)
        .map(r => ({ productId: r.productId, quantity: r.quantity, unit: r.unit || 'kg' }));

      if (validItems.length === 0) {
        errDiv.innerText = "Add at least one raw ingredient with quantity.";
        errDiv.classList.remove('hidden');
        return;
      }

      const payload = {
        productId,
        name,
        outputQuantity,
        items: validItems
      };

      const res = await API.createRecipe(payload);
      if (res.success) {
        close();
        await this.mount(this.container);
      } else {
        errDiv.innerText = res.error || "Failed to save Recipe.";
        errDiv.classList.remove('hidden');
      }
    });
  }

  // --- Mixer Run Form Logic ---
  setupMixerForm() {
    const selectRecipe = document.getElementById('mix-recipe');
    const inputQty = document.getElementById('mix-qty');
    const labelUnit = document.getElementById('mix-unit');
    const analyzerBody = document.getElementById('mixer-analyzer-body');
    const btnExecute = document.getElementById('btn-execute-mixer');

    const runStockAnalysis = () => {
      analyzerBody.innerHTML = '';
      const recId = selectRecipe.value;
      const qtyToProduce = parseFloat(inputQty.value) || 0.0;

      if (!recId || qtyToProduce <= 0) {
        analyzerBody.innerHTML = `<div class="text-xs text-slate-500 py-6 text-center">Select recipe to analyze stocks</div>`;
        return;
      }

      const recipe = this.recipes.find(r => r.id === recId);
      if (!recipe) return;

      labelUnit.innerText = recipe.product.unit;

      let isMixPossible = true;

      analyzerBody.innerHTML = recipe.recipeItems.map(item => {
        const totalNeededKg = item.quantity * qtyToProduce;
        
        // Find matching product in catalog
        const catalogProd = this.products.find(p => p.id === item.productId);
        const currentStock = catalogProd ? catalogProd.totalStock : 0.0;

        const isStockOk = currentStock >= totalNeededKg;
        if (!isStockOk) isMixPossible = false;

        return `
          <div class="p-3 bg-darkbg-900/50 border rounded-lg flex items-center justify-between ${
            isStockOk ? 'border-slate-700/40' : 'border-rose-500/20 bg-rose-500/5'
          }">
            <div>
              <h4 class="text-xs font-semibold text-slate-200">${item.product.name}</h4>
              <p class="text-[10px] text-slate-400">Mixin: ${item.quantity} kg | Total Needed: ${totalNeededKg} kg</p>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold ${isStockOk ? 'text-green-400' : 'text-rose-400'}">
                Stock: ${currentStock.toFixed(1)} kg
              </span>
              <span class="block text-[9px] ${isStockOk ? 'text-slate-500' : 'text-rose-400 font-bold'}">
                ${isStockOk ? 'Stock Safe' : 'INSUFFICIENT!'}
              </span>
            </div>
          </div>
        `;
      }).join('');

      btnExecute.disabled = !isMixPossible;
      if (!isMixPossible) {
        btnExecute.classList.remove('bg-brand-600', 'hover:bg-brand-500');
        btnExecute.classList.add('bg-slate-700', 'cursor-not-allowed', 'text-slate-400');
      } else {
        btnExecute.classList.remove('bg-slate-700', 'cursor-not-allowed', 'text-slate-400');
        btnExecute.classList.add('bg-brand-600', 'hover:bg-brand-500');
      }
    };

    selectRecipe.addEventListener('change', runStockAnalysis);
    inputQty.addEventListener('input', runStockAnalysis);

    btnExecute.addEventListener('click', async () => {
      const errDiv = document.getElementById('mixer-error');
      errDiv.classList.add('hidden');

      const recipeId = selectRecipe.value;
      const quantityProduced = parseFloat(inputQty.value) || 0.0;

      if (!recipeId || quantityProduced <= 0) return;

      const recipe = this.recipes.find(r => r.id === recipeId);

      const payload = {
        productId: recipe.productId,
        recipeId,
        quantityProduced
      };

      btnExecute.disabled = true;
      btnExecute.innerText = "Executing Production mix...";

      const res = await API.executeProduction(payload);
      if (res.success) {
        // Clear state and jump back to formula catalog tab
        this.activeTab = 'recipes';
        await this.mount(this.container);
      } else {
        btnExecute.disabled = false;
        btnExecute.innerText = "Mix & Execute Production Batch";
        errDiv.innerText = res.error || "Mixer production execution failed.";
        errDiv.classList.remove('hidden');
      }
    });
  }
}
