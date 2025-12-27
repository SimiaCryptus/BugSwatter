const DB_NAME = 'BlackboxRecorderDB';
const DB_VERSION = 1;
const STORE_NAME = 'events';

/**
 * IndexedDB Wrapper for buffering recording data.
 * Handles storage within the Extension's origin.
 */
class RecorderDB {
  constructor() {
    this.dbPromise = null;
  }

  _open() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('tabId', 'tabId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });

    return this.dbPromise;
  }

  /**
   * Adds a single event to the timeline.
   * @param {Object} event - The event object (must contain id, tabId, timestamp, type, data)
   */
  async addEvent(event) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(event);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves all events for a specific tab, sorted by timestamp.
   * @param {number} tabId
   */
  async getEvents(tabId) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('tabId');
      const request = index.getAll(IDBKeyRange.only(tabId));

      request.onsuccess = () => {
        // Sort by timestamp in memory (IDB index sort is reliable but getAll returns array)
        const events = request.result.sort((a, b) => a.timestamp - b.timestamp);
        resolve(events);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clears all events for a specific tab.
   * @param {number} tabId
   */
  async clearEvents(tabId) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('tabId');
      const request = index.openKeyCursor(IDBKeyRange.only(tabId));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * Wrapper to get all events for a tab (alias for getEvents to match panel.js usage)
   */
  async getAllEvents(tabId) {
    return this.getEvents(tabId);
  }
  /**
   * Returns counts of events by type for a specific tab.
   * @param {number} tabId
   */
  async getCounts(tabId) {
    const events = await this.getEvents(tabId);
    const counts = {
      network: 0,
      interaction: 0,
      console: 0
    };
    events.forEach(e => {
      if (counts[e.type] !== undefined) {
        counts[e.type]++;
      }
    });
    return counts;
  }
}

export const db = new RecorderDB();