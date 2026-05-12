/**
 * Returns JS code to be injected into the iframe's srcdoc.
 * Handles hover highlighting, click selection, and path reporting via postMessage.
 * Supports both [data-office-path] (docx/pptx) and [data-cell] (xlsx).
 */
export function getElementSelectorScript(): string {
  return `
(function() {
  let selectedEl = null;
  let pickMode = false;
  const pathBar = document.getElementById('path-bar');

  document.addEventListener('mouseover', function(e) {
    const el = e.target.closest('[data-cell], [data-office-path]');
    if (el && el !== selectedEl) {
      el.style.outline = '2px solid #3b82f6';
      el.style.outlineOffset = '-2px';
    }
  });

  document.addEventListener('mouseout', function(e) {
    const el = e.target.closest('[data-cell], [data-office-path]');
    if (el && el !== selectedEl) {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
  });

  document.addEventListener('click', function(e) {
    if (!pickMode) return;
    const el = e.target.closest('[data-cell], [data-office-path]');
    if (!el) return;

    e.preventDefault();
    e.stopPropagation();

    if (selectedEl) {
      selectedEl.classList.remove('selected');
      selectedEl.style.outline = '';
      selectedEl.style.outlineOffset = '';
    }

    selectedEl = el;
    el.classList.add('selected');
    el.style.outline = '2px solid #f97316';
    el.style.outlineOffset = '-2px';

    const path = el.getAttribute('data-cell') || el.getAttribute('data-office-path');
    if (path && pathBar) {
      pathBar.textContent = path;
      pathBar.style.display = 'block';
    }

    pickMode = false;
    window.parent.postMessage({ type: 'office-element-selected', path: path }, '*');
  });

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'toggle-pick-mode') {
      pickMode = !pickMode;
      document.body.style.cursor = pickMode ? 'crosshair' : '';
    }
  });
})();
`
}
