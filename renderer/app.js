let state = { projects: [], tasks: [], sessions: [], settings: {} };
let openSession = null;
let tickTimer = null;
let currentWeekStart = startOfWeek(new Date());
let pendingSwitchTaskId = null;
let selectedProjectId = null;

// ---------- Titlebar ----------
document.getElementById('min-btn').onclick = () => window.api.minimize();
document.getElementById('close-btn').onclick = () => window.api.close();
document.getElementById('pin-btn').onclick = async () => {
  const pinned = await window.api.togglePin();
  document.getElementById('pin-btn').style.opacity = pinned ? '1' : '0.4';
};

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'report') renderReport();
    if (btn.dataset.tab === 'analysis') renderAnalysis();
    if (btn.dataset.tab === 'entries') renderEntries();
    if (btn.dataset.tab === 'daily') renderDaily();
  };
});

// ---------- Data load ----------
async function refreshState() {
  state = await window.api.getAll();
  openSession = await window.api.getOpenSession();
  renderTaskSelect();
  renderProjectList();
  renderEntryTaskSelect();
  updateTimerUI();

  if (selectedProjectId) {
    const stillExists = state.projects.find((p) => p.id === selectedProjectId);
    if (stillExists) {
      renderProjectDetail();
    } else {
      selectedProjectId = null;
      document.getElementById('project-detail').classList.add('hidden');
    }
  }
}

function renderEntryTaskSelect() {
  const sel = document.getElementById('entry-task-select');
  const prev = sel.value;
  sel.innerHTML = '';
  state.tasks.forEach((t) => {
    const project = state.projects.find((p) => p.id === t.projectId);
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${project ? project.name + ' / ' : ''}${t.name}`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function renderTaskSelect() {
  const sel = document.getElementById('task-select');
  const prev = sel.value;
  sel.innerHTML = '';
  state.tasks.forEach((t) => {
    const project = state.projects.find((p) => p.id === t.projectId);
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${project ? project.name + ' / ' : ''}${t.name}`;
    sel.appendChild(opt);
  });
  if (openSession) sel.value = openSession.taskId;
  else if (prev) sel.value = prev;
}

function renderProjectList() {
  const el = document.getElementById('project-list');
  el.innerHTML = '';
  state.projects.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'item-row project-row' + (p.id === selectedProjectId ? ' selected' : '');

    const label = document.createElement('span');
    label.className = 'project-label';
    label.textContent = p.name;
    label.onclick = () => selectProject(p.id);
    row.appendChild(label);

    const actions = document.createElement('span');

    const edit = document.createElement('button');
    edit.className = 'edit-btn';
    edit.textContent = 'Rename';
    edit.onclick = (e) => {
      e.stopPropagation();
      startInlineRename(row, label, p.name, async (newName) => {
        await window.api.renameProject(p.id, newName);
        refreshState();
      });
    };
    actions.appendChild(edit);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.onclick = async (e) => {
      e.stopPropagation();
      await window.api.deleteProject(p.id);
      if (selectedProjectId === p.id) {
        selectedProjectId = null;
        document.getElementById('project-detail').classList.add('hidden');
      }
      refreshState();
    };
    actions.appendChild(del);

    row.appendChild(actions);
    el.appendChild(row);
  });
}

function selectProject(id) {
  selectedProjectId = id;
  renderProjectList();
  renderProjectDetail();
}

