import BaseView from './baseView.js';
import API from '../api.js';

export default class PartnersView extends BaseView {
  constructor() {
    super();
    this.withdrawals = [];
    this.sohaibTotal = 0;
    this.tayyabTotal = 0;
    this.aqibTotal = 0;
  }

  async preRender() {
    const res = await API.getPartnerWithdrawals();
    if (res.success) {
      this.withdrawals = res.data;
      this.sohaibTotal = this.withdrawals
        .filter(w => w.partnerName.toLowerCase().includes('sohaib'))
        .reduce((s, w) => s + w.amount, 0);
      this.tayyabTotal = this.withdrawals
        .filter(w => w.partnerName.toLowerCase().includes('tayyab'))
        .reduce((s, w) => s + w.amount, 0);
      this.aqibTotal = this.withdrawals
        .filter(w => w.partnerName.toLowerCase().includes('aqib'))
        .reduce((s, w) => s + w.amount, 0);
    }
  }

  render() {
    const formatPKR = (num) => {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency', currency: 'PKR', minimumFractionDigits: 0
      }).format(num).replace('PKR', 'Rs.');
    };

    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold text-slate-100">Partner Withdrawals</h1>
            <p class="text-sm text-slate-400">Track money withdrawn by business partners</p>
          </div>
          <button id="btn-add-withdrawal" class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-xl font-semibold shadow-md shadow-brand-500/10 flex items-center gap-2 transition-active">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            Record Withdrawal
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div class="p-5 bg-gradient-to-r from-amber-950/40 to-darkbg-800 border border-amber-500/20 rounded-xl">
            <div class="text-xs font-semibold text-amber-300 uppercase tracking-wider">Sohaib — Total Withdrawn</div>
            <div class="text-2xl font-bold text-amber-400 mt-1">${formatPKR(this.sohaibTotal)}</div>
          </div>
          <div class="p-5 bg-gradient-to-r from-sky-950/40 to-darkbg-800 border border-sky-500/20 rounded-xl">
            <div class="text-xs font-semibold text-sky-300 uppercase tracking-wider">Tayyab — Total Withdrawn</div>
            <div class="text-2xl font-bold text-sky-400 mt-1">${formatPKR(this.tayyabTotal)}</div>
          </div>
          <div class="p-5 bg-gradient-to-r from-violet-950/40 to-darkbg-800 border border-violet-500/20 rounded-xl">
            <div class="text-xs font-semibold text-violet-300 uppercase tracking-wider">Aqib — Total Withdrawn</div>
            <div class="text-2xl font-bold text-violet-400 mt-1">${formatPKR(this.aqibTotal)}</div>
          </div>
        </div>

        <div class="bg-darkbg-800 border border-slate-700/30 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-700/60 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-darkbg-900/40">
                  <th class="py-4 px-6">Date</th>
                  <th class="py-4 px-6">Partner</th>
                  <th class="py-4 px-6">Amount</th>
                  <th class="py-4 px-6">Note</th>
                  <th class="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/30 text-sm text-slate-300">
                ${this.withdrawals.length === 0 ? `
                  <tr><td colspan="5" class="py-12 text-center text-slate-500">No withdrawals recorded yet.</td></tr>
                ` : this.withdrawals.map(w => {
                  const formattedDate = new Date(w.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const pLower = w.partnerName.toLowerCase();
                  const partnerColor = pLower.includes('sohaib') ? 'text-amber-400' : pLower.includes('aqib') ? 'text-violet-400' : 'text-sky-400';
                  return `
                    <tr class="hover:bg-slate-700/10 transition-colors">
                      <td class="py-4 px-6 text-slate-400 font-mono">${formattedDate}</td>
                      <td class="py-4 px-6"><span class="font-bold ${partnerColor}">${w.partnerName}</span></td>
                      <td class="py-4 px-6 font-bold text-rose-400">${formatPKR(w.amount)}</td>
                      <td class="py-4 px-6 text-slate-400">${w.note || '--'}</td>
                      <td class="py-4 px-6 text-right">
                        <button data-delete-id="${w.id}" class="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/10 rounded-lg text-xs font-semibold transition-active">Delete</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Add Withdrawal Modal -->
        <div id="modal-withdrawal" class="fixed inset-0 z-50 overflow-y-auto hidden">
          <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
            <div id="modal-overlay" class="fixed inset-0 bg-darkbg-900/60 backdrop-blur-sm transition-opacity"></div>
            <div class="inline-block align-middle bg-darkbg-800 rounded-xl text-left border border-slate-700/30 overflow-hidden shadow-xl transform transition-all sm:max-w-md sm:w-full">
              <div class="px-6 py-4 bg-darkbg-900/40 border-b border-slate-700/30 flex justify-between items-center">
                <h3 class="text-sm font-bold text-slate-100">Record Partner Withdrawal</h3>
                <button id="modal-close" class="text-slate-400 hover:text-slate-200"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
              </div>
              <form id="form-withdrawal" class="p-6 space-y-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Partner *</label>
                  <select id="wd-partner" required class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
                    <option value="">-- Select Partner --</option>
                    <option value="Sohaib">Sohaib</option>
                    <option value="Tayyab">Tayyab</option>
                    <option value="Aqib">Aqib</option>
                  </select>
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Amount (Rs.) *</label>
                  <input type="number" id="wd-amount" required min="1" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 font-bold text-sm focus:border-brand-500 focus:outline-none">
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Note / Reason</label>
                  <input type="text" id="wd-note" placeholder="e.g. Personal expenses withdrawal" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none">
                </div>
                <div id="wd-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold"></div>
                <div class="pt-3 border-t border-slate-700/40 flex justify-end gap-2">
                  <button type="button" id="btn-cancel-wd" class="px-4 py-2 bg-slate-700 text-slate-300 rounded text-xs font-semibold">Cancel</button>
                  <button type="submit" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded text-xs font-bold">Save Withdrawal</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.setupWithdrawalForm();
    this.setupDeleteHandlers();
  }

  setupWithdrawalForm() {
    const btnAdd = document.getElementById('btn-add-withdrawal');
    const modal = document.getElementById('modal-withdrawal');
    const overlay = document.getElementById('modal-overlay');
    const closeBtn = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('btn-cancel-wd');
    const form = document.getElementById('form-withdrawal');
    const errDiv = document.getElementById('wd-error');

    const open = () => {
      modal.classList.remove('hidden');
    };
    const close = () => {
      modal.classList.add('hidden');
      form.reset();
      errDiv.classList.add('hidden');
    };

    btnAdd.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');
      const partnerName = document.getElementById('wd-partner').value;
      const amount = parseFloat(document.getElementById('wd-amount').value);
      const note = document.getElementById('wd-note').value;
      if (!partnerName || isNaN(amount) || amount <= 0) {
        errDiv.innerText = 'Please select a partner and enter a valid amount.';
        errDiv.classList.remove('hidden');
        return;
      }
      const res = await API.createPartnerWithdrawal({ partnerName, amount, note });
      if (res.success) {
        close();
        await this.mount(this.container);
      } else {
        errDiv.innerText = res.error || 'Failed to save withdrawal.';
        errDiv.classList.remove('hidden');
      }
    });
  }

  setupDeleteHandlers() {
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-id]');
      if (!btn) return;
      if (!confirm('Are you sure you want to delete this withdrawal?')) return;
      const id = btn.getAttribute('data-delete-id');
      const res = await API.deletePartnerWithdrawal({ id });
      if (res.success) {
        await this.mount(this.container);
      } else {
        alert(res.error || 'Failed to delete.');
      }
    });
  }
}
