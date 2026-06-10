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
description: Clone a website (single or multi-page) with pixel-accurate fidelity using built-in MCP tools. Invoke when asked to replicate, copy, or clone a website's appearance.
metadata:
  type: workflow
---

# Website Cloning Workflow

**Tools handle the heavy lifting. Your job: call tools → diff → patch → repeat.**

---

## Step 1: Discover Pages

\\\`\\\`\\\`
browser_site_pages(url: "<homepage URL>")
\\\`\\\`\\\`

Returns a page list + \`pageMap\`. Save the pageMap — it's needed in every \`browser_clone_page\` call.

If the site has only one page, pageMap is just \`{ "<url>": "index.html" }\`.

---

## Step 2: Clone Each Page

For **every** page in the list, call:

\\\`\\\`\\\`
browser_clone_page(
  url: "<page URL>",
  outputDir: "<absolute_path>/clone-<domain>",
  pageMap: { "<url1>": "index.html", "<url2>": "about.html", ... },
  waitMs: 5000
)
\\\`\\\`\\\`

**All pages share one \`outputDir\`.** Do not use separate dirs per page.

Returns: \`{ htmlFile, cssFile, cssRuleCount, resources }\`

---

## Step 3: Serve & Take Reference Screenshots

Start local server (once, reuse for all pages):

\\\`\\\`\\\`
browser_serve_local(dir: "<outputDir>")
\\\`\\\`\\\`

For each page:

1. Screenshot the **original**:
   \\\`\\\`\\\`
   browser_navigate(url: "<original page URL>")
   browser_screenshot()
   \\\`\\\`\\\`

2. Screenshot the **clone**:
   \\\`\\\`\\\`
   browser_navigate(url: "http://localhost:<port>/<pagename>.html")
   browser_screenshot()
   \\\`\\\`\\\`

3. Diff:
   \\\`\\\`\\\`
   browser_screenshot_diff(imageA: <ref>, imageB: <clone>, threshold: 15)
   \\\`\\\`\\\`

---

## Step 4: Patch Visual Differences (Review Loop)

For each **red region** in the diff image:

1. Navigate to the **original** page
2. Extract the element's full computed styles:
   \\\`\\\`\\\`
   browser_patch_element(selector: "<CSS selector of mismatched element>")
   \\\`\\\`\\\`
   Returns a ready-to-paste \`<style>\` block with all computed properties + \`::before\`/\`::after\`.

3. Paste the \`<style>\` block into \`<head>\` of the clone HTML file.

4. Re-screenshot clone + re-diff to verify.

**Repeat until similarity >= 92% or 6 iterations.**

### Iteration exit rules

| Condition | Action |
|-----------|--------|
| similarity >= **92%** | Page DONE |
| similarity >= **85%** AND iterations >= 3 | Accept (diminishing returns) |
| iterations >= **6** | Best-effort, move on |
| only text content differs | Done |

After each diff output:
\\\`\\\`\\\`
Page: [name] | Iter: [n/6] | Similarity: [X]% | Status: [continuing/DONE]
\\\`\\\`\\\`

---

## Step 5: Wire Navigation (After ALL Pages Cloned)

\\\`\\\`\\\`
browser_wire_navigation(
  dir: "<outputDir>",
  pageMap: { same map from Step 1 }
)
\\\`\\\`\\\`

Then verify by clicking through nav links in the local browser.

---

## Agent Review Mode (Optional — for complex sites)

After Step 4 produces a diff, spawn a **review sub-agent** with:
- The diff image (base64)
- The original page URL
- The clone HTML file path

The review agent:
1. Reads the diff image, identifies the 3 worst-diverging regions
2. Calls \`browser_navigate\` to original, then \`browser_patch_element\` for each region
3. Returns a list of \`<style>\` patches to apply

Apply all patches, then re-diff in the main agent.

---

## Final Summary

\\\`\\\`\\\`
## Clone Complete

| Page | File | Similarity | Iterations | Status |
|------|------|-----------|------------|--------|
| Home | index.html | 94% | 2 | Done |
| About | about.html | 87% | 6 | best-effort |

Output: <outputDir>
Pages: N | Resources: N files | CSS rules: N
\\\`\\\`\\\`

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
