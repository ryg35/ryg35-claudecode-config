#!/bin/bash
# PostToolUse hook (matcher: Edit|Write) の入口。中身は ng-words-check.py。
#
# ここを薄い殻にしてあるのは、hook の payload を argv ではなく stdin のまま
# Python へ渡すためだ。1.2MB の JSON を argv で渡すと exec が
# 「Argument list too long」で落ち、検査が黙って素通りする（実測済み）。
#
# 使い方:
#   hook : stdin に PostToolUse の JSON
#   単体 : ng-words-check.sh --file <path>
#
# 設計、YAML パーサの範囲、環境変数 NG_WORDS_YAML は
# ng-words-check.py の冒頭コメントに書いた。

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$DIR/ng-words-check.py" "$@"

# 検査器の失敗で編集を止めない。python3 が無い環境でも必ず exit 0
exit 0
