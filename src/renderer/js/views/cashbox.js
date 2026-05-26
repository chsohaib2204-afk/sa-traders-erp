import BaseView from './baseView.js';
import API from '../api.js';

export default class CashBoxView extends BaseView {
  constructor() {
    super();
    this.balance = null;
    this.transactions = [];
  }

  async preRender() {
    const [balRes, txRes] = await Promise.all([
      API.getCashBoxBalance(),
      API.getCashBoxTransactions()
    ]);
    if (balRes.success) this.balance = balRes.data;
    if (txRes.success) this.transactions = txRes.data;
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
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold text-slate-100">Cash Box</h1>
            <p class="text-sm text-slate-400">Track on-hand cash and bank receipts</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Balance</div>
            <div class="mt-2 text-2xl font-bold text-cyan-400">${formatPKR(this.balance ? this.balance.balance : 0)}</div>
          </div>
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Deposits</div>
            <div class="mt-2 text-2xl font-bold text-emerald-400">${formatPKR(this.balance ? this.balance.todayDeposits : 0)}</div>
          </div>
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Withdrawals</div>
            <div class="mt-2 text-2xl font-bold text-rose-400">${formatPKR(this.balance ? this.balance.todayWithdrawals : 0)}</div>
          </div>
        </div>

        <!-- Manual Deposit / Withdraw -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Manual Deposit</h3>
            <form id="form-cb-deposit" class="space-y-3">
              <input type="number" id="cb-deposit-amount" required min="1" placeholder="Amount (Rs.)" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none">
              <input type="text" id="cb-deposit-desc" placeholder="Description" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
              <button type="submit" class="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-slate-100 rounded-lg font-bold text-sm transition-active">Deposit Cash</button>
            </form>
            <div id="cb-deposit-err" class="hidden text-xs text-rose-500"></div>
          </div>
          <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Manual Withdrawal</h3>
            <form id="form-cb-withdraw" class="space-y-3">
              <input type="number" id="cb-withdraw-amount" required min="1" placeholder="Amount (Rs.)" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none">
              <input type="text" id="cb-withdraw-desc" placeholder="Description" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
              <button type="submit" class="w-full py-2.5 bg-rose-700 hover:bg-rose-600 text-slate-100 rounded-lg font-bold text-sm transition-active">Withdraw Cash</button>
            </form>
            <div id="cb-withdraw-err" class="hidden text-xs text-rose-500"></div>
          </div>
        </div>

        <!-- Transaction History -->
        <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl">
          <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Transaction History</h3>
          <div class="overflow-x-auto mt-4">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-700/60 text-slate-400 font-semibold uppercase tracking-wider">
                  <th class="py-3 px-4">Date</th>
                  <th class="py-3 px-4">Type</th>
                  <th class="py-3 px-4">Description</th>
                  <th class="py-3 px-4 text-right">Amount</th>
                  <th class="py-3 px-4 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/30 text-slate-300">
                ${this.transactions.length === 0 ? `
                  <tr><td colspan="5" class="py-8 text-center text-slate-500">No transactions yet.</td></tr>
                ` : this.transactions.map(tx => `
                  <tr class="hover:bg-slate-700/10">
                    <td class="py-3 px-4 text-slate-400 font-mono">${new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td class="py-3 px-4">
                      <span class="px-2 py-0.5 text-[10px] font-bold rounded-full ${tx.type === 'DEPOSIT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">${tx.type}</span>
                    </td>
                    <td class="py-3 px-4 text-slate-200">${tx.description}</td>
                    <td class="py-3 px-4 text-right font-bold ${tx.type === 'DEPOSIT' ? 'text-emerald-400' : 'text-rose-400'}">${formatPKR(tx.amount)}</td>
                    <td class="py-3 px-4 text-right font-bold text-slate-300">${formatPKR(tx.runningBalance)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.setupDepositForm();
    this.setupWithdrawForm();
  }

  setupDepositForm() {
    const form = document.getElementById('form-cb-deposit');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('cb-deposit-err');
      err.classList.add('hidden');
      const amount = parseFloat(document.getElementById('cb-deposit-amount').value);
      const description = document.getElementById('cb-deposit-desc').value || 'Manual deposit';
      if (!amount || amount <= 0) {
        err.innerText = 'Enter a valid amount.';
        err.classList.remove('hidden');
        return;
      }
      const res = await API.cashBoxDeposit({ amount, description });
      if (res.success) {
        await this.mount(this.container);
      } else {
        err.innerText = res.error;
        err.classList.remove('hidden');
      }
    });
  }

  setupWithdrawForm() {
    const form = document.getElementById('form-cb-withdraw');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('cb-withdraw-err');
      err.classList.add('hidden');
      const amount = parseFloat(document.getElementById('cb-withdraw-amount').value);
      const description = document.getElementById('cb-withdraw-desc').value || 'Manual withdrawal';
      if (!amount || amount <= 0) {
        err.innerText = 'Enter a valid amount.';
        err.classList.remove('hidden');
        return;
      }
      const res = await API.cashBoxWithdraw({ amount, description });
      if (res.success) {
        await this.mount(this.container);
      } else {
        err.innerText = res.error;
        err.classList.remove('hidden');
      }
    });
  }
}
