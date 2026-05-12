/**
 * Returns JS code to be injected into the iframe's srcdoc.
 * Handles hover highlighting, click selection, and path reporting via postMessage.
 */
export function getElementSelectorScript(): string {
  return `
(function() {
  let selectedEl = null;
  const pathBar = document.getElementById('path-bar');

  document.addEventListener('mouseover', function(e) {
    const el = e.target.closest('[data-office-path]');
    if (el && el !== selectedEl) {
      el.style.outline = '2px solid #3b82f6';
      el.style.outlineOffset = '2px';
    }
  });

  document.addEventListener('mouseout', function(e) {
    const el = e.target.closest('[data-office-path]');
    if (el && el !== selectedEl) {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
  });

  document.addEventListener('click', function(e) {
    const el = e.target.closest('[data-office-path]');
    if (!el) return;

    if (selectedEl) {
      selectedEl.classList.remove('selected');
      selectedEl.style.outline = '';
      selectedEl.style.outlineOffset = '';
    }

    selectedEl = el;
    el.classList.add('selected');
    el.style.outline = '2px solid #f97316';
    el.style.outlineOffset = '2px';

    const path = el.getAttribute('data-office-path');
    if (path && pathBar) {
      pathBar.textContent = path;
      pathBar.style.display = 'block';
    }

    window.parent.postMessage({ type: 'office-element-selected', path: path }, '*');
  });
})();
`
}
