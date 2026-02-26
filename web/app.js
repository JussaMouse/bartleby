// Bartleby Dashboard — app.js
// Vanilla JS, no framework. Functions grouped by concern.
// Render functions receive data and return HTML strings only.
// State and data fetching at the top level.

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('bartleby_token') || '';
}

function setToken(token) {
  localStorage.setItem('bartleby_token', token);
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket
// ─────────────────────────────────────────────────────────────────────────────

let ws = null;
let wsReconnectTimer = null;
const wsSubscriptions = new Set(); // view names currently open in panels

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener('open', () => {
    setStatus('connected');
    clearTimeout(wsReconnectTimer);
    // Re-subscribe all open panels
    for (const view of wsSubscriptions) {
      wsSubscribe(view);
    }
  });

  ws.addEventListener('message', (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {
      // ignore malformed messages
    }
  });

  ws.addEventListener('close', () => {
    setStatus('disconnected');
    wsReconnectTimer = setTimeout(connect, 3000);
  });

  ws.addEventListener('error', () => {
    ws.close();
  });
}

function wsSubscribe(viewName) {
  wsSubscriptions.add(viewName);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', view: viewName }));
  }
}

function wsUnsubscribe(viewName) {
  wsSubscriptions.delete(viewName);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'unsubscribe', view: viewName }));
  }
}

