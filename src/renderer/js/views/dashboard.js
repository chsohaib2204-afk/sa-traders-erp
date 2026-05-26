import BaseView from './baseView.js';
import API from '../api.js';

export default class DashboardView extends BaseView {
  constructor() {
    super();
    this.summary = null;
    this.transactions = [];
    this.lowStock = [];
    this.chartInstance = null;
    this.partnerWithdrawals = [];
  }

  async preRender() {
    // Fetch data asynchronously from the SQLite database
    const summaryRes = await API.getDashboardSummary();
    const transactionsRes = await API.getRecentTransactions();
    const lowStockRes = await API.getLowStockAlerts();

    if (summaryRes.success) this.summary = summaryRes.data;
    if (transactionsRes.success) this.transactions = transactionsRes.data;
    if (lowStockRes.success) this.lowStock = lowStockRes.data;

    const partnerWdRes = await API.getPartnerWithdrawals();
    if (partnerWdRes.success) this.partnerWithdrawals = partnerWdRes.data;
  }

  render() {
    if (!this.summary) {
      return `
        <div class="flex items-center justify-center min-h-[400px]">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
        </div>
      `;
    }

    const {
      todaySales,
      todayCash,
      pendingCustomerBalances,
      mainBranchPayable,
      grossProfit,
      netProfit,
      lowStockCount,
      cashBoxBalance,
      todayGrossProfit,
      todayNetProfit
    } = this.summary;

    const khataAddedToday = Math.max(0, todaySales - todayCash);

    // Standard Currency Formatter (PKR Rs.)
    const formatPKR = (num) => {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
        minimumFractionDigits: 0
      }).format(num).replace('PKR', 'Rs.');
    };

    return `
      <div class="space-y-6">
        <!-- Title & Date -->
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold text-slate-100">Welcome back, SA Traders</h1>
            <p class="text-sm text-slate-400">SA Traders ERP — Real-time offline analytics</p>
          </div>
          <div class="px-4 py-2 bg-darkbg-800 border border-slate-700/50 rounded-lg text-slate-300 text-sm font-medium">
            <span class="inline-block w-2.5 h-2.5 bg-brand-500 rounded-full mr-2 animate-pulse"></span>
            System Live (Offline-First)
          </div>
        </div>

        <!-- 5 Essential Accounting Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
          <!-- Card 1: Today Sales -->
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl relative overflow-hidden group hover:border-brand-500/30 transition-active">
            <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-brand-500/5 rounded-full group-hover:scale-125 transition-active"></div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Sales</div>
            <div class="mt-2 text-2xl font-bold text-slate-100">${formatPKR(todaySales)}</div>
            <div class="mt-3 text-xs text-slate-400 flex items-center">
              <span class="text-green-400 font-medium mr-1">Invoiced value</span>
              generated today
            </div>
          </div>

          <!-- Card 2: Today Cash -->
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl relative overflow-hidden group hover:border-brand-500/30 transition-active">
            <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full group-hover:scale-125 transition-active"></div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's Cash Received</div>
            <div class="mt-2 text-2xl font-bold text-emerald-400">${formatPKR(todayCash)}</div>
            <div class="mt-3 text-xs text-slate-400">
              <span class="text-slate-300 font-medium">${formatPKR(khataAddedToday)}</span> added to Khata (credit sales)
            </div>
          </div>

          <!-- Card 3: Cash Box Balance -->
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl relative overflow-hidden group hover:border-brand-500/30 transition-active">
            <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-cyan-500/5 rounded-full group-hover:scale-125 transition-active"></div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cash Box Balance</div>
            <div class="mt-2 text-2xl font-bold text-cyan-400">${formatPKR(cashBoxBalance || 0)}</div>
            <div class="mt-3 text-xs text-slate-400">
              On-hand cash & bank receipts
            </div>
          </div>

          <!-- Card 4: Total Khata balance -->
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl relative overflow-hidden group hover:border-brand-500/30 transition-active">
            <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-yellow-500/5 rounded-full group-hover:scale-125 transition-active"></div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Customer Ledger (Khata)</div>
            <div class="mt-2 text-2xl font-bold text-yellow-400">${formatPKR(pendingCustomerBalances)}</div>
            <div class="mt-3 text-xs text-slate-400">
              Total pending receivables from clients
            </div>
          </div>

          <!-- Card 5: Main Branch Payable -->
          <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl relative overflow-hidden group hover:border-brand-500/30 transition-active">
            <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-rose-500/5 rounded-full group-hover:scale-125 transition-active"></div>
            <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Main Branch Payable</div>
            <div class="mt-2 text-2xl font-bold text-rose-400">${formatPKR(mainBranchPayable)}</div>
            <div class="mt-3 text-xs text-slate-400">
              Owed to central branch for purchases
            </div>
          </div>
        </div>

        <!-- Profit Analytics Banner -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div class="p-5 bg-gradient-to-r from-brand-900/40 to-darkbg-800 border border-brand-500/20 rounded-xl flex items-center justify-between">
            <div>
              <div class="text-xs font-semibold text-brand-300 uppercase tracking-wider">Cumulative Gross Profit</div>
              <div class="text-2xl font-bold text-brand-400 mt-1">${formatPKR(grossProfit)}</div>
              <p class="text-[11px] text-slate-400 mt-1">FIFO Cost of Goods Sold deducted from net sales revenue</p>
            </div>
            <div class="p-3 bg-brand-500/10 text-brand-400 rounded-lg">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
            </div>
          </div>

          <div class="p-5 bg-gradient-to-r from-sky-950/40 to-darkbg-800 border border-sky-500/20 rounded-xl flex items-center justify-between">
            <div>
              <div class="text-xs font-semibold text-sky-300 uppercase tracking-wider">Net Factory Profit</div>
              <div class="text-2xl font-bold ${netProfit >= 0 ? 'text-sky-400' : 'text-rose-400'} mt-1">${formatPKR(netProfit)}</div>
              <p class="text-[11px] text-slate-400 mt-1">Gross profit minus salaries, utilities, and transport expenses</p>
            </div>
            <div class="p-3 bg-sky-500/10 text-sky-400 rounded-lg">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            </div>
          </div>
        </div>

        <!-- Daily Profit & Partner Summary -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div class="p-5 bg-gradient-to-r from-emerald-950/40 to-darkbg-800 border border-emerald-500/20 rounded-xl">
            <div class="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Today's Gross Profit</div>
            <div class="text-2xl font-bold text-emerald-400 mt-1">${formatPKR(todayGrossProfit)}</div>
            <p class="text-[11px] text-slate-400 mt-1">Sales - COGS (today)</p>
          </div>
          <div class="p-5 bg-gradient-to-r from-sky-950/40 to-darkbg-800 border border-sky-500/20 rounded-xl">
            <div class="text-xs font-semibold text-sky-300 uppercase tracking-wider">Today's Net Profit</div>
            <div class="text-2xl font-bold ${todayNetProfit >= 0 ? 'text-sky-400' : 'text-rose-400'} mt-1">${formatPKR(todayNetProfit)}</div>
            <p class="text-[11px] text-slate-400 mt-1">Gross - Today's expenses</p>
          </div>
          <div class="p-5 bg-gradient-to-r from-amber-950/40 to-darkbg-800 border border-amber-500/20 rounded-xl">
            <div class="text-xs font-semibold text-amber-300 uppercase tracking-wider">Sohaib Withdrawals</div>
            <div class="text-2xl font-bold text-amber-400 mt-1">${formatPKR(this.partnerWithdrawals.filter(w => w.partnerName.toLowerCase().includes('sohaib')).reduce((s, w) => s + w.amount, 0))}</div>
            <p class="text-[11px] text-slate-400 mt-1">Total withdrawn</p>
          </div>
          <div class="p-5 bg-gradient-to-r from-cyan-950/40 to-darkbg-800 border border-cyan-500/20 rounded-xl">
            <div class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">Tayyab Withdrawals</div>
            <div class="text-2xl font-bold text-cyan-400 mt-1">${formatPKR(this.partnerWithdrawals.filter(w => w.partnerName.toLowerCase().includes('tayyab')).reduce((s, w) => s + w.amount, 0))}</div>
            <p class="text-[11px] text-slate-400 mt-1">Total withdrawn</p>
          </div>
          <div class="p-5 bg-gradient-to-r from-violet-950/40 to-darkbg-800 border border-violet-500/20 rounded-xl">
            <div class="text-xs font-semibold text-violet-300 uppercase tracking-wider">Aqib Withdrawals</div>
            <div class="text-2xl font-bold text-violet-400 mt-1">${formatPKR(this.partnerWithdrawals.filter(w => w.partnerName.toLowerCase().includes('aqib')).reduce((s, w) => s + w.amount, 0))}</div>
            <p class="text-[11px] text-slate-400 mt-1">Total withdrawn</p>
          </div>
        </div>

        <!-- Main Chart and Stats section -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- 7-Day Sales Trend Line Chart -->
          <div class="lg:col-span-2 p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl flex flex-col justify-between">
            <div class="flex justify-between items-center mb-4">
              <div>
                <h3 class="text-base font-bold text-slate-100">7-Day Sales Performance</h3>
                <p class="text-xs text-slate-400">Revenue growth of Wanda and raw materials</p>
              </div>
              <span class="text-xs font-medium text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded-full">Chart.js Powered</span>
            </div>
            <div class="relative h-[250px] w-full">
              <canvas id="salesChart"></canvas>
            </div>
          </div>

          <!-- Low Stock Warnings panel -->
          <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl flex flex-col">
            <div class="flex justify-between items-center mb-4">
              <div>
                <h3 class="text-base font-bold text-slate-100">Low Stock Alerts</h3>
                <p class="text-xs text-slate-400">Items matching low inventory limits</p>
              </div>
              <span class="px-2 py-0.5 text-xs font-semibold rounded-full ${lowStockCount > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-green-500/10 text-green-400'}">
                ${lowStockCount} Items
              </span>
            </div>

            <div class="flex-grow space-y-3 overflow-y-auto max-h-[250px] pr-1">
              ${this.lowStock.length === 0 ? `
                <div class="flex flex-col items-center justify-center h-full py-8 text-slate-500">
                  <svg class="w-8 h-8 opacity-40 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <p class="text-xs">All stocks at optimal levels</p>
                </div>
              ` : this.lowStock.map(item => `
                <div class="p-3 bg-darkbg-900/50 border border-slate-700/40 rounded-lg flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-semibold text-slate-200">${item.name}</h4>
                    <p class="text-[11px] text-slate-400">SKU: ${item.sku} | Cat: ${item.category}</p>
                  </div>
                  <div class="text-right">
                    <div class="text-xs font-bold text-rose-400">${item.currentStock} ${item.unit}</div>
                    <div class="text-[10px] text-slate-500">Limit: ${item.alertLimit} ${item.unit}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Recent Transactions -->
        <div class="p-5 bg-darkbg-800 border border-slate-700/30 rounded-xl">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h3 class="text-base font-bold text-slate-100">Recent ERP Transactions</h3>
              <p class="text-xs text-slate-400">Most recent customer invoicing movements</p>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-slate-700/60 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th class="pb-3 pl-2">Invoice #</th>
                  <th class="pb-3">Type</th>
                  <th class="pb-3">Customer / Party</th>
                  <th class="pb-3">Date</th>
                  <th class="pb-3">Total Amount</th>
                  <th class="pb-3 pr-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/40 text-sm text-slate-300">
                ${this.transactions.length === 0 ? `
                  <tr>
                    <td colspan="6" class="py-8 text-center text-slate-500 text-xs">No transactions recorded yet</td>
                  </tr>
                ` : this.transactions.map(tx => `
                  <tr class="hover:bg-slate-700/10 transition-colors">
                    <td class="py-3.5 pl-2 font-mono font-medium text-brand-400">${tx.reference}</td>
                    <td class="py-3.5">${tx.type}</td>
                    <td class="py-3.5 font-medium text-slate-200">${tx.party}</td>
                    <td class="py-3.5 text-xs text-slate-400">${tx.date}</td>
                    <td class="py-3.5 font-bold">${formatPKR(tx.amount)}</td>
                    <td class="py-3.5 pr-2 text-right">
                      <span class="px-2.5 py-1 text-[11px] font-semibold rounded-full ${tx.colorClass}">
                        ${tx.status}
                      </span>
                    </td>
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
    // Prevent errors if summary or canvas is missing
    if (!this.summary || !document.getElementById('salesChart')) return;

    const ctx = document.getElementById('salesChart').getContext('2d');
    const chartData = this.summary.chartSales;

    const labels = chartData.map(d => d.date);
    const dataPoints = chartData.map(d => d.amount);

    // Setup nice emerald area gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.25)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.00)');

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Daily Sales (Rs.)',
          data: dataPoints,
          borderColor: '#22c55e',
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#22c55e',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f1f5f9',
            bodyColor: '#f1f5f9',
            borderColor: 'rgba(148, 163, 184, 0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return ' Rs. ' + new Intl.NumberFormat('en-US').format(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#94a3b8',
              font: {
                family: 'Inter',
                size: 11
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(51, 65, 85, 0.15)'
            },
            ticks: {
              color: '#94a3b8',
              font: {
                family: 'Inter',
                size: 11
              },
              callback: function(value) {
                if (value >= 1000) {
                  return 'Rs. ' + (value / 1000) + 'k';
                }
                return 'Rs. ' + value;
              }
            }
          }
        }
      }
    });
  }
}
