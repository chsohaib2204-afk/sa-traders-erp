import BaseView from './baseView.js';
import API from '../api.js';

export default class KhataView extends BaseView {
  constructor() {
    super();
    this.customers = [];
    this.selectedCustomerId = window.activeCustomerId || '';
    this.ledgerData = null; // { customer, ledger }

    // Clear global active ID after capturing it
    delete window.activeCustomerId;
  }

  async preRender() {
    const custRes = await API.getCustomers();
    if (custRes.success) {
      this.customers = custRes.data;
    }

    if (this.selectedCustomerId) {
      const ledgerRes = await API.getCustomerLedger(this.selectedCustomerId);
      if (ledgerRes.success) {
        this.ledgerData = ledgerRes.data;
      }
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
        <!-- Top bar Selector -->
        <div class="flex justify-between items-center bg-darkbg-800 border border-slate-700/30 p-5 rounded-xl gap-4">
          <div class="flex items-center gap-3 flex-grow max-w-md">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Choose Client Account:</label>
            <select id="khata-customer-select" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 font-semibold focus:border-brand-500 focus:outline-none text-sm transition-active">
              <option value="">-- Choose Customer --</option>
              ${this.customers.map(c => `<option value="${c.id}" ${this.selectedCustomerId === c.id ? 'selected' : ''}>${c.name} (Bal: ${formatPKR(c.balance)})</option>`).join('')}
            </select>
          </div>
          
          ${this.ledgerData ? `
            <button id="btn-print-ledger" class="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600/30 text-slate-100 rounded-xl font-semibold flex items-center gap-2 transition-active">
              <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              Print Statement
            </button>
          ` : ''}
        </div>

        ${!this.ledgerData ? `
          <div class="flex flex-col items-center justify-center min-h-[300px] text-center text-slate-500 p-8 border border-dashed border-slate-700/40 rounded-xl">
            <svg class="w-16 h-16 opacity-25 mb-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
            <h3 class="text-base font-bold text-slate-400">No Account Selected</h3>
            <p class="text-sm max-w-sm mt-1">Please choose an active customer from the dropdown above to view their running ledger and log payments.</p>
          </div>
        ` : `
          <!-- Client Selected Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left 2 Cols: Running Ledger sheet -->
            <div class="lg:col-span-2 space-y-6" id="printable-ledger-area">
              <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
                <!-- Ledger Header -->
                <div class="flex justify-between items-start pb-4 border-b border-slate-700/40">
                  <div>
                    <h2 class="text-lg font-bold text-slate-100">${this.ledgerData.customer.name}</h2>
                    <p class="text-xs text-slate-400">Outstanding Account Balance Statement</p>
                  </div>
                  <div class="text-right">
                    <span class="block text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">Net Due</span>
                    <span class="block text-xl font-bold mt-1.5 ${this.ledgerData.customer.balance > 0 ? 'text-rose-400' : 'text-emerald-400'}">
                      ${formatPKR(this.ledgerData.customer.balance)}
                    </span>
                  </div>
                </div>

                <!-- Ledger Table -->
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr class="border-b border-slate-700/60 text-slate-400 font-semibold uppercase tracking-wider bg-darkbg-900/20">
                        <th class="py-3 px-4">Date</th>
                        <th class="py-3 px-4">Description</th>
                        <th class="py-3 px-4 text-right">Debit (Owed)</th>
                        <th class="py-3 px-4 text-right">Credit (Paid)</th>
                        <th class="py-3 px-4 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-700/30 text-slate-300">
                      ${this.ledgerData.ledger.length === 0 ? `
                        <tr>
                          <td colspan="5" class="py-8 text-center text-slate-500">No ledger entries logged for this account.</td>
                        </tr>
                      ` : this.ledgerData.ledger.map(entry => {
                        const formattedDate = new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const isDebit = entry.type === 'DEBIT';

                        return `
                          <tr class="hover:bg-slate-700/10">
                            <td class="py-3 px-4 text-slate-400 font-mono">${formattedDate}</td>
                            <td class="py-3 px-4 font-semibold text-slate-200">${entry.description}</td>
                            <td class="py-3 px-4 text-right ${isDebit ? 'font-bold text-rose-400' : 'text-slate-500'}">
                              ${isDebit ? formatPKR(entry.amount) : '--'}
                            </td>
                            <td class="py-3 px-4 text-right ${!isDebit ? 'font-bold text-emerald-400' : 'text-slate-500'}">
                              ${!isDebit ? formatPKR(entry.amount) : '--'}
                            </td>
                            <td class="py-3 px-4 text-right font-bold ${entry.runningBalance > 0 ? 'text-slate-300' : 'text-emerald-400'}">
                              ${formatPKR(entry.runningBalance)}
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Right 1 Col: Receive Payment panel -->
            <div class="space-y-6">
              <div class="p-6 bg-darkbg-800 border border-slate-700/30 rounded-xl space-y-4">
                <h3 class="text-sm font-bold text-slate-200 pb-3 border-b border-slate-700/40 uppercase tracking-wider">Collect Cash Payment</h3>
                
                <form id="form-collect-payment" class="space-y-4">
                  <div class="space-y-1.5">
                    <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Payment Amount (Rs.) *</label>
                    <input type="number" id="pay-amount" required min="1" placeholder="PKR Amount" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm font-bold focus:border-brand-500 focus:outline-none transition-active">
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Payment Date</label>
                    <input type="date" id="pay-date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none transition-active">
                  </div>

                  <div class="space-y-1.5">
                    <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Payment Description</label>
                    <input type="text" id="pay-desc" placeholder="e.g. Received via cash / bank transfer" class="w-full px-4 py-2.5 bg-darkbg-900 border border-slate-700 rounded-lg text-slate-100 text-sm focus:border-brand-500 focus:outline-none transition-active">
                  </div>

                  <div id="payment-error" class="hidden text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/10 rounded-lg font-semibold"></div>

                  <button type="submit" class="w-full py-3 bg-brand-600 hover:bg-brand-500 text-slate-100 rounded-lg font-bold text-sm shadow-lg shadow-brand-500/5 transition-active">
                    Record Credit Payment
                  </button>
                </form>
              </div>
            </div>
          </div>
        `}
      </div>
    `;
  }

  async postRender() {
    this.setupCustomerSelection();

    if (this.ledgerData) {
      this.setupPaymentCollection();
      this.setupPrintStatement();
    }
  }

  setupCustomerSelection() {
    const select = document.getElementById('khata-customer-select');
    select.addEventListener('change', async (e) => {
      this.selectedCustomerId = e.target.value;
      this.ledgerData = null;
      await this.mount(this.container);
    });
  }

  setupPaymentCollection() {
    const form = document.getElementById('form-collect-payment');
    const errDiv = document.getElementById('payment-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errDiv.classList.add('hidden');

      const amount = parseFloat(document.getElementById('pay-amount').value);
      const date = document.getElementById('pay-date').value;
      const description = document.getElementById('pay-desc').value;

      if (!this.selectedCustomerId || isNaN(amount) || amount <= 0) {
        errDiv.innerText = "Please input a valid payment amount.";
        errDiv.classList.remove('hidden');
        return;
      }

      const res = await API.receiveCustomerPayment({
        customerId: this.selectedCustomerId,
        amount,
        date,
        description
      });

      if (res.success) {
        // Refresh view completely
        await this.mount(this.container);
      } else {
        errDiv.innerText = res.error || "Failed to receive payment.";
        errDiv.classList.remove('hidden');
      }
    });
  }

  setupPrintStatement() {
    const btn = document.getElementById('btn-print-ledger');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const printContents = document.getElementById('printable-ledger-area').innerHTML;
      const originalContents = document.body.innerHTML;

      // Construct a clean statement print layout
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Account Ledger Statement - ${this.ledgerData.customer.name}</title>
            <style>
              body { font-family: 'Inter', sans-serif; color: #1e293b; padding: 40px; }
              table { width: 100%; border-collapse: collapse; margin-top: 30px; font-size: 13px; }
              th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; }
              th { background-color: #f8fafc; font-weight: bold; color: #475569; }
              .text-right { text-align: right; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px solid #cbd5e1; padding-bottom: 20px; }
              .header h2 { margin: 0; font-size: 20px; color: #0f172a; }
              .header p { margin: 4px 0 0 0; font-size: 12px; color: #64748b; }
              .balance-card { text-align: right; }
              .balance-val { font-size: 22px; font-weight: bold; margin-top: 5px; color: #be123c; }
            </style>
          </head>
          <body>
            ${printContents}
            <div style="margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8;">
              Statement generated automatically via SA Traders ERP.
            </div>
            <script>
              window.onload = function() { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    });
  }
}
