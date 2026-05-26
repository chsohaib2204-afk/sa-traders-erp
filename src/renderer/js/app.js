import DashboardView from './views/dashboard.js';
import ProductsView from './views/products.js';
import InventoryView from './views/inventory.js';
import ManufacturingView from './views/manufacturing.js';
import SalesView from './views/sales.js';
import CustomersView from './views/customers.js';
import KhataView from './views/khata.js';
import BranchView from './views/branch.js';
import ExpensesView from './views/expenses.js';
import ReportsView from './views/reports.js';
import SettingsView from './views/settings.js';
import PartnersView from './views/partners.js';
import CashBoxView from './views/cashbox.js';

/**
 * SPA router — maps sidebar navigation to view controllers.
 * Each view extends BaseView and talks to the main process via API (IPC).
 */
class App {
  constructor() {
    this.contentArea = null;
    this.currentViewInstance = null;
    this.views = {
      dashboard: DashboardView,
      products: ProductsView,
      inventory: InventoryView,
      manufacturing: ManufacturingView,
      sales: SalesView,
      customers: CustomersView,
      khata: KhataView,
      branch: BranchView,
      expenses: ExpensesView,
      reports: ReportsView,
      partners: PartnersView,
      cashbox: CashBoxView,
      settings: SettingsView,
    };
  }

  init() {
    this.contentArea = document.getElementById('content-area');
    this.setupSidebarNavigation();

    // Default load Dashboard view on boot
    this.switchView('dashboard');
  }

  setupSidebarNavigation() {
    const navItems = document.querySelectorAll('[data-view]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();

        navItems.forEach(nav => {
          nav.classList.remove('bg-brand-500/10', 'text-brand-400', 'border-l-4', 'border-brand-500');
          nav.classList.add('text-slate-400', 'hover:bg-slate-700/20', 'hover:text-slate-200');
        });

        const clickedItem = e.currentTarget;
        clickedItem.classList.remove('text-slate-400', 'hover:bg-slate-700/20', 'hover:text-slate-200');
        clickedItem.classList.add('bg-brand-500/10', 'text-brand-400', 'border-l-4', 'border-brand-500');

        const viewName = clickedItem.getAttribute('data-view');
        this.switchView(viewName);
      });
    });
  }

  async switchView(viewName) {
    console.log(`[Router] Navigating to: ${viewName}`);

    // Replace content area with a fresh clone to remove all stale event listeners
    const oldContent = this.contentArea;
    const parent = oldContent.parentNode;
    const newContent = document.createElement('div');
    newContent.id = 'content-area';
    newContent.className = oldContent.className;
    parent.replaceChild(newContent, oldContent);
    this.contentArea = newContent;

    this.contentArea.classList.add('opacity-0', 'transition-all', 'duration-150');
    await new Promise(resolve => setTimeout(resolve, 150));

    const ViewClass = this.views[viewName];

    if (ViewClass) {
      this.currentViewInstance = new ViewClass();
      await this.currentViewInstance.mount(this.contentArea);
    } else {
      this.currentViewInstance = null;
      this.renderUnknownView(viewName);
    }

    this.contentArea.classList.remove('opacity-0');
    this.contentArea.classList.add('opacity-100');
  }

  renderUnknownView(viewName) {
    const title = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    this.contentArea.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-[400px] text-center text-slate-400">
        <p class="text-lg font-semibold text-slate-200">${title}</p>
        <p class="text-sm mt-2">This module is not registered in the router.</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
