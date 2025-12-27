(function() {
  // Prevent multiple injections
  if (window.__devtools_blackbox_injected) return;
  window.__devtools_blackbox_injected = true;

  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  /**
   * Safely serialize arguments to avoid circular references and BigInt errors.
   * Ensures the data is JSON-serializable for messaging.
   */
  function safeSerialize(arg) {
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    if (typeof arg === 'function') return `[Function: ${arg.name || 'anonymous'}]`;
    if (arg instanceof Error) return `[Error: ${arg.message}]`;
    
    if (typeof arg === 'object') {
      try {
        // Handle BigInt and create a clean object copy
        return JSON.parse(JSON.stringify(arg, (key, value) => {
          if (typeof value === 'bigint') return value.toString() + 'n';
          return value;
        }));
      } catch (e) {
        // Fallback for circular references or other serialization errors
        return Object.prototype.toString.call(arg);
      }
    }
    
    return arg;
  }

  function intercept(level) {
    return function(...args) {
      // Execute original console method so the developer still sees logs
      if (originalConsole[level]) {
        originalConsole[level].apply(console, args);
      }

      // Serialize and send to content script
      try {
        const serializedArgs = args.map(safeSerialize);
        
        window.postMessage({
          source: 'devtools-blackbox',
          type: 'console',
          payload: {
            level,
            timestamp: Date.now(),
            arguments: serializedArgs
          }
        }, '*');
      } catch (e) {
        // Fail silently to avoid impacting the page
      }
    };
  }

  // Hook methods
  console.log = intercept('log');
  console.info = intercept('info');
  console.warn = intercept('warn');
  console.error = intercept('error');
  console.debug = intercept('debug');
})();