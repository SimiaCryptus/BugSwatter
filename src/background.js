import { db } from './utils/db.js';

/**
 * Background Service Worker
 * Acts as the Coordinator for Sticky Mode and Navigation lifecycle.
 */

// Helper to access session storage for sticky state
async function getStickyState(tabId) {
  const key = `sticky_${tabId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] || false;
}

async function setStickyState(tabId, isSticky) {
  const key = `sticky_${tabId}`;
  await chrome.storage.session.set({ [key]: isSticky });
}

// 1. Navigation Handler
// Wipes buffer on navigation unless Sticky Mode is active.
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // We only care about top-level frame navigations
  if (details.frameId !== 0) return;

  const tabId = details.tabId;
  const isSticky = await getStickyState(tabId);

  if (isSticky) {
    // Sticky Mode: Keep buffer, insert Navigation Event
    console.log(`[Background] Sticky navigation on tab ${tabId}. Appending event.`);
    await db.addEvent({
      id: crypto.randomUUID(),
      tabId: tabId,
      timestamp: Date.now(),
      type: 'navigation',
      data: {
        url: details.url,
        transitionType: details.transitionType,
        transitionQualifiers: details.transitionQualifiers
      }
    });
  } else {
    // Standard Mode: Wipe buffer
    console.log(`[Background] Standard navigation on tab ${tabId}. Wiping buffer.`);
    await db.clearEvents(tabId);
  }
});

// 2. Message Handler
// Communicates with DevTools panel for state management
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || sender.tab?.id;

  if (!tabId) return;

  if (message.action === 'SET_STICKY') {
    setStickyState(tabId, message.value).then(() => {
      sendResponse({ success: true });
    });
    return true; // Async response
  }

  if (message.action === 'GET_STICKY') {
    getStickyState(tabId).then((isSticky) => {
      sendResponse({ isSticky });
    });
    return true; // Async response
  }
  // Handle Recording State (Centralized State Management)
  if (message.type === 'START_RECORDING') {
    chrome.storage.session.set({ recordingState: 'recording' });
    return;
  }
  if (message.type === 'STOP_RECORDING') {
    chrome.storage.session.set({ recordingState: 'idle' });
    return;
  }

  // 4. Handle Events from Content Script
  if (message.type === 'RECORD_EVENT') {
    const event = {
      ...message.payload,
      tabId: tabId, // Ensure tabId is attached securely from sender
      // Ensure ID exists
      id: message.payload.id || crypto.randomUUID()
    };
    db.addEvent(event).catch(err => console.error('Failed to save event', err));
    return;
  }
});

// 3. Cleanup on Tab Close
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Always clean up storage and DB when tab is closed
  const key = `sticky_${tabId}`;
  await chrome.storage.session.remove(key);
  await db.clearEvents(tabId);
});