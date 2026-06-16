/**
 * MCP Stdio Server - Browser Tools for Claude Code
 *
 * Usage: add to .claude.json mcpServers:
 *   "browser-tools": { "type": "stdio", "command": "node", "args": ["scripts/browser-mcp-server.js"] }
 *
 * Communicates with the Electron app's built-in HTTP API on localhost:3100
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const BASE = `http://localhost:${process.env.FENG_CLAUDE_BROWSER_PORT || 3100}`

// [2026-04-30] MCP tools/list must use inputSchema; input_schema lets Claude Code load the server but hide its tools.
const TOOLS = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the embedded browser',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to navigate to' } },
      required: ['url']
    }
  },
  {
    name: 'browser_screenshot',
    description: 'Capture a screenshot of the current page (PNG base64)',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_click',
    description: 'Click an element by CSS selector',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector' } },
      required: ['selector']
    }
  },
  {
    name: 'browser_type',
    description: 'Type text into an input element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
        text: { type: 'string', description: 'Text to type' }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'browser_get_url',
    description: 'Get the current page URL',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_get_text',
    description: 'Get page text, optionally filtered by CSS selector. Default limit is 30000 chars; pass maxLength to get more or less.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (optional)' },
        maxLength: { type: 'number', description: 'Max characters to return (default 30000)' }
      },
      required: []
    }
  },
  {
    name: 'browser_eval',
    description: 'Execute JavaScript in the page context. For same-origin iframes, pass frameSelector to run JS inside the iframe.',
    inputSchema: {
      type: 'object',
      properties: {
        javascript: { type: 'string', description: 'JS code to execute' },
        frameSelector: { type: 'string', description: 'CSS selector of a same-origin <iframe> to execute inside (optional)' }
      },
      required: ['javascript']
    }
  },
  {
    name: 'browser_eval_in_frame',
    description: 'Execute JavaScript inside a cross-origin iframe using CDP isolated world. Works where browser_eval+frameSelector fails due to cross-origin restrictions. Use browser_get_frames first to find the frame URL.',
    inputSchema: {
      type: 'object',
      properties: {
        frameUrl: { type: 'string', description: 'Partial URL string to match the target iframe (e.g. "cloudflare.com" or "recaptcha")' },
        javascript: { type: 'string', description: 'JS code to execute inside the frame' }
      },
      required: ['frameUrl', 'javascript']
    }
  },
  {
    name: 'browser_show',
    description: 'Show the embedded browser in the app window',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_hide',
    description: 'Hide the embedded browser',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_devtools',
    description: 'Toggle DevTools (console, network, elements) for the embedded browser',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_back',
    description: 'Go back one page in browser history',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_forward',
    description: 'Go forward one page in browser history',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_reload',
    description: 'Reload the current page',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_console',
    description: 'Get console logs (log, warn, error, info, debug) from the embedded browser page',
    inputSchema: {
      type: 'object',
      properties: {
        clear: { type: 'boolean', description: 'Clear the log buffer after reading (default: false)' }
      },
      required: []
    }
  },
  {
    name: 'office_preview',
    description: 'Open an Office file (.docx/.xlsx/.pptx) in the built-in preview panel.',
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string', description: 'Absolute path to the Office file' } },
      required: ['filePath']
    }
  },
  {
    name: 'browser_get_html',
    description: 'Get the HTML source of the page or a specific element. Useful for understanding page structure without a screenshot (saves tokens).',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector to get outerHTML of (optional, defaults to full page)' } },
      required: []
    }
  },
  {
    name: 'browser_save_html',
    description: 'Save the rendered HTML of the current page (or a selector) directly to a file on disk. Avoids piping large HTML through the model context. Use this instead of browser_get_html when you only need the HTML saved (e.g. snapshotting each SPA route).',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Absolute file path to write the HTML to (e.g. "C:/clone/about.html"). Parent dirs are created automatically.' },
        selector:   { type: 'string', description: 'Optional CSS selector — saves only that element\'s outerHTML instead of the full page.' }
      },
      required: ['outputPath']
    }
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page. Use deltaY for relative scrolling (positive=down, negative=up) — useful for triggering lazy-loaded content. Use selector to scroll an element into view. Use x/y for absolute position.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to scroll into view (optional)' },
        deltaY: { type: 'number', description: 'Relative vertical scroll in pixels, e.g. 800 scrolls down one screen. Use this to trigger lazy-loaded content.' },
        x: { type: 'number', description: 'Absolute horizontal scroll position (used if no selector/deltaY)' },
        y: { type: 'number', description: 'Absolute vertical scroll position (used if no selector/deltaY)' },
        behavior: { type: 'string', description: '"smooth" (default) or "instant"' }
      },
      required: []
    }
  },
  {
    name: 'browser_key',
    description: 'Send a keyboard key press to the page. Useful for Enter, Tab, Escape, arrow keys, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name e.g. "Enter", "Tab", "Escape", "ArrowDown", "a"' },
        modifiers: { type: 'array', items: { type: 'string' }, description: 'Modifier keys: ["ctrl"], ["shift"], ["alt"], ["meta"]' }
      },
      required: ['key']
    }
  },
  {
    name: 'browser_hover',
    description: 'Move the mouse over an element to trigger hover effects, tooltips, or dropdown menus.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector of element to hover over' } },
      required: ['selector']
    }
  },
  {
    name: 'browser_select',
    description: 'Set the value of a <select> dropdown element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the <select> element' },
        value: { type: 'string', description: 'Option value to select' }
      },
      required: ['selector', 'value']
    }
  },
  {
    name: 'browser_check',
    description: 'Check or uncheck a checkbox or radio button element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the checkbox/radio' },
        checked: { type: 'boolean', description: 'true to check, false to uncheck (toggles if omitted)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_capture_resources',
    description: 'Navigate to a URL and capture ALL network resources (HTML, CSS, JS, images, fonts, JSON) to a local directory using CDP. Generates a manifest.json mapping original URLs to local file paths. Use this as the first step when cloning a website — run before browser_screenshot_diff or any code generation.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL to capture resources from' },
        outputDir: { type: 'string', description: 'Absolute path to local directory where files will be saved' },
        waitMs: { type: 'number', description: 'Extra milliseconds to wait after page load for lazy resources (default 3000, max 15000)' }
      },
      required: ['url', 'outputDir']
    }
  },
  {
    name: 'browser_screenshot_diff',
    description: 'Compare two PNG screenshots pixel-by-pixel. Returns similarity score (0-100%), diff stats, and a diff image with differences highlighted in red. Independent of browser state — works on any two base64 PNG images. Designed for iterative website cloning: screenshot original → screenshot clone → compare → patch → repeat.',
    inputSchema: {
      type: 'object',
      properties: {
        imageA: { type: 'string', description: 'Base64 PNG string (e.g. from browser_screenshot data field) — the reference/original image' },
        imageB: { type: 'string', description: 'Base64 PNG string — the image to compare against the reference' },
        threshold: { type: 'number', description: 'Per-channel difference threshold 0-255 (default 10). Higher = more tolerant of minor color differences.' }
      },
      required: ['imageA', 'imageB']
    }
  },
  {
    name: 'browser_screenshot_element',
    description: 'Capture a screenshot of only a specific element (cropped). More efficient than a full page screenshot when focusing on a component.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of element to capture' },
        quality: { type: 'number', description: 'JPEG quality 10-100 (default 80)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_get_cookies',
    description: 'Get all cookies for the current page URL. Useful for inspecting session/auth state.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_wait_for',
    description: 'Wait for a CSS selector to appear in the DOM (useful for SPAs and dynamic content).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for' },
        timeout: { type: 'number', description: 'Max wait time in milliseconds (default 5000, max 30000)' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_get_forms',
    description: 'Enumerate all forms and their input fields on the current page. Useful before filling out forms.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_get_frames',
    description: 'List all <iframe> elements on the page with their src, name, bounds, and center coordinates. Use this before browser_click_at to locate cross-origin iframes (e.g. Cloudflare Turnstile, reCAPTCHA).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_click_at',
    description: 'Click at exact page coordinates using OS-level mouse events. Works inside cross-origin iframes (Cloudflare Turnstile, reCAPTCHA, etc.) where CSS selectors cannot reach. Use browser_get_frames first to find the iframe center, then offset from it.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Page X coordinate to click' },
        y: { type: 'number', description: 'Page Y coordinate to click' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'browser_drag',
    description: 'Simulate a realistic human-like drag (Bezier curve path with random jitter and ease-in-out timing). Useful for sliders, drag-and-drop, and CAPTCHA slider challenges.',
    inputSchema: {
      type: 'object',
      properties: {
        fromSelector: { type: 'string', description: 'CSS selector of drag start element (optional)' },
        toSelector:   { type: 'string', description: 'CSS selector of drag end element (optional)' },
        fromX: { type: 'number', description: 'Start X coordinate (used if no fromSelector)' },
        fromY: { type: 'number', description: 'Start Y coordinate (used if no fromSelector)' },
        toX:   { type: 'number', description: 'End X coordinate (used if no toSelector)' },
        toY:   { type: 'number', description: 'End Y coordinate (used if no toSelector)' },
        steps:      { type: 'number', description: 'Number of intermediate mouse-move steps (default 60, more = smoother)' },
        durationMs: { type: 'number', description: 'Total drag duration in ms (default 800)' }
      },
      required: []
    }
  },
  {
    name: 'browser_click_human',
    description: 'Click an element using real mouse events (mousedown + random delay + mouseup) with slight position jitter, more realistic than browser_click.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'CSS selector of element to click' } },
      required: ['selector']
    }
  },
  {
    name: 'browser_type_human',
    description: 'Type text character by character with random delays (mimics human typing speed). More realistic than browser_type for sites that detect instant input.',
    inputSchema: {
      type: 'object',
      properties: {
        selector:  { type: 'string', description: 'CSS selector of input element' },
        text:      { type: 'string', description: 'Text to type' },
        minDelay:  { type: 'number', description: 'Min ms between keystrokes (default 40)' },
        maxDelay:  { type: 'number', description: 'Max ms between keystrokes (default 140)' }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'browser_site_pages',
    description: 'Discover all internal pages/routes of a website by combining sitemap.xml and in-page link extraction. Returns a list of pages with their URL, slug, and suggested local filename. Use this as the FIRST step when cloning a multi-page site. When cloning a COMPLETE site, you must then clone EVERY discovered route — not just the homepage — because SPA route components are lazy-loaded chunks captured only when their route is actually visited. Pass the full list to browser_clone_site, or loop browser_clone_page over each URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Any URL on the target site (homepage recommended)' }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_clone_page',
    description: 'Fully clone a single page in one call: captures all network resources, exports complete CSS (including JS-injected styles), copies the rendered DOM, rewrites all URLs to local paths, and wires internal navigation links. Returns paths to the generated HTML and CSS files. Run browser_site_pages first to get the pageMap for navigation wiring. IMPORTANT for SPAs (Vue/React/Angular): this only captures resources actually requested while THIS page was open. Route components are lazy-loaded as separate JS chunks that are NOT downloaded until you navigate to that route — cloning only the homepage leaves every other route\'s component chunk missing. To clone a COMPLETE SPA you must visit EACH route (in-app link clicks or browser_navigate to its URL) so its component loads and its chunk is captured. Prefer browser_clone_site, which walks all discovered routes automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        url:       { type: 'string', description: 'Page URL to clone' },
        outputDir: { type: 'string', description: 'Absolute path to output directory (shared across all pages of a site)' },
        outputFile: { type: 'string', description: 'Explicit output HTML filename (e.g. "about.html"). REQUIRED for SPA hash routes (#/about) where the base URL is identical and the default name would collide on index.html. When omitted, the name is derived from the URL path AND hash route.' },
        stripJs:   { type: 'boolean', description: 'Static-snapshot mode: remove ALL <script> tags from the saved HTML so the framework (Vue/React) cannot re-mount and wipe the already-rendered DOM. Use this for a faithful VISUAL clone where you only need the rendered look + working page-to-page navigation (via the injected nav shim), not live interactivity. Default false (keeps JS + API replay). RECOMMENDED for navigable static SPA clones — it also avoids the route-fix/URL conflict entirely.' },
        routeFix:  { type: 'boolean', description: 'Default true (non-stripJs only). Injects a tiny script that history.replaceState()s the URL to this file\'s original route path (e.g. /promo) so a LIVE Vue/React router renders the correct route instead of blanking. Set false if it conflicts with your serving setup. Ignored when stripJs is true (no scripts are kept).' },
        pageMap:   { type: 'object', description: 'Map of original URL → local filename for navigation wiring, e.g. {"https://example.com/": "index.html", "https://example.com/about": "about.html"}. Get this from browser_site_pages.' },
        waitMs:    { type: 'number', description: 'Extra wait after page load for JS/lazy content (default 4000, max 15000)' },
        interactMs: { type: 'number', description: 'Extra ms to keep recording API responses after scroll (default 0, max 20000). Increase for SPAs so more XHR/fetch responses get archived for replay.' }
      },
      required: ['url', 'outputDir']
    }
  },
  {
    name: 'browser_clone_site',
    description: 'Clone an ENTIRE website in one call: discovers all pages/routes, navigates to and clones EACH one (so every lazy-loaded SPA route component chunk is captured, not just the homepage\'s), records API responses for offline replay (SPA tabs/modals/routing work in the clone), starts a local preview server, computes per-page visual similarity vs the original, and wires navigation links. Returns a summary table. This replaces the manual site_pages → clone_page → serve_local → screenshot/diff sequence. Takes ~10-20s per page. To clone a COMPLETE site, ensure maxPages is high enough to cover ALL discovered routes (default 10, max 30) — re-run with the same outputDir to continue past the cap for larger sites.',
    inputSchema: {
      type: 'object',
      properties: {
        url:       { type: 'string', description: 'Homepage URL of the site to clone' },
        outputDir: { type: 'string', description: 'Absolute path to output directory' },
        maxPages:  { type: 'number', description: 'Max pages to clone (default 10, max 30). Use multiple calls with the same outputDir for larger sites.' },
        waitMs:    { type: 'number', description: 'Extra wait per page after load (default 4000, max 15000)' },
        interactMs: { type: 'number', description: 'Extra ms per page to record API responses (default 0, max 20000). Set 3000+ for SPAs.' },
        stripJs:   { type: 'boolean', description: 'Static-snapshot mode: strip all <script> tags so the framework cannot re-render and blank the page (default false).' },
        clickRules:{ type: 'array', description: 'Custom nav rules for non-<a> tabbars (div + JS router). Same format as browser_clone_routes clickRules.', items: {} }
      },
      required: ['url', 'outputDir']
    }
  },
  {
    name: 'browser_clone_routes',
    description: 'Clone an explicit LIST of routes in one call — the reliable way to clone a Vue/React SPA whose routes are NOT discoverable via sitemap or links (e.g. hash routes like #/about that browser_clone_site cannot find). Pass the route list you obtained from the app\'s router config. Each route is navigated, fully cloned (with its own output filename), API responses recorded, navigation wired, and a preview server started. Routes may be full URLs, hash routes ("#/about"), absolute paths ("/about"), or {route, file} objects to control the output filename.',
    inputSchema: {
      type: 'object',
      properties: {
        outputDir: { type: 'string', description: 'Absolute path to output directory' },
        routes:    { type: 'array', description: 'Route list. Items can be strings ("#/about", "/about", "https://site/#/about") or objects {route, file}. Each becomes a distinct local HTML file.', items: {} },
        url:       { type: 'string', description: 'Base URL to resolve relative/hash routes against (defaults to the current page URL).' },
        waitMs:    { type: 'number', description: 'Extra wait per page after load (default 4000, max 15000)' },
        interactMs:{ type: 'number', description: 'Extra ms per page to record API responses (default 0, max 20000). Set 3000+ for SPAs.' },
        stripJs:   { type: 'boolean', description: 'Static-snapshot mode: strip all <script> tags so the framework cannot re-render and blank the page. Page-to-page navigation still works via the injected nav shim. RECOMMENDED for faithful navigable SPA clones — also avoids the route-fix URL conflict. Default false.' },
        routeFix:  { type: 'boolean', description: 'Default true (non-stripJs only). Each cloned file replaceState()s the URL to its original route path so a live router renders correctly. Set false to disable. Ignored when stripJs is true.' },
        clickRules:{ type: 'array', description: 'Custom navigation rules for tabbars that are NOT <a href> links (e.g. <div> + JS router). The injected nav shim auto-handles <a href> and common data-route/data-to/data-path/data-url attributes; use clickRules ONLY for elements keyed by something else (like an icon\'s alt code). Each rule: {selector, file} (every click on selector → file) OR {selector, value, map} where value is "childSelector@attr" (e.g. "img@alt") or a self attribute name, and map is value→filename. Example: [{"selector":".tabbar-left-item","value":"img@alt","map":{"110004":"index.html","110006":"promo.html"}}]', items: {} },
        serve:     { type: 'boolean', description: 'Start a local preview server when done (default true).' }
      },
      required: ['outputDir', 'routes']
    }
  },
  {
    name: 'browser_serve_local',
    description: 'Start a local static HTTP server to preview cloned HTML files. Returns the server URL. Multiple calls with different dirs start separate servers. Use this before browser_screenshot to compare clone vs original.',
    inputSchema: {
      type: 'object',
      properties: {
        dir:  { type: 'string', description: 'Absolute path to the directory containing cloned HTML files' },
        port: { type: 'number', description: 'Port to listen on (default: auto-assign free port)' }
      },
      required: ['dir']
    }
  },
  {
    name: 'browser_patch_element',
    description: 'Extract the complete computed styles of an element from the CURRENT page as a <style> block including ::before and ::after pseudo-elements. Use as the review/patch step: navigate to the ORIGINAL page, call this tool with applyTo set to the clone HTML file path — the patch is written into the file automatically (re-calling with the same selector replaces the previous patch instead of stacking). Omit applyTo to just get the style block text.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to extract styles from' },
        applyTo:  { type: 'string', description: 'Absolute path to the clone HTML file. If set, the style patch is inserted into its <head> automatically.' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_screenshot_full',
    description: 'Capture a full-page screenshot by scrolling through the entire page and stitching slices into one tall PNG. Works on any page including SPAs — captures the rendered visual state, not source code. Returns base64 PNG. Use outputPath to save directly to disk (recommended for large pages).',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath:  { type: 'string',  description: 'Absolute file path to save the PNG (e.g. "C:/Users/.../page.png"). Recommended for full pages to avoid large base64 in context.' },
        scrollDelay: { type: 'number',  description: 'ms to wait after each scroll before capturing (default 300). Increase for pages with scroll animations.' },
        maxHeight:   { type: 'number',  description: 'Max total page height in px to capture (default 30000, max 60000).' }
      },
      required: []
    }
  },
  {
    name: 'browser_wire_navigation',
    description: 'Rewrite all internal navigation href links across every HTML file in a directory to point to local cloned files instead of original URLs. Run this after all pages are cloned to make navigation work between local files.',
    inputSchema: {
      type: 'object',
      properties: {
        dir:     { type: 'string', description: 'Absolute path to directory containing cloned HTML files' },
        pageMap: { type: 'object', description: 'Map of original URL → local filename, same as passed to browser_clone_page' },
        clickRules: { type: 'array', description: 'Optional custom navigation rules for non-<a> tabbars (div + JS router). Same format as browser_clone_routes clickRules: [{selector, value:"img@alt", map:{...}}] or [{selector, file}].', items: {} }
      },
      required: ['dir', 'pageMap']
    }
  },
  {
    name: 'browser_tab_list',
    description: 'List the debug-browser tabs belonging to THIS terminal session. Each session has its own isolated set of tabs; you only see and control your own. Returns id, title, url, and which tab is active.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_tab_new',
    description: 'Open a new tab in this session\'s debug browser and make it active. All subsequent browser_* actions (navigate/screenshot/click/...) target the active tab.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Optional URL to load in the new tab' } },
      required: []
    }
  },
  {
    name: 'browser_tab_select',
    description: 'Switch the active tab of this session\'s debug browser. Get tab ids from browser_tab_list.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'string', description: 'Tab id from browser_tab_list' } },
      required: ['tabId']
    }
  },
  {
    name: 'browser_tab_close',
    description: 'Close a tab in this session\'s debug browser. If it was active, the adjacent tab becomes active.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'string', description: 'Tab id from browser_tab_list' } },
      required: ['tabId']
    }
  },
  {
    name: 'browser_routine_list',
    description: 'List recorded browser routines for THIS terminal session\'s project (stored in {workdir}/.claude/browser-routines). Returns each routine\'s name, description, params (template ${var} placeholders to pass to browser_routine_run), and step count. Routines automate repeated UI sequences (login, close dialogs, navigation) without per-step LLM reasoning.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_routine_delete',
    description: 'Delete a recorded routine by name from this project.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Routine name' } },
      required: ['name']
    }
  }
  ,
  {
    name: 'browser_routine_run',
    description: 'Replay a recorded routine in this session\'s active debug-browser tab. Executes the saved steps (navigate/click/type/select/sleep/wait_for/evaluate) without per-step reasoning. Pass params for any ${var} placeholders (e.g. {"username":"admin","password":"x"}). Returns ok, any variables captured by evaluate steps, and on failure the error + failedStepIndex.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Routine name (from browser_routine_list)' },
        params: { type: 'object', description: 'Values for ${var} placeholders (optional)' }
      },
      required: ['name']
    }
  }
  ,
  {
    name: 'browser_routine_record_start',
    description: 'Start recording browser actions in this session\'s active tab. Clicks, input/select changes, and navigations are captured. The current page URL is recorded as the first step. Call browser_routine_record_stop with a name to save. Recorded values are stored in plaintext; edit the JSON to replace secrets with ${var} placeholders.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'browser_routine_record_stop',
    description: 'Stop recording and save the captured steps as a routine in {workdir}/.claude/browser-routines/<name>.json.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Routine name to save as' } },
      required: ['name']
    }
  }
]

async function callHttp(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const data = body ? JSON.stringify(body) : undefined
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        // [2026-06-12] 标识当前终端 session，使内嵌浏览器按 session 隔离调试 tab
        'X-Feng-Session': process.env.FENG_CLAUDE_SESSION_ID || ''
      }
    }
    const req = http.request(options, (res) => {
      let d = ''
      res.on('data', (chunk) => { d += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(d)) } catch { resolve({ error: d }) }
      })
    })
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        resolve({ error: `Browser server not running on port ${process.env.FENG_CLAUDE_BROWSER_PORT || 3100}. Open the embedded browser first.` })
      } else {
        reject(e)
      }
    })
    if (data) req.write(data)
    req.end()
  })
}

async function handleTool(name, args) {
  try {
    switch (name) {
      case 'browser_navigate': {
        const r = await callHttp('/navigate', { url: args.url })
        return [{ type: 'text', text: r.success ? `Navigated to ${r.url}` : `Failed: ${r.error}` }]
      }
      case 'browser_tab_list': {
        const r = await callHttp('/tabs')
        const tabs = r.tabs || []
        if (!tabs.length) return [{ type: 'text', text: 'No tabs open in this session.' }]
        const lines = tabs.map(t => `${t.active ? '* ' : '  '}${t.id}  ${t.title || '(untitled)'}  ${t.url}`)
        return [{ type: 'text', text: `Tabs (${tabs.length}):\n${lines.join('\n')}` }]
      }
      case 'browser_tab_new': {
        const r = await callHttp('/tabs/new', { url: args.url || '' })
        if (r.error) return [{ type: 'text', text: `Failed: ${r.error}` }]
        return [{ type: 'text', text: `Opened tab ${r.tabId} (now active). ${(r.tabs||[]).length} tab(s) total.` }]
      }
      case 'browser_tab_select': {
        const r = await callHttp('/tabs/select', { tabId: args.tabId })
        return [{ type: 'text', text: r.ok ? `Switched to tab ${args.tabId}` : `Failed: ${r.error}` }]
      }
      case 'browser_tab_close': {
        const r = await callHttp('/tabs/close', { tabId: args.tabId })
        return [{ type: 'text', text: r.ok ? `Closed tab ${args.tabId}. ${(r.tabs||[]).length} tab(s) left.` : `Failed: ${r.error}` }]
      }
      case 'browser_screenshot': {
        // [2026-06-16] "display surface not available" 是间歇性合成器未就绪，自动重试（show + 等待 + 重拍）
        let r = await callHttp('/screenshot')
        let attempts = 0
        while ((!r.data) && /display surface|not available for capture|capture/i.test(String(r.error || '')) && attempts < 3) {
          attempts++
          await callHttp('/show')
          await new Promise(rs => setTimeout(rs, 400 * attempts))
          r = await callHttp('/screenshot')
        }
        if (r.data) {
          const fmt = r.format === 'png' ? 'image/png' : 'image/jpeg'
          const retried = attempts ? ` (after ${attempts} retr${attempts === 1 ? 'y' : 'ies'})` : ''
          const meta = `Screenshot: ${r.width||'?'}x${r.height||'?'} ${r.format||'jpeg'}, ${r.byteLength||Math.round(r.data.length*0.75)} bytes${r.url?`, url: ${r.url}`:''}${retried}`
          return [{ type: 'text', text: meta }, { type: 'image', data: r.data, mimeType: fmt }]
        }
        return [{ type: 'text', text: `Failed: ${r.error || 'No screenshot data returned'}${attempts ? ` (retried ${attempts}×). Try browser_show then retry, or browser_screenshot_full.` : ''}` }]
      }
      case 'browser_click': {
        const r = await callHttp('/click', { selector: args.selector })
        if (r.error) return [{ type: 'text', text: `Failed: ${r.error}` }]
        return [{ type: 'text', text: `Clicked ${args.selector}` }]
      }
      case 'browser_type': {
        const r = await callHttp('/type', { selector: args.selector, text: args.text })
        if (r.error) return [{ type: 'text', text: `Failed: ${r.error}` }]
        return [{ type: 'text', text: `Typed into ${args.selector}` }]
      }
      case 'browser_get_url': {
        const r = await callHttp('/url')
        return [{ type: 'text', text: r.url || 'No page loaded' }]
      }
      case 'browser_get_text': {
        let path = args.selector ? `/text?selector=${encodeURIComponent(args.selector)}` : '/text'
        if (args.maxLength) path += `${path.includes('?') ? '&' : '?'}maxLength=${args.maxLength}`
        const r = await callHttp(path)
        return [{ type: 'text', text: r.text || '' }]
      }
      case 'browser_eval': {
        const r = await callHttp('/eval', { javascript: args.javascript, frameSelector: args.frameSelector })
        return [{ type: 'text', text: r.result !== undefined ? String(r.result) : `Failed: ${r.error}` }]
      }
      case 'browser_eval_in_frame': {
        const r = await callHttp('/eval-in-frame', { frameUrl: args.frameUrl, javascript: args.javascript })
        if (r.result !== undefined) return [{ type: 'text', text: String(r.result) }]
        const msg = r.availableFrameUrls
          ? `Failed: ${r.error}\nAvailable frames:\n${r.availableFrameUrls.join('\n')}`
          : `Failed: ${r.error}`
        return [{ type: 'text', text: msg }]
      }
      case 'browser_show': {
        await callHttp('/show')
        return [{ type: 'text', text: 'Browser shown' }]
      }
      case 'browser_hide': {
        await callHttp('/hide')
        return [{ type: 'text', text: 'Browser hidden' }]
      }
      case 'browser_devtools': {
        const r = await callHttp('/devtools')
        return [{ type: 'text', text: r.visible ? 'DevTools opened' : 'DevTools closed' }]
      }
      case 'browser_back': {
        await callHttp('/back')
        return [{ type: 'text', text: 'Went back' }]
      }
      case 'browser_forward': {
        await callHttp('/forward')
        return [{ type: 'text', text: 'Went forward' }]
      }
      case 'browser_reload': {
        await callHttp('/reload')
        return [{ type: 'text', text: 'Reloaded page' }]
      }
      case 'browser_console': {
        const path = args.clear ? '/console?clear=true' : '/console'
        const r = await callHttp(path)
        if (r.entries?.length > 0) {
          const lines = r.entries.map(e => `[${e.timestamp}] ${e.level}: ${e.text}`)
          return [{ type: 'text', text: lines.join('\n') }]
        }
        return [{ type: 'text', text: 'No console logs captured' }]
      }
      case 'office_preview': {
        const r = await callHttp('/open-office-preview', { filePath: args.filePath })
        return [{ type: 'text', text: r.success ? `Office preview opened: ${args.filePath}` : `Failed: ${r.error}` }]
      }
      case 'browser_get_html': {
        const p = args.selector ? `/html?selector=${encodeURIComponent(args.selector)}` : '/html'
        const r = await callHttp(p)
        return [{ type: 'text', text: r.html ?? `Failed: ${r.error}` }]
      }
      case 'browser_save_html': {
        if (!args.outputPath) return [{ type: 'text', text: 'Failed: outputPath is required' }]
        const p = args.selector ? `/html?selector=${encodeURIComponent(args.selector)}` : '/html'
        const r = await callHttp(p)
        if (r.html == null) return [{ type: 'text', text: `Failed: ${r.error || 'no HTML returned'}` }]
        try {
          fs.mkdirSync(path.dirname(args.outputPath), { recursive: true })
          fs.writeFileSync(args.outputPath, r.html, 'utf-8')
          return [{ type: 'text', text: `Saved HTML (${Buffer.byteLength(r.html)} bytes) → ${args.outputPath}` }]
        } catch (e) {
          return [{ type: 'text', text: `Failed to write file: ${String(e && e.message || e)}` }]
        }
      }
      case 'browser_scroll': {
        const r = await callHttp('/scroll', { selector: args.selector, deltaY: args.deltaY, x: args.x, y: args.y, behavior: args.behavior || 'smooth' })
        const desc = args.selector ? ` to ${args.selector}` : args.deltaY !== undefined ? ` by deltaY=${args.deltaY}` : ` to (${args.x||0},${args.y||0})`
        return [{ type: 'text', text: r.ok ? `Scrolled${desc}` : `Failed: ${r.error}` }]
      }
      case 'browser_key': {
        const r = await callHttp('/key', { key: args.key, modifiers: args.modifiers || [] })
        return [{ type: 'text', text: r.ok ? `Key sent: ${args.key}` : `Failed: ${r.error}` }]
      }
      case 'browser_hover': {
        const r = await callHttp('/hover', { selector: args.selector })
        return [{ type: 'text', text: r.ok ? `Hovered over ${args.selector}` : `Failed: ${r.error}` }]
      }
      case 'browser_select': {
        const r = await callHttp('/select', { selector: args.selector, value: args.value })
        return [{ type: 'text', text: r.ok ? `Selected "${args.value}" in ${args.selector}` : `Failed: ${r.error}` }]
      }
      case 'browser_check': {
        const r = await callHttp('/check', { selector: args.selector, checked: args.checked })
        return [{ type: 'text', text: r.ok ? `Checkbox ${args.selector} is now ${r.checked ? 'checked' : 'unchecked'}` : `Failed: ${r.error}` }]
      }
      case 'browser_capture_resources': {
        const r = await callHttp('/capture-resources', { url: args.url, outputDir: args.outputDir, waitMs: args.waitMs })
        if (r.saved !== undefined) {
          return [{ type: 'text', text: `Captured ${r.saved} files (${r.skipped} skipped) → ${r.outputDir}\nmanifest.json written with ${Object.keys(r.manifest || {}).length} URL mappings` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_screenshot_diff': {
        const r = await callHttp('/screenshot-compare', { imageA: args.imageA, imageB: args.imageB, threshold: args.threshold })
        if (r.similarity !== undefined) {
          const sizeNote = r.sizeMatch ? '' : ` | ⚠ Size mismatch — missing ${r.missingPixels} pixels`
          const txt = `Similarity: ${r.similarity}% | Diff pixels: ${r.diffPixels}/${r.totalPixels} (${r.diffPercent}%)${sizeNote} | Compare area: ${r.width}x${r.height}`
          return [
            { type: 'text', text: txt },
            { type: 'image', data: r.diffImage, mimeType: 'image/png' }
          ]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_screenshot_element': {
        const path = `/screenshot-element?selector=${encodeURIComponent(args.selector)}${args.quality ? `&quality=${args.quality}` : ''}`
        const r = await callHttp(path)
        if (r.data) {
          return [
            { type: 'text', text: `Element screenshot: ${r.width||'?'}x${r.height||'?'} jpeg — ${args.selector}` },
            { type: 'image', data: r.data, mimeType: 'image/jpeg' }
          ]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_get_cookies': {
        const r = await callHttp('/cookies')
        if (r.cookies) {
          const lines = r.cookies.map(c => `${c.name}=${c.value.slice(0,40)}${c.value.length>40?'...':''} (${c.domain||''}${c.httpOnly?' httpOnly':''}${c.secure?' secure':''})`)
          return [{ type: 'text', text: lines.length ? lines.join('\n') : 'No cookies' }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_wait_for': {
        const r = await callHttp('/wait-for', { selector: args.selector, timeout: args.timeout || 5000 })
        return [{ type: 'text', text: r.found ? `Element found: ${args.selector}` : `Timeout: ${args.selector} not found within ${args.timeout||5000}ms` }]
      }
      case 'browser_get_forms': {
        const r = await callHttp('/forms')
        if (r.forms) {
          if (!r.forms.length) return [{ type: 'text', text: 'No forms found on page' }]
          const lines = r.forms.map(f => {
            const fields = f.fields.map(fl => `  - [${fl.tag}${fl.type?`:${fl.type}`:''}] name="${fl.name||''}" ${fl.placeholder?`placeholder="${fl.placeholder}"`:''}${fl.required?' required':''}`).join('\n')
            return `Form #${f.index}${f.id?` id="${f.id}"`:''}${f.name?` name="${f.name}"`:''}:\n${fields}`
          })
          return [{ type: 'text', text: lines.join('\n\n') }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_get_frames': {
        const r = await callHttp('/frames')
        if (r.frames) {
          if (!r.frames.length) return [{ type: 'text', text: 'No iframes found on page' }]
          const lines = r.frames.map(f =>
            `[${f.index}] src="${f.src||''}" name="${f.name||''}" bounds=(${f.bounds.x},${f.bounds.y} ${f.bounds.width}x${f.bounds.height}) center=(${f.centerX},${f.centerY}) selector="${f.selector}"`
          )
          return [{ type: 'text', text: lines.join('\n') }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_click_at': {
        const r = await callHttp('/click-at', { x: args.x, y: args.y })
        return [{ type: 'text', text: r.ok ? `Clicked at (${r.x},${r.y})` : `Failed: ${r.error}` }]
      }
      case 'browser_drag': {
        const r = await callHttp('/drag', {
          fromSelector: args.fromSelector, toSelector: args.toSelector,
          fromX: args.fromX, fromY: args.fromY, toX: args.toX, toY: args.toY,
          steps: args.steps, durationMs: args.durationMs
        })
        return [{ type: 'text', text: r.ok ? `Dragged from (${r.from?.x},${r.from?.y}) to (${r.to?.x},${r.to?.y}) in ${r.steps} steps` : `Failed: ${r.error}` }]
      }
      case 'browser_click_human': {
        const r = await callHttp('/click-human', { selector: args.selector })
        return [{ type: 'text', text: r.ok ? `Human-clicked ${args.selector} at (${r.x},${r.y})` : `Failed: ${r.error}` }]
      }
      case 'browser_type_human': {
        const r = await callHttp('/type-human', { selector: args.selector, text: args.text, minDelay: args.minDelay, maxDelay: args.maxDelay })
        return [{ type: 'text', text: r.ok ? `Typed ${r.length} chars into ${args.selector}` : `Failed: ${r.error}` }]
      }
      case 'browser_site_pages': {
        const r = await callHttp('/site-pages', { url: args.url })
        if (r.pages) {
          const lines = r.pages.map(p => `  ${p.filename}  ←  ${p.url}`)
          const mapStr = JSON.stringify(Object.fromEntries(r.pages.map(p => [p.url, p.filename])), null, 2)
          return [{ type: 'text', text: `Found ${r.pages.length} pages (origin: ${r.origin}):\n${lines.join('\n')}\n\nPage map (pass as pageMap to browser_clone_page):\n${mapStr}` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_clone_page': {
        const r = await callHttp('/clone-page', { url: args.url, outputDir: args.outputDir, outputFile: args.outputFile, stripJs: args.stripJs, routeFix: args.routeFix, pageMap: args.pageMap || {}, waitMs: args.waitMs, interactMs: args.interactMs })
        if (r.htmlFile) {
          const crossNote = r.crossOriginCss?.length ? `\nCross-origin CSS fetched: ${r.crossOriginCss.length} sheets` : ''
          const apiNote = r.apiResponses ? `\nAPI responses archived for replay: ${r.apiResponses}` : ''
          return [{ type: 'text', text: `Cloned: ${r.htmlFile}\nCSS: ${r.cssFile} (${r.cssRuleCount} rule blocks)\nResources: ${r.resources} files saved → ${r.outputDir}${crossNote}${apiNote}\n\nNext: browser_serve_local to preview, then browser_screenshot + browser_screenshot_diff` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_clone_site': {
        const r = await callHttp('/clone-site', { url: args.url, outputDir: args.outputDir, maxPages: args.maxPages, waitMs: args.waitMs, interactMs: args.interactMs, stripJs: args.stripJs, routeFix: args.routeFix, clickRules: args.clickRules || [] })
        if (r.pages) {
          const rows = r.pages.map(p => `  ${p.htmlFile}  sim=${p.similarity === null ? '?' : p.similarity + '%'}  res=${p.resources}  api=${p.apiResponses}  ←  ${p.url}`)
          const failRows = (r.failed || []).map(f => `  FAILED  ${f.url}  (${f.error})`)
          return [{ type: 'text', text:
            `Site cloned → ${r.outputDir}\nPreview server: ${r.serverUrl}\nNavigation wired in ${r.navUpdated} files\n\nPages (${r.pages.length}):\n${rows.join('\n')}${failRows.length ? '\n' + failRows.join('\n') : ''}\n\nNext: for pages with sim < 92%, navigate to the original page and use browser_patch_element(selector, applyTo: "<outputDir>/<file>.html") to fix differences, then re-screenshot.` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_clone_routes': {
        const r = await callHttp('/clone-routes', {
          outputDir: args.outputDir, routes: args.routes || [], url: args.url,
          waitMs: args.waitMs, interactMs: args.interactMs, serve: args.serve, stripJs: args.stripJs,
          routeFix: args.routeFix, clickRules: args.clickRules || []
        })
        if (r.pages) {
          const rows = r.pages.map(p => `  ${p.htmlFile}  res=${p.resources}  api=${p.apiResponses}  ←  ${p.url}`)
          const failRows = (r.failed || []).map(f => `  FAILED  ${f.url}  (${f.error})`)
          const srv = r.serverUrl ? `\nPreview server: ${r.serverUrl}` : ''
          return [{ type: 'text', text:
            `Cloned ${r.pages.length} route(s) → ${r.outputDir}${srv}\nNavigation wired in ${r.navUpdated} files\n\n${rows.join('\n')}${failRows.length ? '\n' + failRows.join('\n') : ''}` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_serve_local': {
        const r = await callHttp('/serve-local', { dir: args.dir, port: args.port })
        if (r.url) {
          return [{ type: 'text', text: `Local server started: ${r.url}\nServing: ${r.dir}\n\nUse browser_navigate("${r.url}/index.html") to preview` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_patch_element': {
        const r = await callHttp('/patch-element', { selector: args.selector, applyTo: args.applyTo })
        if (r.applied) {
          return [{ type: 'text', text: `Element: ${r.selector}\nRect: ${JSON.stringify(r.rect)}\n\nPatch applied to: ${r.file}\nRe-screenshot the clone to verify.` }]
        }
        if (r.stylePatch) {
          return [{ type: 'text', text: `Element: ${r.selector}\nRect: ${JSON.stringify(r.rect)}\n\nPaste this into clone HTML <head> to patch:\n\n<style>\n${r.stylePatch}\n</style>` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_screenshot_full': {
        const r = await callHttp('/screenshot-full', { outputPath: args.outputPath, scrollDelay: args.scrollDelay, maxHeight: args.maxHeight })
        if (r.data !== undefined) {
          const saved = r.savedTo ? `\nSaved to: ${r.savedTo}` : ''
          const meta = `Full-page screenshot: ${r.width}x${r.height}px (${r.slices} slices)${saved}`
          const result = [{ type: 'text', text: meta }]
          if (!args.outputPath) result.push({ type: 'image', data: r.data, mimeType: 'image/png' })
          return result
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_wire_navigation': {
        const r = await callHttp('/wire-navigation', { dir: args.dir, pageMap: args.pageMap, clickRules: args.clickRules || [] })
        if (r.updated !== undefined) {
          return [{ type: 'text', text: `Navigation wired in ${r.updated}/${r.files?.length} HTML files\nFiles: ${r.files?.join(', ')}` }]
        }
        return [{ type: 'text', text: `Failed: ${r.error}` }]
      }
      case 'browser_routine_list': {
        const r = await callHttp('/routine/list')
        const rs = r.routines || []
        if (!rs.length) return [{ type: 'text', text: 'No routines recorded for this project.' }]
        const lines = rs.map(x => `- ${x.name}  (${x.stepCount} steps)${x.params.length ? `  params: ${x.params.join(', ')}` : ''}${x.description ? `\n    ${x.description}` : ''}`)
        return [{ type: 'text', text: `Routines (${rs.length}):\n${lines.join('\n')}` }]
      }
      case 'browser_routine_delete': {
        const r = await callHttp('/routine/delete', { name: args.name })
        return [{ type: 'text', text: r.ok ? `Deleted routine ${args.name}` : `Failed: ${r.error}` }]
      }
      case 'browser_routine_run': {
        const r = await callHttp('/routine/run', { name: args.name, params: args.params || {} })
        if (r.ok) {
          const vars = r.variables && Object.keys(r.variables).length
            ? `\nVariables: ${JSON.stringify(r.variables)}` : ''
          return [{ type: 'text', text: `Routine "${args.name}" completed.${vars}` }]
        }
        const at = r.failedStepIndex !== undefined ? ` (step ${r.failedStepIndex})` : ''
        return [{ type: 'text', text: `Routine failed${at}: ${r.error}` }]
      }
      case 'browser_routine_record_start': {
        const r = await callHttp('/routine/record/start', {})
        return [{ type: 'text', text: r.ok ? 'Recording started. Perform actions in the browser, then call browser_routine_record_stop.' : `Failed: ${r.error}` }]
      }
      case 'browser_routine_record_stop': {
        const r = await callHttp('/routine/record/stop', { name: args.name })
        return [{ type: 'text', text: r.ok ? `Saved routine "${args.name}" (${r.stepCount} steps) → ${r.path}` : `Failed: ${r.error}` }]
      }
      default:
        return [{ type: 'text', text: `Unknown tool: ${name}` }]
    }
  } catch (e) {
    return [{ type: 'text', text: `Error: ${e.message}` }]
  }
}

async function handleMessage(msg) {
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'browser-tools', version: '1.0.0' }
      }
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      return { content: await handleTool(msg.params.name, msg.params.arguments || {}) }
    default:
      return null
  }
}

let buffer = ''

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString()
  let newlineIndex
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim()
    buffer = buffer.slice(newlineIndex + 1)
    if (!line) continue
    try {
      const parsed = JSON.parse(line)
      handleMessage(parsed).then((result) => {
        if (result !== null) {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result }) + '\n')
        }
      }).catch((e) => {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, error: { code: -32603, message: String(e) } }) + '\n')
      })
    } catch {}
  }
})
