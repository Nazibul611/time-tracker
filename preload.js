const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  togglePin: () => ipcRenderer.invoke('window-toggle-pin'),

  getAll: () => ipcRenderer.invoke('data-get-all'),

  addProject: (name, color) => ipcRenderer.invoke('project-add', name, color),
  deleteProject: (id) => ipcRenderer.invoke('project-delete', id),
  updateProject: (id, patch) => ipcRenderer.invoke('project-update', id, patch),

  addTask: (projectId, name) => ipcRenderer.invoke('task-add', projectId, name),
  deleteTask: (id) => ipcRenderer.invoke('task-delete', id),
  renameTask: (id, name) => ipcRenderer.invoke('task-rename', id, name),
  updateTaskDetails: (id, patch) => ipcRenderer.invoke('task-update', id, patch),
  renameProject: (id, name) => ipcRenderer.invoke('project-rename', id, name),

  startSession: (taskId) => ipcRenderer.invoke('session-start', taskId),
  stopSession: (sessionId) => ipcRenderer.invoke('session-stop', sessionId),
  getOpenSession: () => ipcRenderer.invoke('session-get-open'),
  addManualSession: (taskId, start, end) => ipcRenderer.invoke('session-add-manual', taskId, start, end),
  updateSession: (id, patch) => ipcRenderer.invoke('session-update', id, patch),
  deleteSession: (id) => ipcRenderer.invoke('session-delete', id),
  listSessions: (limit) => ipcRenderer.invoke('session-list', limit),

  updateSettings: (patch) => ipcRenderer.invoke('settings-update', patch),

  weeklyReport: (fromTs, toTs) => ipcRenderer.invoke('report-weekly', fromTs, toTs),
  exportCsv: (rows, suggestedName) => ipcRenderer.invoke('report-export-csv', rows, suggestedName),

  addAttachmentLink: (projectId, label, url, type, month) =>
    ipcRenderer.invoke('attachment-add-link', projectId, label, url, type, month),
  addAttachmentFile: (projectId, label, type, month) =>
    ipcRenderer.invoke('attachment-add-file', projectId, label, type, month),
  deleteAttachment: (projectId, attachmentId) => ipcRenderer.invoke('attachment-delete', projectId, attachmentId),
  openAttachment: (attachment) => ipcRenderer.invoke('attachment-open', attachment),

  onForegroundWindowChanged: (callback) => {
    ipcRenderer.on('foreground-window-changed', (event, info) => callback(info));
  }
});
