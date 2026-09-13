#!/bin/bash
# PreToolUse hook (matcher: Edit|Write)
# skill / agent / command / rules ファイルへの書き込み時に、
# skill-authoring skill (~/.claude/skills/skill-authoring/SKILL.md) の起動を
# additionalContext で促す。
#
# 背景: rules/*.md は毎セッション常駐ロードされるが、「ロードされている」と
# 「執筆の瞬間に適用される」は別の状態 (coding-style.md Self-Verification の
# 痛点と同型)。このhookは authoring の瞬間にトリガーを再注入し、compaction で
# ルールが文脈から薄れても発火を保証する。
#
# 設計メモ:
# - ブロックしない (exit 0 + additionalContext のみ)。permissionDecision は
#   出力しない: "allow" を返すと権限プロンプトを勝手にバイパスしてしまう。
# - セッションごとに1回だけ発火 (マーカーファイルで dedup)。毎編集ごとに
#   注入するとノイズになり、リマインダー自体が無視され始めるため。

set -u

INPUT=$(cat)

python3 - "$INPUT" <<'PYEOF'
import json, os, re, sys

data = json.loads(sys.argv[1])
path = data.get("tool_input", {}).get("file_path", "") or ""
session = data.get("session_id", "") or "nosession"

# 対象: SKILL.md / agents/*.md / commands/*.md / rules/*.md / CLAUDE.md
patterns = [
    r"/skills/[^/]+/SKILL\.md$",
    r"/agents/[^/]+\.md$",
    r"/commands/[^/]+\.md$",
    r"/rules/[^/]+\.md$",
    r"/CLAUDE\.md$",
]
if not any(re.search(p, path) for p in patterns):
    sys.exit(0)

# セッション内1回のみ (2回目以降は沈黙)
marker = f"/tmp/claude-skill-authoring-reminded-{session}"
if os.path.exists(marker):
    sys.exit(0)
open(marker, "w").close()

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": (
            "REMINDER (skill-authoring trigger): you are writing to a skill/"
            "agent/command/rules file. If this is a new file or a substantive "
            "revision, invoke the `skill-authoring` skill "
            "(~/.claude/skills/skill-authoring/SKILL.md), pick the persuasion "
            "principles per its table, and state your choice in one line. "
            "Mechanical edits (typo/path fix) are exempt."
        ),
    }
}))
PYEOF
exit 0
