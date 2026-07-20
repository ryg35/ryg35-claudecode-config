#!/usr/bin/env bash
# PreCompact hook: compact 前に handoff/current.md をスナップショットし、
# 圧縮で文脈が失われても直前状態を復元できるようにする。
# OMC hooks #15 (pre-compact) + #16 (project-memory-precompact) を統合したもの。
#
# 2026-07-05 修正: current.md が更新されないまま compact が繰り返されると
# 同一内容のスナップショットが無限に積もっていた(実測45本中31本が重複)。
# 直前世代と同一ならコピーをスキップし、保持は新しい10本にローテーション。
HANDOFF="$HOME/.claude/handoff/current.md"
SNAP_DIR="$HOME/.claude/handoff"
KEEP=10

if [ -f "$HANDOFF" ]; then
  LATEST=$(ls -t "$SNAP_DIR"/precompact-*.md 2>/dev/null | head -1)
  if [ -z "$LATEST" ] || ! cmp -s "$HANDOFF" "$LATEST"; then
    TS=$(date +%Y-%m-%d-%H%M)
    cp "$HANDOFF" "$SNAP_DIR/precompact-${TS}.md" 2>/dev/null || true
  fi
  # ローテーション: 新しい KEEP 本を残し、それより古い世代を削除
  ls -t "$SNAP_DIR"/precompact-*.md 2>/dev/null | tail -n +$((KEEP + 1)) | while IFS= read -r f; do
    rm -f "$f"
  done
fi

# 圧縮前に未完了作業を handoff へ書き出すようリマインドする。
echo "<system-reminder>"
echo "About to compact. If there is work in flight, write a fresh"
echo "summary to ~/.claude/handoff/current.md so the next session can pick it up."
echo "</system-reminder>"
exit 0
