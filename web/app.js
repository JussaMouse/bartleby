// Bartleby Dashboard

const PANEL_STORAGE_KEY = 'bartleby.panels';
const API_TOKEN_KEY = 'bartleby.apiToken';
const panels = new Map();
let ws = null;
let autocompleteData = { contexts: [], projects: [], tags: [] };
let replMessages = [];
let apiToken = null;

// API token management
function getApiToken() {
  if (!apiToken) {
    apiToken = localStorage.getItem(API_TOKEN_KEY);
  }
  return apiToken;
}

function setApiToken(token) {
  apiToken = token;
  if (token) {
    localStorage.setItem(API_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(API_TOKEN_KEY);
  }
}

// Fetch wrapper that adds auth token
async function apiFetch(url, options = {}) {
  const token = getApiToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  // If 401, token might be invalid - prompt for new one
  if (response.status === 401) {
    const newToken = prompt('API token required. Please enter your BARTLEBY_API_TOKEN:');
    if (newToken) {
      setApiToken(newToken);
      // Retry with new token
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(url, { ...options, headers });
    }
  }

  return response;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  loadPanels();
  fetchAutocomplete();
  setupDragDrop();
});

// WebSocket
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    document.getElementById('status').textContent = 'connected';
    document.getElementById('status').className = 'status connected';
    
    // Subscribe to all current panels
    for (const view of panels.keys()) {
      ws.send(JSON.stringify({ type: 'subscribe', view }));
    }
  };

  ws.onclose = () => {
    document.getElementById('status').textContent = 'disconnected';
    document.getElementById('status').className = 'status disconnected';
    setTimeout(connectWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'data' && msg.view) {
      renderPanel(msg.view, msg.data, msg.pageView);
    }
  };
}

// Autocomplete data
async function fetchAutocomplete() {
  try {
    const res = await apiFetch('/api/autocomplete');
    if (res.ok) {
      autocompleteData = await res.json();
      console.log('Autocomplete data loaded:', autocompleteData);
    }
  } catch (e) {
    console.warn('Failed to fetch autocomplete data:', e);
  }
}

// Panel management
function addPanel(view) {
  if (panels.has(view)) return;

  const panel = createPanel(view);
  document.getElementById('panels').appendChild(panel);
  panels.set(view, panel);
  savePanels();

  // REPL is local-only, render immediately
  if (view === 'repl') {
    renderPanel('repl', null);
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', view }));
  }
}

function removePanel(view) {
  const panel = panels.get(view);
  if (panel) {
    panel.remove();
    panels.delete(view);
    savePanels();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', view }));
    }
  }
}

function savePanels() {
  const views = Array.from(panels.keys());
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(views));
}

function loadPanels() {
  let views = [];
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (raw) {
      views = JSON.parse(raw);
    }
  } catch (e) {}

  if (!views.length) {
    views = ['inbox', 'next-actions'];
  }

  for (const view of views) {
    addPanel(view);
  }
}

function createPanel(view) {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.dataset.view = view;

  const title = formatViewTitle(view);

  panel.innerHTML = `
    <div class="panel-header">
      <h2>${title}</h2>
      <button class="panel-close" onclick="removePanel('${view}')">&times;</button>
    </div>
    <div class="panel-content">
      <div class="empty">Loading...</div>
    </div>
  `;

  return panel;
}

