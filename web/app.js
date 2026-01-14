// Bartleby Dashboard - WebSocket client and panel management

let ws = null;
let reconnectTimer = null;
const panels = new Map(); // view -> panel element
let editingId = null; // Currently editing page ID

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    updateStatus('connected');
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

function updateStatus(status) {
  const el = document.getElementById('status');
  el.textContent = status === 'connected' ? '● Connected' : '○ Disconnected';
  el.className = 'status ' + status;
}

function handleMessage(msg) {
  if (msg.type === 'data' && msg.view && msg.data) {
    renderPanel(msg.view, msg.data);
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
  
  return `<ul>${items.map(item => `
    <li class="item clickable" onclick="openEditor('${item.id}', '${escapeHtml(item.title)}')">
      <span class="item-title">${escapeHtml(item.title)}</span>
      <span class="item-meta">${timeAgo(item.created_at)}</span>
    </li>
  `).join('')}</ul>`;
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
    html += ctxTasks.map(task => `
      <li class="item clickable" onclick="openEditor('${task.id}', '${escapeHtml(task.title)}')">
        <span class="item-title">${escapeHtml(task.title)}</span>
        <span class="item-meta">
          ${task.project ? `<span class="item-project">+${task.project}</span>` : ''}
          ${task.due_date ? `<span class="item-due">${formatDue(task.due_date)}</span>` : ''}
        </span>
      </li>
    `).join('');
    html += '</ul>';
  }
  
  return html;
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
  
  const { project, actions } = data;
  let html = '';
  
  // Project itself is editable
  html += `<div class="item clickable" onclick="openEditor('${project.id}', '${escapeHtml(project.title)}')" style="margin-bottom: 16px; padding: 8px; border-radius: 4px;">`;
  html += `<span class="item-meta">Click to edit project</span>`;
  if (project.content) {
    html += `<div style="margin-top: 8px; color: var(--text-muted);">${escapeHtml(project.content)}</div>`;
  }
  html += '</div>';
  
  html += '<div class="section-header">Actions</div>';
  
  if (!actions || actions.length === 0) {
    html += '<div class="empty">No actions</div>';
  } else {
    html += `<ul>${actions.map(a => `
      <li class="item clickable" onclick="openEditor('${a.id}', '${escapeHtml(a.title)}')">
        <span class="item-title">${escapeHtml(a.title)}</span>
        <span class="item-meta">
          ${a.context ? `<span class="item-context">${a.context}</span>` : ''}
          ${a.due_date ? `<span class="item-due">${formatDue(a.due_date)}</span>` : ''}
        </span>
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
    html += overdue.map(t => `
      <li class="item">
        <span class="item-title">${escapeHtml(t.title)}</span>
        <span class="item-meta"><span class="item-due overdue">${formatDue(t.due_date)}</span></span>
      </li>
    `).join('');
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
  
  return `<ul>${items.map(item => `
    <li class="item clickable" onclick="openEditor('${item.id}', '${escapeHtml(item.title)}')">
      <span class="item-title">${escapeHtml(item.title)}</span>
      <span class="item-meta">${item.type} · ${timeAgo(item.updated_at)}</span>
    </li>
  `).join('')}</ul>`;
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// Editor functions
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  connect();
  
  // Add default panels
  addPanel('inbox');
  addPanel('next-actions');
});
