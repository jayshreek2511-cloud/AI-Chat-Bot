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
// RAG FIX START — define missing settings functions
function openSettings() { settingsModal.classList.add('open'); }
function closeSettings() { settingsModal.classList.remove('open'); }
// RAG FIX END
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

// ============================================
// RAG PART 6 START — Upload, Doc Mode, Streaming, Sources
// ============================================

// RAG FIX START — Wrap in DOMContentLoaded to ensure DOM is ready
document.addEventListener('DOMContentLoaded', function() {

// ── RAG DOM refs ────────────────────────────
const ragDropzone     = document.getElementById('ragDropzone');
const ragFileInput    = document.getElementById('ragFileInput');
const ragUploadStatus = document.getElementById('ragUploadStatus');
const ragDocModeBtn   = document.getElementById('ragDocModeBtn');

if (!ragDropzone || !ragFileInput) {
  console.error('RAG elements not found in DOM!');
  return;
}
console.log('RAG upload zone initialized');

// ── RAG State ───────────────────────────────
let ragDocModeActive = false;
let ragDocLoaded     = false;
const ragSessionId   = 'rag_' + Math.random().toString(36).substring(2, 10);

// ── File Upload — Click ─────────────────────
ragDropzone.addEventListener('click', function(e) {
  e.preventDefault();
  e.stopPropagation();
  console.log('Drop zone clicked');
  ragFileInput.click();
});

ragFileInput.addEventListener('change', function() {
  if (ragFileInput.files.length > 0) {
    console.log('File selected:', ragFileInput.files[0].name);
    ragUploadFile(ragFileInput.files[0]);
  }
});

// ── File Upload — Drag & Drop ───────────────
ragDropzone.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.stopPropagation();
  ragDropzone.classList.add('drag-over');
});
ragDropzone.addEventListener('dragleave', function() {
  ragDropzone.classList.remove('drag-over');
});
ragDropzone.addEventListener('drop', function(e) {
  e.preventDefault();
  e.stopPropagation();
  ragDropzone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    console.log('File dropped:', e.dataTransfer.files[0].name);
    ragUploadFile(e.dataTransfer.files[0]);
  }
});

