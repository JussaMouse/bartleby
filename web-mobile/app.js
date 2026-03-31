const screen = document.getElementById('screen');
const statusEl = document.getElementById('status');
const tabbar = document.getElementById('tabbar');
const titleEl = document.getElementById('screen-title');

const state = {
  current: 'home',
  feed: null,
  threads: null,
  messages: [],
  lists: null,
  activity: null,
  settings: null,
  installPromptEvent: null,
};

async function api(path, options = {}) {
  const response = await fetch(`/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body?.error?.message || 'Request failed');
  }
  return body.data;
}

async function init() {
  statusEl.textContent = 'ready';
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
    render();
  });
  await loadHome();
  renderTabs();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/app/sw.js').catch(() => {});
  }
}

async function navigate(name) {
  state.current = name;
  if (name === 'home') await loadHome();
  if (name === 'chat') await loadChat();
  if (name === 'lists') await loadLists();
  if (name === 'activity') await loadActivity();
  if (name === 'settings') await loadSettings();
  renderTabs();
  render();
}

async function loadHome() {
  state.feed = await api('/me/feed');
}

async function loadChat() {
  state.threads = await api('/chat/threads');
  const threadId = state.threads.threads[0]?.id;
  if (threadId) {
    const payload = await api(`/chat/threads/${threadId}/messages`);
    state.messages = payload.messages;
  }
}

async function loadLists() {
  const [next, inbox] = await Promise.all([api('/tasks/next'), api('/tasks/inbox')]);
  state.lists = { next, inbox };
}

async function loadActivity() {
  state.activity = await api('/activity');
}

async function loadSettings() {
  state.settings = await api('/settings/summary');
}

function renderTabs() {
  const nav = state.feed?.nav || [
    { id: 'home', label: 'Home' },
    { id: 'chat', label: 'Chat' },
    { id: 'lists', label: 'Lists' },
    { id: 'capture', label: 'Capture' },
    { id: 'activity', label: 'Activity' },
    { id: 'settings', label: 'Settings' },
  ];

  tabbar.innerHTML = nav.map((item) => `
    <button data-screen="${item.id}" class="${state.current === item.id ? 'active' : ''}">
      ${escapeHtml(item.label)}
      ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
    </button>`).join('');

  Array.from(tabbar.querySelectorAll('button')).forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.screen));
  });
}

function render() {
  titleEl.textContent = titleFor(state.current);

  if (state.current === 'home') {
    screen.innerHTML = `
      <section class="card hero">
        <p class="eyebrow">Phone-first Bartleby</p>
        <h2>Capture fast, review clearly, continue later.</h2>
        <p class="muted">The mobile app is being designed for async use first: quick capture, short chat, and task visibility.</p>
        ${state.installPromptEvent ? '<p class="install-note">This app can be installed to your iPhone home screen.</p>' : ''}
        <div class="button-row">
          <button id="go-capture">Capture</button>
          <button id="go-chat">Chat</button>
        </div>
      </section>
      ${(state.feed?.cards || []).map((card) => `<section class="card"><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.body)}</p></section>`).join('')}`;
    document.getElementById('go-capture')?.addEventListener('click', () => navigate('capture'));
    document.getElementById('go-chat')?.addEventListener('click', () => navigate('chat'));
    return;
  }

  if (state.current === 'chat') {
    screen.innerHTML = `
      <section class="card">
        <h2>Chat</h2>
        <p class="muted">Short, phone-friendly replies are the default mobile posture.</p>
        <div>${state.messages.map((message) => `<div class="message ${escapeHtml(message.role)}"><strong>${escapeHtml(message.role)}</strong><p>${escapeHtml(message.text)}</p></div>`).join('')}</div>
        <textarea id="chat-input" rows="3" placeholder="Send Bartleby a message"></textarea>
        <div class="button-row">
          <button id="send-chat">Send</button>
          <button id="chat-refresh">Refresh</button>
        </div>
      </section>`;
    document.getElementById('send-chat')?.addEventListener('click', sendChat);
    document.getElementById('chat-refresh')?.addEventListener('click', async () => {
      await loadChat();
      render();
    });
    return;
  }

  if (state.current === 'lists') {
    screen.innerHTML = `
      <section class="card"><h2>${escapeHtml(state.lists?.next?.title || 'Next')}</h2>${renderList(state.lists?.next?.items || [])}</section>
      <section class="card"><h2>${escapeHtml(state.lists?.inbox?.title || 'Inbox')}</h2>${renderList(state.lists?.inbox?.items || [])}</section>`;
    return;
  }

  if (state.current === 'capture') {
    screen.innerHTML = `
      <section class="card hero">
        <p class="eyebrow">Quick capture</p>
        <h2>Get it into Bartleby fast.</h2>
        <p class="muted">Text works now. Async voice jobs are scaffolded and will become the next transport into the same pipeline.</p>
        <textarea id="capture-input" rows="4" placeholder="Capture a thought, task, or message"></textarea>
        <div class="button-row">
          <button id="capture-send">Send as chat</button>
          <button id="voice-send">Queue voice job</button>
        </div>
      </section>`;
    document.getElementById('capture-send')?.addEventListener('click', sendCaptureAsChat);
    document.getElementById('voice-send')?.addEventListener('click', createVoiceJob);
    return;
  }

  if (state.current === 'activity') {
    screen.innerHTML = `
      <section class="card">
        <h2>Activity</h2>
        <p class="muted">Recent transport and conversation events across Bartleby.</p>
        ${(state.activity?.items || []).map((item) => `<div class="list-item"><strong>${escapeHtml(item.channel)}</strong><p>${escapeHtml(item.text)}</p><p class="meta">${escapeHtml(item.direction)} · ${escapeHtml(item.timestamp)}</p></div>`).join('') || '<p class="muted">No activity yet.</p>'}
      </section>`;
    return;
  }

  screen.innerHTML = `
    <section class="card">
      <h2>Settings Summary</h2>
      ${(state.settings?.items || []).map((item) => `<div class="list-item"><strong>${escapeHtml(item.key)}</strong><p>${escapeHtml(item.value)}</p><p class="meta">${escapeHtml(item.category)}</p></div>`).join('')}
    </section>`;
}

function renderList(items) {
  if (!items.length) return '<p class="muted">Nothing here.</p>';
  return items.map((item) => `<div class="list-item"><strong>${escapeHtml(item.title)}</strong><p class="meta">${escapeHtml(item.context || 'no context')} · ${escapeHtml(item.status)}</p></div>`).join('');
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  await api('/chat/messages', { method: 'POST', body: JSON.stringify({ text }) });
  await loadChat();
  await loadActivity();
  renderTabs();
  render();
}

async function sendCaptureAsChat() {
  const input = document.getElementById('capture-input');
  const text = input?.value?.trim();
  if (!text) return;
  await api('/chat/messages', { method: 'POST', body: JSON.stringify({ text }) });
  await loadHome();
  await navigate('chat');
}

async function createVoiceJob() {
  await api('/voice/messages', { method: 'POST', body: JSON.stringify({ mode: 'placeholder' }) });
  await loadActivity();
  renderTabs();
  state.current = 'activity';
  render();
}

function titleFor(screenName) {
  switch (screenName) {
    case 'chat': return 'Chat';
    case 'lists': return 'Lists';
    case 'capture': return 'Capture';
    case 'activity': return 'Activity';
    case 'settings': return 'Settings';
    default: return 'Home';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init().catch((error) => {
  statusEl.textContent = 'error';
  screen.innerHTML = `<section class="card"><h2>Error</h2><p>${escapeHtml(error.message)}</p></section>`;
});
