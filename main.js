const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./store');
const WindowWatcher = require('./windowWatcher');

let mainWindow;
let store;
let watcher;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 300,
    minHeight: 380,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));

  createWindow();

  watcher = new WindowWatcher({
    intervalMs: store.getAll().settings.pollIntervalMs || 2000,
    onChange: (info) => {
      if (!store.getAll().settings.promptOnSwitch) return;
      // Ignore switching to our own tracker window
      if (info.title && info.title.includes('Floating Time Tracker')) return;
      if (mainWindow) {
        mainWindow.webContents.send('foreground-window-changed', info);
      }
    }
  });
  watcher.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (watcher) watcher.stop();
  if (store) store.stopAllOpenSessions();
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC: window chrome ----------

ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
ipcMain.handle('window-toggle-pin', () => {
  const pinned = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(pinned);
  return pinned;
});

// ---------- IPC: data ----------

ipcMain.handle('data-get-all', () => store.getAll());

ipcMain.handle('project-add', (e, name, color) => store.addProject(name, color));
ipcMain.handle('project-delete', (e, id) => store.deleteProject(id));
ipcMain.handle('project-update', (e, id, patch) => store.updateProject(id, patch));

ipcMain.handle('task-add', (e, projectId, name) => store.addTask(projectId, name));
ipcMain.handle('task-delete', (e, id) => store.deleteTask(id));
ipcMain.handle('task-rename', (e, id, name) => store.renameTask(id, name));
ipcMain.handle('task-update', (e, id, patch) => store.updateTask(id, patch));
ipcMain.handle('project-rename', (e, id, name) => store.renameProject(id, name));

ipcMain.handle('session-start', (e, taskId) => store.startSession(taskId));
ipcMain.handle('session-stop', (e, sessionId) => store.stopSession(sessionId));
ipcMain.handle('session-get-open', () => store.getOpenSession());
ipcMain.handle('session-add-manual', (e, taskId, start, end) => store.addManualSession(taskId, start, end));
ipcMain.handle('session-update', (e, id, patch) => store.updateSession(id, patch));
ipcMain.handle('session-delete', (e, id) => store.deleteSession(id));
ipcMain.handle('session-list', (e, limit) => store.listSessions(limit));

ipcMain.handle('settings-update', (e, patch) => {
  const updated = store.updateSettings(patch);
  if (patch.pollIntervalMs && watcher) watcher.setInterval(patch.pollIntervalMs);
  return updated;
});

ipcMain.handle('report-weekly', (e, fromTs, toTs) => store.weeklyReport(fromTs, toTs));

ipcMain.handle('report-export-csv', async (e, rows, suggestedName) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedName || 'weekly-report.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { saved: false };

  const header = 'Project,Task,Hours\n';
  const body = rows
    .map((r) => `${r.projectName},${r.taskName},${(r.ms / 3600000).toFixed(2)}`)
    .join('\n');
  fs.writeFileSync(filePath, header + body, 'utf-8');
  return { saved: true, filePath };
});

// ---------- IPC: project attachments (docs / invoices) ----------

ipcMain.handle('attachment-add-link', (e, projectId, label, url, type, month) => {
  if (!url) return null;
  return store.addAttachment(projectId, { label: label || url, url, type: type || 'link', month: month || null });
});

ipcMain.handle('attachment-add-file', async (e, projectId, label, type, month) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return null;

  const src = filePaths[0];
  const fileName = path.basename(src);
  const destDir = path.join(app.getPath('userData'), 'attachments', projectId);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, `${Date.now()}-${fileName}`);
  fs.copyFileSync(src, destPath);

  return store.addAttachment(projectId, {
    label: label && label.trim() ? label.trim() : fileName,
    path: destPath,
    type: type || 'doc',
    month: month || null
  });
});

ipcMain.handle('attachment-delete', (e, projectId, attachmentId) => store.deleteAttachment(projectId, attachmentId));

ipcMain.handle('attachment-open', (e, attachment) => {
  if (attachment.path) return shell.openPath(attachment.path);
  if (attachment.url) return shell.openExternal(attachment.url);
  return null;
});
