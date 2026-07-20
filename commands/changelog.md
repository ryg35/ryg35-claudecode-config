---
description: Auto-generate or update CHANGELOG.md from conventional commits since last release/tag.
---

# Changelog

Generate changelog entries from git commit history.

## Instructions

1. **Find the last version tag or changelog entry**

```bash
git tag --sort=-version:refname | head -5
```

- If no tags exist, use the initial commit as the starting point

2. **Collect commits since last tag**

```bash
git log <last-tag>..HEAD --oneline --no-merges
```

3. **Parse conventional commit types and group**

Categorize commits into sections:

- **Added** (`feat:`, `add:`)
- **Fixed** (`fix:`)
- **Changed** (`change:`, `refactor:`)
- **Removed** (`remove:`)
- **Performance** (`perf:`)
- **Documentation** (`docs:`)
- **Testing** (`test:`)
- **Infrastructure** (`chore:`, `ci:`)

4. **Generate changelog entry**

Format following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [Unreleased] - YYYY-MM-DD

### Added
- Description of new feature (#issue)

### Fixed
- Description of bug fix (#issue)

### Changed
- Description of change (#issue)
```

5. **Prepend to CHANGELOG.md**

- If CHANGELOG.md exists, prepend the new entry after the header
- If it doesn't exist, create it with a standard header
- Preserve all existing entries

6. **Show the generated entry for review**

## Arguments

$ARGUMENTS can be:
- (none) - Generate unreleased changelog
- `<version>` - Generate changelog for specific version (e.g., `1.2.0`)
- `preview` - Show what would be generated without writing
