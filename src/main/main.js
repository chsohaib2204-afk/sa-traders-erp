const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Force 100% scale — ignore OS-level DPI scaling (e.g. Windows 150% or macOS "Larger Text")
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Determine if we are in development mode
const isDev = !app.isPackaged;

// Configure SQLite database path dynamically
const dbDir = isDev
  ? path.join(__dirname, '../database')
  : path.join(app.getPath('userData'), 'database');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, isDev ? 'dev.db' : 'prod.db');
// Set DATABASE_URL environment variable dynamically before loading prisma handlers
process.env.DATABASE_URL = `file:${dbPath}`;

console.log(`[ERP Startup] Database path set to: ${dbPath}`);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,     // Protect execution context
      nodeIntegration: false,    // Avoid direct Node.js exposure in renderer
      sandbox: true              // Run renderer process in sandbox
    },
    title: "SA Traders ERP",
    show: false,
    autoHideMenuBar: true
  });

  // Load the SPA UI
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize application
app.whenReady().then(async () => {
  try {
    // Create tables if dev.db exists but schema was never pushed
    const { ensureDatabaseSchema } = require('./ensureDatabase');
    await ensureDatabaseSchema();

    // Load IPC database controllers (after schema exists)
    try {
      require('./ipcHandlers');
    } catch (err) {
      console.error('[ERP] Failed to load IPC handlers:', err);
    }

    // Start background sync engine (offline → Supabase)
    try {
      const { startSyncService } = require('./syncService');
      startSyncService();
    } catch (err) {
      console.error('[ERP] Failed to start sync service:', err);
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error('[ERP] Fatal startup error:', err);
    try {
      dialog.showErrorBox('SA Traders ERP — Startup Error', err.stack || err.message);
    } catch {
      // dialog may not be available yet; worst case, silently fail
    }
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── Auto-backup on quit ─────────────────────────────────
// Performs a full cloud backup before the app exits, then
// enforces the 30-backup retention policy.

let isQuitting = false;
const BACKUP_TIMEOUT_MS = 30_000;

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;

  console.log('[Backup] Auto backup on exit…');

  let timeoutId;
  const backupPromise = (async () => {
    const { createFullBackup, cleanupOldBackups } = require('./backupService');
    const result = await createFullBackup();
    if (result.success) {
      console.log('[Backup] Auto backup completed before exit');
      await cleanupOldBackups();
    } else {
      console.log('[Backup] Auto backup failed, continuing shutdown');
    }
  })();

  const race = Promise.race([
    backupPromise,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timeout')), BACKUP_TIMEOUT_MS);
    }),
  ]);

  try {
    await race;
  } catch (err) {
    if (err.message === 'timeout') {
      console.log('[Backup] Backup timeout, continuing shutdown');
    } else {
      console.log('[Backup] Auto backup error, continuing shutdown');
    }
  } finally {
    clearTimeout(timeoutId);
  }

  app.quit();
});
