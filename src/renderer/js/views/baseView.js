/**
 * BaseView - Foundation class for all view controllers.
 * Provides standard lifecycle hooks for visual pages in the SPA.
 */
export default class BaseView {
  constructor() {
    this.container = null;
  }

  /**
   * Hook executed before DOM insertion. Perfect for loading asynchronous database data.
   */
  async preRender() {}

  /**
   * Generates the HTML layout string.
   * @returns {string}
   */
  render() {
    return ``;
  }

  /**
   * Hook executed after DOM insertion. Perfect for attaching UI event handlers, initialising Chart.js, or grid bindings.
   */
  async postRender() {}

  /**
   * Entry point to mount the controller into the active viewport.
   * @param {HTMLElement} container
   */
  async mount(container) {
    this.container = container;
    try {
      await this.preRender();
      this.container.innerHTML = this.render();
      await this.postRender();
    } catch (err) {
      console.error("[BaseView Error] Mounting failed:", err);
      this.container.innerHTML = `
        <div class="p-6 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 max-w-xl mx-auto my-12">
          <h2 class="font-bold text-lg mb-2">Failed to Load View</h2>
          <p class="text-sm opacity-90">${err.message}</p>
        </div>
      `;
    }
  }
}
