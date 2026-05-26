import BaseView from './baseView.js';
import API from '../api.js';

export default class BranchView extends BaseView {
  constructor() {
    super();
    this.transactions = [];
    this.totalOwed = 0.0;
  }

  async preRender() {
    const res = await API.getBranchTransactions();
    if (res.success) {
      this.transactions = res.data;
      // Latest running balance (API returns newest first)
      const latest = this.transactions.reduce((best, tx) => {
        if (!best) return tx;
        return new Date(tx.createdAt) > new Date(best.createdAt) ? tx : best;
      }, null);
      this.totalOwed = latest ? latest.runningPayable : 0.0;
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
        <!-- Header & Balance -->
        <div class="flex justify-between items-center bg-gradient-to-r from-rose-950/40 to-darkbg-800 border border-rose-500/20 p-6 rounded-xl">
          <div>
            <h1 class="text-xl font-bold text-slate-100">Main Branch Accounting</h1>
            <p class="text-xs text-slate-400 mt-1">Audit payables, settle inter-branch stock transactions, and log supplier branch transfers</p>
          </div>
          <div class="text-right">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Net Payable to Head Office</span>
            <span class="block text-2xl font-black text-rose-400 mt-1.5">${formatPKR(this.totalOwed)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Transactions Ledger Table (Left 2 Cols) -->
          <div class="lg:col-span-2 p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Branch Accounting Running Statement</h3>
            
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-700/60 text-slate-400 font-semibold uppercase tracking-wider bg-darkbg-900/20">
                    <th class="py-3 px-4">Date</th>
                    <th class="py-3 px-4">Source</th>
                    <th class="py-3 px-4">Description</th>
                    <th class="py-3 px-4 text-right">Debit (Payable Increase)</th>
                    <th class="py-3 px-4 text-right">Credit (Settle Decrease)</th>
                    <th class="py-3 px-4 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-700/30 text-slate-300">
                  ${this.transactions.length === 0 ? `
                    <tr>
                      <td colspan="6" class="py-8 text-center text-slate-500">No branch transactions recorded.</td>
                    </tr>
                  ` : this.transactions.map(tx => {
                    const formattedDate = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const isIncrease = tx.type === 'PAYABLE_INCREASE';
                    const sourceLabel = tx.source === 'PURCHASE'
                      ? 'Stock Purchase'
                      : (tx.source === 'SALE' ? 'Branch Sale' : 'Manual');
                    const sourceClass = tx.source === 'PURCHASE'
                      ? 'bg-amber-500/10 text-amber-400'
                      : (tx.source === 'SALE' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-slate-400');
                    let detail = tx.description;
                    if (tx.purchase) {
                      const inv = tx.purchase.invoiceNumber ? `Inv ${tx.purchase.invoiceNumber}` : 'Purchase';
                      const sup = tx.purchase.supplier?.name ? ` · ${tx.purchase.supplier.name}` : '';
                      detail = `${tx.description}${sup ? ` (${inv}${sup})` : ''}`;
                    }

                    return `
                      <tr class="hover:bg-slate-700/10">
                        <td class="py-3 px-4 text-slate-400 font-mono">${formattedDate}</td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${sourceClass}">${sourceLabel}</span>
                        </td>
                        <td class="py-3 px-4 font-semibold text-slate-200 text-[11px] leading-relaxed">${detail}</td>
                        <td class="py-3 px-4 text-right ${isIncrease ? 'font-bold text-rose-400' : 'text-slate-500'}">
                          ${isIncrease ? formatPKR(tx.amount) : '--'}
                        </td>
                        <td class="py-3 px-4 text-right ${!isIncrease ? 'font-bold text-emerald-400' : 'text-slate-500'}">
                          ${!isIncrease ? formatPKR(tx.amount) : '--'}
                        </td>
                        <td class="py-3 px-4 text-right font-bold text-rose-400">
                          ${formatPKR(tx.runningPayable)}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Adjustments Panel (Right 1 Col) -->
          <div class="space-y-6">
            <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
              <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Log Branch Adjustment</h3>
              
              <form id="form-branch-tx" class="space-y-4">
                <!-- Type -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Adjustment Type</label>
                  <select id="branch-tx-type" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    <option value="PAYABLE_INCREASE">Payable Increase (Branch paid supplier for us)</option>
                    <option value="PAYABLE_DECREASE">Payable Settlement (Direct bank/cash paid to branch)</option>
                  </select>
                </div>

                <!-- Amount -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Transaction Amount (Rs.) *</label>
                  <input type="number" id="branch-tx-amount" required min="1" placeholder="PKR Amount" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none transition-active">
                </div>

                <!-- Description Reason -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Transaction Description *</label>
                  <input type="text" id="branch-tx-desc" required placeholder="e.g. Settle payment via Sargent Bank online transfer" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none transition-active">
                </div>

                <div id="branch-tx-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold"></div>

                <button type="submit" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/5 transition-active">
                  Execute Ledger Transaction
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.setupBranchTxForm();
  }

  setupBranchTxForm() {
    const form = document.getElementById('form-branch-tx');
    const errDiv = document.getElementById('branch-tx-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      const type = document.getElementById('branch-tx-type').value;
      const amount = parseFloat(document.getElementById('branch-tx-amount').value);
      const description = document.getElementById('branch-tx-desc').value;

      if (isNaN(amount) || amount <= 0 || !description) {
        errDiv.innerText = "Please complete all fields with positive values.";
        errDiv.classList.remove('hidden');
        return;
      }

      const res = await API.createBranchTransaction({ type, amount, description });
      if (res.success) {
        // Refresh view
        await this.mount(this.container);
      } else {
        errDiv.innerText = res.error || "Branch ledger transaction failed.";
        errDiv.classList.remove('hidden');
      }
    });
  }
}