function formatViewTitle(view) {
  if (view.startsWith('project:')) {
    return view.slice(8);
  }
  return view.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function promptProjectPanel() {
  const name = prompt('Project name:');
  if (name) {
    addPanel('project:' + name);
  }
}

// Panel rendering
function renderPanel(view, data, pageView) {
  const panel = panels.get(view);
  if (!panel) return;

  const content = panel.querySelector('.panel-content');

  // Skip re-render if there's an active edit in this panel (would steal focus)
  const hasActiveEdit = content.querySelector('.action-edit:not(.hidden)') ||
                        content.querySelector('.item-edit:not(.hidden)') ||
                        content.querySelector('.note-content-edit:not(.hidden)');
  if (hasActiveEdit) {
    console.log('Skipping re-render, active edit in panel:', view);
    return;
  }

  if (view === 'repl') {
    // REPL doesn't use server data, render from local messages
    content.innerHTML = renderRepl();
  } else if (view === 'inbox') {
    content.innerHTML = renderInbox(data);
  } else if (view === 'next-actions') {
    content.innerHTML = renderNextActions(data);
  } else if (view === 'projects') {
    content.innerHTML = renderProjects(data);
  } else if (view.startsWith('project:')) {
    // Use PageView if available, otherwise fall back to old rendering
    content.innerHTML = pageView ? renderPageView(pageView) : renderProject(data);
  } else if (view.startsWith('note-edit:')) {
    // Note editing panel (creation or edit)
    content.innerHTML = renderNoteEdit(view, data);
  } else if (view.startsWith('note:')) {
    // Use PageView if available, otherwise fall back to old rendering
    content.innerHTML = pageView ? renderPageView(pageView) : renderNote(data);
  } else if (view === 'calendar') {
    content.innerHTML = renderCalendar(data);
  } else if (view === 'today') {
    content.innerHTML = renderToday(data);
  } else if (view === 'recent') {
    content.innerHTML = renderRecent(data);
  } else if (view === 'notes') {
    content.innerHTML = renderNotes(data);
  } else {
    content.innerHTML = `<div class="empty">Unknown view: ${view}</div>`;
  }
}

// PageView rendering - structured sections
function renderPageView(pageView) {
  if (!pageView || !pageView.sections) {
    return '<div class="empty">No view data</div>';
  }

  let html = '';

  for (const section of pageView.sections) {
    // Skip empty sections
    if (!section.content || section.content.trim() === '') {
      continue;
    }

    // Render section header
    html += `<div class="section-header">${esc(section.title)}</div>`;

    // Render section content as markdown
    html += `<div class="section-content">${renderMarkdown(section.content)}</div>`;
  }

  return html || '<div class="empty">No content</div>';
}

function renderInbox(data) {
  let html = '<div class="panel-toolbar"><button class="btn-inline" onclick="createNewItem()">+ New Item</button></div>';
  
  if (!data?.length) {
    html += '<div class="empty">Inbox empty</div>';
    return html;
  }
  const items = data.map(item => renderActionItem(item, true)).join('');
  html += `<ul>${items}</ul>`;
  return html;
}

function renderNextActions(data) {
  let html = '<div class="panel-toolbar"><button class="btn-inline" onclick="createNewAction()">+ New Action</button></div>';
  
  if (!data?.length) {
    html += '<div class="empty">No actions</div>';
    return html;
  }

  // Group by context
  const byContext = {};
  for (const task of data) {
    const ctx = task.context || 'No Context';
    if (!byContext[ctx]) byContext[ctx] = [];
    byContext[ctx].push(task);
  }

  for (const [ctx, actions] of Object.entries(byContext)) {
    if (actions.length === 0) continue;
    html += `<div class="section-header">${ctx}</div>`;
    html += '<ul>' + actions.map(a => renderActionItem(a)).join('') + '</ul>';
  }

  if (html === '<div class="panel-toolbar"><button class="btn-inline" onclick="createNewAction()">+ New Action</button></div>') {
    html += '<div class="empty">No actions</div>';
  }
  
  return html;
}

function renderProjects(data) {
  let html = '<div class="panel-toolbar"><button class="btn-inline" onclick="createNewProject()">+ New Project</button></div>';
  
  if (!data?.length) {
    html += '<div class="empty">No projects</div>';
    return html;
  }

  const items = data.map(p => renderEditableItem(p, 'project')).join('');
  html += `<ul>${items}</ul>`;
  return html;
}

// Generic editable item renderer for non-action types
function renderEditableItem(item, itemType) {
  const id = item.id;
  const title = item.title;
  
  // Build display info based on type
  let metaHtml = '';
  if (itemType === 'event') {
    const d = new Date(item.start_time);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = item.all_day ? 'all day' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    metaHtml = `<span class="item-meta">${dateStr} ${timeStr}</span>`;
  } else if (itemType === 'project') {
    metaHtml = `<span class="item-meta clickable-hint">click to expand</span>`;
  } else if (itemType === 'note') {
    // Show project if present
    if (item.project) {
      metaHtml = `<span class="item-meta">+${esc(item.project)}</span>`;
    }
  } else if (item.type) {
    metaHtml = `<span class="item-meta">${item.type}</span>`;
  }

  // Notes and projects open panels on click
  if (itemType === 'project') {
    return `
      <li class="item generic-item" data-id="${id}" data-type="${itemType}" data-title="${esc(title)}">
        <div class="item-display" onclick="addPanel('project:${esc(title)}')">
          <span class="item-title">${esc(title)}</span>
          ${metaHtml}
        </div>
      </li>
    `;
  }
  
  if (itemType === 'note') {
    return `
      <li class="item generic-item" data-id="${id}" data-type="${itemType}" data-title="${esc(title)}" data-project="${esc(item.project || '')}">
        <div class="item-display">
          <span class="item-title" onclick="addPanel('note:${id}')">${esc(title)}</span>
          ${metaHtml}
          <span class="edit-link" onclick="event.stopPropagation(); openNoteEdit('${id}')">edit</span>
        </div>
      </li>
    `;
  }

  // Other types (events, etc.) use inline editing
  return `
    <li class="item generic-item" data-id="${id}" data-type="${itemType}" data-title="${esc(title)}">
      <div class="item-display" onclick="startGenericEdit(this.parentElement)">
        <span class="item-title">${esc(title)}</span>
        ${metaHtml}
      </div>
      <div class="item-edit hidden">
        <input type="text" class="inline-input" value="${esc(title)}"
               onkeydown="handleGenericEditKey(event, this)"
               onblur="handleGenericEditBlur(event, this)">
        <div class="inline-actions">
          <button class="btn-inline save" onclick="saveGenericEdit(this.closest('.generic-item'))">Save</button>
          <button class="btn-inline" onclick="cancelGenericEdit(this.closest('.generic-item'))">Cancel</button>
          <button class="btn-inline remove" onclick="removeItem(this.closest('.generic-item'))">Remove</button>
        </div>
        <div class="autocomplete-menu hidden"></div>
      </div>
    </li>
  `;
}

function renderProject(data) {
  if (!data?.project) {
    return '<div class="empty">Project not found</div>';
  }

  let html = '';

  // Actions
  if (data.actions?.length) {
    html += '<div class="section-header">Actions</div>';
    html += '<ul>' + data.actions.map(a => renderActionItem(a)).join('') + '</ul>';
  }

  // Media
  if (data.media?.length) {
    html += '<div class="section-header">Media</div>';
    html += '<div class="media-grid">';
    for (const m of data.media) {
      const meta = m.metadata ? JSON.parse(m.metadata) : {};
      const isImage = meta.mimeType?.startsWith('image/');
      if (isImage) {
        html += `
          <div class="media-item" onclick="openLightbox('/media/${esc(meta.fileName)}', '${esc(m.title)}')">
            <img src="/media/${esc(meta.fileName)}" alt="${esc(m.title)}">
            <span class="media-title">${esc(m.title)}</span>
          </div>
        `;
      } else {
        html += `
          <div class="media-item file">
            <span class="media-icon">📄</span>
            <span class="media-title">${esc(m.title)}</span>
          </div>
        `;
      }
    }
    html += '</div>';
  }

  // Notes
  if (data.notes?.length) {
    html += '<div class="section-header">Notes</div>';
    html += '<ul>' + data.notes.map(n => renderEditableItem(n, 'note')).join('') + '</ul>';
  }

  return html || '<div class="empty">Empty project</div>';
}

function renderNote(data) {
  if (!data?.note) {
    return '<div class="empty">Note not found</div>';
  }
  
  const note = data.note;
  let html = '';
  
  // Note content - display mode
  html += `<div class="note-content-display" data-note-id="${note.id}">`;
  if (note.content) {
    html += `<div class="note-content">${renderMarkdown(note.content)}</div>`;
  } else {
    html += '<div class="empty">Empty note</div>';
  }
  html += '</div>';
  
  // Note content - edit mode (hidden by default)
  html += `<div class="note-content-edit hidden" data-note-id="${note.id}">`;
  html += `<textarea class="note-textarea" rows="12">${esc(note.content || '')}</textarea>`;
  html += `<div class="note-edit-actions">
    <button class="btn-inline save" onclick="saveNoteContent('${note.id}')">Save</button>
    <button class="btn-inline" onclick="cancelNoteEdit('${note.id}')">Cancel</button>
  </div>`;
  html += '</div>';
  
  // Metadata
  html += '<div class="note-meta">';
  if (note.project) {
    html += `<span class="meta-item">+${esc(note.project)}</span>`;
  }
  if (note.tags?.length) {
    html += note.tags.map(t => `<span class="meta-item">#${esc(t)}</span>`).join('');
  }
  if (note.updated_at) {
    const updated = new Date(note.updated_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    html += `<span class="meta-item muted">Updated ${updated}</span>`;
  }
  html += '</div>';
  
  // Action buttons at bottom of panel
  html += `
    <div class="note-actions">
      <button class="btn-inline" onclick="startNoteEdit('${note.id}')">Edit</button>
      <select class="btn-inline convert-select" onchange="convertNote('${note.id}', this.value); this.value='';">
        <option value="">Convert to...</option>
        <option value="action">→ Action</option>
        <option value="event">→ Event</option>
        <option value="project">→ Project</option>
        <option value="entry">→ Entry</option>
      </select>
      <button class="btn-inline remove" onclick="removeNoteFromPanel('${note.id}')">Remove</button>
    </div>
  `;
  
  return html;
}

function editNoteInRepl(noteId) {
  // Add edit command to REPL
  replMessages.push({ 
    role: 'user', 
    text: `edit ${noteId}` 
  });
  
  if (!panels.has('repl')) {
    addPanel('repl');
  }
  
  // Trigger the edit command
  apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `edit ${noteId}` }),
  })
    .then(res => res.json())
    .then(data => {
      replMessages.push({ role: 'assistant', text: data.reply || '(no response)' });
      refreshReplPanel();
    })
    .catch(() => {
      replMessages.push({ role: 'assistant', text: '(error)' });
      refreshReplPanel();
    });
}

async function removeNoteFromPanel(noteId) {
  if (!confirm('Remove this note?')) return;
  
  try {
    const res = await apiFetch(`/api/page/${noteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    
    // Close the note panel
    removePanel(`note:${noteId}`);
    showToast('Note removed');
  } catch (e) {
    console.error('Delete failed:', e);
    showToast('Failed to remove note', true);
  }
}

function startNoteEdit(noteId) {
  const display = document.querySelector(`.note-content-display[data-note-id="${noteId}"]`);
  const edit = document.querySelector(`.note-content-edit[data-note-id="${noteId}"]`);
  
  if (display && edit) {
    display.classList.add('hidden');
    edit.classList.remove('hidden');
    const textarea = edit.querySelector('textarea');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }
}

function cancelNoteEdit(noteId) {
  const display = document.querySelector(`.note-content-display[data-note-id="${noteId}"]`);
  const edit = document.querySelector(`.note-content-edit[data-note-id="${noteId}"]`);
  
  if (display && edit) {
    display.classList.remove('hidden');
    edit.classList.add('hidden');
  }
}

async function saveNoteContent(noteId) {
  const edit = document.querySelector(`.note-content-edit[data-note-id="${noteId}"]`);
  const textarea = edit?.querySelector('textarea');
  
  if (!textarea) return;
  
  const content = textarea.value;
  
  try {
    // Get current note to preserve title
    const getRes = await apiFetch(`/api/page/${noteId}`);
    if (!getRes.ok) throw new Error('Failed to get note');
    const noteData = await getRes.json();
    
    // Update content while preserving title line
    let newContent = content;
    if (!content.startsWith('# ')) {
      newContent = `# ${noteData.title}\n\n${content}`;
    }
    
    const res = await apiFetch(`/api/page/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent }),
    });
    
    if (!res.ok) throw new Error('Save failed');
    
    showToast('Saved');
    // Panel will refresh from garden update
  } catch (e) {
    console.error('Save failed:', e);
    showToast('Save failed', true);
  }
}

async function convertNote(noteId, targetType) {
  if (!targetType) return;
  
  try {
    console.log('Converting note:', noteId, 'to:', targetType);
    
    // Use direct convert endpoint (no auth needed)
    const res = await apiFetch(`/api/page/${noteId}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType }),
    });
    
    const data = await res.json();
    console.log('Convert response:', data);
    
    if (!res.ok) {
      throw new Error(data.error || 'Conversion failed');
    }
    
    // Close note panel
    removePanel(`note:${noteId}`);
    showToast(`Converted to ${targetType}`);
  } catch (e) {
    console.error('Convert failed:', e);
    showToast('Conversion failed', true);
  }
}

