# Project Specification: DevTools Blackbox Recorder

## 1. Executive Summary

A Chrome DevTools extension that acts as a privacy-first "flight data recorder" for web developers. It captures a
chronological narrative of a debugging session—including user interactions, network metadata, and console logs—and
exports them as a structured bug report.

**Core Philosophy:**

* **Intent over Noise:** Filter out framework churn; capture only developer actions.
* **Privacy by Default:** Capture metadata only. No bodies, cookies, or passwords.
* **Ephemeral:** Data lives in memory/IndexedDB and is wiped on navigation unless "Sticky Mode" is active.

---

## 2. Architecture Overview

The extension utilizes the standard Chrome Extension MV3 architecture with a specific focus on the DevTools API.

### Components

1. **DevTools Page (`devtools.html/js`):**
    * The primary UI.
    * Connects to the `background` worker.
    * Visualizes the current recording state.
    * Handles ZIP generation and "Send to Service" logic.
2. **Background Service Worker (`background.js`):**
    * **The Coordinator.** Manages the "Sticky Mode" state machine using `chrome.storage.session` (to handle MV3
      ephemeral lifecycle).
    * Persists recording state flags across navigations.
    * *Note:* Data buffering is delegated to IndexedDB directly from contexts to avoid memory pressure in the ephemeral
      worker.
3. **Content Script (`content.js`):**
    * Injects the `InteractionListener` (clicks, keys).
    * Parses HTML `<head>` for "Send to Service" configuration.
    * Handles the actual `POST` request for "Send to Service" to respect page CORS policies.
4. Injected Script (Page Context):
    * Hooks `console.*` methods.
    * *Crucial:* Must communicate back to Content Script via `window.postMessage`.

---

## 3. Feature Specifications








### 3.1. Interaction Recorder

**Goal:** Record human actions to reproduce the bug.
**Privacy Filter:**

* **Clicks:** Capture Selector + Coordinates.
* **Keys:** Capture *only* navigation keys (Enter, Esc, Tab, Arrows). **Ignore** alphanumeric keys to prevent
  password/PII leakage.
* **Paste:** Capture the "Paste" action event, but **redact** the clipboard payload entirely.
* **Focus/Blur:** Capture target selector.

**Selector Strategy:**
Generate stable selectors in this priority order:

1. `id`
2. `data-testid` / `data-cy`
3. `aria-label` / `role`
4. Unique Class combination
5. `tagName:nth-child` (fallback)
   *Note: Must support Shadow DOM traversal for selectors.*

### 3.2. Network Metadata Recorder

**Goal:** Capture the "shape" of traffic without the payload.
**Captured Data:**

* Method (GET/POST)
* URL (Sanitized: Query params allowed, but flagged if suspicious)
* Status Code
* Timing (Duration)
* Headers (Allowlist: `content-type`, `cache-control`, etc. Blocklist: `cookie`, `authorization`).

### 3.3. Sticky Mode (Multi-Page Recording)

**Goal:** Allow recording to persist across page reloads and navigations.

**State Machine:**

* **Idle:** Buffer is empty.
* **Recording (Single):** Buffer fills. On Navigation → **Wipe Buffer**.
* **Recording (Sticky):** Buffer fills. On Navigation → **Keep Buffer** + Insert `NavigationEvent`.

**Visual Indicators:**

* **Badge:** Extension icon turns Green (Sticky) or Red (Recording).
* **Panel:** A persistent banner in the DevTools panel: *"Sticky Mode Active: Capturing across navigations."*

### 3.4. Configuration & Performance Profiles

To accommodate varying system capabilities and site complexity, the extension supports profiles:

* **Standard Mode (Default):** Records Console, Network, and Clicks.
* **Snapshotting:** Optional toggle to capture HTML snapshots on navigation (High memory usage).

---

## 4. Integration Spec: "Send to Service"

The extension looks for specific metadata in the document `<head>` to enable direct bug reporting.

### 4.1. Detection Logic

The extension scans for either specific `<meta>` tags or a JSON configuration script.

**Option A: Meta Tags (Simple)**

```html

<meta name="debug-report:endpoint" content="https://api.myapp.com/bugs/ingest">
<meta name="debug-report:features" content="dom,network,console">
<meta name="debug-report:session-id" content="sess_12345"> <!-- Optional Correlation ID -->
```

**Option B: JSON Config (Advanced)**

```html

<script type="application/json" id="debug-report-config">
    {
      "endpoint": "https://api.myapp.com/bugs/ingest",
      "features": ["dom", "network", "interactions"],
      "env": "staging",
      "publicKey": "-----BEGIN PUBLIC KEY... (for encryption)"
    }
</script>
```

### 4.2. Behavior

1. If detected, the DevTools panel renders a **"Send to Service"** button.
2. On click, a confirmation modal appears.
    * **Security Requirement:** Must display the **Target URL** and **Current Page Origin** prominently.
    * **Preview:** User must be able to expand and inspect the JSON payload.
3. On confirmation, the extension performs a `POST` request.
    * **Context:** Request is executed via the **Content Script** to enforce the page's CORS policy (preventing
      exfiltration to arbitrary domains).

---

## 5. Data Schema (The Artifact)

Whether downloaded as a ZIP or sent to a service, the data structure is normalized.

**File Structure (ZIP):**

```text
bug-report/
├── metadata.json      # Browser, Viewport, Extension Version, Timestamp
├── timeline.json      # The Master Event Stream (Merged)
├── console.json       # Raw Console Logs
└── network.json       # Network Metadata
```

**Timeline Event Object (JSON):**
Every event in `timeline.json` shares a base interface:

```typescript
interface TimelineEvent {
    id: string;
    timestamp: number;
    type: 'interaction' | 'network' | 'console' | 'navigation' | 'snapshot';
    data: any; // Payload specific to type
}
```

**Example Payload:**

```json
[
  {
    "timestamp": 167890001,
    "type": "interaction",
    "data": {
      "action": "click",
      "selector": "button#submit"
    }
  },
  {
    "timestamp": 167890002,
    "type": "snapshot",
    "data": {
      "trigger": "click",
      "html": "<body...>...</body>"
    }
  },
  {
    "timestamp": 167890010,
    "type": "network",
    "data": {
      "method": "POST",
      "url": "/api/login",
      "status": 500
    }
  }
]
```

---

## 6. Privacy & Security Controls

1. **Sanitization:**
    * **Input Fields:** Values are never recorded.
    * **Passwords:** Fields with `type="password"` are ignored entirely.
    * **Clipboard:** No access requested.
2. **Storage:**
    * Data is stored in `IndexedDB` within the extension's origin.
    * Data is **never** sent to a third party unless the user clicks "Send to Service" AND the page explicitly opts-in
      via HTML headers.
3. **Retention:**
    * **Default:** Cleared on every page load.
    * **Sticky Mode:** Cleared on "Stop Recording" or Tab Close.

---

## 7. Implementation Roadmap

### Phase 1: The Data Pipeline (MV3 & Persistence)



* Set up Manifest V3 structure with `chrome.storage.session` (The Coordinator).
* Implement IndexedDB buffering (bypassing the ephemeral Service Worker).
* Implement "Sticky Mode" state persistence.

### Phase 2: The Recorders

* Implement Console and Network listeners.
* Implement `InteractionListener` (clicks/keys/paste).
* Implement Shadow DOM traversal for selector generation.

### Phase 3: Integration

* Implement HTML `<head>` parser.
* Build "Send to Service" UI and POST logic.
* Implement ZIP generation (using `JSZip`).
* Final polish of selectors and visual indicators.