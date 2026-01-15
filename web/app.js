const state = {
  status: 'idle',
  listening: false,
  speaking: false,
  pendingTranscript: '',
};

const elements = {
  status: document.getElementById('status'),
  log: document.getElementById('log'),
  transcript: document.getElementById('transcript'),
  micButton: document.getElementById('mic-button'),
  stopButton: document.getElementById('stop-button'),
  textForm: document.getElementById('text-form'),
  textInput: document.getElementById('text-input'),
  tokenButton: document.getElementById('token-button'),
  ttsToggle: document.getElementById('tts-toggle'),
};

const tokenStorageKey = 'bartleby.apiToken';

function getApiToken() {
  return localStorage.getItem(tokenStorageKey) || '';
}

function setApiToken(token) {
  if (token) {
    localStorage.setItem(tokenStorageKey, token);
  } else {
    localStorage.removeItem(tokenStorageKey);
  }
}

function initTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    setApiToken(token);
  }
}

function setStatus(text, kind = 'idle') {
  elements.status.textContent = text;
  elements.status.dataset.state = kind;
}

function appendMessage(role, text) {
  const item = document.createElement('div');
  item.className = `message ${role}`;

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'You' : 'Bartleby';

  const content = document.createElement('div');
  content.className = 'message-text';
  content.textContent = text;

  item.appendChild(label);
  item.appendChild(content);
  elements.log.appendChild(item);
  elements.log.scrollTop = elements.log.scrollHeight;
}

function updateTranscript(text) {
  elements.transcript.textContent = text || 'Tap the mic to speak.';
}

async function sendText(text, source = 'text') {
  const clean = text.trim();
  if (!clean) return;

  appendMessage('user', clean);
  updateTranscript(source === 'voice' ? clean : '');
  setStatus('Sending...', 'sending');

  const token = getApiToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: clean }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Request failed');
    }

    const payload = await res.json();
    const reply = payload.reply || '';
    appendMessage('assistant', reply);

    if (elements.ttsToggle.checked) {
      speak(reply);
    } else {
      setStatus('Idle', 'idle');
    }
  } catch (err) {
    console.error('Chat request failed', err);
    setStatus('Request failed', 'error');
  }
}

function speak(text) {
  if (!text) {
    setStatus('Idle', 'idle');
    return;
  }

  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onstart = () => {
    state.speaking = true;
    setStatus('Speaking...', 'speaking');
  };
  utterance.onend = () => {
    state.speaking = false;
    setStatus('Idle', 'idle');
  };
  utterance.onerror = () => {
    state.speaking = false;
    setStatus('Speech failed', 'error');
  };
  speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }
  state.speaking = false;
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function setupRecognition() {
  if (!SpeechRecognition) {
    setStatus('Speech not supported', 'error');
    elements.micButton.disabled = true;
    updateTranscript('Speech recognition is not available on this device.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    state.listening = true;
    state.pendingTranscript = '';
    setStatus('Listening...', 'listening');
    elements.micButton.textContent = 'Stop Listening';
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        state.pendingTranscript += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }
    updateTranscript(interim || state.pendingTranscript);
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error', event.error);
    state.listening = false;
    elements.micButton.textContent = 'Start Listening';
    setStatus('Mic error', 'error');
  };

  recognition.onend = () => {
    const text = state.pendingTranscript.trim();
    state.listening = false;
    elements.micButton.textContent = 'Start Listening';

    if (text) {
      sendText(text, 'voice');
    } else {
      setStatus('Idle', 'idle');
    }
  };
}

function toggleListening() {
  if (!recognition) return;
  if (state.listening) {
    recognition.stop();
    return;
  }

  try {
    recognition.start();
  } catch (err) {
    console.warn('Failed to start recognition', err);
  }
}

function bindEvents() {
  elements.micButton.addEventListener('click', toggleListening);
  elements.stopButton.addEventListener('click', () => {
    stopSpeaking();
    setStatus('Idle', 'idle');
  });

  elements.textForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = elements.textInput.value;
    elements.textInput.value = '';
    sendText(value, 'text');
  });

  elements.tokenButton.addEventListener('click', () => {
    const current = getApiToken();
    const token = prompt('API token (leave empty to clear):', current);
    if (token !== null) {
      setApiToken(token.trim());
    }
  });
}

function init() {
  initTokenFromUrl();
  setupRecognition();
  bindEvents();
  setStatus('Idle', 'idle');
}

document.addEventListener('DOMContentLoaded', init);
