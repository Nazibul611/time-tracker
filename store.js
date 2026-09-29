const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  projects: [],
  tasks: [],
  sessions: [],
  settings: { promptOnSwitch: true, promptTimeoutSec: 15, pollIntervalMs: 2000 }
};

class Store {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'data.json');
    this.data = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return { ...DEFAULT_DATA, ...JSON.parse(raw) };
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  _id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  getAll() {
    return this.data;
  }

  addProject(name, color) {
    const project = {
      id: this._id(),
      name,
      color: color || '#5b8def',
      client: '',
      startDate: '',
      deadline: '',
      notes: '',
      attachments: []
    };
    this.data.projects.push(project);
    this._save();
    return project;
  }

  updateProject(id, patch) {
    const project = this.data.projects.find((p) => p.id === id);
    if (project) {
      ['client', 'startDate', 'deadline', 'notes'].forEach((k) => {
        if (patch[k] !== undefined) project[k] = patch[k];
      });
      this._save();
    }
    return project;
  }

  deleteProject(id) {
    const userDataDir = path.dirname(this.filePath);
    const attachDir = path.join(userDataDir, 'attachments', id);
    try { fs.rmSync(attachDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }

    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    const taskIds = this.data.tasks.filter((t) => t.projectId === id).map((t) => t.id);
    this.data.tasks = this.data.tasks.filter((t) => t.projectId !== id);
    this.data.sessions = this.data.sessions.filter((s) => !taskIds.includes(s.taskId));
    this._save();
  }

  addAttachment(projectId, attachment) {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) return null;
    if (!project.attachments) project.attachments = [];
    const att = { id: this._id(), addedAt: Date.now(), ...attachment };
    project.attachments.push(att);
    this._save();
    return att;
  }

  deleteAttachment(projectId, attachmentId) {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project || !project.attachments) return;
    const att = project.attachments.find((a) => a.id === attachmentId);
    if (att && att.path) {
      try { fs.unlinkSync(att.path); } catch (e) { /* ignore */ }
    }
    project.attachments = project.attachments.filter((a) => a.id !== attachmentId);
    this._save();
  }

  addTask(projectId, name) {
    const task = { id: this._id(), projectId, name };
    this.data.tasks.push(task);
    this._save();
    return task;
  }

  deleteTask(id) {
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
    this.data.sessions = this.data.sessions.filter((s) => s.taskId !== id);
    this._save();
  }

  renameTask(id, name) {
    const task = this.data.tasks.find((t) => t.id === id);
    if (task) {
      task.name = name;
      this._save();
    }
    return task;
  }

  updateTask(id, patch) {
    const task = this.data.tasks.find((t) => t.id === id);
    if (task) {
      ['name', 'deadline', 'notes'].forEach((k) => {
        if (patch[k] !== undefined) task[k] = patch[k];
      });
      this._save();
    }
    return task;
  }

  renameProject(id, name) {
    const project = this.data.projects.find((p) => p.id === id);
    if (project) {
      project.name = name;
      this._save();
    }
    return project;
  }

  startSession(taskId) {
    // close any dangling open session first
    this.data.sessions.forEach((s) => {
      if (!s.end) s.end = Date.now();
    });
    const session = { id: this._id(), taskId, start: Date.now(), end: null };
    this.data.sessions.push(session);
    this._save();
    return session;
  }

  stopSession(sessionId) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (session && !session.end) {
      session.end = Date.now();
      this._save();
    }
    return session;
  }

  stopAllOpenSessions() {
    let changed = false;
    this.data.sessions.forEach((s) => {
      if (!s.end) {
        s.end = Date.now();
        changed = true;
      }
    });
    if (changed) this._save();
  }

  getOpenSession() {
    return this.data.sessions.find((s) => !s.end) || null;
  }

  addManualSession(taskId, start, end) {
    const session = { id: this._id(), taskId, start, end };
    this.data.sessions.push(session);
    this._save();
    return session;
  }

  updateSession(id, patch) {
    const session = this.data.sessions.find((s) => s.id === id);
    if (session) {
      if (patch.taskId !== undefined) session.taskId = patch.taskId;
      if (patch.start !== undefined) session.start = patch.start;
      if (patch.end !== undefined) session.end = patch.end;
      this._save();
    }
    return session;
  }

  deleteSession(id) {
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    this._save();
  }

  listSessions(limit = 20) {
    return [...this.data.sessions]
      .filter((s) => s.end) // exclude the currently-running one
      .sort((a, b) => b.start - a.start)
      .slice(0, limit)
      .map((s) => {
        const task = this.data.tasks.find((t) => t.id === s.taskId);
        const project = task ? this.data.projects.find((p) => p.id === task.projectId) : null;
        return {
          id: s.id,
          taskId: s.taskId,
          taskName: task ? task.name : '(deleted task)',
          projectName: project ? project.name : '',
          start: s.start,
          end: s.end
        };
      });
  }

  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this._save();
    return this.data.settings;
  }

  // --- Reporting helpers ---

  durationForTask(taskId, fromTs, toTs) {
    return this.data.sessions
      .filter((s) => s.taskId === taskId)
      .reduce((sum, s) => {
        const start = Math.max(s.start, fromTs);
        const end = Math.min(s.end || Date.now(), toTs);
        return sum + Math.max(0, end - start);
      }, 0);
  }

  weeklyReport(weekStartTs, weekEndTs) {
    return this.data.tasks.map((task) => {
      const project = this.data.projects.find((p) => p.id === task.projectId);
      return {
        taskId: task.id,
        taskName: task.name,
        projectName: project ? project.name : '(no project)',
        ms: this.durationForTask(task.id, weekStartTs, weekEndTs)
      };
    }).filter((r) => r.ms > 0)
      .sort((a, b) => b.ms - a.ms);
  }

  totalsByTask(fromTs, toTs) {
    return this.weeklyReport(fromTs, toTs);
  }
}

module.exports = Store;
