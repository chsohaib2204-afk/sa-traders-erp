import BaseView from './baseView.js';
import API from '../api.js';

export default class ExpensesView extends BaseView {
  constructor() {
    super();
    this.expenses = [];
    this.totalExpenses = 0.0;
  }

  async preRender() {
    const res = await API.getExpenses();
    if (res.success) {
      this.expenses = res.data;
      this.totalExpenses = this.expenses.reduce((sum, e) => sum + e.amount, 0.0);
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
        <!-- Header & Stats -->
        <div class="flex justify-between items-center bg-darkbg-800 border border-slate-700/30 p-6 rounded-xl">
          <div>
            <h1 class="text-xl font-bold text-slate-100">Factory Expense Log</h1>
            <p class="text-xs text-slate-400 mt-1">Track operational costs including salaries, diesel transport, utility bills, and plant maintenance</p>
          </div>
          <div class="text-right">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Cumulative Expenditure</span>
            <span class="block text-2xl font-black text-rose-400 mt-1.5">${formatPKR(this.totalExpenses)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Expenses Audit Table (Left 2 Cols) -->
          <div class="lg:col-span-2 p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Operational Expense Sheets</h3>
            
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-700/60 text-slate-400 font-semibold uppercase tracking-wider bg-darkbg-900/20">
                    <th class="py-3 px-4">Date</th>
                    <th class="py-3 px-4">Category</th>
                    <th class="py-3 px-4">Description</th>
                    <th class="py-3 px-4 text-right">Amount (PKR)</th>
                    <th class="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-700/30 text-slate-300">
                  ${this.expenses.length === 0 ? `
                    <tr>
                      <td colspan="5" class="py-8 text-center text-slate-500">No expenses recorded yet.</td>
                    </tr>
                  ` : this.expenses.map(e => {
                    const formattedDate = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                    return `
                      <tr class="hover:bg-slate-700/10">
                        <td class="py-3 px-4 text-slate-400 font-mono">${formattedDate}</td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                            e.category === 'SALARY' ? 'bg-sky-500/10 text-sky-400' :
                            e.category === 'ELECTRICITY' ? 'bg-yellow-500/10 text-yellow-400' :
                            e.category === 'TRANSPORT' ? 'bg-brand-500/10 text-brand-400' : 'bg-rose-500/10 text-rose-400'
                          }">
                            ${e.category}
                          </span>
                        </td>
                        <td class="py-3 px-4 text-slate-300 font-medium">${e.description || 'N/A'}</td>
                        <td class="py-3 px-4 text-right font-bold text-rose-400">
                          ${formatPKR(e.amount)}
                        </td>
                        <td class="py-3 px-4 text-right">
                          <button data-edit-id="${e.id}" class="px-2 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/10 rounded text-[10px] font-semibold transition-active mr-1">Edit</button>
                          <button data-delete-id="${e.id}" class="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/10 rounded text-[10px] font-semibold transition-active">Delete</button>
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
              <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Log Factory Expense</h3>
              
              <form id="form-expense" class="space-y-4">
                <!-- Category Select -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Expense Category</label>
                  <select id="exp-category" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 focus:border-brand-500 focus:outline-none text-sm transition-active">
                    <option value="SALARY">Worker Wages / Salaries</option>
                    <option value="ELECTRICITY">Electricity / Utilities Bill</option>
                    <option value="TRANSPORT">Diesel Freight / Transport</option>
                    <option value="MAINTENANCE">Plant repair / Maintenance</option>
                    <option value="OTHER">Other Operational Expense</option>
                  </select>
                </div>

                <!-- Date -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Expense Date</label>
                  <input type="date" id="exp-date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none transition-active">
                </div>

                <!-- Amount -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Expenditure Amount (Rs.) *</label>
                  <input type="number" id="exp-amount" required min="1" placeholder="PKR Amount" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none transition-active">
                </div>

                <!-- Description Reason -->
                <div class="space-y-1.5">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Mill Description *</label>
                  <input type="text" id="exp-desc" required placeholder="e.g. Paid weekly wages to mixer operator" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none transition-active">
                </div>

                <div id="expense-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold"></div>

                <button type="submit" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/5 transition-active">
                  Record Factory Expense
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.setupExpenseForm();
    this.setupEditExpense();
    this.setupDeleteExpense();
  }

  setupDeleteExpense() {
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-id]');
      if (!btn) return;
      if (!confirm('Delete this expense record?')) return;
      const id = btn.getAttribute('data-delete-id');
      const res = await API.deleteExpense({ id });
      if (res.success) {
        await this.mount(this.container);
      } else {
        alert(res.error || 'Failed to delete expense.');
      }
    });
  }

  setupEditExpense() {
    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-edit-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-edit-id');

      const expense = this.expenses.find(ex => ex.id === id);
      if (!expense) {
        alert('Expense data not found.');
        return;
      }

      this.editingExpenseId = id;

      document.getElementById('exp-category').value = expense.category;
      document.getElementById('exp-date').value = expense.date.split('T')[0];
      document.getElementById('exp-amount').value = expense.amount;
      document.getElementById('exp-desc').value = expense.description || '';

      const submitBtn = document.querySelector('#form-expense button[type="submit"]');
      if (submitBtn) submitBtn.innerText = 'Update Expense';

      document.getElementById('form-expense').scrollIntoView({ behavior: 'smooth' });
    });
  }

  setupExpenseForm() {
    this.editingExpenseId = null;
    const form = document.getElementById('form-expense');
    const errDiv = document.getElementById('expense-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      const category = document.getElementById('exp-category').value;
      const date = document.getElementById('exp-date').value;
      const amount = parseFloat(document.getElementById('exp-amount').value);
      const description = document.getElementById('exp-desc').value;

      if (isNaN(amount) || amount <= 0 || !description) {
        errDiv.innerText = "Please complete all fields with positive values.";
        errDiv.classList.remove('hidden');
        return;
      }

      if (this.editingExpenseId) {
        const res = await API.updateExpense({ id: this.editingExpenseId, category, date, amount, description });
        if (res.success) {
          this.editingExpenseId = null;
          const submitBtn = document.querySelector('#form-expense button[type="submit"]');
          if (submitBtn) submitBtn.innerText = 'Record Factory Expense';
          await this.mount(this.container);
        } else {
          errDiv.innerText = res.error || 'Failed to update expense.';
          errDiv.classList.remove('hidden');
        }
      } else {
        const res = await API.createExpense({ category, date, amount, description });
        if (res.success) {
          await this.mount(this.container);
        } else {
          errDiv.innerText = res.error || "Expense logging failed.";
          errDiv.classList.remove('hidden');
        }
      }
    });
  }
}
