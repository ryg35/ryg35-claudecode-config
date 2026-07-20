#!/usr/bin/env python3
"""Generate colorized diff from Claude Code PostToolUse hook input."""
import json, sys, difflib, os

input_file = sys.argv[1]
diff_file = sys.argv[2]

with open(input_file) as f:
    data = json.load(f)

tool_name = data.get("tool_name", "")
tool_input = data.get("tool_input", {})
fpath = tool_input.get("file_path", "")

RED = "\033[31m"
GREEN = "\033[32m"
CYAN = "\033[36m"
BOLD = "\033[1m"
RESET = "\033[0m"
DIM = "\033[2m"

output = []

if tool_name == "Edit":
    old = tool_input.get("old_string", "")
    new = tool_input.get("new_string", "")
    if not old and not new:
        sys.exit(0)

    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    if old_lines and not old_lines[-1].endswith("\n"):
        old_lines[-1] += "\n"
    if new_lines and not new_lines[-1].endswith("\n"):
        new_lines[-1] += "\n"

    fname = os.path.basename(fpath)
    output.append(f"{BOLD}{CYAN}━━━ Edit: {fname} ━━━{RESET}")
    output.append(f"{DIM}{fpath}{RESET}")
    output.append("")

    for line in difflib.unified_diff(old_lines, new_lines, lineterm=""):
        line = line.rstrip("\n")
        if line.startswith("---") or line.startswith("+++"):
            continue
        elif line.startswith("@@"):
            output.append(f"{CYAN}{line}{RESET}")
        elif line.startswith("-"):
            output.append(f"{RED}{line}{RESET}")
        elif line.startswith("+"):
            output.append(f"{GREEN}{line}{RESET}")
        else:
            output.append(f"{DIM}{line}{RESET}")

elif tool_name == "Write":
    content = tool_input.get("content", "")
    lines = content.count("\n") + 1
    fname = os.path.basename(fpath)
    output.append(f"{BOLD}{CYAN}━━━ Write: {fname} ━━━{RESET}")
    output.append(f"{DIM}{fpath}{RESET}")
    output.append(f"{GREEN}+{lines} lines written{RESET}")
    output.append("")
    for i, line in enumerate(content.split("\n")[:30]):
        output.append(f"{GREEN}+ {line}{RESET}")
    if lines > 30:
        output.append(f"{DIM}... ({lines - 30} more lines){RESET}")
else:
    sys.exit(0)

if output:
    with open(diff_file, "w") as f:
        f.write("\n".join(output) + "\n")
