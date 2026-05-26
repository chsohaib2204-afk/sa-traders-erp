import BaseView from './baseView.js';
import API from '../api.js';

export default class CustomersView extends BaseView {
  constructor() {
    super();
    this.customers = [];
  }

  async preRender() {
    const res = await API.getCustomers();
    if (res.success) {
      this.customers = res.data;
    }
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
            <h1 class="text-2xl font-bold text-slate-100">Customer Database</h1>
            <p class="text-sm text-slate-400">Manage client profiles, premium loyal tags, and active balances</p>
          </div>
          <button id="btn-add-customer" class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-xl font-semibold shadow-md shadow-brand-500/10 flex items-center gap-2 transition-active">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
            Add Customer
          </button>
        </div>

        <!-- Customer List Table -->
        <div class="bg-darkbg-800 border border-slate-700/30 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-700/60 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-darkbg-900/40">
                  <th class="py-4 px-6">Customer Name</th>
                  <th class="py-4 px-6">Phone Number</th>
                  <th class="py-4 px-6">Billing Category</th>
                  <th class="py-4 px-6">Owed Khata Balance</th>
                  <th class="py-4 px-6">Address</th>
                  <th class="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/30 text-sm text-slate-300">
                ${this.customers.length === 0 ? `
                  <tr>
                    <td colspan="6" class="py-12 text-center text-slate-500">No customers registered in database yet.</td>
                  </tr>
                ` : this.customers.map(c => `
                  <tr class="hover:bg-slate-700/10 transition-colors">
                    <td class="py-4 px-6">
                      <div class="font-bold text-slate-200">${c.name}</div>
                      <div class="flex gap-1.5 mt-1">
                        ${c.isLoyal ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/15">Loyal</span>` : ''}
                        ${c.isMainBranchCustomer ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/15">Main Branch Cust</span>` : ''}
                      </div>
                    </td>
                    <td class="py-4 px-6 font-mono font-medium text-slate-400">${c.phone || '--'}</td>
                    <td class="py-4 px-6 text-xs text-slate-400">${c.isLoyal ? 'Premium (Loyal Price)' : 'Standard (Default Price)'}</td>
                    <td class="py-4 px-6 font-bold ${c.balance > 0 ? 'text-rose-400' : 'text-emerald-400'}">${formatPKR(c.balance)}</td>
                    <td class="py-4 px-6 text-xs text-slate-400 max-w-[150px] truncate" title="${c.address}">${c.address || '--'}</td>
                    <td class="py-4 px-6 text-right space-x-1.5">
                      <button data-edit-id="${c.id}" class="px-2.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/10 rounded-lg text-xs font-semibold transition-active">Edit</button>
                      <button data-delete-id="${c.id}" class="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/10 rounded-lg text-xs font-semibold transition-active">Delete</button>
                      <button data-ledger-id="${c.id}" class="px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/10 rounded-lg text-xs font-semibold transition-active">
                        View Khata Ledger
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Slide Drawer: Add Customer Form -->
        <div id="drawer-add-customer" class="fixed inset-0 z-50 overflow-hidden hidden" role="dialog" aria-modal="true">
          <div class="absolute inset-0 overflow-hidden">
            <div id="drawer-overlay" class="absolute inset-0 bg-darkbg-900/60 backdrop-blur-sm transition-opacity duration-300 opacity-0"></div>
            
            <div class="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div id="drawer-panel" class="pointer-events-auto w-screen max-w-md transform transition-transform duration-300 translate-x-full">
                <div class="flex h-full flex-col bg-darkbg-800 border-l border-slate-700/30 shadow-2xl">
                  <div class="h-16 px-6 border-b border-slate-700/30 flex items-center justify-between bg-darkbg-900/20">
                    <h2 class="text-md font-bold text-slate-100">Add New Customer</h2>
                    <button id="drawer-close" class="text-slate-400 hover:text-slate-200 focus:outline-none">
                      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>

                  <form id="form-customer" class="flex-grow overflow-y-auto p-6 space-y-5">
                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Customer Name *</label>
                      <input type="text" name="name" required placeholder="e.g. Haji Bashir Dairy Farm" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Phone Number</label>
                      <input type="text" name="phone" placeholder="e.g. 0300-7654321" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Address</label>
                      <input type="text" name="address" placeholder="e.g. Chak 46/SB, Sargodha" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <!-- Row Category Checkboxes -->
                    <div class="p-4 bg-darkbg-900/50 border border-slate-700/40 rounded-xl space-y-3">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Profile Badges / Tagging</label>
                      
                      <div class="flex items-center gap-2">
                        <input type="checkbox" id="isLoyal" name="isLoyal" class="w-4 h-4 text-brand-500 bg-darkbg-900 border-slate-700 rounded focus:ring-brand-500 focus:ring-2">
                        <label for="isLoyal" class="text-sm text-slate-300 font-medium select-none">Loyal Customer (Premium pricing model)</label>
                      </div>

                      <div class="flex items-center gap-2">
                        <input type="checkbox" id="isMainBranchCustomer" name="isMainBranchCustomer" class="w-4 h-4 text-brand-500 bg-darkbg-900 border-slate-700 rounded focus:ring-brand-500 focus:ring-2">
                        <label for="isMainBranchCustomer" class="text-sm text-slate-300 font-medium select-none">Main Branch Customer (Settled by Head Office)</label>
                      </div>
                    </div>

                    <div class="space-y-1.5">
                      <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Initial Outstanding Balance (PKR)</label>
                      <input type="number" step="any" name="initialBalance" value="0" min="0" placeholder="e.g. 5000 (Owed to us)" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    </div>

                    <div id="customer-form-error" class="hidden text-xs text-rose-500 p-3 bg-rose-500/10 rounded-lg border border-rose-500/10 font-semibold leading-relaxed"></div>

                    <!-- Submit Footer -->
                    <div class="pt-4 border-t border-slate-700/40 flex justify-end gap-3">
                      <button type="button" id="btn-cancel-drawer" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-semibold transition-active">Cancel</button>
                      <button type="submit" class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg text-sm font-bold shadow-lg shadow-brand-500/5 transition-active">Save Profile</button>
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

  async postRender() {
    this.setupAddCustomerDrawer();
    this.setupEditCustomer();
    this.setupDeleteCustomer();
    this.setupDeepLinkLedgers();
  }

  setupAddCustomerDrawer() {
    this.editingCustomerId = null;
    const btnAdd = document.getElementById('btn-add-customer');
    const btnCancel = document.getElementById('btn-cancel-drawer');
    const btnClose = document.getElementById('drawer-close');
    const drawer = document.getElementById('drawer-add-customer');
    const overlay = document.getElementById('drawer-overlay');
    const panel = document.getElementById('drawer-panel');
    const form = document.getElementById('form-customer');
    const errDiv = document.getElementById('customer-form-error');

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
        this.editingCustomerId = null;
        const submitBtn = drawer.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerText = 'Save Profile';
      }, 300);
    };

    btnAdd.addEventListener('click', openDrawer);
    btnCancel.addEventListener('click', closeDrawer);
    btnClose.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      const formData = new FormData(form);
      const payload = {
        name: formData.get('name'),
        phone: formData.get('phone') || null,
        address: formData.get('address') || null,
        isLoyal: formData.get('isLoyal') === 'on',
        isMainBranchCustomer: formData.get('isMainBranchCustomer') === 'on',
        initialBalance: parseFloat(formData.get('initialBalance')) || 0.0
      };

      if (!payload.name) {
        errDiv.innerText = "Customer Name is required.";
        errDiv.classList.remove('hidden');
        return;
      }

      if (this.editingCustomerId) {
        const res = await API.updateCustomer({ id: this.editingCustomerId, ...payload });
        if (res.success) {
          this.editingCustomerId = null;
          closeDrawer();
          await this.mount(this.container);
        } else {
          errDiv.innerText = res.error || "Failed to update customer.";
          errDiv.classList.remove('hidden');
        }
      } else {
        const res = await API.createCustomer(payload);
        if (res.success) {
          closeDrawer();
          await this.mount(this.container);
        } else {
          errDiv.innerText = res.error || "Failed to create customer.";
          errDiv.classList.remove('hidden');
        }
      }
    });
  }

  setupEditCustomer() {
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-edit-id]');
      if (!btn) return;
      const customerId = btn.getAttribute('data-edit-id');

      const res = await API.getCustomerLedger(customerId);
      if (!res.success) {
        alert(res.error || 'Failed to load customer details');
        return;
      }

      const c = res.data.customer;

      const drawer = document.getElementById('drawer-add-customer');
      const overlay = document.getElementById('drawer-overlay');
      const panel = document.getElementById('drawer-panel');

      document.querySelector('input[name="name"]').value = c.name;
      document.querySelector('input[name="phone"]').value = c.phone || '';
      document.querySelector('input[name="address"]').value = c.address || '';
      document.getElementById('isLoyal').checked = c.isLoyal;
      document.getElementById('isMainBranchCustomer').checked = c.isMainBranchCustomer;
      document.querySelector('input[name="initialBalance"]').value = c.balance || 0;

      const submitBtn = drawer.querySelector('button[type="submit"]');
      submitBtn.innerText = 'Update Customer';

      this.editingCustomerId = customerId;

      drawer.classList.remove('hidden');
      setTimeout(() => {
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
      }, 50);
    });
  }

  setupDeleteCustomer() {
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-id]');
      if (!btn) return;
      if (!confirm('Are you sure you want to delete this customer? This will also remove their ledger records.')) return;
      const id = btn.getAttribute('data-delete-id');
      const res = await API.deleteCustomer({ id });
      if (res.success) {
        await this.mount(this.container);
      } else {
        alert(res.error || 'Failed to delete customer.');
      }
    });
  }

  setupDeepLinkLedgers() {
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ledger-id]');
      if (btn) {
        const customerId = btn.getAttribute('data-ledger-id');
        
        // Deep link: We swap view to 'khata' and pass parameters!
        // We can access global App instance by storing customerId globally or on the window object
        window.activeCustomerId = customerId;
        
        // Trigger sidebar click programmatically
        const khataTab = document.querySelector('[data-view="khata"]');
        if (khataTab) {
          khataTab.click();
        }
      }
    });
  }
}
