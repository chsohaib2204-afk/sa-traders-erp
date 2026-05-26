const { contextBridge, ipcRenderer } = require('electron');

// Explicit whitelist of secure channels permitted for renderer-to-main communication
const ALLOWED_CHANNELS = [
  'db-action', // Generic database handler channel
];

contextBridge.exposeInMainWorld('api', {
  /**
   * Invokes an IPC action on the main process safely.
   * @param {string} channel
   * @param {object} payload
   * @returns {Promise<any>}
   */
  invoke: async (channel, payload) => {
    if (ALLOWED_CHANNELS.includes(channel)) {
      try {
        return await ipcRenderer.invoke(channel, payload);
      } catch (err) {
        console.error(`[Preload Error] Channel '${channel}' failed:`, err);
        throw err;
      }
    }
    throw new Error(`Unauthorized IPC channel: ${channel}`);
  }
});
