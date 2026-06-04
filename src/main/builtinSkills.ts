import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface BuiltinSkill {
  name: string
  content: string
}

const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name: 'clone-website',
    content: `---
name: clone-website
description: Step-by-step workflow for iteratively cloning a website using browser MCP tools and visual diff comparison. Invoke when asked to replicate, copy, or clone a website's appearance.
metadata:
  type: workflow
---

# Website Cloning Workflow

You are cloning a website. Follow these phases strictly. Do NOT generate the full page in one shot — work component by component and verify with visual diff at each stage.

## Tools Available
- \`browser_navigate\`, \`browser_screenshot\` — capture the target
- \`browser_get_text\`, \`browser_get_html\` (with selector) — extract content
- \`browser_eval\` — extract computed styles (colors, fonts, spacing)
- \`browser_screenshot_diff\` — pixel-level comparison between original and clone
- Local HTTP server or \`data:text/html\` URI to preview generated HTML

---

## Phase 1: Analyze Target

1. Navigate to the target URL
2. Take a full-page screenshot → save as **reference**
3. Extract design tokens via \`browser_eval\`:
   \`\`\`javascript
   // Colors & fonts from body/root
   const s = getComputedStyle(document.documentElement)
   JSON.stringify({
     bg: s.backgroundColor, text: s.color,
     font: s.fontFamily, fontSize: s.fontSize,
     vars: [...document.styleSheets[0]?.cssRules || []].filter(r => r.cssText?.startsWith(':root')).map(r => r.cssText).join('')
   })
   \`\`\`
4. Identify components: list header / hero / features / pricing / footer etc.
5. Note: fonts (Google Fonts URLs), icon libraries (FontAwesome etc.), image CDN patterns

### 1.2 Extract & Download All Images

Extract every image URL on the page:
\`\`\`javascript
JSON.stringify([...new Set([
  // <img> tags
  ...[...document.querySelectorAll('img[src]')].map(i => i.src),
  // CSS background-image
  ...[...document.querySelectorAll('*')].map(el => {
    const bg = getComputedStyle(el).backgroundImage
    const m = bg.match(/url\\(["']?([^"')]+)["']?\\)/)
    return m ? m[1] : null
  }).filter(Boolean),
  // srcset
  ...[...document.querySelectorAll('img[srcset], source[srcset]')].flatMap(el =>
    el.getAttribute('srcset').split(',').map(s => s.trim().split(' ')[0])
  )
]).filter(u => u && !u.startsWith('data:')).map(u => new URL(u, location.href).href)])
\`\`\`

For each image URL:
1. Use \`browser_navigate\` to open the image URL, then \`browser_screenshot\` — OR use a Node.js fetch/curl inside \`browser_eval\` if available
2. Save to local \`images/\` folder with a sanitized filename (e.g. \`hero-bg.jpg\`, \`logo.png\`)
3. Build a mapping table: \`{ originalUrl → "images/filename.ext" }\`

**Filename convention**: use the last path segment, strip query params. If duplicate names exist, append index.

**Skip**: data URIs, external tracking pixels (1x1), URLs from third-party analytics domains.

---

## Phase 2: Build Component by Component

Work in this order: **layout shell → header → hero → main sections → footer**

For each component:
1. \`browser_get_html\` with a specific selector (e.g. \`header\`, \`nav\`, \`.hero\`) — get structure
2. \`browser_get_text\` with selector — get copy/content
3. \`browser_eval\` to get computed styles for that component:
   \`\`\`javascript
   const el = document.querySelector('header')
   const s = getComputedStyle(el)
   JSON.stringify({ bg: s.background, padding: s.padding, height: s.height })
   \`\`\`
4. Generate clean HTML/CSS for that component
   - Replace all image URLs with local paths from the mapping table built in Phase 1.2
   - e.g. \`src="https://cdn.example.com/hero.jpg"\` → \`src="images/hero.jpg"\`
   - For CSS \`background-image\`: replace inline styles and \`<style>\` blocks the same way
5. Append to the working HTML file

**Rules:**
- Use CSS variables for repeated colors/fonts
- Include Google Fonts / icon CDN links in \`<head>\` if the original uses them
- Prefer flexbox/grid — avoid fixed pixel widths
- Add \`box-sizing: border-box\` globally
- All \`<img src>\`, \`srcset\`, and CSS \`background-image\` must point to local \`images/\` paths

### 2.2 Extract Dynamic Effects

Before generating each component, extract its animations and interactions:

**CSS Animations & Transitions:**
\`\`\`javascript
const rules = []
for (const sheet of document.styleSheets) {
  try {
    for (const rule of sheet.cssRules) {
      if (rule instanceof CSSKeyframesRule) rules.push(rule.cssText)
      if (rule instanceof CSSStyleRule && rule.style.transition) rules.push(rule.cssText)
      if (rule instanceof CSSStyleRule && rule.style.animation) rules.push(rule.cssText)
    }
  } catch {}
}
JSON.stringify(rules)
\`\`\`

**Hover / Focus states:**
\`\`\`javascript
const hoverRules = []
for (const sheet of document.styleSheets) {
  try {
    for (const rule of sheet.cssRules) {
      if (rule.selectorText?.includes(':hover') || rule.selectorText?.includes(':focus'))
        hoverRules.push(rule.cssText)
    }
  } catch {}
}
JSON.stringify(hoverRules)
\`\`\`

**Detect animation libraries:**
\`\`\`javascript
JSON.stringify({
  gsap: typeof gsap !== 'undefined',
  aos: typeof AOS !== 'undefined',
  scrollReveal: typeof ScrollReveal !== 'undefined',
  anime: typeof anime !== 'undefined',
  lottie: typeof lottie !== 'undefined',
  swiper: typeof Swiper !== 'undefined',
  framerMotion: !!document.querySelector('[data-framer-component-type]'),
  scripts: [...document.querySelectorAll('script[src]')].map(s => s.src)
})
\`\`\`

**Scroll-triggered effects:**
- Use \`browser_scroll\` with \`deltaY\` to trigger scroll animations, then \`browser_screenshot\` to capture animated state
- Note elements with \`data-aos\`, \`data-scroll\`, \`data-animate\` attributes

**Replicate strategy:**
- Pure CSS transitions/animations → copy \`@keyframes\` and \`transition\`/\`animation\` properties directly
- AOS / ScrollReveal → add CDN link + copy \`data-aos\` / \`data-sr\` attributes from HTML
- GSAP / anime.js → add CDN + replicate JS initialization
- Lottie → download the \`.json\` animation file, add Lottie player CDN
- Swiper/sliders → add Swiper CDN + copy configuration options
- Custom JS → extract the relevant \`<script>\` block content

---

## Phase 3: Preview & Diff

After building each major section:

1. Write current HTML to a temp file or open via \`data:text/html,...\` URI
2. \`browser_navigate\` to the preview
3. \`browser_screenshot\` → save as **clone_screenshot**
4. \`browser_screenshot_diff\` with reference vs clone:
   \`\`\`
   imageA: <reference base64>
   imageB: <clone_screenshot base64>
   threshold: 15
   \`\`\`
5. Check result:
   - **≥ 95%** similarity → move to next component
   - **80–95%** → fix the highlighted red regions, re-diff
   - **< 80%** → re-examine that component's HTML/CSS

---

## Phase 4: Iterate

For each red region in the diff image:
1. Identify which component it belongs to
2. Re-extract the original's computed styles for that area
3. Patch the CSS — focus on: spacing, font-size, color, border-radius, shadows
4. Re-screenshot and re-diff
5. Repeat until similarity ≥ target

### Completion Thresholds (STOP when ANY condition is met)

| Condition | Action |
|-----------|--------|
| similarity ≥ **92%** | ✅ Page is DONE — move to next page |
| similarity ≥ **85%** AND iteration ≥ **3** | ✅ Accept — diminishing returns |
| iteration ≥ **5** for this page | ✅ Mark as best-effort, move on |
| diff shows only text content differences | ✅ Done — content differences are acceptable |

**Do NOT continue iterating just because similarity is not 100%.** Pixel-perfect is not the goal.

After each diff output:
\`Page: [name] | Iteration: [n/5] | Similarity: [X]% | Status: [continuing/DONE]\`

When a page is DONE, **stop touching it** — move to the next page immediately.

---

## Final: Declare Done & Output Summary

**The clone is COMPLETE when ALL of the following are true:**
1. All pages in the page list have been processed (similarity met OR max iterations reached)
2. Internal navigation links work between pages
3. Images are local (no broken img src)

**Output a final summary in this exact format and then STOP:**
\`\`\`
## Clone Complete

| Page | Similarity | Iterations | Status |
|------|-----------|------------|--------|
| index.html | 94% | 2 | ✅ Done |
| about.html | 88% | 5 | ✅ Best-effort |

Output folder: [path]
Total pages: [n]
Images downloaded: [n]
\`\`\`

**Do NOT keep iterating after this summary. The task is finished.**

---

## Phase 5: Final Polish

- Check responsive: resize browser and compare
- Check hover states if important
- Replace placeholder images with actual \`src\` URLs from original
- Verify fonts render correctly (check \`@font-face\` or Google Fonts link)

---

## Phase 6: Multi-Page Discovery & Cloning

After the main page reaches ≥ 90% similarity, discover and clone linked pages.

### 6.1 Discover All Pages

Use \`browser_eval\` on the original site to extract all internal navigation links:
\`\`\`javascript
const base = location.origin
const links = [...new Set(
  [...document.querySelectorAll('a[href]')]
    .map(a => a.href)
    .filter(h => h.startsWith(base) && !h.includes('#') && h !== base + '/')
)]
JSON.stringify(links.slice(0, 20))  // cap at 20 pages
\`\`\`

Build a **page list**. Exclude: same-page anchors (#), external domains, file downloads (.pdf/.zip).

### 6.2 Prioritize Pages

Clone in this order:
1. Pages linked directly from the main nav (highest priority)
2. Pages reachable via CTA buttons (e.g. "Get Started", "Pricing", "About")
3. Remaining discovered pages

To find nav + CTA links specifically:
\`\`\`javascript
JSON.stringify([
  ...document.querySelectorAll('nav a, header a, [class*="cta"] a, [class*="button"] a')
].map(a => ({ text: a.textContent.trim(), href: a.href })).filter(x => x.href.startsWith(location.origin)))
\`\`\`

### 6.3 Clone Each Page

For each page in the list:
1. \`browser_navigate\` to the target page
2. \`browser_screenshot\` → save as reference for this page
3. Identify which components are **shared** with the main page (header/footer are usually identical)
4. **Reuse** shared components — do not regenerate them
5. Build only the page-specific content area
6. Apply Phase 3–4 diff loop until similarity ≥ 90%
7. Save as a separate HTML file (e.g. \`about.html\`, \`pricing.html\`)

### 6.4 Wire Up Navigation

After all pages are cloned:
1. Update all \`<a href="...">\` links in every HTML file to point to local files (e.g. \`href="/pricing"\` → \`href="pricing.html"\`)
2. Verify nav links work by navigating between pages in the browser
3. Shared header/footer — extract into a reusable snippet or inline consistently

### 6.5 Click-Through Verification

For each page transition that requires a button click (not a direct link):
1. \`browser_navigate\` back to the original site
2. \`browser_click\` or \`browser_click_human\` on the button/CTA
3. \`browser_get_url\` — confirm the URL it navigated to
4. Add that URL to the clone list if not already present

---

## Checklist Before Declaring Done

- [ ] Similarity ≥ 90% on full-page diff (main page)
- [ ] Header / nav looks correct
- [ ] Hero section matches (text, CTA buttons, background)
- [ ] Color palette matches (check with browser_eval on specific elements)
- [ ] Font family and weight match
- [ ] Spacing / padding within 5–10px of original
- [ ] Footer present and complete
- [ ] All nav-linked pages cloned (≥ 90% each)
- [ ] Internal links between pages work correctly
- [ ] No broken images or missing fonts across all pages
`
  }
]

/**
 * 首次运行时将内置 skill 写入 ~/.claude/commands/。
 * 已存在则跳过，不覆盖用户修改。
 */
export function installBuiltinSkills(): void {
  const dir = join(homedir(), '.claude', 'commands')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return
  }
  for (const skill of BUILTIN_SKILLS) {
    const dest = join(dir, `${skill.name}.md`)
    if (existsSync(dest)) continue
    try {
      writeFileSync(dest, skill.content, 'utf-8')
      console.log(`[builtinSkills] installed: ${skill.name}`)
    } catch (e) {
      console.warn(`[builtinSkills] failed to install ${skill.name}:`, e)
    }
  }
}
