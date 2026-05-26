const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

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
  // Create tables if dev.db exists but schema was never pushed
  const { ensureDatabaseSchema } = require('./ensureDatabase');
  await ensureDatabaseSchema();

  // Load IPC database controllers (after schema exists)
  require('./ipcHandlers');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