function renderProjectDetail() {
  const project = state.projects.find((p) => p.id === selectedProjectId);
  if (!project) return;

  document.getElementById('project-detail').classList.remove('hidden');
  document.getElementById('detail-project-name').textContent = project.name;
  document.getElementById('detail-client').value = project.client || '';
  document.getElementById('detail-start-date').value = project.startDate || '';
  document.getElementById('detail-deadline').value = project.deadline || '';
  document.getElementById('detail-notes').value = project.notes || '';

  // --- tasks scoped to this project ---
  const taskListEl = document.getElementById('detail-task-list');
  taskListEl.innerHTML = '';
  const tasks = state.tasks.filter((t) => t.projectId === project.id);
  tasks.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'item-row';

    const label = document.createElement('span');
    label.textContent = t.name;
    row.appendChild(label);

    const deadline = document.createElement('input');
    deadline.type = 'date';
    deadline.className = 'inline-edit task-deadline';
    deadline.value = t.deadline || '';
    deadline.title = 'Task deadline';
    deadline.onchange = async () => {
      await window.api.updateTaskDetails(t.id, { deadline: deadline.value });
      refreshState();
    };
    row.appendChild(deadline);

    const actions = document.createElement('span');

    const edit = document.createElement('button');
    edit.className = 'edit-btn';
    edit.textContent = 'Rename';
    edit.onclick = () => startInlineRename(row, label, t.name, async (newName) => {
      await window.api.renameTask(t.id, newName);
      refreshState();
    });
    actions.appendChild(edit);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.onclick = async () => { await window.api.deleteTask(t.id); refreshState(); };
    actions.appendChild(del);

    row.appendChild(actions);
    taskListEl.appendChild(row);
  });
  if (tasks.length === 0) taskListEl.innerHTML = '<p>No tasks yet.</p>';

  // --- attachments (docs / invoices) ---
  const attEl = document.getElementById('detail-attachments');
  attEl.innerHTML = '';
  const attachments = project.attachments || [];
  attachments.forEach((a) => {
    const row = document.createElement('div');
    row.className = 'entry-row';
    const typeLabel = a.type === 'invoice'
      ? `Invoice${a.month ? ' · ' + a.month : ''}`
      : (a.type === 'link' ? 'Link' : 'Document');
    row.innerHTML = `
      <div class="entry-info">
        <span>${a.label}</span>
        <span class="entry-meta">${typeLabel}</span>
      </div>
    `;
    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const open = document.createElement('button');
    open.className = 'edit-btn';
    open.textContent = 'Open';
    open.onclick = () => window.api.openAttachment(a);
    actions.appendChild(open);

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = 'Delete';
    del.onclick = async () => { await window.api.deleteAttachment(project.id, a.id); refreshState(); };
    actions.appendChild(del);

    row.appendChild(actions);
    attEl.appendChild(row);
  });
  if (attachments.length === 0) attEl.innerHTML = '<p>No docs or invoices attached yet.</p>';
}

// Swaps a row's label for an inline text input; calls onSave(newName) on Enter/blur-confirm.
function startInlineRename(row, labelEl, currentName, onSave, prefix = '') {
  const input = document.createElement('input');
  input.className = 'inline-edit';
  input.value = currentName;
  row.replaceChild(input, labelEl);
  input.focus();
  input.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (val && val !== currentName) onSave(val);
    else row.replaceChild(labelEl, input);
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { done = true; row.replaceChild(labelEl, input); }
  };
  input.onblur = commit;
}

// ---------- Add project/task ----------
document.getElementById('add-project-btn').onclick = async () => {
  const input = document.getElementById('new-project-name');
  if (!input.value.trim()) return;
  await window.api.addProject(input.value.trim());
  input.value = '';
  refreshState();
};

document.getElementById('detail-save-btn').onclick = async () => {
  if (!selectedProjectId) return;
  const patch = {
    client: document.getElementById('detail-client').value.trim(),
    startDate: document.getElementById('detail-start-date').value,
    deadline: document.getElementById('detail-deadline').value,
    notes: document.getElementById('detail-notes').value
  };
  await window.api.updateProject(selectedProjectId, patch);
  refreshState();
};

document.getElementById('detail-add-task-btn').onclick = async () => {
  if (!selectedProjectId) return;
  const input = document.getElementById('detail-new-task-name');
  if (!input.value.trim()) return;
  await window.api.addTask(selectedProjectId, input.value.trim());
  input.value = '';
  refreshState();
};

// --- docs & invoices ---
document.getElementById('attachment-type').onchange = (e) => {
  document.getElementById('attachment-month').classList.toggle('hidden', e.target.value !== 'invoice');
};

document.getElementById('attach-file-btn').onclick = async () => {
  if (!selectedProjectId) return;
  const label = document.getElementById('attachment-label').value.trim();
  const type = document.getElementById('attachment-type').value;
  const month = type === 'invoice' ? document.getElementById('attachment-month').value : null;
  const att = await window.api.addAttachmentFile(selectedProjectId, label, type, month);
  if (att) {
    document.getElementById('attachment-label').value = '';
    refreshState();
  }
};

document.getElementById('attach-link-btn').onclick = async () => {
  if (!selectedProjectId) return;
  const label = document.getElementById('attachment-label').value.trim();
  const url = document.getElementById('attachment-url').value.trim();
  if (!url) return;
  const type = document.getElementById('attachment-type').value;
  const month = type === 'invoice' ? document.getElementById('attachment-month').value : null;
  await window.api.addAttachmentLink(selectedProjectId, label, url, type, month);
  document.getElementById('attachment-label').value = '';
  document.getElementById('attachment-url').value = '';
  refreshState();
};

