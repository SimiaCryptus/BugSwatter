import { db } from './utils/db.js';

let isRecording = false;
let serviceConfig = null;
let isSticky = false;
const TAB_ID = chrome.devtools.inspectedWindow.tabId;

// UI Elements
const btnRecord = document.getElementById('btnRecord');
const btnClear = document.getElementById('btnClear');
const btnExport = document.getElementById('btnExport');
const btnSend = document.getElementById('btnSend');
const chkSticky = document.getElementById('chkSticky');
const stickyBanner = document.getElementById('stickyBanner');
const recordingStatus = document.getElementById('recordingStatus');
const statNetwork = document.getElementById('statNetwork');
const statInteractions = document.getElementById('statInteractions');
const statConsole = document.getElementById('statConsole');
// Modal Elements (Moved from bottom to top scope)
const sendServiceBtn = document.getElementById('btnSend'); // Fixed ID reference
const serviceModal = document.getElementById('service-modal'); // Note: This needs to exist in HTML
const confirmSendBtn = document.getElementById('confirm-send-btn'); // Note: This needs to exist in HTML

// Initialize
async function init() {
    // db.init() is not needed as _open() handles it lazily
    await syncState();
    updateStats();

    // Listen for storage changes to sync state with Background Coordinator
    chrome.storage.session.onChanged.addListener((changes) => {
        if (changes.recordingState || changes.stickyMode) {
            syncState();
        }
    });

    // Poll for stats updates (since IDB events don't propagate across contexts)
    setInterval(updateStats, 2000);
}

async function syncState() {
    const state = await chrome.storage.session.get(['recordingState', 'stickyMode']);
    isRecording = state.recordingState === 'recording';
    isSticky = !!state.stickyMode;
    updateUI();
  checkForServiceConfig();
}
// Check if the current page has a "Send to Service" configuration
function checkForServiceConfig() {
  if (!TAB_ID) return;
  chrome.tabs.sendMessage(
    TAB_ID,
    { type: 'CHECK_SERVICE_CONFIG' },
    (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be ready or page not supported
        return;
      }
      if (response && response.config) {
        serviceConfig = response;
        sendServiceBtn.style.display = 'inline-block';
      } else {
        sendServiceBtn.style.display = 'none';
        serviceConfig = null;
      }
    }
  );
}
// Re-check config on navigation
chrome.devtools.network.onNavigated.addListener(() => {
  setTimeout(checkForServiceConfig, 1000);
});


async function generateReportPayload() {
  const events = await db.getAllEvents(TAB_ID);
  // Separate events by type for the structured report
  const timeline = events.sort((a, b) => a.timestamp - b.timestamp);
  const consoleEvents = events.filter(e => e.type === 'console');
  const networkEvents = events.filter(e => e.type === 'network');
  const interactionEvents = events.filter(e => e.type === 'interaction');
  return {
    metadata: {
      timestamp: Date.now(),
      url: serviceConfig ? serviceConfig.url : 'unknown',
      userAgent: navigator.userAgent,
      version: '1.0.0'
    },
    timeline: timeline,
    console: consoleEvents,
    network: networkEvents,
    interactions: interactionEvents
  };
}

function updateUI() {
    // Recording Button State
    if (isRecording) {
        btnRecord.textContent = 'Stop Recording';
        btnRecord.className = 'btn btn-danger';
        recordingStatus.textContent = 'Recording';
        recordingStatus.className = 'status-badge status-recording';
    } else {
        btnRecord.textContent = 'Start Recording';
        btnRecord.className = 'btn btn-primary';
        recordingStatus.textContent = 'Idle';
        recordingStatus.className = 'status-badge status-idle';
    }

    // Sticky Mode State
    chkSticky.checked = isSticky;
    if (isSticky) {
        stickyBanner.classList.add('active');
    } else {
        stickyBanner.classList.remove('active');
    }
}

