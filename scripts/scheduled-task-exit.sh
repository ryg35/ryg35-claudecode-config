#!/usr/bin/env bash
# Stop hook: 定期タスク(scheduled-task)のセッションは、ターンが終わったら自分で終了する。
#
# 背景: Claude Desktop の定期タスク(na-sync 等)は 60〜120秒で仕事を終えたあとも
# claude プロセス(300〜450MB)が残り、janitor(10分周期 + idle 15分)が刈るまで最長25分居座る。
# 15分周期の na-sync なら常時1〜2本が待機状態で、メモリ圧縮の原因になる。
# Stop フックはターン完了の瞬間に走るので、ここで自分の claude プロセスに SIGTERM を送れば
# 待機時間がゼロになる。janitor は取りこぼしの保険として残す。
#
# 安全弁:
#   1. 記録の先頭80行に <scheduled-task name=...> が「在る」ものだけ対象(対話セッションは触らない)
#   2. stop_hook_active=true (他の Stop フックが継続を指示した後) なら何もしない
#   3. kill は PID 指定の SIGTERM のみ。DELAY 秒待ってから送る(アプリが最終出力を受け取る猶予)
#   4. 送ったあと生存確認して記録する(送った≠止まった)
set -u
DELAY="${SCHED_EXIT_DELAY:-20}"
LOG="$HOME/.claude/logs/scheduled-task-exit.log"
IN="$(cat)"
TRANSCRIPT="$(printf '%s' "$IN" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("transcript_path",""))' 2>/dev/null)"
ACTIVE="$(printf '%s' "$IN" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("1" if d.get("stop_hook_active") else "0")' 2>/dev/null)"
[ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ] || exit 0
[ "$ACTIVE" = "1" ] && exit 0
# jsonl 内では name=\"na-sync\" とエスケープされている。name=" で探すと全件外れる(janitor と同じ罠)
NAME="$(head -n 80 "$TRANSCRIPT" | grep -o '<scheduled-task name=\\\{0,1\}"[^"\\]*' | head -n1 | sed 's/.*"//')"
[ -n "$NAME" ] || exit 0
# フックの親を辿って claude 本体の PID を見つける(disclaimer ラッパーは対象外)
pid=$PPID
target=""
for _ in 1 2 3 4 5 6; do
  [ "$pid" -gt 1 ] || break
  cmd="$(ps -o command= -p "$pid" 2>/dev/null)"
  case "$cmd" in
    *"MacOS/claude "*) case "$cmd" in *disclaimer*) ;; *) target=$pid; break;; esac;;
  esac
  pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
done
[ -n "$target" ] || { echo "[$(date '+%F %T')] $NAME: claude PID 特定不能 (ppid=$PPID)" >> "$LOG"; exit 0; }
sid="$(basename "$TRANSCRIPT" .jsonl | cut -c1-8)"
nohup bash -c "sleep $DELAY; kill -TERM $target 2>/dev/null; sleep 5; if kill -0 $target 2>/dev/null; then r=生存; else r=終了; fi; echo \"[\$(date '+%F %T')] $NAME $sid pid=$target SIGTERM後 \$r\" >> '$LOG'" >/dev/null 2>&1 &
exit 0