function renderCalendar(data) {
  let html = '<div class="panel-toolbar"><button class="btn-inline" onclick="createNewEvent()">+ New Event</button></div>';
  
  if (!data?.length) {
    html += '<div class="empty">Nothing scheduled</div>';
    return html;
  }

  const events = data.filter(e => e.entry_type === 'event');
  const deadlines = data.filter(e => e.entry_type === 'deadline');

  if (events.length) {
    html += '<div class="section-header">Events</div><ul>';
    html += events.map(e => renderEditableItem(e, 'event')).join('');
    html += '</ul>';
  }

  if (deadlines.length) {
    html += '<div class="section-header">Deadlines</div><ul>';
    html += deadlines.map(d => renderEditableItem(d, 'deadline')).join('');
    html += '</ul>';
  }

  if (!events.length && !deadlines.length) {
    html += '<div class="empty">Nothing scheduled</div>';
  }

  return html;
}

function renderToday(data) {
  // data is { events: [...], overdue: [...] }
  let html = '';

  const events = data.events?.filter(e => e.entry_type === 'event') || [];
  const deadlines = data.events?.filter(e => e.entry_type === 'deadline') || [];

  if (events.length) {
    html += '<div class="section-header">Events</div><ul>';
    html += events.map(e => renderEditableItem(e, 'event')).join('');
    html += '</ul>';
  }

  if (deadlines.length) {
    html += '<div class="section-header">Due Today</div><ul>';
    html += deadlines.map(d => renderEditableItem(d, 'deadline')).join('');
    html += '</ul>';
  }

  if (data.overdue?.length) {
    html += '<div class="section-header">Overdue</div><ul>';
    html += data.overdue.map(o => renderActionItem(o, false)).join('');
    html += '</ul>';
  }

  return html || '<div class="empty">Nothing for today</div>';
}

function renderRecent(data) {
  // data is array of pages
  if (!data?.length) {
    return '<div class="empty">No recent pages</div>';
  }

  const items = data.map(p => {
    // Actions use the action item renderer
    if (p.type === 'action') {
      return renderActionItem(p, false);
    }
    // Items use the action item renderer with inbox flag
    if (p.type === 'item') {
      return renderActionItem(p, true);
    }
    // Others use generic editable item
    return renderEditableItem(p, p.type);
  }).join('');

  return `<ul>${items}</ul>`;
}

function renderNoteEdit(view, data) {
  const isNew = view === 'note-edit:new';
  const noteId = isNew ? null : view.slice(10); // Remove 'note-edit:'

  let note = null;
  if (!isNew && data?.note) {
    note = data.note;
  }

  const title = note?.title || '';
  const content = note?.content || '';

  // Build tags string from note metadata
  let tagsStr = '';
  const tagParts = [];
  if (note?.project) {
    const projectName = note.project; // TODO: resolve project ID to name
    tagParts.push('+' + projectName);
  }
  if (note?.tags && note.tags.length > 0) {
    tagParts.push(...note.tags.map(t => '#' + t));
  }
  if (note?.context) {
    tagParts.push(note.context);
  }
  tagsStr = tagParts.join(' ');

  let html = '<div class="note-edit-form">';

  // Title field
  html += '<div class="form-group">';
  html += '<label>Title</label>';
  html += `<input type="text" id="note-title" class="form-input" value="${esc(title)}" placeholder="Note title" autofocus>`;
  html += '</div>';

  // Tags field
  html += '<div class="form-group" style="position: relative;">';
  html += '<label>Tags</label>';
  html += `<input type="text" id="note-tags" class="form-input" value="${esc(tagsStr)}" placeholder="+project #tags @context with person" onkeydown="handleNoteTagsKey(event)">`;
  html += '<div id="note-tags-autocomplete" class="autocomplete-menu hidden"></div>';
  html += '</div>';

  // Content field
  html += '<div class="form-group">';
  html += '<label>Content</label>';
  html += `<textarea id="note-content" class="form-textarea" rows="12" placeholder="Note content...">${esc(content)}</textarea>`;
  html += '</div>';

  // Buttons
  html += '<div class="form-actions">';
  if (isNew) {
    html += `<button class="btn-primary" onclick="saveNewNote()">Save</button>`;
    html += `<button class="btn-secondary" onclick="removePanel('note-edit:new')">Cancel</button>`;
  } else {
    html += `<button class="btn-primary" onclick="saveNoteEdit('${noteId}')">Save</button>`;
    html += `<button class="btn-secondary" onclick="removePanel('note-edit:${noteId}')">Cancel</button>`;
    html += `<button class="btn-danger" onclick="deleteNoteFromEdit('${noteId}')">Delete</button>`;
  }
  html += '</div>';

  html += '</div>';

  return html;
}

function renderNotes(data) {
  let html = '<div class="panel-toolbar"><button class="btn-inline" onclick="createNewNote()">+ New Note</button></div>';
  
  if (!data?.length) {
    html += '<div class="empty">No notes yet</div>';
    return html;
  }

  const items = data.map(n => renderEditableItem(n, 'note')).join('');
  html += `<ul>${items}</ul>`;
  return html;
}

function createNewNote() {
  // Open note edit panel for new note
  addPanel('note-edit:new');
}

function openNoteEdit(noteId) {
  // Open note edit panel for existing note
  addPanel('note-edit:' + noteId);
}

// Autocomplete for note tags field
let noteTagsAutocompleteItems = [];
let noteTagsAutocompleteIndex = -1;

function handleNoteTagsKey(event) {
  const input = document.getElementById('note-tags');
  const menu = document.getElementById('note-tags-autocomplete');
  if (!input || !menu) return;

  const menuVisible = !menu.classList.contains('hidden');

  // Handle navigation and selection when menu is open
  if (menuVisible) {
    // Enter - apply selected item
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (noteTagsAutocompleteIndex >= 0 && noteTagsAutocompleteItems[noteTagsAutocompleteIndex]) {
        applyNoteTagsAutocomplete(noteTagsAutocompleteItems[noteTagsAutocompleteIndex]);
      }
      hideNoteTagsAutocomplete();
      return;
    }

    // Tab or ArrowDown - cycle to next item
    if (event.key === 'Tab' || event.key === 'ArrowDown') {
      event.preventDefault();
      noteTagsAutocompleteIndex = (noteTagsAutocompleteIndex + 1) % noteTagsAutocompleteItems.length;
      updateNoteTagsAutocompleteSelection();
      return;
    }

    // ArrowUp - cycle to previous item
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      noteTagsAutocompleteIndex = (noteTagsAutocompleteIndex - 1 + noteTagsAutocompleteItems.length) % noteTagsAutocompleteItems.length;
      updateNoteTagsAutocompleteSelection();
      return;
    }

    // Escape - close menu
    if (event.key === 'Escape') {
      event.preventDefault();
      hideNoteTagsAutocomplete();
      return;
    }
  }

  // Tab when menu is closed - trigger autocomplete
  if (event.key === 'Tab' && !menuVisible) {
    event.preventDefault();

    // Trigger autocomplete based on cursor position
    const cursorPos = input.selectionStart;
    const text = input.value;
    const beforeCursor = text.slice(0, cursorPos);

    const contextMatch = beforeCursor.match(/@(\w*)$/);
    const projectMatch = beforeCursor.match(/\+([^\s]*)$/);
    const tagMatch = beforeCursor.match(/#(\w*)$/);
    const withMatch = beforeCursor.match(/\bwith\s+(\w*)$/i);

    if (contextMatch) {
      const partial = contextMatch[1].toLowerCase();
      const matches = autocompleteData.contexts.filter(c =>
        c.toLowerCase().startsWith('@' + partial) || c.toLowerCase().startsWith(partial)
      );
      showNoteTagsAutocomplete(matches);
    } else if (projectMatch) {
      const partial = projectMatch[1].toLowerCase();
      const matches = autocompleteData.projects.filter(p =>
        p.toLowerCase().startsWith(partial) ||
        p.toLowerCase().replace(/\s+/g, '-').startsWith(partial)
      );
      showNoteTagsAutocomplete(matches.map(p => '+' + p.toLowerCase().replace(/\s+/g, '-')));
    } else if (tagMatch) {
      const partial = tagMatch[1].toLowerCase();
      const matches = autocompleteData.tags.filter(t =>
        t.toLowerCase().startsWith(partial)
      );
      showNoteTagsAutocomplete(matches.map(t => '#' + t));
    } else if (withMatch) {
      const partial = withMatch[1].toLowerCase();
      const contacts = autocompleteData.contacts || [];
      const matches = contacts.filter(c =>
        c.toLowerCase().startsWith(partial)
      );
      showNoteTagsAutocomplete(matches);
    }
  }
}

