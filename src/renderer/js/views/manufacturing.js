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
                  ${r.recipeItems.reduce((s,i)=>s+i.quantity,0)} kg
                </div>
              </div>
              <div class="flex gap-1.5 mt-2 pt-2 border-t border-slate-700/30">
                <button data-edit-id="${r.id}" class="flex-1 px-2.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/10 rounded-lg text-xs font-semibold transition-active">Edit</button>
                <button data-delete-id="${r.id}" class="flex-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/10 rounded-lg text-xs font-semibold transition-active">Delete</button>
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
                        <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Ingredient Weight (auto)</label>
                        <div class="flex gap-2">
                          <input type="number" step="any" name="rec-yield" id="rec-yield-auto" readonly class="w-full px-3 py-2 bg-darkbg-900/40 border border-slate-700/50 rounded-lg text-brand-400 text-sm font-bold select-none cursor-default">
                          <div id="rec-yield-unit" class="px-3 py-2.5 bg-darkbg-900 border border-slate-700 text-slate-400 rounded-lg text-xs font-bold select-none">kg</div>
                        </div>
                        <p class="text-[10px] text-slate-500">Auto-calculated from ingredient quantities below</p>
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
        <!-- Left: Mixer setup -->
        <div class="lg:col-span-2 space-y-6">
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-5">
            <h3 class="text-base font-bold text-slate-100 pb-3 border-b border-slate-700/40">Start Production Run</h3>
            
            <div class="space-y-4">
              <!-- Select Recipe -->
              <div class="space-y-1.5">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Select Formula</label>
                <select id="mix-recipe" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 font-semibold focus:border-brand-500 focus:outline-none text-sm transition-active">
                  <option value="">-- Choose Mix Formula --</option>
                  ${this.recipes.map(r => `<option value="${r.id}">${r.name} → ${r.product.name}</option>`).join('')}
                </select>
              </div>

              <!-- Recipe info summary shown on selection -->
              <div id="mix-recipe-info" class="hidden p-4 bg-brand-500/5 border border-brand-500/15 rounded-xl">
                <div class="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Formula Weight</div>
                    <div id="mix-info-ingredients" class="text-lg font-bold text-brand-400">0 kg</div>
                  </div>
                  <div>
                    <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Equivalent</div>
                    <div id="mix-info-bags" class="text-lg font-bold text-emerald-400">0</div>
                  </div>
                  <div>
                    <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sale Price</div>
                    <div id="mix-info-price" class="text-lg font-bold text-sky-400">--</div>
                  </div>
                  <div>
                    <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cost/Kg</div>
                    <div id="mix-info-costkg" class="text-lg font-bold text-slate-300">--</div>
                  </div>
                </div>
              </div>

              <!-- Production Unit Selector -->
              <div class="space-y-2">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Requested Production Unit</label>
                <div class="flex gap-3">
                  <label class="flex items-center gap-2 px-4 py-2 bg-darkbg-900 border border-slate-700 rounded-lg cursor-pointer hover:border-brand-500/50 transition-active">
                    <input type="radio" name="prod-unit" value="kg" checked class="accent-brand-500">
                    <span class="text-sm font-semibold text-slate-200">KG</span>
                  </label>
                  <label class="flex items-center gap-2 px-4 py-2 bg-darkbg-900 border border-slate-700 rounded-lg cursor-pointer hover:border-brand-500/50 transition-active">
                    <input type="radio" name="prod-unit" value="bag" class="accent-brand-500">
                    <span class="text-sm font-semibold text-slate-200">Bag (40kg)</span>
                  </label>
                </div>
              </div>

              <!-- Desired Output Qty -->
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Desired Output Quantity</label>
                  <div class="flex gap-2">
                    <input type="number" step="any" min="0.1" id="mix-output-qty" value="10" class="flex-1 px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 font-bold text-lg focus:border-brand-500 focus:outline-none text-sm transition-active">
                    <div id="mix-output-unit" class="px-4 py-2.5 bg-darkbg-900/60 border border-slate-700 rounded-lg text-slate-400 text-sm font-bold select-none">kg</div>
                  </div>
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Equivalent (KG)</label>
                  <div id="mix-equiv-kg" class="w-full px-4 py-2.5 bg-darkbg-900/60 border border-slate-700 rounded-lg text-brand-300 text-lg font-bold select-none">10 kg</div>
                </div>
              </div>

              <!-- Cost / Profit estimate panel -->
              <div id="mix-profit-panel" class="hidden p-4 bg-darkbg-900/80 border border-slate-700/30 rounded-xl space-y-3">
                <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Estimated Profit Analysis</div>
                <div id="mix-profit-breakdown" class="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <div class="text-[10px] text-slate-500">Ingredient Cost</div>
                    <div id="mix-est-ing-cost" class="font-bold text-slate-200">Rs. 0</div>
                  </div>
                  <div>
                    <div class="text-[10px] text-slate-500">Revenue</div>
                    <div id="mix-est-revenue" class="font-bold text-sky-400">Rs. 0</div>
                  </div>
                  <div>
                    <div class="text-[10px] text-slate-500">Est. Profit</div>
                    <div id="mix-est-profit" class="text-lg font-bold text-emerald-400">Rs. 0</div>
                  </div>
                </div>
              </div>

              <!-- Extra Cost -->
              <div class="p-4 bg-amber-950/20 border border-amber-500/15 rounded-xl space-y-3">
                <div class="text-xs font-bold text-amber-300 uppercase tracking-wider">Extra Production Costs</div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label class="text-xs font-semibold text-slate-400 block">Labor / Electricity / Other (Rs.)</label>
                    <input type="number" min="0" id="mix-extra-cost" value="0" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-amber-500 focus:outline-none text-sm transition-active">
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-semibold text-slate-400 block">Cost per Unit (Rs.)</label>
                    <div id="mix-cost-per-unit" class="w-full px-4 py-2.5 bg-darkbg-900/60 border border-slate-700 rounded-lg text-sky-400 text-sm font-bold select-none">--</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Stock Check -->
        <div class="space-y-6">
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Stock Check</h3>
            
            <div id="mixer-analyzer-body" class="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
              <div class="text-xs text-slate-500 py-6 text-center">Select a formula to check ingredient stock</div>
            </div>

            <div id="mixer-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold leading-relaxed"></div>

            <button id="btn-execute-mixer" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/10 transition-active">
              Execute Production
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
      this.setupEditRecipe();
      this.setupDeleteRecipe();
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
    this.editingRecipeId = null;
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
        this.editingRecipeId = null;
        const submitBtn = drawer.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerText = 'Save Recipe';
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
      labelYieldUnit.innerText = 'kg';
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
        el.addEventListener('change', (e) => { onRowInput(e); updateAutoYield(); });
        el.addEventListener('input', (e) => { onRowInput(e); updateAutoYield(); });
      });
    };

    const updateAutoYield = () => {
      const total = this.recipeRows.reduce((s, r) => s + (r.quantity || 0), 0);
      const yieldField = document.getElementById('rec-yield-auto');
      if (yieldField) yieldField.value = total.toFixed(2);
    };

    btnAddRow.addEventListener('click', () => {
      this.recipeRows.push({ productId: '', quantity: 1, unit: 'kg' });
      renderRows();
      updateAutoYield();
    });

    renderRows();
    updateAutoYield();

    // Submit Recipe Mix
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      syncRecipeRowsFromDom();

      const formData = new FormData(form);
      const name = (formData.get('rec-name') || '').toString().trim();
      const productId = selectTarget.value;

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
        items: validItems
      };

      const res = this.editingRecipeId
        ? await API.updateRecipe({ id: this.editingRecipeId, ...payload })
        : await API.createRecipe(payload);
      if (res.success) {
        close();
        await this.mount(this.container);
      } else {
        errDiv.innerText = res.error || "Failed to save Recipe.";
        errDiv.classList.remove('hidden');
      }
    });
  }

  setupEditRecipe() {
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-edit-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-edit-id');
      
      const recipe = this.recipes.find(r => r.id === id);
      if (!recipe) return;
      
      this.editingRecipeId = id;
      
      // Open drawer
      const drawer = document.getElementById('drawer-add-recipe');
      const overlay = document.getElementById('drawer-overlay');
      const panel = document.getElementById('drawer-panel');
      
      // Populate form
      document.querySelector('input[name="rec-name"]').value = recipe.name;
      document.getElementById('rec-target-product').value = recipe.productId;
      
      // Populate recipe items rows
      this.recipeRows = recipe.recipeItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unit: 'kg'
      }));
      
      // Re-render rows
      const rowsContainer = document.getElementById('recipe-rows-container');
      if (rowsContainer) {
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
        
        // Add listeners with auto-yield update
        rowsContainer.querySelectorAll('[data-row-idx]').forEach(el => {
          el.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-row-idx'), 10);
            const field = e.target.getAttribute('data-field');
            if (field === 'productId') this.recipeRows[idx].productId = e.target.value;
            if (field === 'quantity') this.recipeRows[idx].quantity = parseFloat(e.target.value) || 0;
          });
        });
      }
      
      // Update auto-yield display
      const updateAutoYield = () => {
        const total = this.recipeRows.reduce((s, r) => s + (r.quantity || 0), 0);
        const yieldField = document.getElementById('rec-yield-auto');
        if (yieldField) yieldField.value = total.toFixed(2);
      };
      updateAutoYield();
      
      // Change button text
      const submitBtn = drawer.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.innerText = 'Update Recipe';
      
      // Open drawer
      drawer.classList.remove('hidden');
      setTimeout(() => {
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
      }, 50);
    });
  }

  setupDeleteRecipe() {
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-id]');
      if (!btn) return;
      if (!confirm('Delete this recipe formula?')) return;
      const id = btn.getAttribute('data-delete-id');
      const res = await API.deleteRecipe({ id });
      if (res.success) {
        await this.mount(this.container);
      } else {
        alert(res.error || 'Failed to delete recipe.');
      }
    });
  }

  // --- Mixer Run Form Logic ---
  setupMixerForm() {
    const BAG_TO_KG = 40.0;
    const selectRecipe = document.getElementById('mix-recipe');
    const inputOutputQty = document.getElementById('mix-output-qty');
    const outputUnit = document.getElementById('mix-output-unit');
    const equivKg = document.getElementById('mix-equiv-kg');
    const extraCostInput = document.getElementById('mix-extra-cost');
    const costPerUnit = document.getElementById('mix-cost-per-unit');
    const recipeInfo = document.getElementById('mix-recipe-info');
    const infoIngredients = document.getElementById('mix-info-ingredients');
    const infoBags = document.getElementById('mix-info-bags');
    const infoPrice = document.getElementById('mix-info-price');
    const infoCostKg = document.getElementById('mix-info-costkg');
    const profitPanel = document.getElementById('mix-profit-panel');
    const estIngCost = document.getElementById('mix-est-ing-cost');
    const estRevenue = document.getElementById('mix-est-revenue');
    const estProfit = document.getElementById('mix-est-profit');
    const analyzerBody = document.getElementById('mixer-analyzer-body');
    const btnExecute = document.getElementById('btn-execute-mixer');
    const errDiv = document.getElementById('mixer-error');

    const getSelectedUnit = () => {
      const sel = document.querySelector('input[name="prod-unit"]:checked');
      return sel ? sel.value : 'kg';
    };

    const estimateCosts = (recipe) => {
      let totalIngredientCost = 0;
      for (const item of recipe.recipeItems) {
        const prod = this.products.find(p => p.id === item.productId);
        const costPrice = prod ? prod.avgCostPrice : 0;
        totalIngredientCost += item.quantity * costPrice;
      }
      return totalIngredientCost;
    };

    const runAnalysis = () => {
      errDiv.classList.add('hidden');
      const recId = selectRecipe.value;
      const inputQty = parseFloat(inputOutputQty.value) || 0;

      if (!recId || inputQty <= 0) {
        recipeInfo.classList.add('hidden');
        profitPanel.classList.add('hidden');
        analyzerBody.innerHTML = `<div class="text-xs text-slate-500 py-6 text-center">Select a formula and enter output qty</div>`;
        return;
      }

      const recipe = this.recipes.find(r => r.id === recId);
      if (!recipe) return;

      const unit = getSelectedUnit();
      const qtyInKg = unit === 'bag' ? inputQty * BAG_TO_KG : inputQty;
      const scaleFactor = qtyInKg / recipe.outputQuantity;
      const totalIngKg = recipe.recipeItems.reduce((sum, i) => sum + i.quantity, 0) * scaleFactor;

      // Update unit display
      outputUnit.innerText = unit;
      if (unit === 'bag') {
        equivKg.innerText = `${inputQty} bag × 40 = ${qtyInKg} kg`;
      } else {
        equivKg.innerText = `${qtyInKg} kg`;
      }

      // Show recipe info
      const formulaWeight = recipe.recipeItems.reduce((sum, i) => sum + i.quantity, 0);
      const isBagProduct = recipe.product.unit === 'bag';
      const bagEquivalent = isBagProduct ? (formulaWeight / BAG_TO_KG) : 0;

      recipeInfo.classList.remove('hidden');
      infoIngredients.innerText = `${formulaWeight.toFixed(2)} kg`;
      infoBags.innerText = isBagProduct ? `${bagEquivalent.toFixed(2)} bag` : '--';
      infoPrice.innerText = `Rs. ${Converter.getCatalogPrice(recipe.product, 'default')} /${recipe.product.unit}`;

      // Estimate costs and revenue
      const baseCost = estimateCosts(recipe);
      const scaledIngCost = baseCost * scaleFactor;
      const extraCost = parseFloat(extraCostInput.value) || 0;
      const totalCost = scaledIngCost + extraCost;
      const costPerKg = totalCost / qtyInKg;

      infoCostKg.innerText = `Rs. ${costPerKg.toFixed(0)}/kg`;

      // Revenue: product.defaultPrice is per product unit (e.g., per bag or per kg)
      // Convert to per-kg for calculation
      const catalogPrice = Converter.getCatalogPrice(recipe.product, 'default');
      const pricePerKg = isBagProduct ? (catalogPrice / BAG_TO_KG) : catalogPrice;
      const revenue = qtyInKg * pricePerKg;
      const profit = revenue - totalCost;

      // Show profit panel
      profitPanel.classList.remove('hidden');
      const formatRs = (n) => 'Rs. ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      estIngCost.innerText = formatRs(scaledIngCost);
      estRevenue.innerText = formatRs(revenue);
      estProfit.innerText = formatRs(profit);
      estProfit.className = profit >= 0 ? 'text-lg font-bold text-emerald-400' : 'text-lg font-bold text-rose-400';

      if (unit === 'bag') {
        const costPerBag = totalCost / inputQty;
        costPerUnit.innerText = `Rs. ${costPerBag.toFixed(0)}/bag (Rs. ${costPerKg.toFixed(0)}/kg)`;
      } else {
        costPerUnit.innerText = `Rs. ${costPerKg.toFixed(0)}/kg`;
      }

      // Stock analysis
      let isMixPossible = true;

      analyzerBody.innerHTML = recipe.recipeItems.map(item => {
        const totalNeeded = item.quantity * scaleFactor;
        const prod = this.products.find(p => p.id === item.productId);
        const currentStock = prod ? prod.totalStock : 0;
        const isStockOk = currentStock >= totalNeeded;
        if (!isStockOk) isMixPossible = false;

        const needDesc = unit === 'bag'
          ? `${totalNeeded.toFixed(2)} kg (${item.quantity} kg × ${inputQty} bag${inputQty > 1 ? 's' : ''})`
          : `${totalNeeded.toFixed(2)} kg (${item.quantity} × ${scaleFactor.toFixed(2)})`;

        return `
          <div class="p-3 bg-darkbg-900/50 border rounded-lg flex items-center justify-between ${isStockOk ? 'border-slate-700/40' : 'border-rose-500/20 bg-rose-500/5'}">
            <div>
              <h4 class="text-xs font-semibold text-slate-200">${item.product.name}</h4>
              <p class="text-[10px] text-slate-400">Need: ${needDesc}</p>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold ${isStockOk ? 'text-green-400' : 'text-rose-400'}">
                Stock: ${currentStock.toFixed(1)} kg
              </span>
              <span class="block text-[9px] ${isStockOk ? 'text-slate-500' : 'text-rose-400 font-bold'}">
                ${isStockOk ? 'OK' : 'SHORT!'}
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

    selectRecipe.addEventListener('change', runAnalysis);
    inputOutputQty.addEventListener('input', runAnalysis);
    extraCostInput.addEventListener('input', runAnalysis);
    document.querySelectorAll('input[name="prod-unit"]').forEach(el => {
      el.addEventListener('change', runAnalysis);
    });

    btnExecute.addEventListener('click', async () => {
      errDiv.classList.add('hidden');

      const recipeId = selectRecipe.value;
      const inputQty = parseFloat(inputOutputQty.value) || 0;
      if (!recipeId || inputQty <= 0) return;

      const recipe = this.recipes.find(r => r.id === recipeId);
      const unit = getSelectedUnit();
      const qtyInKg = unit === 'bag' ? inputQty * BAG_TO_KG : inputQty;
      const extraCost = parseFloat(extraCostInput.value) || 0;

      const payload = {
        productId: recipe.productId,
        recipeId,
        quantityProduced: qtyInKg,
        extraCost
      };

      btnExecute.disabled = true;
      btnExecute.innerText = "Running Production...";

      const res = await API.executeProduction(payload);
      if (res.success) {
        this.activeTab = 'recipes';
        await this.mount(this.container);
      } else {
        btnExecute.disabled = false;
        btnExecute.innerText = "Execute Production";
        errDiv.innerText = res.error || "Production failed.";
        errDiv.classList.remove('hidden');
      }
    });
  }
}
