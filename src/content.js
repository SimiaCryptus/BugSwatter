import { getUniqueSelector } from './utils/selectors.js';

const NAVIGATION_KEYS = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
let isRecording = false;

// Initialize
(async () => {
  try {
    // Inject the console interceptor
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/injected.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    // Listen for Console logs from injected.js
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data.source !== 'devtools-blackbox') return;
      if (event.data.type === 'console') {
        record({
          type: 'console',
          data: event.data.payload
        });
      }
    });

    // Check initial state
    const { recordingState } = await chrome.storage.session.get('recordingState');
    if (recordingState === 'recording') {
      startRecording();
    }

    // Listen for state changes from Background
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes.recordingState) {
        if (changes.recordingState.newValue === 'recording') {
          startRecording();
        } else {
          stopRecording();
        }
      }
    });
  } catch (err) {
    // Context might be invalidated on reload
    console.debug('DevTools Recorder: Content script init failed', err);
  }
})();

function startRecording() {
  if (isRecording) return;
  isRecording = true;
  
  // Use capture phase to ensure we get events before stopPropagation might be called
  window.addEventListener('click', handleInteraction, { capture: true, passive: true });
  window.addEventListener('keydown', handleKeydown, { capture: true, passive: true });
  window.addEventListener('paste', handlePaste, { capture: true, passive: true });
  window.addEventListener('focus', handleFocus, { capture: true, passive: true });
  window.addEventListener('blur', handleBlur, { capture: true, passive: true });
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  
  window.removeEventListener('click', handleInteraction, { capture: true });
  window.removeEventListener('keydown', handleKeydown, { capture: true });
  window.removeEventListener('paste', handlePaste, { capture: true });
  window.removeEventListener('focus', handleFocus, { capture: true });
  window.removeEventListener('blur', handleBlur, { capture: true });
}

// --- Event Handlers ---

function handleInteraction(event) {
  // We use composedPath to handle Shadow DOM targets correctly
  const path = event.composedPath();
  const target = path[0];

  if (shouldIgnore(target)) return;

  const selector = getUniqueSelector(target);
  
  // Calculate coordinates relative to viewport
  const { clientX, clientY } = event;

  record({
    type: 'interaction',
    data: {
      action: 'click',
      selector,
      x: clientX,
      y: clientY
    }
  });
}

function handleKeydown(event) {
  if (!NAVIGATION_KEYS.has(event.key)) return;

  record({
    type: 'interaction',
    data: {
      action: 'keydown',
      key: event.key
    }
  });
}

function handlePaste(event) {
  record({
    type: 'interaction',
    data: {
      action: 'paste',
      clipboard: '[REDACTED]'
    }
  });
}

function handleFocus(event) {
  const target = event.composedPath()[0];
  if (shouldIgnore(target)) return;
  
  record({
    type: 'interaction',
    data: {
      action: 'focus',
      selector: getUniqueSelector(target)
    }
  });
}

function handleBlur(event) {
  const target = event.composedPath()[0];
  if (shouldIgnore(target)) return;

  record({
    type: 'interaction',
    data: {
      action: 'blur',
      selector: getUniqueSelector(target)
    }
  });
}

// --- Helpers ---

function shouldIgnore(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
  
  // Privacy: Ignore password fields
  if (element.tagName === 'INPUT' && element.type === 'password') return true;
  
  return false;
}

function record(payload) {
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
    timestamp: Date.now(),
    ...payload
  };
  
  // Send to background script (Context Isolation Fix)
  chrome.runtime.sendMessage({
    type: 'RECORD_EVENT',
    payload: event
  });
}