function onMessage(msg) {
  if (msg.type === 'data' && msg.view && msg.viewData) {
    updatePanelData(msg.view, msg.viewData);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────────────────────────────────────

// panels: Array<{ id: string, view: string, el: HTMLElement }>
const panels = [];

function addPanel(view) {
  const id = `panel-${Date.now()}`;
  const el = document.createElement('div');
  el.className = 'panel';
  el.dataset.panelId = id;
  el.dataset.view = view;

  if (view === 'repl') {
    el.innerHTML = renderReplPanel();
    document.getElementById('panels').appendChild(el);
    panels.push({ id, view, el });
    savePanels();
    const input = el.querySelector('.repl-input');
    if (input) input.focus();
    return;
  }

  el.innerHTML = `<div class="panel-header">
    <span class="panel-title">${esc(view)}</span>
    <button class="panel-close" onclick="removePanel('${id}')">&times;</button>
  </div>
  <div class="panel-body loading">Loading…</div>`;

  document.getElementById('panels').appendChild(el);
  panels.push({ id, view, el });
  savePanels();

  wsSubscribe(view);
  loadPanel(id, view);
}

function removePanel(id) {
  const idx = panels.findIndex(p => p.id === id);
  if (idx === -1) return;
  const { view, el } = panels[idx];
  el.remove();
  panels.splice(idx, 1);
  if (!panels.some(p => p.view === view)) {
    wsUnsubscribe(view);
  }
  savePanels();
}

async function loadPanel(id, view) {
  try {
    const viewData = await apiFetch(`/api/view/${encodeURIComponent(view)}`);
    updatePanelData(view, viewData);
  } catch (err) {
    setPanelBody(id, `<div class="error">Error: ${esc(err.message)}</div>`);
  }
}

function updatePanelData(view, viewData) {
  for (const panel of panels) {
    if (panel.view !== view) continue;
    const html = renderViewData(viewData);
    const body = panel.el.querySelector('.panel-body');
    const header = panel.el.querySelector('.panel-title');
    if (body) {
      body.className = 'panel-body';
      body.innerHTML = html;
    }
    if (header) header.textContent = viewData.title;
  }
}

function setPanelBody(id, html) {
  const panel = panels.find(p => p.id === id);
  if (!panel) return;
  const body = panel.el.querySelector('.panel-body');
  if (body) body.innerHTML = html;
}

function savePanels() {
  const saved = panels.map(p => p.view);
  localStorage.setItem('bartleby_panels', JSON.stringify(saved));
}

function loadPanels() {
  try {
    const saved = JSON.parse(localStorage.getItem('bartleby_panels') || '[]');
    for (const view of saved) {
      addPanel(view);
    }
  } catch {
    addPanel('Inbox');
    addPanel('Next Actions');
  }
  if (panels.length === 0) {
    addPanel('Inbox');
    addPanel('Next Actions');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderViewData(viewData) {
  if (!viewData?.sections?.length) {
    return '<div class="empty">Nothing here.</div>';
  }
  return viewData.sections.map(renderSection).join('');
}

function renderSection(section) {
  switch (section.kind) {
    case 'content':   return renderContentSection(section);
    case 'list':      return renderListSection(section);
    case 'metadata':  return renderMetadataSection(section);
    case 'graph':
      return `<div class="section section-graph"><span class="muted">${section.nodes?.length ?? 0} nodes, ${section.edges?.length ?? 0} connections</span></div>`;
    default:
      return '';
  }
}

function renderContentSection(section) {
  if (!section.markdown?.trim() && !section.html?.trim()) return '';
  return `<div class="section section-content">
    <div class="section-title">${esc(section.title)}</div>
    <div class="content-body">${renderMarkdown(section.html || section.markdown)}</div>
  </div>`;
}

function renderListSection(section) {
  if (!section.items?.length) return '';
  const items = section.items.map(renderListItem).join('');
  return `<div class="section section-list">
    <div class="section-title">${esc(section.title)} <span class="count">${section.count}</span></div>
    <ul class="item-list">${items}</ul>
  </div>`;
}

function renderListItem(item) {
  const icon = statusIcon(item.status);
  const ctx = item.context ? `<span class="item-context">${esc(item.context)}</span>` : '';
  const due = item.due ? `<span class="item-due">${formatDate(item.due)}</span>` : '';
  const project = item.project ? `<span class="item-project">${esc(item.project)}</span>` : '';
  const completable = item.type === 'action' && item.status === 'active';

  return `<li class="item status-${esc(item.status)}" data-id="${esc(item.id)}" data-type="${esc(item.type)}" onclick="openRecord('${esc(item.id)}')">
    <span class="item-icon">${icon}</span>
    <span class="item-title">${esc(item.title)}</span>
    ${ctx}${due}${project}
    <span class="item-actions">
      ${completable ? `<button onclick="completeItem(event,'${esc(item.id)}')">✓</button>` : ''}
      <button onclick="editItem(event,'${esc(item.id)}')">✎</button>
    </span>
  </li>`;
}

function renderMetadataSection(section) {
  if (!section.fields?.length) return '';
  const fields = section.fields
    .map(f => `<span class="meta-field"><span class="meta-label">${esc(f.label)}</span><span class="meta-value">${esc(f.value)}</span></span>`)
    .join('');
  return `<div class="section section-metadata"><div class="meta-fields">${fields}</div></div>`;
}

function statusIcon(status) {
  const icons = { completed: '✓', waiting: '⏳', someday: '○', archived: '—', processed: '✓' };
  return icons[status] || '☐';
}

// ─────────────────────────────────────────────────────────────────────────────
// REPL
// ─────────────────────────────────────────────────────────────────────────────

const replHistory = [];
let replHistoryIndex = -1;

function renderReplPanel() {
  return `<div class="panel-header">
    <span class="panel-title">REPL</span>
    <button class="panel-close" onclick="removePanel(this.closest('.panel').dataset.panelId)">&times;</button>
  </div>
  <div class="panel-body repl-body">
    <div class="repl-output"></div>
    <div class="repl-input-row">
      <span class="repl-prompt">&gt;</span>
      <input class="repl-input" type="text" placeholder="Ask Bartleby…" autocomplete="off"
        onkeydown="onReplKey(event)">
      <button onclick="sendReplMessage(this)">Send</button>
    </div>
  </div>`;
}

function onReplKey(e) {
  if (e.key === 'Enter') {
    sendReplMessage(e.target.nextElementSibling);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (replHistoryIndex < replHistory.length - 1) {
      replHistoryIndex++;
      e.target.value = replHistory[replHistory.length - 1 - replHistoryIndex] || '';
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (replHistoryIndex > 0) {
      replHistoryIndex--;
      e.target.value = replHistory[replHistory.length - 1 - replHistoryIndex] || '';
    } else {
      replHistoryIndex = -1;
      e.target.value = '';
    }
  }
}

async function sendReplMessage(btn) {
  const row = btn.closest('.repl-input-row');
  const input = row?.querySelector('.repl-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  replHistory.push(text);
  replHistoryIndex = -1;
  input.value = '';

  const output = btn.closest('.repl-body')?.querySelector('.repl-output');
  if (!output) return;

  appendReplLine(output, 'user', text);

  try {
    const data = await apiFetch('/api/chat', { body: { text } });
    appendReplLine(output, 'assistant', data.reply);
  } catch (err) {
    appendReplLine(output, 'error', err.message);
  }
}

function appendReplLine(output, role, text) {
  const div = document.createElement('div');
  div.className = `repl-message repl-${role}`;
  div.innerHTML = role === 'user'
    ? `<span class="repl-you">&gt; ${esc(text)}</span>`
    : `<span class="repl-reply">${renderMarkdown(text)}</span>`;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// Open / Editing
// ─────────────────────────────────────────────────────────────────────────────

async function openRecord(id) {
  try {
    const record = await apiFetch(`/api/record/${id}`);
    // Check if this record's title is already open as a panel
    const existing = panels.find(p => p.view === record.title);
    if (existing) {
      existing.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    addPanel(record.title);
  } catch {
    // Silently ignore — record may have been deleted
  }
}

function editItem(e, id) {
  e.stopPropagation();
  startEdit(id);
}

async function startEdit(id) {
  try {
    const record = await apiFetch(`/api/record/${id}`);
    showEditModal(record);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showEditModal(record) {
  document.getElementById('edit-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'edit-modal';
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-content">
    <div class="modal-header">
      <span>Edit ${esc(record.type)}</span>
      <button onclick="cancelEdit()">&times;</button>
    </div>
    <div class="modal-body">
      <label>Title<input type="text" id="edit-title" value="${esc(record.title)}"></label>
      <label>Status<select id="edit-status">
        ${['active','completed','waiting','someday','archived'].map(s =>
          `<option value="${s}"${record.status === s ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
        ).join('')}
      </select></label>
      ${record.type === 'action' ? `
        <label>Context<input type="text" id="edit-context" value="${esc(record.context || '')}"></label>
        <label>Due<input type="date" id="edit-due_date" value="${esc(record.due_date || '')}"></label>
      ` : ''}
      <label>Content<textarea id="edit-content" rows="6">${esc(record.content || '')}</textarea></label>
    </div>
    <div class="modal-footer">
      <button onclick="cancelEdit()">Cancel</button>
      <button class="btn-primary" onclick="saveEdit('${esc(record.id)}')">Save</button>
    </div>
  </div>`;

  modal.addEventListener('click', (e) => { if (e.target === modal) cancelEdit(); });
  document.body.appendChild(modal);
  document.getElementById('edit-title')?.focus();
}

async function saveEdit(id) {
  const updates = {};
  const title   = document.getElementById('edit-title')?.value?.trim();
  const status  = document.getElementById('edit-status')?.value;
  const content = document.getElementById('edit-content')?.value;
  const context = document.getElementById('edit-context')?.value;
  const due     = document.getElementById('edit-due_date')?.value;

  if (title   != null) updates.title    = title;
  if (status  != null) updates.status   = status;
  if (content != null) updates.content  = content;
  if (context != null) updates.context  = context;
  if (due     != null) updates.due_date = due;

  try {
    await apiFetch(`/api/record/${id}`, { method: 'PATCH', body: updates });
    cancelEdit();
    showToast('Saved');
    refreshActivePanels();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function cancelEdit() {
  document.getElementById('edit-modal')?.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// Creation
// ─────────────────────────────────────────────────────────────────────────────

async function createRecord(type, fields) {
  const record = await apiFetch('/api/record', { body: { type, ...fields } });
  refreshActivePanels();
  return record;
}

async function quickCapture() {
  const input = document.getElementById('capture-input');
  const text = input?.value?.trim();
  if (!text) return;

  try {
    await createRecord('item', { title: text, source: 'typed' });
    input.value = '';
    showToast(`Captured: ${text}`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function completeItem(e, id) {
  e.stopPropagation();
  try {
    await apiFetch(`/api/record/${id}`, { method: 'PATCH', body: { status: 'completed' } });
    showToast('Completed');
    refreshActivePanels();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function refreshActivePanels() {
  for (const panel of panels) {
    if (panel.view === 'repl') continue;
    loadPanel(panel.id, panel.view);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag-drop
// ─────────────────────────────────────────────────────────────────────────────

function setupDragDrop() {
  const overlay = document.getElementById('drop-overlay');

  document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      overlay.classList.remove('hidden');
    }
  });

  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) overlay.classList.add('hidden');
  });

  document.addEventListener('dragover', (e) => e.preventDefault());

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    overlay.classList.add('hidden');
    for (const file of Array.from(e.dataTransfer?.files || [])) {
      await uploadFile(file);
    }
  });
}

async function uploadFile(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const res = await fetch('/api/media/upload', { method: 'POST', headers, body: formData });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

    const record = await res.json();
    showToast(`Imported: ${record.title}`);
    refreshActivePanels();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeLightbox(e) {
  const lb = document.getElementById('lightbox');
  if (e.target === lb || e.target.classList.contains('lightbox-close')) {
    lb.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
  if (!text) return '';
  if (text.trim().startsWith('<')) return text; // Already HTML
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function setStatus(state) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = state;
  el.className = `status ${state}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  connect();
  setupDragDrop();
  loadPanels();

  document.getElementById('capture-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') quickCapture();
  });
});