btnExport.addEventListener('click', async () => {
  const payload = await generateReportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bug-report-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

if (sendServiceBtn) {
sendServiceBtn.addEventListener('click', () => {
  if (!serviceConfig) return;
  document.getElementById('modal-endpoint').textContent = serviceConfig.config.endpoint;
  document.getElementById('modal-origin').textContent = serviceConfig.origin;
  if(serviceModal) serviceModal.showModal();
});
}

if (confirmSendBtn) {
confirmSendBtn.addEventListener('click', async (e) => {
  e.preventDefault(); // Prevent form submission closing modal immediately
  const originalText = confirmSendBtn.textContent;
  confirmSendBtn.textContent = 'Sending...';
  confirmSendBtn.disabled = true;
  try {
    const payload = await generateReportPayload();
    chrome.tabs.sendMessage(
      TAB_ID,
      { type: 'POST_REPORT', payload },
      (response) => {
        serviceModal.close();
        confirmSendBtn.textContent = originalText;
        confirmSendBtn.disabled = false;
        if (chrome.runtime.lastError) {
          alert('Error sending report: ' + chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success) {
          alert('Report sent successfully!');
        } else {
          alert('Failed to send report: ' + (response?.error || 'Unknown error'));
        }
      }
    );
  } catch (err) {
    console.error(err);
    serviceModal.close();
    confirmSendBtn.textContent = originalText;
    confirmSendBtn.disabled = false;
    alert('Error generating report: ' + err.message);
  }

});
}

async function updateStats() {
    try {
        // Pass TAB_ID to getCounts
        const counts = await db.getCounts(TAB_ID);
        statNetwork.textContent = counts.network || 0;
        statInteractions.textContent = counts.interaction || 0;
        statConsole.textContent = counts.console || 0;
    } catch (e) {
        console.error('Failed to update stats', e);
    }
}

// --- Event Handlers ---

btnRecord.addEventListener('click', () => {
    const action = isRecording ? 'STOP_RECORDING' : 'START_RECORDING';
    chrome.runtime.sendMessage({ type: action });
});

chkSticky.addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ 
        action: 'SET_STICKY', 
        value: e.target.checked,
        tabId: TAB_ID 
    });
});

btnClear.addEventListener('click', async () => {
    await db.clearEvents(TAB_ID);
    updateStats();
});


// --- Network Recorder ---

chrome.devtools.network.onRequestFinished.addListener(async (request) => {
    if (!isRecording) return;

    // Ignore data URIs to prevent database bloat
    if (request.request.url.startsWith('data:')) return;

    const entry = {
        id: crypto.randomUUID(),
        tabId: TAB_ID,
        type: 'network',
        method: request.request.method,
        url: request.request.url,
        status: request.response.status,
        time: request.time,
        headers: filterHeaders([...request.request.headers, ...request.response.headers]),
        suspicious: isSuspicious(request.request.url)
    };

    await db.addEvent(entry);
    
    // Optimistic UI update
    const current = parseInt(statNetwork.textContent) || 0;
    statNetwork.textContent = current + 1;
});

// Handle Navigation Logic (Wipe buffer if not sticky)
chrome.devtools.network.onNavigated.addListener(async () => {
    // Background script handles data wiping on navigation to prevent race conditions.
    // We just update the UI stats.
    updateStats();
    setTimeout(checkForServiceConfig, 1000);
});

// --- Helpers ---

function filterHeaders(headers) {
    // Blocklist for sensitive headers
    const BLOCKLIST = ['cookie', 'authorization', 'set-cookie', 'proxy-authorization'];
    return headers
        .filter(h => !BLOCKLIST.includes(h.name.toLowerCase()))
        .map(h => ({ name: h.name, value: h.value }));
}

function isSuspicious(url) {
    const lower = url.toLowerCase();
    // Basic heuristic for PII in URL
    return lower.includes('password=') || 
           lower.includes('token=') || 
           lower.includes('access_token=') ||
           lower.includes('secret=');
}

init();