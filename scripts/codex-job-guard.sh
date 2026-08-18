#!/usr/bin/env bash
# codex ジョブの死亡検知 (PostToolUse: Bash)
#
# 目的は1つ。**死んでいるジョブを「実行中」と報告してしまう事故を止めること。**
#
# codex-exec-bg.sh のジョブは2通りの死に方をする。
#
#   1. フラグ不正などで即死する。`.meta` は status=error になるが、
#      Bash ツール側の出力は空なので、掘らないと原因が分からない
#      (2026-08-16: `--search` が未対応で1秒で死亡)
#   2. ハーネスの2分タイムアウトで SIGTERM される。このとき wrapper は
#      最後の write_meta に到達しないので、`.meta` は **status=running のまま
#      永久に残る**。プロセスは居ないのに「実行中」に見える
#      (2026-07-27: 2回連続で「まだ実行中です」とユーザーに報告した)
#
# よって status だけを信用してはならない。必ず ps で pid の生死を併せて見る。
#
# 注意: `.meta` の label= 行は日本語プロンプトをバイト単位で切るため不正な UTF-8 に
# なることがある。ロケール依存の grep はこれを理由にファイル全体を空振りするので、
# 読み出しは必ず LC_ALL=C で行う (2026-08-16 に監視が2回誤検知した)。

set -u

# 既定は本番の置き場。テストのときだけ差し替える (本番へ偽データを置かずに済ませるため)
JOBS_DIR=${CODEX_JOBS_DIR:-/tmp/claude-codex-jobs}
[ -d "$JOBS_DIR" ] || exit 0

payload=$(cat 2>/dev/null || true)

meta_field() { LC_ALL=C sed -n "s/^$2=//p" "$1" 2>/dev/null | head -1; }
is_alive() { [ -n "$1" ] && ps -p "$1" >/dev/null 2>&1; }

# --- 1. codex を起動した直後なら、即死していないかを見る -------------------
case "$payload" in
  *codex-exec-bg.sh*)
    sleep 3
    newest=$(ls -t "$JOBS_DIR"/*.meta 2>/dev/null | head -1)
    if [ -n "$newest" ]; then
      st=$(meta_field "$newest" status)
      if [ "$st" = "error" ]; then
        echo "codex ジョブが即座に失敗しました ($(basename "${newest%.meta}"))。原因:"
        LC_ALL=C tail -c 500 "${newest%.meta}.jsonl" 2>/dev/null
        echo "同じコマンドをそのまま投げ直さないこと。フラグと引数を直してから再実行してください。"
      fi
    fi
    ;;
esac

# --- 2. 死体が running のまま残っていないかを常に掃く ----------------------
# 一度報告した死体は .stale を置いて二度目を出さない (毎回の Bash で騒がない)
for m in "$JOBS_DIR"/*.meta; do
  [ -e "$m" ] || continue
  [ -e "${m%.meta}.stale" ] && continue
  [ "$(meta_field "$m" status)" = "running" ] || continue
  pid=$(meta_field "$m" pid)
  is_alive "$pid" && continue

  : > "${m%.meta}.stale"
  echo "codex ジョブ $(basename "${m%.meta}") は status=running のままですが、PID $pid は存在しません。"
  echo "SIGTERM で殺された可能性が高い状態です。**このジョブを「実行中」として扱わないこと。**"
  echo "run_in_background: true を付け忘れると、ハーネスの2分タイムアウトでこうなります。"
done

exit 0
