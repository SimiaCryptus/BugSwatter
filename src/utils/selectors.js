/**
 * Generates a stable, privacy-safe CSS selector for a DOM element.
 * Supports Shadow DOM traversal and prioritizes semantic attributes.
 */

export function getUniqueSelector(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';

  // Handle Shadow DOM: If element is inside a shadow root, prefix with host selector
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) {
    const hostSelector = getUniqueSelector(root.host);
    const internalSelector = getSelectorLogic(element, root);
    return `${hostSelector} >>> ${internalSelector}`;
  }

  return getSelectorLogic(element, element.ownerDocument);
}

/**
 * Core logic to determine selector within a specific root context
 */
function getSelectorLogic(el, rootContext) {
  // 1. ID
  if (el.id) {
    const escapedId = CSS.escape(el.id);
    // Check uniqueness within the root context
    if (rootContext.querySelectorAll(`#${escapedId}`).length === 1) {
      return `#${escapedId}`;
    }
  }

  // 2. Data Attributes (Test IDs)
  const testAttrs = ['data-testid', 'data-cy', 'data-test', 'data-automation-id'];
  for (const attr of testAttrs) {
    if (el.hasAttribute(attr)) {
      const selector = `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
      if (rootContext.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // 3. ARIA / Role
  if (el.getAttribute('aria-label')) {
    const selector = `[aria-label="${CSS.escape(el.getAttribute('aria-label'))}"]`;
    if (rootContext.querySelectorAll(selector).length === 1) {
      return selector;
    }
  }

  // 4. Unique Class Combination
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/);
    if (classes.length > 0) {
      const classSelector = '.' + classes.map(c => CSS.escape(c)).join('.');
      // Only use if it's unique, otherwise it's too generic
      if (rootContext.querySelectorAll(classSelector).length === 1) {
        return classSelector;
      }
    }
  }

  // 5. Fallback: Path
  return getPathSelector(el, rootContext);
}

function getPathSelector(el, rootContext) {
  const path = [];
  let current = el;
  
  while (current) {
    // Stop if we hit the root
    if (current.parentNode === rootContext || current.parentNode instanceof Document || current.parentNode instanceof ShadowRoot) {
      path.unshift(current.tagName.toLowerCase());
      break;
    }

    // Optimization: If an ancestor has a unique ID, use it as a base
    if (current !== el && current.id) {
      const escapedId = CSS.escape(current.id);
      if (rootContext.querySelectorAll(`#${escapedId}`).length === 1) {
        path.unshift(`#${escapedId}`);
        break;
      }
    }

    const parent = current.parentElement;
    if (!parent) {
      path.unshift(current.tagName.toLowerCase());
      break;
    }
    
    const tagName = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children);
    const sameTagSiblings = siblings.filter(s => s.tagName.toLowerCase() === tagName);
    
    if (sameTagSiblings.length === 1) {
      path.unshift(tagName);
    } else {
      const index = siblings.indexOf(current) + 1;
      path.unshift(`${tagName}:nth-child(${index})`);
    }
    
    current = parent;
  }
  
  return path.join(' > ');
}