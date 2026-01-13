// Bartleby Dashboard - WebSocket client and panel management

let ws = null;
let reconnectTimer = null;
const panels = new Map(); // view -> panel element

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
    <li class="item">
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
      <li class="item">
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
  
  if (project.content) {
    html += `<div style="margin-bottom: 16px; color: var(--text-muted);">${escapeHtml(project.content)}</div>`;
  }
  
  html += '<div class="section-header">Actions</div>';
  
  if (!actions || actions.length === 0) {
    html += '<div class="empty">No actions</div>';
  } else {
    html += `<ul>${actions.map(a => `
      <li class="item">
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
    <li class="item">
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  connect();
  
  // Add default panels
  addPanel('inbox');
  addPanel('next-actions');
});
