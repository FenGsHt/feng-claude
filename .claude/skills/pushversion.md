---
name: pushversion
description: Bump version, update changelogs, and push to trigger GitHub builds.
---

# PushVersion Skill

## Description
Bump version, update changelogs, and push to trigger GitHub builds.

## Usage
When invoked, this skill will:
1. Read current version from `package.json`
2. Ask user for target version (default: patch +1)
3. Update `package.json` version
4. Get recent git commits since last version tag
5. Update `CHANGELOG.md` with new version section
6. Update `RELEASES.md` with GitHub Release content
7. Update `README.md` with version highlights (zh/en)
8. Commit all changes with `chore: v<version>` message
9. Push to origin to trigger GitHub Actions

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
git log --oneline <last-version-tag>..HEAD
```
Or if no tag:
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
Add highlights in both zh and en sections:

Chinese (after `## 中文` and intro line):
```markdown
### v<version> 主要更新

- **<feature>**: <description>
- **<fix>**: <description>
```

English (after `## English` and intro line):
```markdown
### v<version> Highlights

- **<feature>**: <description>
- **<fix>**: <description>
```

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

## Notes
- Version format: `0.7.XX` (patch version bumps)
- Date format: `YYYY-MM-DD`
- Always commit with `Co-Authored-By: Claude <noreply@anthropic.com>`
- After push, GitHub Actions will build and create release artifacts
- GitHub Release content is in RELEASES.md, ready to copy