function showNoteTagsAutocomplete(items) {
  const menu = document.getElementById('note-tags-autocomplete');
  if (!menu || !items.length) return;

  noteTagsAutocompleteItems = items;
  noteTagsAutocompleteIndex = 0;

  menu.innerHTML = items.map((item, i) =>
    `<div class="autocomplete-item${i === 0 ? ' selected' : ''}" onclick="clickNoteTagsAutocomplete('${esc(item)}')">${esc(item)}</div>`
  ).join('');
  menu.classList.remove('hidden');
}

function hideNoteTagsAutocomplete() {
  const menu = document.getElementById('note-tags-autocomplete');
  if (menu) {
    menu.classList.add('hidden');
    menu.innerHTML = '';
  }
  noteTagsAutocompleteItems = [];
  noteTagsAutocompleteIndex = -1;
}

function updateNoteTagsAutocompleteSelection() {
  const menu = document.getElementById('note-tags-autocomplete');
  if (!menu) return;

  const items = menu.querySelectorAll('.autocomplete-item');
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === noteTagsAutocompleteIndex);
  });
}

function clickNoteTagsAutocomplete(value) {
  applyNoteTagsAutocomplete(value);
  hideNoteTagsAutocomplete();
  document.getElementById('note-tags')?.focus();
}

function applyNoteTagsAutocomplete(value) {
  const input = document.getElementById('note-tags');
  if (!input) return;

  const cursorPos = input.selectionStart;
  const text = input.value;
  const beforeCursor = text.slice(0, cursorPos);
  const afterCursor = text.slice(cursorPos);

  let newBefore = beforeCursor;

  if (value.startsWith('@')) {
    newBefore = beforeCursor.replace(/@\w*$/, value + ' ');
  } else if (value.startsWith('+')) {
    newBefore = beforeCursor.replace(/\+[^\s]*$/, value + ' ');
  } else if (value.startsWith('#')) {
    newBefore = beforeCursor.replace(/#\w*$/, value + ' ');
  } else if (beforeCursor.match(/\bwith\s+\w*$/i)) {
    // Contact name completion
    newBefore = beforeCursor.replace(/(\bwith\s+)\w*$/i, '$1' + value + ' ');
  } else {
    newBefore = beforeCursor + value + ' ';
  }

  input.value = newBefore + afterCursor;
  input.selectionStart = input.selectionEnd = newBefore.length;
}

async function saveNewNote() {
  const title = document.getElementById('note-title')?.value.trim();
  const tags = document.getElementById('note-tags')?.value.trim();
  const content = document.getElementById('note-content')?.value.trim();

  if (!title) {
    showToast('Title is required', true);
    return;
  }

  try {
    // Parse tags field for +project #tags @context with person
    let fullTitle = title;
    if (tags) {
      fullTitle += ' ' + tags;
    }

    // Create note via chat API which handles metadata parsing
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `new note ${fullTitle}` }),
    });

    if (!res.ok) throw new Error('Failed to create note');

    const data = await res.json();

    // If note was created, append content if provided
    if (content && data.noteId) {
      // TODO: Add content to note via update API
      // For now, content needs to be added separately
    }

    showToast('Note created');
    removePanel('note-edit:new');
  } catch (e) {
    console.error('Create note failed:', e);
    showToast('Failed to create note', true);
  }
}

