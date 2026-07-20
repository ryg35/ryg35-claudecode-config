---
description: Save a clipboard screenshot to ~/.claude/screenshots and display it inline.
---

Capture a screenshot from the clipboard and display it. Follow these steps exactly.

## Prerequisites
- The user has already taken a screenshot using Cmd+Shift+A or similar
- Execute this when an image has been copied to the clipboard

## Steps

1. Run the following command with the Bash tool:
```
FILEPATH="$HOME/.claude/screenshots/capture_$(date +%Y-%m-%d_%H-%M-%S).png" && mkdir -p "$HOME/.claude/screenshots" && pngpaste "$FILEPATH" 2>&1; if [ -f "$FILEPATH" ]; then echo "SAVED:$FILEPATH"; else echo "NO_IMAGE"; fi
```

2. If the result starts with `SAVED:`:
   - Run the following with the Bash tool to add to history:
```
node -e "
const fs = require('fs');
const path = '$FILEPATH';
const hf = require('os').homedir() + '/.claude/screenshots/history.json';
const h = fs.existsSync(hf) ? JSON.parse(fs.readFileSync(hf,'utf-8')) : [];
h.unshift({ path, filename: require('path').basename(path), type: 'capture', label: '', timestamp: new Date().toISOString(), size: fs.statSync(path).size });
if (h.length > 100) h.length = 100;
fs.writeFileSync(hf, JSON.stringify(h, null, 2));
console.log('History updated:', h.length, 'entries');
"
```
   - Open the file path with the Read tool to display the image

3. If the result is `NO_IMAGE`:
   - Display "No image found in clipboard. Take a screenshot with Cmd+Shift+A and then run /ss again."

## Important
- The save destination must always be the `~/.claude/screenshots/` directory
- pngpaste must be installed (`brew install pngpaste`)
