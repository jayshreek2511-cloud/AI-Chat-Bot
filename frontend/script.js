/* ============================================
   NEURALCHAT — script.js
   Connects to POST /chat on your Flask backend
============================================ */

// ── Config ──────────────────────────────────
let API_ENDPOINT = 'http://localhost:5000/chat';
const BASE_URL = 'http://localhost:5000';

// ── DOM refs ────────────────────────────────
const chatArea          = document.getElementById('chatArea');
const messagesContainer = document.getElementById('messagesContainer');
const welcomeScreen     = document.getElementById('welcomeScreen');
const messageInput      = document.getElementById('messageInput');
const sendBtn           = document.getElementById('sendBtn');
const newChatBtn        = document.getElementById('newChatBtn');
const hamburgerBtn      = document.getElementById('hamburgerBtn');
const sidebarCloseBtn   = document.getElementById('sidebarCloseBtn');
const sidebarOverlay    = document.getElementById('sidebarOverlay');
const sidebar           = document.getElementById('sidebar');
const settingsBtn       = document.getElementById('settingsBtn');
const settingsModal     = document.getElementById('settingsModal');
const modalCloseBtn     = document.getElementById('modalCloseBtn');
const modalSaveBtn      = document.getElementById('modalSaveBtn');
const apiEndpointInput  = document.getElementById('apiEndpointInput');
const themeSelect       = document.getElementById('themeSelect');
const historyList       = document.getElementById('historyList');
const sidebarToggle     = document.getElementById('sidebarToggle');
const navbarLogoToggle  = document.getElementById('navbarLogoToggle');

// ── State ───────────────────────────────────
let isWaiting   = false;
let messageCount = 0;
let currentSessionId = null;

// ── Helpers ─────────────────────────────────
function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMessage(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:13px;">$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function scrollToBottom(smooth = true) {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

// ── Welcome Screen ───────────────────────────
function hideWelcome() {
  if (welcomeScreen && welcomeScreen.style.display !== 'none') {
    welcomeScreen.style.opacity = '0';
    welcomeScreen.style.transition = 'opacity 0.3s ease';
    setTimeout(() => { welcomeScreen.style.display = 'none'; }, 300);
  }
}

function showWelcome() {
  welcomeScreen.style.display = 'flex';
  welcomeScreen.style.opacity = '1';
  messagesContainer.innerHTML = '';
}

// ── Add a chat bubble ────────────────────────
function addMessage(role, text, skipCount = false) {
  hideWelcome();
  if (!skipCount) messageCount++;

  const group = document.createElement('div');
  group.className = 'message-group';

  const row = document.createElement('div');
  row.className = `message-row ${role === 'user' ? 'user' : 'bot'}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'U' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = formatMessage(text);

  row.appendChild(avatar);
  row.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.innerHTML = `<span>${timeNow()}</span>`;

  group.appendChild(row);
  group.appendChild(meta);
  messagesContainer.appendChild(group);

  scrollToBottom();
}

// ── Typing indicator ─────────────────────────
function showTypingIndicator() {
  hideWelcome();
  const row = document.createElement('div');
  row.className = 'message-row bot';
  row.id = 'typingIndicator';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = 'AI';

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>`;

  row.appendChild(avatar);
  row.appendChild(indicator);
  messagesContainer.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

// ── Send a message ───────────────────────────
async function sendMessage() {
  if (isWaiting) return;

  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  addMessage('user', text);
  isWaiting = true;
  showTypingIndicator();

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
          message: text,
          sessionId: currentSessionId
      })
    });

    if (!response.ok) throw new Error(`Server error ${response.status}`);

    const data = await response.json();
    removeTypingIndicator();
    addMessage('assistant', data.reply || 'No response received.');

    // If this was the first message of a new session
    if (!currentSessionId) {
      currentSessionId = data.sessionId;
      addHistoryEntry(data.title, data.sessionId);
    }

  } catch (err) {
    removeTypingIndicator();
    addMessage('assistant', `⚠️ **Error:** ${err.message}`);
  } finally {
    isWaiting = false;
  }
}