// ---------- Timer ----------
function updateTimerUI() {
  const btn = document.getElementById('start-stop-btn');
  if (openSession) {
    btn.textContent = 'Stop';
    btn.classList.add('running');
    startTick();
  } else {
    btn.textContent = 'Start';
    btn.classList.remove('running');
    stopTick();
    document.getElementById('elapsed').textContent = '00:00:00';
  }
}

function startTick() {
  stopTick();
  tickTimer = setInterval(() => {
    if (!openSession) return;
    const ms = Date.now() - openSession.start;
    document.getElementById('elapsed').textContent = formatDuration(ms);
  }, 1000);
}
function stopTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

document.getElementById('start-stop-btn').onclick = async () => {
  if (openSession) {
    await window.api.stopSession(openSession.id);
    openSession = null;
  } else {
    const taskId = document.getElementById('task-select').value;
    if (!taskId) return;
    openSession = await window.api.startSession(taskId);
  }
  updateTimerUI();
};

document.getElementById('task-select').onchange = async () => {
  // switching the dropdown while running restarts the session on the new task
  if (openSession) {
    await window.api.stopSession(openSession.id);
    const taskId = document.getElementById('task-select').value;
    openSession = await window.api.startSession(taskId);
    updateTimerUI();
  }
};

// ---------- Window-switch prompt ----------
window.api.onForegroundWindowChanged((info) => {
  if (!openSession) return; // nothing to prompt about if nothing is running
  pendingSwitchTaskId = openSession.taskId;
  document.getElementById('switch-message').textContent =
    `You switched to "${info.processName}" (${info.title || 'no title'}). Still working on this task?`;
  document.getElementById('switch-overlay').classList.remove('hidden');
});

document.getElementById('switch-keep').onclick = () => {
  document.getElementById('switch-overlay').classList.add('hidden');
};
document.getElementById('switch-pause').onclick = async () => {
  if (openSession) {
    await window.api.stopSession(openSession.id);
    openSession = null;
    updateTimerUI();
  }
  document.getElementById('switch-overlay').classList.add('hidden');
};
document.getElementById('switch-change').onclick = () => {
  document.getElementById('switch-overlay').classList.add('hidden');
  document.querySelector('.tab-btn[data-tab="timer"]').click();
  document.getElementById('task-select').focus();
};

// ---------- Manual entries ----------
let editingSessionId = null;

function todayDateStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

document.getElementById('entry-date').value = todayDateStr();

function combineDateTime(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD, timeStr: HH:MM (local time)
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

document.getElementById('manual-entry-form').onsubmit = async (e) => {
  e.preventDefault();
  const taskId = document.getElementById('entry-task-select').value;
  const dateStr = document.getElementById('entry-date').value;
  const startStr = document.getElementById('entry-start').value;
  const endStr = document.getElementById('entry-end').value;
  if (!taskId || !dateStr || !startStr || !endStr) return;

  const start = combineDateTime(dateStr, startStr);
  let end = combineDateTime(dateStr, endStr);
  if (end <= start) end += 24 * 3600 * 1000; // entry crossed midnight

  if (editingSessionId) {
    await window.api.updateSession(editingSessionId, { taskId, start, end });
    cancelEntryEdit();
  } else {
    await window.api.addManualSession(taskId, start, end);
  }
  document.getElementById('entry-start').value = '';
  document.getElementById('entry-end').value = '';
  renderEntries();
};

document.getElementById('entry-cancel-btn').onclick = () => cancelEntryEdit();

function cancelEntryEdit() {
  editingSessionId = null;
  document.getElementById('entry-save-btn').textContent = 'Add entry';
  document.getElementById('entry-cancel-btn').classList.add('hidden');
  document.getElementById('entry-start').value = '';
  document.getElementById('entry-end').value = '';
  document.getElementById('entry-date').value = todayDateStr();
}

function timeStrFromTs(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function renderEntries() {
  const entries = await window.api.listSessions(30);
  const el = document.getElementById('entry-list');
  el.innerHTML = '';
  entries.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'entry-row';
    const hours = ((s.end - s.start) / 3600000).toFixed(2);
    const dateLabel = new Date(s.start).toLocaleDateString();
    row.innerHTML = `
      <div class="entry-info">
        <span>${s.projectName ? s.projectName + ' / ' : ''}${s.taskName}</span>
        <span class="entry-meta">${dateLabel}, ${timeStrFromTs(s.start)}–${timeStrFromTs(s.end)} (${hours}h)</span>
      </div>
    `;
    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const edit = document.createElement('button');
    edit.className = 'edit-btn';
    edit.textContent = 'Edit';
    edit.onclick = () => {
      editingSessionId = s.id;
      document.getElementById('entry-task-select').value = s.taskId;
      document.getElementById('entry-date').value = new Date(s.start).toISOString().slice(0, 10);
      document.getElementById('entry-start').value = timeStrFromTs(s.start);
      document.getElementById('entry-end').value = timeStrFromTs(s.end);
      document.getElementById('entry-save-btn').textContent = 'Save changes';
      document.getElementById('entry-cancel-btn').classList.remove('hidden');
    };
    actions.appendChild(edit);

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = 'Delete';
    del.onclick = async () => { await window.api.deleteSession(s.id); renderEntries(); };
    actions.appendChild(del);

    row.appendChild(actions);
    el.appendChild(row);
  });
  if (entries.length === 0) el.innerHTML = '<p>No entries yet — log one above, or run the timer.</p>';
}

