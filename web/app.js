// Bartleby Dashboard - WebSocket client and panel management

let ws = null;
let reconnectTimer = null;
const panels = new Map(); // view -> panel element
let editingId = null; // Currently editing page ID

// Autocomplete data (fetched once, refreshed on updates)
let autocompleteData = { contexts: [], projects: [] };

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    updateStatus('connected');
    fetchAutocompleteData();
    // Resubscribe to all existing panels
    for (const view of panels.keys()) {
      ws.send(JSON.stringify({ type: 'subscribe', view }));
    }
  };
  
  ws.onclose = () => {
    updateStatus('disconnected');
    // Reconnect after 2 seconds
    reconnectTimer = setTimeout(connect, 2000);
  };
  
  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
  
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  };
}

async function fetchAutocompleteData() {
  try {
    const res = await fetch('/api/autocomplete');
    autocompleteData = await res.json();
  } catch (e) {
    console.error('Failed to fetch autocomplete data:', e);
  }
}

function updateStatus(status) {
  const el = document.getElementById('status');
  el.textContent = status === 'connected' ? '● Connected' : '○ Disconnected';
  el.className = 'status ' + status;
}

function handleMessage(msg) {
  if (msg.type === 'data' && msg.view && msg.data) {
    renderPanel(msg.view, msg.data);
    // Refresh autocomplete when data changes
    fetchAutocompleteData();
  }
}

function addPanel(view) {
  if (panels.has(view)) {
    // Already exists, just highlight it
    const panel = panels.get(view);
    panel.classList.add('highlight');
    setTimeout(() => panel.classList.remove('highlight'), 300);
    return;
  }
  
  const panel = createPanel(view);
  document.getElementById('panels').appendChild(panel);
  panels.set(view, panel);
  
  // Subscribe to updates
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', view }));
  }
}

