import BaseView from './baseView.js';
import API from '../api.js';

/**
 * Phase 8 — Profit & Loss reports view.
 * Displays gross/net profit, COGS, and expense breakdown charts.
 */
export default class ReportsView extends BaseView {
  constructor() {
    super();
    this.report = null;
    this.expenseChart = null;
  }

  async preRender() {
    const res = await API.getReportsData();
    if (res.success) {
      this.report = res.data;
    }
  }

  render() {
    if (!this.report) {
      return `
        <div class="flex items-center justify-center min-h-[400px]">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
        </div>
      `;
    }

    const formatPKR = (num) => {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0
      }).format(num).replace('PKR', 'Rs.');
    };

    const {
      netRevenue,
      cogs,
      grossProfit,
      totalExpenses,
      netProfit,
      expenseBreakdown
    } = this.report;

    const grossMarginPct = netRevenue > 0 ? ((grossProfit / netRevenue) * 100).toFixed(1) : '0.0';
    const netMarginPct = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : '0.0';

    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold text-slate-100">Profit & Loss Reports</h1>
            <p class="text-sm text-slate-400">FIFO-based COGS, gross profit, and net profit after factory expenses</p>
          </div>
          <div class="px-4 py-2 bg-darkbg-800 border border-slate-700/30 rounded-lg text-xs text-slate-400">
            All-time ledger summary
          </div>
        </div>

        <!-- P&L summary cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Net Sales Revenue</div>
            <div class="mt-2 text-xl font-bold text-slate-100">${formatPKR(netRevenue)}</div>
            <div class="mt-2 text-[11px] text-slate-500">After invoice discounts</div>
          </div>
          <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cost of Goods Sold</div>
            <div class="mt-2 text-xl font-bold text-amber-400">${formatPKR(cogs)}</div>
            <div class="mt-2 text-[11px] text-slate-500">FIFO batch costing</div>
          </div>
          <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gross Profit</div>
            <div class="mt-2 text-xl font-bold text-brand-400">${formatPKR(grossProfit)}</div>
            <div class="mt-2 text-[11px] text-brand-500/80">${grossMarginPct}% gross margin</div>
          </div>
          <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Net Profit</div>
            <div class="mt-2 text-xl font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatPKR(netProfit)}</div>
            <div class="mt-2 text-[11px] text-slate-500">After ${formatPKR(totalExpenses)} expenses · ${netMarginPct}% net</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Expense breakdown chart -->
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <h3 class="text-sm font-bold text-slate-200 pb-4 border-b border-slate-700/40 uppercase tracking-wider">Expense Breakdown</h3>
            <div class="h-64 mt-4">
              ${expenseBreakdown.length === 0
                ? '<p class="text-sm text-slate-500 text-center py-16">No expenses recorded yet.</p>'
                : '<canvas id="expenseChart"></canvas>'}
            </div>
          </div>

          <!-- Expense table -->
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl">
            <h3 class="text-sm font-bold text-slate-200 pb-4 border-b border-slate-700/40 uppercase tracking-wider">Category Totals</h3>
            <div class="overflow-x-auto mt-4">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-700/60 text-slate-400 font-semibold uppercase tracking-wider">
                    <th class="py-3 px-4">Category</th>
                    <th class="py-3 px-4 text-right">Amount</th>
                    <th class="py-3 px-4 text-right">Share</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-700/30 text-slate-300">
                  ${expenseBreakdown.length === 0 ? `
                    <tr><td colspan="3" class="py-8 text-center text-slate-500">No data</td></tr>
                  ` : expenseBreakdown.map(row => {
                    const share = totalExpenses > 0 ? ((row.amount / totalExpenses) * 100).toFixed(1) : '0.0';
                    return `
                      <tr class="hover:bg-slate-700/10">
                        <td class="py-3 px-4 font-medium">${row.category}</td>
                        <td class="py-3 px-4 text-right font-bold text-rose-400">${formatPKR(row.amount)}</td>
                        <td class="py-3 px-4 text-right text-slate-400">${share}%</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Formula reference for operators -->
        <div class="p-5 bg-darkbg-800/60 border border-slate-700/20 rounded-xl text-xs text-slate-400 leading-relaxed">
          <span class="font-bold text-slate-300">Accounting formulas:</span>
          Gross Profit = Net Sales − COGS (FIFO).
          Net Profit = Gross Profit − Total Expenses.
        </div>
      </div>
    `;
  }

  async postRender() {
    if (!this.report || !this.report.expenseBreakdown?.length) return;

    const canvas = document.getElementById('expenseChart');
    if (!canvas) return;

    const labels = this.report.expenseBreakdown.map(e => e.category);
    const values = this.report.expenseBreakdown.map(e => e.amount);

    const colors = [
      'rgba(56, 189, 248, 0.85)',
      'rgba(250, 204, 21, 0.85)',
      'rgba(34, 197, 94, 0.85)',
      'rgba(244, 63, 94, 0.85)',
      'rgba(148, 163, 184, 0.85)'
    ];

    this.expenseChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#0f172a',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            callbacks: {
              label: (ctx) => ` Rs. ${new Intl.NumberFormat('en-US').format(ctx.parsed)}`
            }
          }
        }
      }
    });
  }
}
