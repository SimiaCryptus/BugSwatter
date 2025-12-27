# Blackbox Recorder 🎥

**Blackbox Recorder** is a privacy-focused Chrome DevTools extension designed to capture user interactions, network activity, and console logs. It helps developers and QA engineers create detailed, structured bug reports by recording the exact timeline of events leading up to an issue.

## ✨ Features

*   **Interaction Recording:** Automatically captures clicks, focus events, and navigation keys (Tab, Arrows, Enter, Escape).
*   **Smart Selectors:** Generates stable, privacy-safe CSS selectors, with support for **Shadow DOM** traversal.
*   **Network Monitoring:** Logs HTTP requests and responses, flagging suspicious URLs (e.g., those containing tokens/passwords).
*   **Console Capture:** Intercepts and serializes `console.log`, `warn`, `error`, etc., preserving the timeline.
*   **Sticky Mode:** Persists the recording buffer across page navigations and reloads.
*   **Privacy First:**
    *   Ignores `type="password"` inputs.
    *   Redacts clipboard paste content.
    *   Strips sensitive headers (Cookies, Authorization) from network logs.
*   **Export Options:** Download the session as a JSON file or send it directly to a configured service endpoint.

## 📂 Project Structure

The extension is built using the standard Chrome Extension architecture (Manifest V3):

*   **`background.js`**: Service worker acting as the coordinator. Handles state management and navigation lifecycle (Sticky Mode).
*   **`content.js`**: Injected into the web page to listen for DOM events.
*   **`injected.js`**: Injected into the page context to intercept Console API calls.
*   **`panel.js` / `panel.html`**: The UI that lives inside Chrome DevTools.
*   **`db.js`**: An IndexedDB wrapper for buffering large amounts of recording data efficiently.
*   **`selectors.js`**: Logic for generating unique CSS selectors.

## 🚀 How to Install from Source

Since this is a developer tool, you can install it directly from the source code without going through the Chrome Web Store.

### Prerequisites
1.  Ensure you have Google Chrome or a Chromium-based browser (Edge, Brave, etc.) installed.

### Installation Steps

1. **Open Extensions Management:**
    Open Chrome and navigate to `chrome://extensions/`.

2. **Enable Developer Mode:**
    Toggle the switch labeled **"Developer mode"** in the top right corner of the page.

3. **Load Unpacked:**
    Click the **"Load unpacked"** button that appears in the top left.

4. **Select Folder:**
    Select the folder where the extension source code is located (the folder containing `manifest.json`).

5. **Verify:**
    The extension should now appear in your list of installed extensions.

### Usage

1.  Open the website you want to debug.
2.  Open Chrome DevTools (`F12` or `Right Click -> Inspect`).
3.  Look for the tab named **"Blackbox Recorder"** in the DevTools panel (you may need to click `>>` if you have many tabs).
4.  Click **Start Recording**.
5.  Perform actions on the page.
6.  Click **Stop Recording** and use **Export ZIP** to save the data.

---

## 🔧 Configuration for "Send to Service"

The extension supports sending reports directly to a backend service. To enable this button in the UI, the webpage being recorded must respond to a specific message.

**On your website**, add a listener like this:

```javascript
window.addEventListener('message', (event) => {
  // Ensure security checks for origin here
  if (event.data && event.data.type === 'CHECK_SERVICE_CONFIG') {
    // Respond to the content script
    // Note: The actual implementation relies on Chrome Runtime messaging,
    // so the page usually needs a specific meta tag or a companion script
    // to bridge this gap depending on your specific implementation.
  }
});
```

*Note: The current implementation in `panel.js` sends a message to the tab via `chrome.tabs.sendMessage`. This requires the content script to relay configuration found on the page back to the panel.*

## 🛡️ Privacy & Security

*   **Data Storage:** All recorded data is stored locally in your browser's IndexedDB (`BlackboxRecorderDB`). It is not sent to the cloud unless you explicitly click "Send to Service".
*   **Sanitization:** The recorder actively filters out Authorization headers and ignores password input fields to prevent accidental leakage of credentials.