// ── History sidebar ──────────────────────────
function addHistoryEntry(title, sessionId) {
  // Remove active state from others
  historyList.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));

  const li = document.createElement('li');
  li.className = 'history-item active';
  li.dataset.id = sessionId;
  li.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" stroke-width="1.5"/></svg>
    <span>${escapeHtml(title)}</span>`;
  
  li.addEventListener('click', () => switchSession(sessionId));
  historyList.prepend(li);
}

async function loadSessions() {
  try {
    const response = await fetch(`${BASE_URL}/sessions`);
    const sessions = await response.json();
    historyList.innerHTML = '';
    sessions.forEach(s => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.dataset.id = s.id;
      li.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" stroke-width="1.5"/></svg>
        <span>${escapeHtml(s.title)}</span>`;
      li.addEventListener('click', () => switchSession(s.id));
      historyList.appendChild(li);
    });
  } catch (err) { console.error("Failed to load sessions", err); }
}

async function switchSession(sessionId) {
  if (currentSessionId === sessionId) return;
  
  historyList.querySelectorAll('.history-item').forEach(i => {
    i.classList.toggle('active', i.dataset.id === sessionId);
  });

  try {
    const response = await fetch(`${BASE_URL}/session/${sessionId}`);
    const session = await response.json();
    
    currentSessionId = sessionId;
    messagesContainer.innerHTML = '';
    hideWelcome();
    
    session.messages.forEach(msg => {
      addMessage(msg.role, msg.content, true);
    });
    
    closeSidebar();
  } catch (err) { console.error("Failed to load session", err); }
}

// ── Sidebar ──────────────────────────────────
function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── New Chat ─────────────────────────────────
function startNewChat() {
  currentSessionId = null;
  messageCount = 0;
  showWelcome();
  historyList.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));
  closeSidebar();
}

// ── Event Listeners ──────────────────────────
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener('input', () => {
  sendBtn.disabled = messageInput.value.trim() === '' || isWaiting;
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
});

newChatBtn.addEventListener('click', startNewChat);
hamburgerBtn.addEventListener('click', openSidebar);
sidebarCloseBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
settingsBtn.addEventListener('click', openSettings);
modalCloseBtn.addEventListener('click', closeSettings);

// Toggle Sidebar Collapse
function toggleSidebar(e) {
  if (e) e.preventDefault();
  
  if (window.innerWidth > 768) {
    sidebar.classList.toggle('collapsed');
    const isNowCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isNowCollapsed);
    console.log("Sidebar toggled. Collapsed:", isNowCollapsed);
  } else {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }
}

// Attach listeners
[sidebarToggle, navbarLogoToggle, hamburgerBtn].forEach(el => {
  if (el) el.addEventListener('click', toggleSidebar);
});

window.addEventListener('DOMContentLoaded', () => {
  const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (isCollapsed && window.innerWidth > 768) {
    sidebar.classList.add('collapsed');
  }
  loadSessions();
});

settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });

modalSaveBtn.addEventListener('click', () => {
  const newEndpoint = apiEndpointInput.value.trim();
  if (newEndpoint) API_ENDPOINT = newEndpoint;
  const theme = themeSelect.value;
  document.body.className = theme === 'dark' ? '' : theme;
  closeSettings();
  showToast('Settings saved!');
});

document.querySelectorAll('.suggestion-card').forEach(card => {
  card.addEventListener('click', () => {
    messageInput.value = card.dataset.suggestion;
    sendBtn.disabled = false;
    messageInput.focus();
    sendMessage();
  });
});

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; bottom:100px; left:50%; transform:translateX(-50%);
    background:var(--accent); color:white;
    padding:10px 20px; border-radius:999px;
    font-size:13px; font-weight:600;
    box-shadow:0 4px 16px var(--accent-glow);
    z-index:9999; animation:fadeInUp 0.3s ease;
    white-space:nowrap;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { 
      toast.style.opacity = '0'; 
      toast.style.transition = 'opacity 0.3s'; 
      setTimeout(() => toast.remove(), 300); 
  }, 2000);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (settingsModal.classList.contains('open')) closeSettings();
    else closeSidebar();
  }
});

window.addEventListener('load', () => {
  messageInput.focus();
  scrollToBottom(false);
});