function removePanel(view) {
  const panel = panels.get(view);
  if (panel) {
    panel.remove();
    panels.delete(view);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', view }));
    }
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

function renderPanel(view, data) {
  const panel = panels.get(view);
  if (!panel) return;
  
  const content = panel.querySelector('.panel-content');
  
  if (view === 'inbox') {
    content.innerHTML = renderInbox(data);
  } else if (view === 'next-actions') {
    content.innerHTML = renderNextActions(data);
  } else if (view === 'projects') {
    content.innerHTML = renderProjects(data);
  } else if (view.startsWith('project:')) {
    content.innerHTML = renderProject(data);
  } else if (view === 'today') {
    content.innerHTML = renderToday(data);
  } else if (view === 'recent') {
    content.innerHTML = renderRecent(data);
  }
}

function renderInbox(items) {
  if (!items || items.length === 0) {
    return '<div class="empty">Inbox empty ✓</div>';
  }
  
  // Inbox items use inline editing like actions
  return `<ul>${items.map(item => renderEditableItem(item, item.title)).join('')}</ul>`;
}

function renderNextActions(tasks) {
  if (!tasks || tasks.length === 0) {
    return '<div class="empty">No actions</div>';
  }
  
  // Group by context
  const byContext = {};
  for (const task of tasks) {
    const ctx = task.context || '@uncategorized';
    if (!byContext[ctx]) byContext[ctx] = [];
    byContext[ctx].push(task);
  }
  
  let html = '';
  for (const [ctx, ctxTasks] of Object.entries(byContext)) {
    html += `<div class="section-header">${ctx}</div><ul>`;
    html += ctxTasks.map(task => renderActionItem(task)).join('');
    html += '</ul>';
  }
  
  return html;
}

function renderActionItem(task) {
  const project = task.project ? ` +${task.project}` : '';
  const due = task.due_date ? ` due:${task.due_date.split('T')[0]}` : '';
  const context = task.context ? ` ${task.context}` : '';
  const fullText = `${task.title}${context}${project}${due}`;
  
  return renderEditableItem(task, fullText, {
    showProject: !!task.project,
    showDue: !!task.due_date,
    projectName: task.project,
    dueDate: task.due_date,
  });
}

// Generic inline-editable item renderer
function renderEditableItem(item, fullText, opts = {}) {
  const { showProject, showDue, projectName, dueDate } = opts;
  const isInbox = item.context === '@inbox';
  
  return `
    <li class="item action-item" data-id="${item.id}" data-full="${escapeAttr(fullText)}" data-context="${item.context || ''}">
      <div class="action-display" onclick="startInlineEdit(this.parentElement)">
        <span class="item-title">${escapeHtml(item.title)}</span>
        <span class="item-meta">
          ${showProject ? `<span class="item-project">+${projectName}</span>` : ''}
          ${showDue ? `<span class="item-due">${formatDue(dueDate)}</span>` : ''}
        </span>
      </div>
      <div class="action-edit hidden">
        <input type="text" class="inline-input" value="${escapeAttr(fullText)}" 
               onkeydown="handleInlineKeydown(event, this)"
               onblur="handleInlineBlur(event, this)">
        <div class="inline-actions">
          <button class="btn-inline save" onclick="saveInlineEdit(this.closest('.action-item'))">Save</button>
          <button class="btn-inline cancel" onclick="cancelInlineEdit(this.closest('.action-item'))">Cancel</button>
          ${isInbox ? `<button class="btn-inline process" onclick="processItem(this.closest('.action-item'))">→ Action</button>` : ''}
          <button class="btn-inline done" onclick="markDone(this.closest('.action-item').dataset.id)">Done</button>
        </div>
        <div class="autocomplete-menu hidden"></div>
      </div>
    </li>
  `;
}

function startInlineEdit(item) {
  // Close any other open inline edits
  document.querySelectorAll('.action-item.editing').forEach(el => {
    if (el !== item) cancelInlineEdit(el);
  });
  
  item.classList.add('editing');
  item.querySelector('.action-display').classList.add('hidden');
  item.querySelector('.action-edit').classList.remove('hidden');
  
  const input = item.querySelector('.inline-input');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function cancelInlineEdit(item) {
  if (!item) return;
  
  item.classList.remove('editing');
  item.querySelector('.action-display').classList.remove('hidden');
  item.querySelector('.action-edit').classList.add('hidden');
  
  // Reset input to original value
  const input = item.querySelector('.inline-input');
  input.value = item.dataset.full;
  
  // Hide autocomplete
  hideAutocomplete(item);
}

function handleInlineBlur(event, input) {
  // Delay to allow clicking buttons
  setTimeout(() => {
    const item = input.closest('.action-item');
    if (!item) return;
    
    // Check if focus is still within the edit area
    const editArea = item.querySelector('.action-edit');
    if (!editArea.contains(document.activeElement)) {
      cancelInlineEdit(item);
    }
  }, 150);
}

function handleInlineKeydown(event, input) {
  const item = input.closest('.action-item');
  const menu = item.querySelector('.autocomplete-menu');
  
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelInlineEdit(item);
    return;
  }
  
  if (event.key === 'Enter') {
    event.preventDefault();
    // If autocomplete is visible and has selection, apply it
    const selected = menu.querySelector('.autocomplete-item.selected');
    if (selected && !menu.classList.contains('hidden')) {
      applyAutocomplete(input, selected.dataset.value);
      hideAutocomplete(item);
    } else {
      saveInlineEdit(item);
    }
    return;
  }
  
  if (event.key === 'Tab') {
    event.preventDefault();
    
    // If autocomplete visible, apply selection
    if (!menu.classList.contains('hidden')) {
      const selected = menu.querySelector('.autocomplete-item.selected');
      if (selected) {
        applyAutocomplete(input, selected.dataset.value);
        hideAutocomplete(item);
        return;
      }
    }
    
    // Try to trigger autocomplete
    const cursorPos = input.selectionStart;
    const text = input.value;
    const beforeCursor = text.slice(0, cursorPos);
    
    // Find if we're typing a @context or +project
    const contextMatch = beforeCursor.match(/@(\w*)$/);
    const projectMatch = beforeCursor.match(/\+([^\s]*)$/);
    
    if (contextMatch) {
      const partial = contextMatch[1].toLowerCase();
      const matches = autocompleteData.contexts.filter(c => 
        c.toLowerCase().startsWith('@' + partial) || c.toLowerCase().startsWith(partial)
      );
      showAutocomplete(item, matches, '@');
    } else if (projectMatch) {
      const partial = projectMatch[1].toLowerCase();
      const matches = autocompleteData.projects.filter(p => 
        p.toLowerCase().startsWith(partial) || 
        p.toLowerCase().replace(/\s+/g, '-').startsWith(partial)
      );
      showAutocomplete(item, matches.map(p => '+' + p.toLowerCase().replace(/\s+/g, '-')), '+');
    }
    return;
  }
  
  // Arrow keys for autocomplete navigation
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
    <div class="autocomplete-item ${i === 0 ? 'selected' : ''}" data-value="${escapeAttr(m)}"
         onclick="applyAutocompleteClick(this)">${escapeHtml(m)}</div>
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
  const item = el.closest('.action-item');
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
  
  // Replace the partial @context or +project with the full value
  let newBefore;
  if (value.startsWith('@')) {
    newBefore = beforeCursor.replace(/@\w*$/, value);
  } else if (value.startsWith('+')) {
    newBefore = beforeCursor.replace(/\+[^\s]*$/, value);
  } else {
    newBefore = beforeCursor + value;
  }
  
  input.value = newBefore + afterCursor;
  input.setSelectionRange(newBefore.length, newBefore.length);
}

async function saveInlineEdit(item) {
  const input = item.querySelector('.inline-input');
  const text = input.value.trim();
  const id = item.dataset.id;
  
  // Parse the text for title, @context, +project, due:date
  let title = text;
  let context = null;
  let project = null;
  let due_date = null;
  
  // Extract context (@word)
  const contextMatch = text.match(/@(\w+)/);
  if (contextMatch) {
    context = '@' + contextMatch[1];
    title = title.replace(/@\w+/, '').trim();
  }
  
  // Extract project (+word or +word-word)
  const projectMatch = text.match(/\+([^\s]+)/);
  if (projectMatch) {
    project = projectMatch[1];
    title = title.replace(/\+[^\s]+/, '').trim();
  }
  
  // Extract due date (due:YYYY-MM-DD or due:date)
  const dueMatch = text.match(/due:(\S+)/i);
  if (dueMatch) {
    due_date = parseDueDate(dueMatch[1]);
    title = title.replace(/due:\S+/i, '').trim();
  }
  
  // Clean up extra spaces
  title = title.replace(/\s+/g, ' ').trim();
  
  try {
    const res = await fetch(`/api/action/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, context, project, due_date }),
    });
    
    if (!res.ok) throw new Error('Failed to save');
    
    // Panel will auto-refresh via WebSocket
    cancelInlineEdit(item);
  } catch (e) {
    console.error('Failed to save:', e);
    alert('Failed to save action');
  }
}

function parseDueDate(str) {
  // Handle common formats
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
  
  // Days of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = days.indexOf(s);
  if (dayIndex !== -1) {
    const d = new Date(today);
    const diff = (dayIndex - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }
  
  // Try parsing as date
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  // MM/DD format
  const mdMatch = str.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1], 10) - 1;
    const d = parseInt(mdMatch[2], 10);
    let year = today.getFullYear();
    const parsed = new Date(year, m, d);
    if (parsed < today) year++;
    return `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  
  return str; // Return as-is if can't parse
}

async function markDone(id) {
  try {
    const res = await fetch(`/api/action/${id}/done`, {
      method: 'POST',
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to mark done');
    }
    
    // Immediately hide the item for snappy UX (panel will also refresh via WebSocket)
    const item = document.querySelector(`[data-id="${id}"]`);
    if (item) {
      item.style.opacity = '0.5';
      item.style.pointerEvents = 'none';
      setTimeout(() => item.remove(), 300);
    }
  } catch (e) {
    console.error('Failed to mark done:', e);
    // Don't show alert - just log
  }
}

async function processItem(item) {
  const id = item.dataset.id;
  const input = item.querySelector('.inline-input');
  
  // Remove @inbox from the input text
  let text = input.value.replace(/@inbox\s*/gi, '').trim();
  input.value = text;
  
  // Update on server - clear the context
  try {
    const res = await fetch(`/api/action/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: null }),
    });
    
    if (!res.ok) throw new Error('Failed to process');
    
    // Update the data attribute
    item.dataset.context = '';
    item.dataset.full = text;
    
    // Hide the Process button since it's no longer inbox
    const processBtn = item.querySelector('.btn-inline.process');
    if (processBtn) processBtn.style.display = 'none';
    
    // Focus at end of input so user can add @context +project
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  } catch (e) {
    console.error('Failed to process item:', e);
  }
}

function renderProjects(projects) {
  if (!projects || projects.length === 0) {
    return '<div class="empty">No active projects</div>';
  }
  
  return `<ul>${projects.map(p => `
    <li class="item" onclick="addPanel('project:${escapeHtml(p.title)}')" style="cursor:pointer">
      <span class="item-title">${escapeHtml(p.title)}</span>
    </li>
  `).join('')}</ul>`;
}

function renderProject(data) {
  if (!data || !data.project) {
    return '<div class="empty">Project not found</div>';
  }
  
  const { project, actions, media, notes } = data;
  let html = '';
  
  // Project itself is editable
  html += `<div class="item clickable" onclick="openEditor('${project.id}', '${escapeHtml(project.title)}')" style="margin-bottom: 16px; padding: 8px; border-radius: 4px;">`;
  html += `<span class="item-meta">Click to edit project</span>`;
  if (project.content) {
    html += `<div style="margin-top: 8px; color: var(--text-muted);">${escapeHtml(project.content)}</div>`;
  }
  html += '</div>';
  
  // Actions
  html += '<div class="section-header">Actions</div>';
  if (!actions || actions.length === 0) {
    html += '<div class="empty">No actions</div>';
  } else {
    html += `<ul>${actions.map(a => renderActionItem(a)).join('')}</ul>`;
  }
  
  // Media
  if (media && media.length > 0) {
    html += '<div class="section-header">Media</div>';
    html += '<div class="media-grid">';
    html += media.map(m => {
      const meta = m.metadata || {};
      const filePath = meta.filePath || '';
      const fileName = meta.fileName || m.title;
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
      
      if (isImage) {
        return `<div class="media-item" onclick="openEditor('${m.id}', '${escapeHtml(m.title)}')">
          <img src="/media/${encodeURIComponent(fileName)}" alt="${escapeHtml(m.title)}" />
          <span class="media-title">${escapeHtml(m.title)}</span>
        </div>`;
      } else {
        return `<div class="media-item file" onclick="openEditor('${m.id}', '${escapeHtml(m.title)}')">
          <span class="media-icon">📎</span>
          <span class="media-title">${escapeHtml(m.title)}</span>
        </div>`;
      }
    }).join('');
    html += '</div>';
  }
  
  // Notes
  if (notes && notes.length > 0) {
    html += '<div class="section-header">Notes</div>';
    html += `<ul>${notes.map(n => `
      <li class="item clickable" onclick="openEditor('${n.id}', '${escapeHtml(n.title)}')">
        <span class="item-title">${escapeHtml(n.title)}</span>
      </li>
    `).join('')}</ul>`;
  }
  
  return html;
}

function renderToday(data) {
  const { events, overdue } = data || {};
  let html = '';
  
  if (overdue && overdue.length > 0) {
    html += '<div class="section-header">⚠️ Overdue</div><ul>';
    html += overdue.map(t => {
      const fullText = `${t.title}${t.context ? ' ' + t.context : ''}${t.project ? ' +' + t.project : ''} due:${t.due_date.split('T')[0]}`;
      return renderEditableItem(t, fullText, {
        showDue: true,
        dueDate: t.due_date,
      });
    }).join('');
    html += '</ul>';
  }
  
  html += '<div class="section-header">📅 Events</div>';
  if (!events || events.length === 0) {
    html += '<div class="empty">No events today</div>';
  } else {
    html += `<ul>${events.map(e => `
      <li class="item">
        <span class="item-title">${escapeHtml(e.title)}</span>
        <span class="item-meta">${formatTime(e.start)}</span>
      </li>
    `).join('')}</ul>`;
  }
  
  return html;
}

function renderRecent(items) {
  if (!items || items.length === 0) {
    return '<div class="empty">No recent activity</div>';
  }
  
  return `<ul>${items.map(item => {
    // Actions and inbox items get inline editing
    if (item.type === 'action' || item.context === '@inbox') {
      const fullText = `${item.title}${item.context ? ' ' + item.context : ''}${item.project ? ' +' + item.project : ''}${item.due_date ? ' due:' + item.due_date.split('T')[0] : ''}`;
      return renderEditableItem(item, fullText, {
        showProject: !!item.project,
        showDue: !!item.due_date,
        projectName: item.project,
        dueDate: item.due_date,
      });
    }
    
    // Other types use the modal editor
    return `
      <li class="item clickable" onclick="openEditor('${item.id}', '${escapeHtml(item.title)}')">
        <span class="item-title">${escapeHtml(item.title)}</span>
        <span class="item-meta">${item.type} · ${timeAgo(item.updated_at)}</span>
      </li>
    `;
  }).join('')}</ul>`;
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDue(dateStr) {
  if (!dateStr) return '';
  // Handle datetime format YYYY-MM-DDTHH:MM
  if (dateStr.includes('T')) {
    const [date, time] = dateStr.split('T');
    return `${date} ${formatTime(time)}`;
  }
  return dateStr;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  // Convert HH:MM to 12h format
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

function promptProjectPanel() {
  const name = prompt('Project name:');
  if (name) {
    addPanel('project:' + name);
  }
}

// Modal editor (for notes, entries, etc. - complex content)
async function openEditor(id, title) {
  try {
    const res = await fetch(`/api/page/${id}`);
    if (!res.ok) throw new Error('Failed to load');
    
    const { record, content } = await res.json();
    
    editingId = id;
    document.getElementById('edit-title').textContent = title;
    document.getElementById('edit-content').value = content;
    
    // Populate project dropdown
    await populateProjectDropdown();
    
    // Set toolbar values from record
    document.getElementById('edit-context').value = record.context || '';
    document.getElementById('edit-project').value = record.project || '';
    document.getElementById('edit-due').value = record.due_date ? record.due_date.split('T')[0] : '';
    
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-content').focus();
  } catch (e) {
    console.error('Failed to open editor:', e);
    alert('Failed to load page');
  }
}

async function populateProjectDropdown() {
  try {
    const res = await fetch('/api/projects');
    const projects = await res.json();
    
    const select = document.getElementById('edit-project');
    // Keep first "none" option, remove rest
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    for (const p of projects) {
      const opt = document.createElement('option');
      opt.value = p.title.toLowerCase().replace(/\s+/g, '-');
      opt.textContent = p.title;
      select.appendChild(opt);
    }
  } catch (e) {
    console.error('Failed to load projects:', e);
  }
}

function updateMetaField(field, value) {
  const textarea = document.getElementById('edit-content');
  let content = textarea.value;
  
  // Parse existing backmatter
  const backmatterMatch = content.match(/\n---\n([\s\S]*?)---\s*$/);
  
  if (backmatterMatch) {
    let meta = backmatterMatch[1];
    const fieldRegex = new RegExp(`^${field}:.*$`, 'm');
    
    if (value) {
      // Format value (add quotes if needed, @ for context)
      let formattedValue = value;
      if (field === 'context' && !value.startsWith('@') && value) {
        formattedValue = `"${value}"`;
      } else if (field === 'context') {
        formattedValue = `"${value}"`;
      }
      
      if (fieldRegex.test(meta)) {
        // Update existing field
        meta = meta.replace(fieldRegex, `${field}: ${formattedValue}`);
      } else {
        // Add new field
        meta = `${field}: ${formattedValue}\n${meta}`;
      }
    } else {
      // Remove field if value is empty
      meta = meta.replace(fieldRegex, '').replace(/^\n+/gm, '\n');
    }
    
    content = content.replace(/\n---\n[\s\S]*?---\s*$/, `\n---\n${meta}---\n`);
  } else if (value) {
    // No backmatter yet, add it
    let formattedValue = field === 'context' ? `"${value}"` : value;
    content = content.trim() + `\n\n---\n${field}: ${formattedValue}\n---\n`;
  }
  
  textarea.value = content;
}

function closeEditor() {
  editingId = null;
  document.getElementById('edit-modal').classList.add('hidden');
}

async function saveEdit() {
  if (!editingId) return;
  
  const content = document.getElementById('edit-content').value;
  
  try {
    const res = await fetch(`/api/page/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    
    if (!res.ok) throw new Error('Failed to save');
    
    closeEditor();
    // Dashboard will auto-update via file watcher
  } catch (e) {
    console.error('Failed to save:', e);
    alert('Failed to save');
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Escape to close editor
  if (e.key === 'Escape' && editingId) {
    closeEditor();
  }
  // Cmd/Ctrl+S to save
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && editingId) {
    e.preventDefault();
    saveEdit();
  }
});

// Drag and drop for media import
let dragCounter = 0;

function initDragDrop() {
  const overlay = document.getElementById('drop-overlay');
  
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      overlay.classList.remove('hidden');
    }
  });
  
  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      overlay.classList.add('hidden');
    }
  });
  
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.add('hidden');
    
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    
    for (const file of files) {
      await uploadMedia(file);
    }
  });
}

async function uploadMedia(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  // Prompt for name/project (optional - use filename by default)
  const defaultName = file.name.replace(/\.[^.]+$/, '');
  const name = prompt(`Import "${file.name}"\n\nName (or add +project):`, defaultName);
  
  if (name === null) return; // Cancelled
  
  formData.append('name', name || defaultName);
  
  try {
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      body: formData,
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }
    
    const result = await res.json();
    showToast(`📎 Imported: ${result.title}`);
  } catch (e) {
    console.error('Upload failed:', e);
    showToast(`Failed to import: ${e.message}`, true);
  }
}

function showToast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  connect();
  initDragDrop();
  
  // Add default panels
  addPanel('inbox');
  addPanel('next-actions');
});