async function saveNoteEdit(noteId) {
  const title = document.getElementById('note-title')?.value.trim();
  const tags = document.getElementById('note-tags')?.value.trim();
  const content = document.getElementById('note-content')?.value;

  if (!title) {
    showToast('Title is required', true);
    return;
  }

  try {
    // Parse tags: +project #tag1 #tag2 @context
    const updates = { title };

    const projectMatch = tags.match(/\+([^@#\s]+)/);
    const tagMatches = tags.match(/#(\w+)/g);
    const contextMatch = tags.match(/@(\w+)/);

    if (projectMatch) {
      updates.project = projectMatch[1];
    }
    if (tagMatches) {
      updates.tags = tagMatches.map(t => t.slice(1));
    }
    if (contextMatch) {
      updates.context = '@' + contextMatch[1];
    }

    // Update note
    const res = await apiFetch(`/api/note/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) throw new Error('Failed to update note');

    // Update content separately if changed
    if (content !== undefined) {
      const contentRes = await apiFetch(`/api/page/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!contentRes.ok) throw new Error('Failed to update content');
    }

    showToast('Note saved');
    removePanel(`note-edit:${noteId}`);
  } catch (e) {
    console.error('Save note failed:', e);
    showToast('Failed to save note', true);
  }
}

async function deleteNoteFromEdit(noteId) {
  if (!confirm('Delete this note?')) return;

  try {
    const res = await apiFetch(`/api/page/${noteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');

    removePanel(`note-edit:${noteId}`);
    showToast('Note deleted');
  } catch (e) {
    console.error('Delete failed:', e);
    showToast('Failed to delete note', true);
  }
}

async function createNewItem() {
  const title = prompt('Capture to inbox:');
  if (!title?.trim()) return;
  
  try {
    const res = await apiFetch('/api/item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!res.ok) throw new Error('Failed to create item');
    showToast('Item captured');
  } catch (e) {
    console.error('Create item failed:', e);
    showToast('Failed to capture item', true);
  }
}

async function createNewAction() {
  try {
    // Create action with placeholder title (server won't broadcast)
    const res = await apiFetch('/api/action?nobroadcast=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    if (!res.ok) throw new Error('Failed to create action');
    
    const data = await res.json();
    const action = data.action;
    if (!action) throw new Error('No action returned');
    
    // Find the @home section (or first section) in next-actions panel
    const panel = document.querySelector('.panel[data-view="next-actions"] .panel-content');
    if (!panel) {
      console.error('Next actions panel not found');
      return;
    }
    
    // Create the action HTML and insert it
    const actionHtml = renderActionItem(action, false);
    
    // Find or create the @home section
    let homeSection = panel.querySelector('.section-header + ul');
    const headers = panel.querySelectorAll('.section-header');
    for (const h of headers) {
      if (h.textContent === '@home') {
        homeSection = h.nextElementSibling;
        break;
      }
    }
    
    if (!homeSection) {
      // No sections yet, create one
      const sectionHtml = `<div class="section-header">@home</div><ul></ul>`;
      const toolbar = panel.querySelector('.panel-toolbar');
      if (toolbar) {
        toolbar.insertAdjacentHTML('afterend', sectionHtml);
      } else {
        panel.insertAdjacentHTML('afterbegin', sectionHtml);
      }
      homeSection = panel.querySelector('.section-header + ul');
    }
    
    // Remove "No actions" message if present
    const empty = panel.querySelector('.empty');
    if (empty) empty.remove();
    
    // Insert at top of the list
    homeSection.insertAdjacentHTML('afterbegin', actionHtml);
    
    // Start editing immediately
    const actionItem = homeSection.querySelector(`.action-item[data-id="${action.id}"]`);
    if (actionItem) {
      startEdit(actionItem);
      const input = actionItem.querySelector('.inline-input');
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  } catch (e) {
    console.error('Create action failed:', e);
    showToast('Failed to create action', true);
  }
}

async function createNewProject() {
  const title = prompt('Project title:');
  if (!title?.trim()) return;
  
  try {
    const res = await apiFetch('/api/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    showToast('Project created');
  } catch (e) {
    console.error('Create project failed:', e);
    showToast('Failed to create project', true);
  }
}

async function createNewEvent() {
  const title = prompt('Event title:');
  if (!title?.trim()) return;
  
  const dateStr = prompt('Date/time (e.g. "tomorrow 3pm", "2026-01-20 14:00"):');
  if (!dateStr?.trim()) return;
  
  try {
    const res = await apiFetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), dateStr: dateStr.trim() }),
    });
    if (!res.ok) throw new Error('Failed to create event');
    showToast('Event created');
  } catch (e) {
    console.error('Create event failed:', e);
    showToast('Failed to create event', true);
  }
}

function renderRepl() {
  let html = '<div class="repl-messages">';
  
  if (replMessages.length === 0) {
    html += '<div class="empty">Type a command below</div>';
  } else {
    for (const msg of replMessages) {
      html += `<div class="repl-msg repl-${msg.role}">`;
      html += `<span class="repl-label">${msg.role === 'user' ? '>' : 'Bartleby:'}</span>`;
      // User input stays plain, assistant output gets markdown rendering
      const content = msg.role === 'user' ? esc(msg.text) : renderMarkdown(msg.text);
      html += `<span class="repl-text">${content}</span>`;
      html += '</div>';
    }
  }
  
  html += '</div>';
  html += `
    <div class="repl-input-wrapper">
      <form class="repl-input" onsubmit="sendReplMessage(event)">
        <input type="text" id="repl-input" placeholder="Type a command..." autocomplete="off" onkeydown="handleReplKeydown(event)">
        <button type="submit">Send</button>
      </form>
      <div id="repl-autocomplete" class="autocomplete-menu hidden"></div>
    </div>
  `;
  
  return html;
}

async function sendReplMessage(event) {
  event.preventDefault();
  const input = document.getElementById('repl-input');
  const text = input.value.trim();
  if (!text) return;
  
  // Add user message
  replMessages.push({ role: 'user', text });
  input.value = '';
  refreshReplPanel();
  
  // Send to server
  try {
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    
    if (res.ok) {
      const data = await res.json();
      replMessages.push({ role: 'assistant', text: data.reply || '(no response)' });
    } else {
      replMessages.push({ role: 'assistant', text: '(error)' });
    }
  } catch (e) {
    replMessages.push({ role: 'assistant', text: '(connection error)' });
  }
  
  refreshReplPanel();
}

function refreshReplPanel() {
  const panel = panels.get('repl');
  if (panel) {
    const content = panel.querySelector('.panel-content');
    content.innerHTML = renderRepl();
    // Scroll to bottom
    const messages = content.querySelector('.repl-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
    // Re-focus input
    const input = document.getElementById('repl-input');
    if (input) input.focus();
  }
}

// REPL autocomplete
let replAutocompleteItems = [];
let replAutocompleteIndex = -1;

function handleReplKeydown(event) {
  const input = document.getElementById('repl-input');
  const menu = document.getElementById('repl-autocomplete');
  console.log('REPL keydown:', event.key, 'input:', input, 'menu:', menu);
  if (!input || !menu) return;

  // Tab - trigger or apply autocomplete
  if (event.key === 'Tab') {
    event.preventDefault();
    console.log('Tab pressed in REPL, autocomplete data:', autocompleteData);
    
    if (!menu.classList.contains('hidden')) {
      // Apply selected item
      if (replAutocompleteIndex >= 0 && replAutocompleteItems[replAutocompleteIndex]) {
        applyReplAutocomplete(replAutocompleteItems[replAutocompleteIndex]);
      }
      hideReplAutocomplete();
      return;
    }
    
    // Trigger autocomplete
    const cursorPos = input.selectionStart;
    const text = input.value;
    const beforeCursor = text.slice(0, cursorPos);
    console.log('REPL before cursor:', beforeCursor);
    
    const contextMatch = beforeCursor.match(/@(\w*)$/);
    const projectMatch = beforeCursor.match(/\+([^\s]*)$/);
    const withMatch = beforeCursor.match(/\bwith\s+(\w*)$/i);
    console.log('REPL context match:', contextMatch, 'project match:', projectMatch, 'with match:', withMatch);
    
    if (contextMatch) {
      const partial = contextMatch[1].toLowerCase();
      const matches = autocompleteData.contexts.filter(c =>
        c.toLowerCase().startsWith('@' + partial) || c.toLowerCase().startsWith(partial)
      );
      console.log('REPL context matches:', matches);
      showReplAutocomplete(matches, '@');
    } else if (projectMatch) {
      const partial = projectMatch[1].toLowerCase();
      const matches = autocompleteData.projects.filter(p =>
        p.toLowerCase().startsWith(partial) ||
        p.toLowerCase().replace(/\s+/g, '-').startsWith(partial)
      );
      console.log('REPL project matches:', matches);
      showReplAutocomplete(matches.map(p => '+' + p.toLowerCase().replace(/\s+/g, '-')), '+');
    } else if (withMatch) {
      const partial = withMatch[1].toLowerCase();
      const contacts = autocompleteData.contacts || [];
      const matches = contacts.filter(c =>
        c.toLowerCase().startsWith(partial)
      );
      console.log('REPL contact matches:', matches);
      showReplAutocomplete(matches, 'with');
    } else {
      // Command or page name completion
      const partial = beforeCursor.toLowerCase().trim();
      console.log('REPL general partial:', partial);
      
      let matches = [];
      
      // Match commands first
      if (autocompleteData.commands) {
        const cmdMatches = autocompleteData.commands.filter(c => 
          c.toLowerCase().startsWith(partial)
        );
        matches.push(...cmdMatches);
      }
      
      // Then page names (for commands like "open", "show", "done", "edit")
      const pageCommands = ['open ', 'show ', 'done ', 'edit ', 'delete '];
      const hasPageCommand = pageCommands.some(cmd => partial.startsWith(cmd));
      
      if (hasPageCommand && autocompleteData.pages) {
        const afterCommand = partial.split(' ').slice(1).join(' ');
        const pageMatches = autocompleteData.pages.filter(p =>
          p.toLowerCase().startsWith(afterCommand)
        ).slice(0, 10);
        
        // Reconstruct with the command prefix
        const cmdPart = partial.split(' ')[0] + ' ';
        matches = pageMatches.map(p => cmdPart + p);
      }
      
      console.log('REPL general matches:', matches);
      if (matches.length) {
        showReplAutocomplete(matches.slice(0, 15), 'full');
      }
    }
    return;
  }
  
  // Arrow keys for menu navigation
  if (!menu.classList.contains('hidden')) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      replAutocompleteIndex = Math.min(replAutocompleteIndex + 1, replAutocompleteItems.length - 1);
      updateReplAutocompleteSelection();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      replAutocompleteIndex = Math.max(replAutocompleteIndex - 1, 0);
      updateReplAutocompleteSelection();
    } else if (event.key === 'Enter') {
      if (replAutocompleteIndex >= 0) {
        event.preventDefault();
        applyReplAutocomplete(replAutocompleteItems[replAutocompleteIndex]);
        hideReplAutocomplete();
      }
    } else if (event.key === 'Escape') {
      hideReplAutocomplete();
    }
  }
}

let replAutocompleteType = 'full'; // 'full', '@', '+'

function showReplAutocomplete(items, type = 'full') {
  const menu = document.getElementById('repl-autocomplete');
  if (!menu || !items.length) return;
  
  replAutocompleteItems = items;
  replAutocompleteIndex = 0;
  replAutocompleteType = type;
  
  menu.innerHTML = items.map((item, i) => 
    `<div class="autocomplete-item${i === 0 ? ' selected' : ''}" onclick="clickReplAutocomplete('${esc(item)}')">${esc(item)}</div>`
  ).join('');
  menu.classList.remove('hidden');
}

function hideReplAutocomplete() {
  const menu = document.getElementById('repl-autocomplete');
  if (menu) {
    menu.classList.add('hidden');
    menu.innerHTML = '';
  }
  replAutocompleteItems = [];
  replAutocompleteIndex = -1;
}

function updateReplAutocompleteSelection() {
  const menu = document.getElementById('repl-autocomplete');
  if (!menu) return;
  
  const items = menu.querySelectorAll('.autocomplete-item');
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === replAutocompleteIndex);
  });
}

function clickReplAutocomplete(value) {
  applyReplAutocomplete(value);
  hideReplAutocomplete();
  document.getElementById('repl-input')?.focus();
}

function applyReplAutocomplete(value) {
  const input = document.getElementById('repl-input');
  if (!input) return;
  
  const cursorPos = input.selectionStart;
  const text = input.value;
  const beforeCursor = text.slice(0, cursorPos);
  const afterCursor = text.slice(cursorPos);
  
  // Find what we're replacing based on type
  let newBefore = beforeCursor;
  
  if (replAutocompleteType === '@') {
    newBefore = beforeCursor.replace(/@\w*$/, value + ' ');
  } else if (replAutocompleteType === '+') {
    newBefore = beforeCursor.replace(/\+[^\s]*$/, value + ' ');
  } else if (replAutocompleteType === 'with') {
    newBefore = beforeCursor.replace(/(\bwith\s+)\w*$/i, '$1' + value + ' ');
  } else {
    // Full replacement - replace entire input, add space for commands
    newBefore = value + ' ';
  }
  
  input.value = newBefore + (replAutocompleteType === 'full' ? '' : afterCursor);
  input.selectionStart = input.selectionEnd = newBefore.length;
}

// Action item with inline editing
function renderActionItem(task, isInbox = false) {
  const project = task.project ? ` +${task.project}` : '';
  const due = task.due_date ? ` due:${task.due_date.split('T')[0]}` : '';
  const context = task.context ? ` ${task.context}` : '';
  const fullText = `${task.title}${context}${project}${due}`;

  return `
    <li class="item action-item" data-id="${task.id}" data-full="${esc(fullText)}" data-context="${task.context || ''}">
      <div class="action-display" onclick="startEdit(this.parentElement)">
        <span class="item-title">${esc(task.title)}</span>
        <span class="item-meta">
          ${task.project ? `<span class="item-project">+${esc(task.project)}</span>` : ''}
          ${task.due_date ? `<span class="item-due">${formatDue(task.due_date)}</span>` : ''}
        </span>
      </div>
      <div class="action-edit hidden">
        <input type="text" class="inline-input" value="${esc(fullText)}"
               onkeydown="handleEditKey(event, this)"
               onblur="handleEditBlur(event, this)">
        <div class="inline-actions">
          <button class="btn-inline save" onclick="saveEdit(this.closest('.action-item'))">Save</button>
          <button class="btn-inline" onclick="cancelEdit(this.closest('.action-item'))">Cancel</button>
          ${isInbox ? `
            <select class="btn-inline convert-select" onchange="convertItem(this.closest('.action-item'), this.value)">
              <option value="">Convert to...</option>
              <option value="action">→ Action</option>
              <option value="event">→ Event</option>
              <option value="project">→ Project</option>
              <option value="note">→ Note</option>
              <option value="entry">→ Entry</option>
            </select>
          ` : ''}
          <button class="btn-inline done" onclick="markDone(this.closest('.action-item').dataset.id)">Done</button>
        </div>
        <div class="autocomplete-menu hidden"></div>
      </div>
    </li>
  `;
}

function formatDue(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('T')) {
    const [date, time] = dateStr.split('T');
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const hour = h % 12 || 12;
    return `${date} ${hour}:${m.toString().padStart(2, '0')}${ampm}`;
  }
  return dateStr;
}

// Inline editing
function startEdit(item) {
  document.querySelectorAll('.action-item.editing').forEach(el => {
    if (el !== item) cancelEdit(el);
  });

  item.classList.add('editing');
  item.querySelector('.action-display').classList.add('hidden');
  item.querySelector('.action-edit').classList.remove('hidden');

  const input = item.querySelector('.inline-input');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function cancelEdit(item) {
  if (!item) return;

  item.classList.remove('editing');
  item.querySelector('.action-display').classList.remove('hidden');
  item.querySelector('.action-edit').classList.add('hidden');

  const input = item.querySelector('.inline-input');
  input.value = item.dataset.full;
  hideAutocomplete(item);
}

function handleEditBlur(event, input) {
  setTimeout(() => {
    const item = input.closest('.action-item');
    if (!item) return;

    const editArea = item.querySelector('.action-edit');
    if (!editArea.contains(document.activeElement)) {
      cancelEdit(item);
    }
  }, 150);
}

function handleEditKey(event, input) {
  const item = input.closest('.action-item');
  const menu = item.querySelector('.autocomplete-menu');

  if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit(item);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const selected = menu.querySelector('.autocomplete-item.selected');
    if (selected && !menu.classList.contains('hidden')) {
      applyAutocomplete(input, selected.dataset.value);
      hideAutocomplete(item);
    } else {
      saveEdit(item);
    }
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    console.log('Tab pressed, autocomplete data:', autocompleteData);

    if (!menu.classList.contains('hidden')) {
      const selected = menu.querySelector('.autocomplete-item.selected');
      if (selected) {
        applyAutocomplete(input, selected.dataset.value);
        hideAutocomplete(item);
        return;
      }
    }

    // Trigger autocomplete
    const cursorPos = input.selectionStart;
    const text = input.value;
    const beforeCursor = text.slice(0, cursorPos);
    console.log('Before cursor:', beforeCursor);

    const contextMatch = beforeCursor.match(/@(\w*)$/);
    const projectMatch = beforeCursor.match(/\+([^\s]*)$/);
    const withMatch = beforeCursor.match(/\bwith\s+(\w*)$/i);
    console.log('Context match:', contextMatch, 'Project match:', projectMatch, 'With match:', withMatch);

    if (contextMatch) {
      const partial = contextMatch[1].toLowerCase();
      const matches = autocompleteData.contexts.filter(c =>
        c.toLowerCase().startsWith('@' + partial) || c.toLowerCase().startsWith(partial)
      );
      console.log('Context matches:', matches);
      showAutocomplete(item, matches, '@');
    } else if (projectMatch) {
      const partial = projectMatch[1].toLowerCase();
      console.log('Project partial:', partial, 'Projects:', autocompleteData.projects);
      const matches = autocompleteData.projects.filter(p =>
        p.toLowerCase().startsWith(partial) ||
        p.toLowerCase().replace(/\s+/g, '-').startsWith(partial)
      );
      console.log('Project matches:', matches);
      showAutocomplete(item, matches.map(p => '+' + p.toLowerCase().replace(/\s+/g, '-')), '+');
    } else if (withMatch) {
      const partial = withMatch[1].toLowerCase();
      console.log('With partial:', partial, 'Contacts:', autocompleteData.contacts);
      const contacts = autocompleteData.contacts || [];
      const matches = contacts.filter(c =>
        c.toLowerCase().startsWith(partial)
      );
      console.log('Contact matches:', matches);
      showAutocomplete(item, matches, 'with');
    }
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!menu.classList.contains('hidden')) {
      event.preventDefault();
      navigateAutocomplete(menu, event.key === 'ArrowDown' ? 1 : -1);
    }
  }
}

function showAutocomplete(item, matches, prefix) {
  const menu = item.querySelector('.autocomplete-menu');

  if (matches.length === 0) {
    hideAutocomplete(item);
    return;
  }

  menu.innerHTML = matches.slice(0, 8).map((m, i) => `
    <div class="autocomplete-item ${i === 0 ? 'selected' : ''}" data-value="${esc(m)}"
         onclick="applyAutocompleteClick(this)">${esc(m)}</div>
  `).join('');

  menu.classList.remove('hidden');
}

function hideAutocomplete(item) {
  const menu = item.querySelector('.autocomplete-menu');
  if (menu) menu.classList.add('hidden');
}

function navigateAutocomplete(menu, direction) {
  const items = menu.querySelectorAll('.autocomplete-item');
  const current = menu.querySelector('.autocomplete-item.selected');
  let currentIndex = Array.from(items).indexOf(current);

  currentIndex += direction;
  if (currentIndex < 0) currentIndex = items.length - 1;
  if (currentIndex >= items.length) currentIndex = 0;

  items.forEach((item, i) => {
    item.classList.toggle('selected', i === currentIndex);
  });
}

function applyAutocompleteClick(el) {
  const item = el.closest('.action-item') || el.closest('.generic-item');
  const input = item.querySelector('.inline-input');
  applyAutocomplete(input, el.dataset.value);
  hideAutocomplete(item);
  input.focus();
}

function applyAutocomplete(input, value) {
  const cursorPos = input.selectionStart;
  const text = input.value;
  const beforeCursor = text.slice(0, cursorPos);
  const afterCursor = text.slice(cursorPos);

  let newBefore;
  if (value.startsWith('@')) {
    newBefore = beforeCursor.replace(/@\w*$/, value);
  } else if (value.startsWith('+')) {
    newBefore = beforeCursor.replace(/\+[^\s]*$/, value);
  } else if (value.startsWith('#')) {
    newBefore = beforeCursor.replace(/#\w*$/, value);
  } else if (beforeCursor.match(/\bwith\s+\w*$/i)) {
    // Contact name completion - replace just the partial name after 'with '
    newBefore = beforeCursor.replace(/(\bwith\s+)\w*$/i, '$1' + value);
  } else {
    newBefore = beforeCursor + value;
  }

  input.value = newBefore + afterCursor;
  input.setSelectionRange(newBefore.length, newBefore.length);
}

async function saveEdit(item) {
  const input = item.querySelector('.inline-input');
  const text = input.value.trim();
  const id = item.dataset.id;

  let title = text;
  let context = null;
  let project = null;
  let due_date = null;

  const contextMatch = text.match(/@(\w+)/);
  if (contextMatch) {
    context = '@' + contextMatch[1];
    title = title.replace(/@\w+/, '').trim();
  }

  const projectMatch = text.match(/\+([^\s]+)/);
  if (projectMatch) {
    project = projectMatch[1];
    title = title.replace(/\+[^\s]+/, '').trim();
  }

  const dueMatch = text.match(/due:(\S+)/i);
  if (dueMatch) {
    due_date = parseDueDate(dueMatch[1]);
    title = title.replace(/due:\S+/i, '').trim();
  }

  title = title.replace(/\s+/g, ' ').trim();

  try {
    const res = await apiFetch(`/api/action/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, context, project, due_date }),
    });

    if (!res.ok) throw new Error('Failed to save');
    
    // Update display immediately (don't wait for WebSocket)
    const titleEl = item.querySelector('.action-display .item-title');
    if (titleEl) titleEl.textContent = title;
    
    const projectEl = item.querySelector('.action-display .item-project');
    if (projectEl) {
      projectEl.textContent = project ? `+${project}` : '';
    }
    
    // Update data attributes
    const newFull = `${title}${context ? ' ' + context : ''}${project ? ' +' + project : ''}${due_date ? ' due:' + due_date : ''}`;
    item.dataset.full = newFull;
    item.dataset.context = context || '';
    
    cancelEdit(item);
    showToast('Saved');
  } catch (e) {
    console.error('Failed to save:', e);
    showToast('Failed to save', true);
  }
}

