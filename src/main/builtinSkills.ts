import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface BuiltinSkill {
  name: string
  content: string
  forceUpdate?: boolean  // if true, overwrite even if file exists
}

const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name: 'clone-website',
    forceUpdate: true,
    content: `---
name: clone-website
description: Clone a website (single or multi-page) with pixel-accurate fidelity and working interactions using built-in MCP tools. Invoke when asked to replicate, copy, or clone a website's appearance.
metadata:
  type: workflow
---

# Website Cloning Workflow

**One tool call clones the whole site. Then: diff → patch → verify interactions.**

---

## Step 1: Clone the Entire Site (one call)

\`\`\`
browser_clone_site(
  url: "<homepage URL>",
  outputDir: "<absolute_path>/clone-<domain>",
  maxPages: 10,
  waitMs: 5000,
  interactMs: 5000   ← for SPAs (Vue/React); 0 for static sites
)
\`\`\`

This single call does everything: discovers pages → clones each (resources + CSS + rendered DOM + URL rewrite) → **records API responses for offline replay** → starts a preview server → computes per-page similarity → wires navigation.

**SPA note:** With \`interactMs >= 5000\`, XHR/fetch responses are archived into \`api-archive.json\` and a \`replay-shim.js\` is injected — tabs, modals, and client-side routing work in the clone (for requests that fired during cloning). Login flows and POST writes cannot be replayed.

Check the returned summary table:
- \`sim\` per page (similarity %)
- \`api\` per page (archived API responses)
- preview server URL

Sites with > 10 pages: call again with the same \`outputDir\` and higher \`maxPages\`, or clone remaining pages individually with \`browser_clone_page\` (same \`outputDir\`, pass the returned \`pageMap\`).

---

## Step 2: Patch Pages with sim < 92%

For each low-similarity page:

1. Diff to locate problems:
   \`\`\`
   browser_navigate(url: "<original page URL>") → browser_screenshot
   browser_navigate(url: "<serverUrl>/<page>.html") → browser_screenshot
   browser_screenshot_diff(imageA, imageB, threshold: 15)
   \`\`\`

2. For each red region, navigate to the **original** page, then:
   \`\`\`
   browser_patch_element(
     selector: "<CSS selector of mismatched element>",
     applyTo: "<outputDir>/<page>.html"
   )
   \`\`\`
   The computed-style patch is **written into the clone file automatically** (re-calling with the same selector replaces the previous patch, no stacking).

3. Re-screenshot clone → re-diff.

### Exit rules per page

| Condition | Action |
|-----------|--------|
| similarity >= 92% | Page DONE |
| similarity >= 85% AND iterations >= 3 | Accept (diminishing returns) |
| iterations >= 6 | Best-effort, move on |
| only text content differs | Done |

After each diff: \`Page: [name] | Iter: [n/6] | Similarity: [X]% | Status: [...]\`

---

## Step 3: Verify Interactions

In the clone (preview server URL):
1. Click nav links → pages should switch
2. Click tabs / open modals / expand sections → should work via replayed API data
3. Check console (\`browser_console\`) for errors

If an interaction fails because its API call wasn't recorded: go back to the **original** site, trigger that interaction, then re-run \`browser_clone_page\` on that page with \`interactMs: 8000\` (same \`outputDir\` — the API archive merges across runs).

---

## Fallback: Screenshot Archive

For states that can't be replayed (post-login, form submissions), archive them visually:

\`\`\`
browser_navigate(url) → interact to reach the state →
browser_screenshot_full(outputPath: "<outputDir>/states/<name>.png", scrollDelay: 500)
\`\`\`

---

## Agent Review Mode (Optional — for complex sites)

After Step 2 produces a diff, spawn a review sub-agent with the diff image, original URL, and clone file path. It identifies the 3 worst regions and calls \`browser_patch_element(selector, applyTo)\` for each. Then re-diff in the main agent.

---

## Final Summary

\`\`\`
## Clone Complete

| Page | File | Similarity | API replay | Interactions |
|------|------|-----------|------------|--------------|
| Home | index.html | 94% | 12 responses | tabs/modals OK |

Output: <outputDir>   Preview: <serverUrl>
\`\`\`

**Stop after this summary.**`
  }
]

/**
 * 首次运行时将内置 skill 写入 ~/.claude/commands/。
 * forceUpdate=true 的 skill 始终覆盖（用于更新）。
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
    if (existsSync(dest) && !skill.forceUpdate) continue
    try {
      writeFileSync(dest, skill.content, 'utf-8')
      console.log(`[builtinSkills] installed: ${skill.name}`)
    } catch (e) {
      console.warn(`[builtinSkills] failed to install ${skill.name}:`, e)
    }
  }
}