// ---------- Daily (day-wise breakdown for the selected week) ----------
async function renderDaily() {
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  document.getElementById('week-label-daily').textContent =
    `${currentWeekStart.toLocaleDateString()} – ${new Date(weekEnd - 1).toLocaleDateString()}`;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(currentWeekStart);
    dayStart.setDate(dayStart.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const rows = await window.api.weeklyReport(dayStart.getTime(), dayEnd.getTime());
    const totalMs = rows.reduce((sum, r) => sum + r.ms, 0);
    days.push({ dayStart, rows, totalMs });
  }

  const max = Math.max(...days.map((d) => d.totalMs), 1);
  const el = document.getElementById('daily-bars');
  el.innerHTML = '';

  days.forEach((day, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'bar-row day-row' + (day.totalMs === 0 ? ' empty' : '');
    const dateLabel = day.dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    wrap.innerHTML = `
      <div class="bar-label"><span>${dateLabel}</span><span>${(day.totalMs / 3600000).toFixed(2)}h</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(day.totalMs / max) * 100}%"></div></div>
    `;
    const breakdown = document.createElement('div');
    breakdown.className = 'day-breakdown';
    breakdown.id = `day-breakdown-${idx}`;
    day.rows.forEach((r) => {
      const sub = document.createElement('div');
      sub.className = 'sub-row';
      sub.innerHTML = `<span>${r.projectName} / ${r.taskName}</span><span>${(r.ms / 3600000).toFixed(2)}h</span>`;
      breakdown.appendChild(sub);
    });
    if (day.rows.length === 0) breakdown.innerHTML = '<div class="sub-row">No time logged</div>';

    if (day.totalMs > 0) {
      wrap.onclick = () => breakdown.classList.toggle('open');
    }

    el.appendChild(wrap);
    el.appendChild(breakdown);
  });
}

// ---------- Report ----------
function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function renderReport() {
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  document.getElementById('week-label').textContent =
    `${currentWeekStart.toLocaleDateString()} – ${new Date(weekEnd - 1).toLocaleDateString()}`;

  const rows = await window.api.weeklyReport(currentWeekStart.getTime(), weekEnd.getTime());
  const tbody = document.querySelector('#report-table tbody');
  tbody.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.projectName}</td><td>${r.taskName}</td><td>${(r.ms / 3600000).toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('report-table').dataset.rows = JSON.stringify(rows);
}

document.getElementById('prev-week-btn').onclick = () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  renderReport();
  renderDaily();
};
document.getElementById('next-week-btn').onclick = () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  renderReport();
  renderDaily();
};
document.getElementById('prev-week-btn-daily').onclick = () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  renderReport();
  renderDaily();
};
document.getElementById('next-week-btn-daily').onclick = () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  renderReport();
  renderDaily();
};
document.getElementById('export-csv-btn').onclick = async () => {
  const rows = JSON.parse(document.getElementById('report-table').dataset.rows || '[]');
  const name = `weekly-report-${currentWeekStart.toISOString().slice(0, 10)}.csv`;
  await window.api.exportCsv(rows, name);
};

// ---------- Analysis (all-time totals by task) ----------
async function renderAnalysis() {
  const rows = await window.api.weeklyReport(0, Date.now());
  const el = document.getElementById('analysis-bars');
  el.innerHTML = '';
  const max = Math.max(...rows.map((r) => r.ms), 1);
  rows.forEach((r) => {
    const wrap = document.createElement('div');
    wrap.className = 'bar-row';
    wrap.innerHTML = `
      <div class="bar-label"><span>${r.projectName} / ${r.taskName}</span><span>${(r.ms / 3600000).toFixed(1)}h</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.ms / max) * 100}%"></div></div>
    `;
    el.appendChild(wrap);
  });
  if (rows.length === 0) el.innerHTML = '<p>No tracked time yet.</p>';
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

refreshState();
