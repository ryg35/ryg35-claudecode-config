#!/bin/bash
# PostToolUse(Bash) hook: ~/.claude リポジトリへの git commit を検知したら、
# 公開側 (ryg35-claudecode-config) へ反映するかをユーザーに毎回確認させる。
#
# なぜ hook か: 「commit したら聞く」を記憶やルール文に置くと、コンテキストが
# 長いセッションで必ず飛ばされる。ハーネスに言わせれば忘れられない。
# (2026-08-18 ユーザー指示「claude-code側を更新したら、config側に反映するか毎回聞く」)
#
# 出力規約は codex-job-guard.sh と同じ: stdout に書いて exit 0。

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# commit を含まないコマンドは対象外
case "$CMD" in *commit*) ;; *) exit 0 ;; esac
# 公開側 clone (scratchpad/public-config) への commit は対象外
case "$CMD" in *public-config*) exit 0 ;; esac
# ~/.claude リポジトリを指していなければ対象外 (Vault や他リポジトリの commit で騒がない)
case "$CMD" in *"/.claude"*|*"cd ~/.claude"*|*"-C ~/.claude"*) ;; *) exit 0 ;; esac

echo "~/.claude に commit が入った。公開側 (ryg35-claudecode-config) へ反映するかをユーザーに確認すること。"
echo "反映する場合: 恒久の場所に clone → python3 ~/.claude/scripts/export-public-config.py --public-repo <clone> → diff をユーザーが確認 → ユーザー自身が push。push を代行しない。"
exit 0
