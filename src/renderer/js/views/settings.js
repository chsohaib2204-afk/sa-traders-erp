import BaseView from './baseView.js';
import API from '../api.js';

/**
 * Phase 1 — System settings: factory info display and database maintenance.
 */
export default class SettingsView extends BaseView {
  constructor() {
    super();
    this.resetting = false;
  }

  render() {
    return `
      <div class="space-y-6 max-w-3xl">
        <div>
          <h1 class="text-2xl font-bold text-slate-100">ERP Settings</h1>
          <p class="text-sm text-slate-400">Factory profile, offline database path, and maintenance tools</p>
        </div>

        <!-- Factory profile (display-only for now; can be persisted in a future Settings table) -->
        <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
          <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Factory Profile</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Business Name</span>
              <span class="text-slate-200 font-medium">SA Traders</span>
            </div>
            <div>
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Branch ID</span>
              <span class="text-slate-200 font-mono">#042</span>
            </div>
            <div>
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Currency</span>
              <span class="text-slate-200">PKR (Pakistani Rupee)</span>
            </div>
            <div>
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Bag Conversion</span>
              <span class="text-slate-200">1 bag = 40 kg</span>
            </div>
          </div>
        </div>

        <!-- Offline database info -->
        <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-3">
          <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Offline Database</h3>
          <p class="text-sm text-slate-400 leading-relaxed">
            All business data is stored locally in SQLite via Prisma. No internet connection is required after installation.
            In development, the database file is <code class="text-brand-400 bg-darkbg-900 px-1 rounded">src/database/dev.db</code>.
            Packaged Windows builds use the user data folder.
          </p>
          <ul class="text-xs text-slate-500 space-y-1 list-disc list-inside">
            <li>Accounting operations use database transactions to prevent stock corruption</li>
            <li>FIFO costing is applied on sales and manufacturing consumption</li>
            <li>Empty database stays empty until you add real business data</li>
          </ul>
        </div>

        <!-- Danger zone: reset -->
        <div class="p-6 bg-rose-500/5 border border-rose-500/20 rounded-xl space-y-4">
          <h3 class="text-sm font-bold text-rose-400 pb-3 border-b border-rose-500/20 uppercase tracking-wider">Danger Zone</h3>
          <p class="text-sm text-slate-400">
            Reset will permanently delete all products, stock batches, customers, sales, khata entries, expenses, and branch payables.
            Use only when starting fresh on a new machine or after backing up data.
          </p>
          <div id="settings-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold"></div>
          <div id="settings-success" class="hidden text-xs text-brand-400 bg-brand-500/10 p-3 border border-brand-500/10 rounded-lg font-semibold"></div>
          <button id="btn-reset-db" type="button" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-slate-100 rounded-lg font-semibold text-sm transition-active">
            Reset Database (Delete All Data)
          </button>
        </div>
      </div>
    `;
  }

  async postRender() {
    const btn = document.getElementById('btn-reset-db');
    const errDiv = document.getElementById('settings-error');
    const okDiv = document.getElementById('settings-success');

    btn.addEventListener('click', async () => {
      errDiv.classList.add('hidden');
      okDiv.classList.add('hidden');

      const confirmed = window.confirm(
        'This will permanently delete ALL business data.\n\nAre you sure you want to reset the database?'
      );
      if (!confirmed) return;

      const doubleCheck = window.confirm(
        'Final confirmation: all inventory, sales, khata, and expenses will be erased. Continue?'
      );
      if (!doubleCheck) return;

      btn.disabled = true;
      btn.textContent = 'Resetting...';

      const res = await API.resetDatabase();

      btn.disabled = false;
      btn.textContent = 'Reset Database (Delete All Data)';

      if (res.success) {
        okDiv.innerText = 'Database cleared. All products, sales, khata, stock, and expenses are now zero.';
        okDiv.classList.remove('hidden');
      } else {
        errDiv.innerText = res.error || 'Reset failed.';
        errDiv.classList.remove('hidden');
      }
    });
  }
}
