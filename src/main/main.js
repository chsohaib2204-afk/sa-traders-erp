const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Global crash prevention ─────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[ERP] Unhandled Rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[ERP] Uncaught Exception:', err.message);
});

// ─── Environment ─────────────────────────────────────────
// Load .env from project root (dev) or resources dir (packaged)
try {
  const dotenv = require('dotenv');
  const possiblePaths = [
    path.join(__dirname, '../../.env'),
    path.join(process.resourcesPath || '', '.env'),
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) { dotenv.config({ path: envPath }); break; }
  }
} catch {
  // dotenv optional; env vars come from OS or manual config
}

app.commandLine.appendSwitch('force-device-scale-factor', '1');
const isDev = !app.isPackaged;

// ─── Database path ───────────────────────────────────────
const dbDir = isDev
  ? path.join(__dirname, '../database')
  : path.join(app.getPath('userData'), 'database');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, isDev ? 'dev.db' : 'prod.db');
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
console.log(`[ERP Startup] Database: ${dbPath}`);

let mainWindow;
let dbReady = false;

// ─── Window creation ─────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'SA Traders ERP',
    show: false,
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Bootstrap (DB → IPC → Sync → UI) ───────────────────
app.whenReady().then(async () => {
  try {
    // 1. Database bootstrap (creates tables, runs migrations)
    const { ensureDatabaseSchema } = require('./ensureDatabase');
    const bootResult = await ensureDatabaseSchema();
    dbReady = bootResult.success;

    if (!dbReady) {
      console.error('[ERP] Database init failed:', bootResult.error);
    }

    // 2. Load IPC handlers (non-blocking)
    try {
      require('./ipcHandlers');
    } catch (err) {
      console.error('[ERP] IPC handlers failed:', err);
    }

    // 3. Start sync service ONLY after DB is confirmed ready
    if (dbReady) {
      try {
        const { startSyncService } = require('./syncService');
        startSyncService();
      } catch (err) {
        console.error('[ERP] Sync service failed:', err);
      }
    } else {
      console.log('[ERP] DB not ready — sync disabled');
    }

    // 4. Create window last
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error('[ERP] Fatal startup error:', err);
    try {
      dialog.showErrorBox('SA Traders ERP — Startup Error', err.stack || err.message);
    } catch {
      // dialog unavailable — silently fail
    }
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Auto-backup on quit ─────────────────────────────────
let isQuitting = false;
const BACKUP_TIMEOUT_MS = 30_000;

app.on('before-quit', async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;

  if (!dbReady) {
    console.log('[Backup] DB not ready — skipping backup');
    app.quit();
    return;
  }

  console.log('[Backup] Auto backup on exit…');

  let timeoutId;
  const backupPromise = (async () => {
    const { createFullBackup, cleanupOldBackups } = require('./backupService');
    const result = await createFullBackup();
    if (result.success) {
      console.log('[Backup] Auto backup completed');
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