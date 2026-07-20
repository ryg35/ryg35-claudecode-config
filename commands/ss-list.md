---
description: Show the screenshot capture history as a table and open an entry by number.
---

Display the screenshot capture history. Follow these steps exactly.

## Steps

1. Use the Read tool to load `~/.claude/screenshots/history.json` (if the file does not exist, display "No history available")

2. Display the loaded JSON as a table in the following format:

| # | Date/Time | Type | Size | Label |
|---|-----------|------|------|-------|
| 0 | YYYY-MM-DD HH:MM | capture/paste | XXX KB | Label |
|   | File path |

3. If the user specifies a number, open the `path` of that entry with the Read tool to display the image

## Important
- The history file path is `$HOME/.claude/screenshots/history.json`
- If the MCP tool `screenshot_list` is available, you may use it instead, but reading directly with the Read tool is the most reliable approach