function parseDueDate(str) {
  const today = new Date();
  const s = str.toLowerCase();

  if (s === 'today') {
    return today.toISOString().split('T')[0];
  }
  if (s === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = days.indexOf(s);
  if (dayIndex !== -1) {
    const d = new Date(today);
    const diff = (dayIndex - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const mdMatch = str.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1], 10) - 1;
    const d = parseInt(mdMatch[2], 10);
    let year = today.getFullYear();
    const parsed = new Date(year, m, d);
    if (parsed < today) year++;
    return `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return str;
}

async function markDone(id) {
  try {
    const res = await apiFetch(`/api/action/${id}/done`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed');

    const item = document.querySelector(`[data-id="${id}"]`);
    if (item) {
      item.style.opacity = '0.5';
      item.style.pointerEvents = 'none';
      setTimeout(() => item.remove(), 300);
    }
  } catch (e) {
    console.error('Failed to mark done:', e);
  }
}

async function processItem(item) {
  const id = item.dataset.id;
  const input = item.querySelector('.inline-input');

  let text = input.value.replace(/@inbox\s*/gi, '').trim();
  input.value = text;

  try {
    await apiFetch(`/api/action/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: null }),
    });
  } catch (e) {
    console.error('Failed to process:', e);
  }
}

async function convertItem(item, targetType) {
  if (!targetType) return;
  
  const id = item.dataset.id;
  const input = item.querySelector('.inline-input');
  const select = item.querySelector('.convert-select');
  
  // Clean up the text - remove @inbox
  let text = input.value.replace(/@inbox\s*/gi, '').trim();
  
  // Reset select
  if (select) select.value = '';
  
  if (targetType === 'action') {
    // Simple conversion - just remove @inbox context
    try {
      await apiFetch(`/api/action/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: null }),
      });
      showToast('Converted to action');
    } catch (e) {
      console.error('Failed to convert:', e);
      showToast('Conversion failed', true);
    }
    return;
  }
  
  // For other types, use chat API to create new item and delete old
  let command = '';
  switch (targetType) {
    case 'event':
      command = `new event ${text}`;
      break;
    case 'project':
      command = `new project ${text}`;
      break;
    case 'note':
      command = `new note ${text}`;
      break;
    case 'entry':
      command = `new entry ${text}`;
      break;
    default:
      return;
  }
  
  try {
    // Create the new item via chat
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: command }),
    });
    
    if (!res.ok) throw new Error('Failed to create');
    
    // Delete the old inbox item
    await apiFetch(`/api/action/${id}/done`, { method: 'POST' });
    
    // Visual feedback
    item.style.opacity = '0.5';
    item.style.pointerEvents = 'none';
    setTimeout(() => item.remove(), 300);
    
    const data = await res.json();
    showToast(data.reply?.split('\n')[0] || `Converted to ${targetType}`);
  } catch (e) {
    console.error('Failed to convert:', e);
    showToast('Conversion failed', true);
  }
}

// Generic item editing (for projects, events, notes, etc.)
function startGenericEdit(item) {
  console.log('startGenericEdit called', item);
  if (!item) {
    console.error('startGenericEdit: no item provided');
    return;
  }
  
  // Close any other open edits
  document.querySelectorAll('.generic-item.editing').forEach(el => {
    if (el !== item) cancelGenericEdit(el);
  });

  item.classList.add('editing');
  const display = item.querySelector('.item-display');
  const edit = item.querySelector('.item-edit');
  console.log('display:', display, 'edit:', edit);
  
  if (display) display.classList.add('hidden');
  if (edit) edit.classList.remove('hidden');

  const input = item.querySelector('.inline-input');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function cancelGenericEdit(item) {
  if (!item) return;

  item.classList.remove('editing');
  item.querySelector('.item-display').classList.remove('hidden');
  item.querySelector('.item-edit').classList.add('hidden');

  const input = item.querySelector('.inline-input');
  input.value = item.dataset.title;
}

function handleGenericEditBlur(event, input) {
  setTimeout(() => {
    const item = input.closest('.generic-item');
    if (!item) return;

    const editArea = item.querySelector('.item-edit');
    if (!editArea.contains(document.activeElement)) {
      cancelGenericEdit(item);
    }
  }, 150);
}

function handleGenericEditKey(event, input) {
  const item = input.closest('.generic-item');
  const menu = item.querySelector('.autocomplete-menu');

  if (event.key === 'Escape') {
    event.preventDefault();
    if (menu && !menu.classList.contains('hidden')) {
      hideAutocomplete(item);
    } else {
      cancelGenericEdit(item);
    }
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    if (menu) {
      const selected = menu.querySelector('.autocomplete-item.selected');
      if (selected && !menu.classList.contains('hidden')) {
        applyAutocomplete(input, selected.dataset.value);
        hideAutocomplete(item);
        return;
      }
    }
    saveGenericEdit(item);
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();

    if (menu && !menu.classList.contains('hidden')) {
      const selected = menu.querySelector('.autocomplete-item.selected');
      if (selected) {
        applyAutocomplete(input, selected.dataset.value);
        hideAutocomplete(item);
        return;
      }
    }

    // Trigger autocomplete based on cursor position
    const cursorPos = input.selectionStart;
    const text = input.value;
    const beforeCursor = text.slice(0, cursorPos);

    const contextMatch = beforeCursor.match(/@(\w*)$/);
    const projectMatch = beforeCursor.match(/\+([^\s]*)$/);
    const tagMatch = beforeCursor.match(/#(\w*)$/);

    if (contextMatch) {
      const partial = contextMatch[1].toLowerCase();
      const matches = autocompleteData.contexts
        .filter(c => c.toLowerCase().replace('@', '').startsWith(partial))
        .map(c => c.startsWith('@') ? c : '@' + c);
      showAutocomplete(item, matches, '@');
    } else if (projectMatch) {
      const partial = projectMatch[1].toLowerCase();
      const matches = autocompleteData.projects
        .filter(p => p.toLowerCase().startsWith(partial))
        .map(p => p.startsWith('+') ? p : '+' + p);
      showAutocomplete(item, matches, '+');
    } else if (tagMatch) {
      const partial = tagMatch[1].toLowerCase();
      const matches = autocompleteData.tags
        .filter(t => t.toLowerCase().startsWith(partial))
        .map(t => t.startsWith('#') ? t : '#' + t);
      showAutocomplete(item, matches, '#');
    }
    return;
  }

  // Arrow keys for autocomplete navigation
  if (menu && !menu.classList.contains('hidden')) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = menu.querySelectorAll('.autocomplete-item');
      const current = menu.querySelector('.autocomplete-item.selected');
      let idx = Array.from(items).indexOf(current);
      
      if (event.key === 'ArrowDown') {
        idx = (idx + 1) % items.length;
      } else {
        idx = (idx - 1 + items.length) % items.length;
      }
      
      items.forEach((it, i) => it.classList.toggle('selected', i === idx));
      return;
    }
  }
}

async function saveGenericEdit(item) {
  const input = item.querySelector('.inline-input');
  const rawValue = input.value.trim();
  const id = item.dataset.id;
  const itemType = item.dataset.type;

  if (!rawValue) {
    showToast('Title cannot be empty', true);
    return;
  }

  // Parse input for title, @context, +project, #tags
  let title = rawValue;
  let context = null;
  let project = null;
  const tags = [];

  // Extract context (@context)
  const contextMatch = rawValue.match(/@(\w+)/);
  if (contextMatch) {
    context = '@' + contextMatch[1];
    title = title.replace(/@\w+/, '').trim();
  }

  // Extract project (+project)
  const projectMatch = rawValue.match(/\+([^\s#@]+)/);
  if (projectMatch) {
    project = projectMatch[1];
    title = title.replace(/\+[^\s#@]+/, '').trim();
  }

  // Extract tags (#tag)
  const tagMatches = rawValue.matchAll(/#(\w+)/g);
  for (const match of tagMatches) {
    tags.push(match[1]);
    title = title.replace(match[0], '').trim();
  }

  // Clean up extra spaces
  title = title.replace(/\s+/g, ' ').trim();

  if (!title) {
    showToast('Title cannot be empty', true);
    return;
  }

  try {
    if (itemType === 'note') {
      // Use dedicated note PATCH endpoint
      const body = { title };
      if (project !== null) body.project = project;
      if (tags.length > 0) body.tags = tags;

      const res = await apiFetch(`/api/note/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Update failed');
      
      item.dataset.title = title;
      item.querySelector('.item-title').textContent = title;
      cancelGenericEdit(item);
      showToast('Saved');
      
      // Open the note panel
      addPanel(`note:${id}`);
    } else if (itemType === 'action' || itemType === 'item') {
      // Use dedicated action PATCH endpoint
      const body = { title };
      if (context !== null) body.context = context;
      if (project !== null) body.project = project;
      if (tags.length > 0) body.tags = tags;

      const res = await apiFetch(`/api/action/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Update failed');
      
      item.dataset.title = title;
      const titleEl = item.querySelector('.item-title') || item.querySelector('.action-title');
      if (titleEl) titleEl.textContent = title;
      cancelGenericEdit(item);
      showToast('Saved');
    } else {
      // Fallback for other types - update via content
      const res = await apiFetch(`/api/page/${id}`, { method: 'GET' });
      
      if (res.ok) {
        const data = await res.json();
        let content = data.content || '';
        content = content.replace(/^#\s+.+$/m, `# ${title}`);
        
        await apiFetch(`/api/page/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        
        item.dataset.title = title;
        item.querySelector('.item-title').textContent = title;
        cancelGenericEdit(item);
        showToast('Saved');
      }
    }
  } catch (e) {
    console.error('Failed to save:', e);
    showToast('Save failed', true);
  }
}

async function removeItem(item) {
  const id = item.dataset.id;
  const itemType = item.dataset.type;
  const title = item.dataset.title;

  if (!confirm(`Remove "${title}"?`)) return;

  try {
    // Use chat API to delete
    const command = itemType === 'event' 
      ? `delete event ${title}` 
      : `delete ${title}`;
    
    const res = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: command }),
    });

    if (res.ok) {
      item.style.opacity = '0.5';
      item.style.pointerEvents = 'none';
      setTimeout(() => item.remove(), 300);
      showToast('Removed');
    } else {
      throw new Error('Failed to remove');
    }
  } catch (e) {
    console.error('Failed to remove:', e);
    showToast('Remove failed', true);
  }
}

// Drag and drop
function setupDragDrop() {
  const overlay = document.getElementById('drop-overlay');

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    overlay.classList.remove('hidden');
  });

  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
      overlay.classList.add('hidden');
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    overlay.classList.add('hidden');

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const isImage = file.type.startsWith('image/');
    
    // For images, offer OCR options
    if (isImage) {
      const choice = prompt(
        'What would you like to do?\n\n' +
        '1 = OCR only (show in REPL)\n' +
        '3 = Import image to garden\n\n' +
        'Or enter a note title to OCR and save:',
        ''
      );
      
      if (!choice) return;
      
      if (choice === '1' || choice.toLowerCase() === 'ocr') {
        // OCR mode - show in REPL
        const formData = new FormData();
        formData.append('file', file);
        
        showToast('Extracting text...');
        
        try {
          const res = await apiFetch('/api/ocr', { method: 'POST', body: formData });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'OCR failed');
          }
          const data = await res.json();
          
          if (data.text) {
            replMessages.push({ 
              role: 'assistant', 
              text: `**OCR Result from ${file.name}:**\n\n${data.text}` 
            });
            
            if (!panels.has('repl')) {
              addPanel('repl');
            }
            refreshReplPanel();
            showToast('Text extracted!');
          }
        } catch (e) {
          console.error('OCR failed:', e);
          showToast(e.message || 'OCR failed', true);
        }
        return;
      }
      
      if (choice === '3' || choice.toLowerCase() === 'import') {
        // Import mode
        const name = prompt('Name for this media (can include +project #tags):', file.name.replace(/\.[^.]+$/, ''));
        if (!name) return;
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);

        try {
          const res = await apiFetch('/api/media/upload', { method: 'POST', body: formData });
          if (!res.ok) throw new Error('Upload failed');
          showToast('Media imported');
        } catch (e) {
          console.error('Upload failed:', e);
          showToast('Upload failed', true);
        }
        return;
      }
      
      // Anything else = OCR to Note with custom title
      const customTitle = choice.trim();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', customTitle);
      
      showToast('Extracting text...');
      
      try {
        const res = await apiFetch('/api/ocr/note', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'OCR failed');
        }
        const data = await res.json();
        
        if (data.noteId) {
          showToast(`Saved: ${data.title}`);
          // Open the note in a panel
          addPanel(`note:${data.noteId}`);
        }
      } catch (e) {
        console.error('OCR to note failed:', e);
        showToast(e.message || 'OCR failed', true);
      }
      return;
    } else {
      // Non-image: standard import
      const name = prompt('Name for this media (can include +project #tags):', file.name.replace(/\.[^.]+$/, ''));
      if (!name) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);

      try {
        const res = await apiFetch('/api/media/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        showToast('Media imported');
      } catch (e) {
        console.error('Upload failed:', e);
        showToast('Upload failed', true);
      }
    }
  });
}

// Lightbox
function openLightbox(src, title) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-title').textContent = title;
  document.getElementById('lightbox').classList.remove('hidden');
}

function closeLightbox(event) {
  if (event.target.tagName !== 'IMG') {
    document.getElementById('lightbox').classList.add('hidden');
  }
}

// Toast
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-panel);
    border: 1px solid ${isError ? 'var(--danger)' : 'var(--success)'};
    color: var(--text-bright);
    padding: 10px 20px;
    border-radius: 6px;
    z-index: 1001;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Utility
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Lightweight markdown renderer for REPL output
function renderMarkdown(text) {
  if (!text) return '';
  
  // First escape HTML
  let html = esc(text);
  
  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_ (but not inside words)
  html = html.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<em>$1</em>');
  html = html.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');
  
  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Process line by line for lists and structure
  const lines = html.split('\n');
  let result = [];
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // List items: - item or * item or • item (with optional indentation)
    const listMatch = line.match(/^(\s*)([-*•])\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        result.push('<ul class="md-list">');
        inList = true;
      }
      const indent = listMatch[1].length > 0 ? ' class="indent"' : '';
      result.push(`<li${indent}>${listMatch[3]}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      
      // Empty line = paragraph break
      if (line.trim() === '') {
        result.push('<br>');
      } else {
        result.push(`<div class="md-line">${line}</div>`);
      }
    }
  }
  
  if (inList) {
    result.push('</ul>');
  }
  
  return result.join('');
}