// ── Upload to /upload ───────────────────────
async function ragUploadFile(file) {
  console.log('Uploading to /upload...');
  ragUploadStatus.textContent = '⏳ Processing document...';
  ragUploadStatus.className = 'rag-upload-status loading';

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await fetch(`${BASE_URL}/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    console.log('Upload success:', data);

    if (data.error) {
      ragUploadStatus.textContent = `❌ ${data.error}`;
      ragUploadStatus.className = 'rag-upload-status error';
      return;
    }

    ragDocLoaded = true;
    ragUploadStatus.textContent = `✅ Document loaded: ${data.filename} (${data.total_chunks} chunks)`;
    ragUploadStatus.className = 'rag-upload-status success';

    // Auto-enable Doc Mode
    if (!ragDocModeActive) ragToggleDocMode();

  } catch (err) {
    console.error('Upload failed:', err);
    ragUploadStatus.textContent = '❌ Upload failed. Try again.';
    ragUploadStatus.className = 'rag-upload-status error';
  }
}

// ── Doc Mode Toggle ─────────────────────────
ragDocModeBtn.addEventListener('click', ragToggleDocMode);

function ragToggleDocMode() {
  ragDocModeActive = !ragDocModeActive;
  ragDocModeBtn.classList.toggle('active', ragDocModeActive);

  if (ragDocModeActive) {
    ragDocModeBtn.textContent = '📄 Doc ✓';
    messageInput.placeholder = 'Ask about your document...';
  } else {
    ragDocModeBtn.textContent = '📄 Doc';
    messageInput.placeholder = 'Message NeuralChat...';
  }
}

// ── Override sendMessage when Doc Mode is on ─
const originalSendMessage = sendMessage;

async function ragSendMessage() {
  if (!ragDocModeActive) return originalSendMessage();
  if (isWaiting) return;

  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  addMessage('user', text);
  isWaiting = true;
  hideWelcome();

  // Show doc indicator + typing
  const indicatorGroup = document.createElement('div');
  indicatorGroup.className = 'message-group';
  indicatorGroup.id = 'ragStreamGroup';

  const indicatorText = document.createElement('div');
  indicatorText.className = 'rag-doc-indicator';
  indicatorText.style.cssText = 'padding: 0 24px; max-width: 860px; margin: 0 auto; width: 100%;';
  indicatorText.textContent = '📄 Answering from document...';

  const streamRow = document.createElement('div');
  streamRow.className = 'message-row bot';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.id = 'ragStreamBubble';
  bubble.innerHTML = '<span class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></span>';

  streamRow.appendChild(avatar);
  streamRow.appendChild(bubble);
  indicatorGroup.appendChild(indicatorText);
  indicatorGroup.appendChild(streamRow);
  messagesContainer.appendChild(indicatorGroup);
  scrollToBottom();

  try {
    const res = await fetch(`${BASE_URL}/rag-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, session_id: ragSessionId, stream: true })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullAnswer = '';
    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      let chunk = decoder.decode(value, { stream: true });

      if (chunk.includes('[DONE]')) {
        chunk = chunk.replace(/\n?\n?\[DONE\]/g, '');
      }

      fullAnswer += chunk;

      if (firstChunk) {
        bubble.innerHTML = '';
        firstChunk = false;
      }
      bubble.innerHTML = formatMessage(fullAnswer);
      scrollToBottom();
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `<span>${timeNow()}</span>`;
    meta.style.cssText = 'padding-left: 44px;';
    indicatorGroup.appendChild(meta);

    ragFetchSources(text, indicatorGroup);

  } catch (err) {
    bubble.innerHTML = formatMessage(`⚠️ **Error:** ${err.message}`);
  } finally {
    isWaiting = false;
  }
}

// ── Fetch sources separately for display ────
async function ragFetchSources(question, container) {
  try {
    const res = await fetch(`${BASE_URL}/rag-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, session_id: ragSessionId, stream: false })
    });
    const data = await res.json();

    if (data.sources && data.sources.length > 0) {
      const sourcesWrap = document.createElement('div');
      sourcesWrap.style.cssText = 'padding: 0 24px 0 68px; max-width: 860px; margin: 0 auto; width: 100%;';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'rag-sources-toggle';
      toggleBtn.textContent = `📎 Sources (${data.sources.length})`;

      const sourcesList = document.createElement('div');
      sourcesList.className = 'rag-sources-list';

      data.sources.forEach((src, i) => {
        const pill = document.createElement('div');
        pill.className = 'rag-source-pill';
        pill.innerHTML = `<strong>${src.chunk_id}</strong> — ${escapeHtml(src.preview)}...`;
        sourcesList.appendChild(pill);
      });

      toggleBtn.addEventListener('click', () => {
        sourcesList.classList.toggle('open');
        toggleBtn.textContent = sourcesList.classList.contains('open')
          ? `📎 Hide Sources`
          : `📎 Sources (${data.sources.length})`;
      });

      sourcesWrap.appendChild(toggleBtn);
      sourcesWrap.appendChild(sourcesList);
      container.appendChild(sourcesWrap);
    }
  } catch (err) {
    console.error('Failed to fetch sources:', err);
  }
}

// ── Replace the send handler ────────────────
sendBtn.removeEventListener('click', sendMessage);
sendBtn.addEventListener('click', ragSendMessage);

document.getElementById('messageInput').addEventListener('keydown', function ragKeyHandler(e) {
  if (e.key === 'Enter' && !e.shiftKey && ragDocModeActive) {
    e.preventDefault();
    e.stopImmediatePropagation();
    ragSendMessage();
  }
}, true);

});  // end DOMContentLoaded
// RAG FIX END

// ============================================
// RAG PART 6 END
// ============================================
