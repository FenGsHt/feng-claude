---
name: pushversion
description: Bump version, update changelogs, and push to trigger GitHub builds. Use when the user wants to release a new version, bump the version number, or publish to GitHub.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(grep *)
  - Bash(git log *)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(git push *)
---

# PushVersion Skill

Bump version, update changelogs, and push to trigger GitHub builds.

## Steps

### 1. Read current version
```bash
grep '"version"' package.json | head -1
```

### 2. Ask user for target version
Default to patch bump (e.g., 0.7.81 → 0.7.82)

### 3. Update package.json
Edit `package.json` version field

### 4. Get recent commits
```bash
git log --oneline -20
```

### 5. Update CHANGELOG.md
Add new section at top (after header):
```markdown
## [<version>] - <date>

### 新功能 | Features
- **<feature>**: <description>

### 修复 | Bug Fixes
- **<fix>**: <description>
```

### 6. Update RELEASES.md
Add new section after the instruction block:
```markdown
---

## v<version> (<date>)

### 新功能
- **<feature>**: <description>

### 修复
- **<fix>**: <description>
```

### 7. Update README.md
Add highlights in both zh and en sections.

### 8. Commit
```bash
git add -A
git commit -m "chore: v<version>

- Bump version to <version>
- Add CHANGELOG.md entry for v<version>
- Add RELEASES.md entry for v<version>
- Update README.md with v<version> highlights (zh/en)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 9. Push
```bash
git push origin master
```
