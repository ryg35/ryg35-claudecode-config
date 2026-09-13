#!/bin/bash
# ng-words-check.sh のフィクスチャテスト。
#
# 期待検出数はこのファイルに直書きする。ルールを足したら fixtures/ng-words/ng.md に
# 1行足して EXPECT_NG を +1 する。これを飛ばしたルールは、次の誤検知で黙って消される。
#
# 使い方: ~/.claude/scripts/ng-words-test.sh
# 全部通れば exit 0、1つでも落ちれば exit 1。
#
# 作業ファイルは TMP に置きっぱなしにする。テストが消すと、落ちたときに
# 何を食わせたのか手元で再現できない。毎回上書きするので溜まらない。

set -u

CHECK="$HOME/.claude/scripts/ng-words-check.sh"
FX="$HOME/.claude/scripts/fixtures/ng-words"
TMP="${TMPDIR:-/tmp}/ng-words-test"
mkdir -p "$TMP"
ERR="$TMP/stderr.txt"

EXPECT_NG=17        # ng.md: scope all のルールを1つずつ
EXPECT_OK=0         # ok.md: 誤検知ゼロ
EXPECT_EXTERNAL=2   # external/note.md: 捏造ゼロ設計 + 無説明の略語1つ

pass=0
fail=0

# 出力のヘッダから件数を取る。出力が空なら0件
count_of() {
  printf '%s' "$1" | python3 -c 'import re,sys; m=re.search(r"で (\d+) 件", sys.stdin.read()); print(m.group(1) if m else 0)'
}

hook_json() {
  python3 -c 'import json,sys; print(json.dumps({"tool_input":{"file_path":sys.argv[1]},"hook_event_name":"PostToolUse"}))' "$1"
}

ok() {
  pass=$((pass + 1))
  echo "  PASS: $1"
}

ng() {
  fail=$((fail + 1))
  echo "  FAIL: $1"
}

check_count() {
  local label="$1" path="$2" expected="$3"
  local out actual
  out=$("$CHECK" --file "$path")
  actual=$(count_of "$out")
  if [ "$actual" = "$expected" ]; then
    ok "$label: $actual 件"
  else
    ng "$label: 期待 $expected 件 / 実際 $actual 件"
    printf '%s\n' "$out"
  fi
}

# 陰性は「stdout が空」だけでは足りない。stderr に警告を吐いていたら、
# hook 経路ではそれがログに流れ続ける。exit code も一緒に見る
check_silent() {
  local label="$1" path="$2"
  local out code err
  out=$("$CHECK" --file "$path" 2>"$ERR")
  code=$?
  err=$(cat "$ERR")
  if [ -z "$out" ] && [ -z "$err" ] && [ "$code" = "0" ]; then
    ok "$label: stdout も stderr も空で exit 0"
  else
    ng "$label: stdout=[$out] stderr=[$err] exit=$code"
  fi
}

check_contains() {
  local label="$1" out="$2" needle="$3"
  case "$out" in
    *"$needle"*) ok "$label" ;;
    *) ng "$label"; printf '%s\n' "$out" ;;
  esac
}

check_missing() {
  local label="$1" out="$2" needle="$3"
  case "$out" in
    *"$needle"*) ng "$label"; printf '%s\n' "$out" ;;
    *) ok "$label" ;;
  esac
}

# hook 経路。stdout が空であること、exit 0 であることを見る
check_hook_silent() {
  local label="$1" payload="$2"
  local out code
  out=$(printf '%s' "$payload" | "$CHECK" 2>/dev/null)
  code=$?
  if [ -z "$out" ] && [ "$code" = "0" ]; then
    ok "$label: 無出力で exit 0"
  else
    ng "$label: stdout=[$out] exit=$code"
  fi
}

echo "== 1. 語の検出数 =="
check_count "ng.md" "$FX/ng.md" "$EXPECT_NG"
check_count "ok.md" "$FX/ok.md" "$EXPECT_OK"
check_count "ok-with-one.md" "$FX/ok-with-one.md" 1
check_count "external/note.md" "$FX/external/note.md" "$EXPECT_EXTERNAL"
check_count "external/guard.md" "$FX/external/guard.md" 2
check_count "mixed-style.md" "$FX/mixed-style.md" 0
check_count "jotai-run.md" "$FX/jotai-run.md" 0
check_count "mix-1of10.md" "$FX/mix-1of10.md" 0
check_count "fence.md" "$FX/fence.md" 0
check_count "front.md" "$FX/front.md" 6
check_count "script-style.html" "$FX/script-style.html" 4
check_count "many.md" "$FX/many.md" 25
check_count "sjis.md" "$FX/sjis.md" 0

echo "== 2. 陰性は完全に無音 =="
check_silent "ok.md" "$FX/ok.md"
check_silent "fence.md" "$FX/fence.md"
check_silent "mix-1of10.md" "$FX/mix-1of10.md"

echo "== 3. 文体 =="
OUT_MIXED=$("$CHECK" --file "$FX/mixed-style.md")
check_contains "敬体の連続を検出" "$OUT_MIXED" "同じ文末が 5 連続（ます）"
check_contains "敬体常体の混在を検出" "$OUT_MIXED" "が混在"
OUT_JOTAI=$("$CHECK" --file "$FX/jotai-run.md")
check_contains "常体の連続を検出" "$OUT_JOTAI" "同じ文末が 5 連続（ている）"
check_contains "run 全体を1回で報告" "$OUT_JOTAI" "L6-10:"
check_missing "少ない方が1文なら混在としない" "$("$CHECK" --file "$FX/mix-1of10.md")" "が混在"

echo "== 4. 打ち切りと非UTF-8 =="
check_contains "20件で打ち切る" "$("$CHECK" --file "$FX/many.md")" "ほか 5 件"
check_contains "非UTF-8 を警告する" "$("$CHECK" --file "$FX/sjis.md")" "UTF-8 として読めない"

echo "== 5. ルールファイルの読み方 =="
OUT_EVIL=$(NG_WORDS_YAML="$FX/evil.yaml" "$CHECK" --file "$FX/evil-target.md")
if [ "$(count_of "$OUT_EVIL")" = "4" ]; then
  ok "クォートと行末コメント: 4 件"
else
  ng "クォートと行末コメント: 期待 4 件 / 実際 $(count_of "$OUT_EVIL") 件"
  printf '%s\n' "$OUT_EVIL"
fi
OUT_BROKEN=$(NG_WORDS_YAML="$FX/broken.yaml" "$CHECK" --file "$FX/probe.md")
check_contains "壊れたルールを飛ばして続行" "$OUT_BROKEN" "で 1 件"
check_contains "good 無しを警告" "$OUT_BROKEN" "警告: no-good"
check_contains "壊れた正規表現を警告" "$OUT_BROKEN" "警告: bad-regex"

echo "== 6. hook 経路 =="
# fixtures は hook 経路では自己除外されるので、TMP へ写して検査対象にする。
# 禁止語をこのファイルに直接書くと、このファイル自身が検査に引っかかる
cp "$FX/ok-with-one.md" "$TMP/hook-target.md"
OUT_HOOK=$(hook_json "$TMP/hook-target.md" | "$CHECK")
check_contains "additionalContext を返した" "$OUT_HOOK" "additionalContext"
if printf '%s' "$OUT_HOOK" | python3 -c 'import json,sys; json.loads(sys.stdin.read())' >/dev/null 2>&1; then
  ok "出力が JSON として読める"
else
  ng "出力が JSON として壊れている"
fi
for ext in markdown mdx htm html txt; do
  cp "$TMP/hook-target.md" "$TMP/hook-target.$ext"
  check_contains ".$ext に反応する" "$(hook_json "$TMP/hook-target.$ext" | "$CHECK")" "additionalContext"
done
check_hook_silent ".py は無反応" "$(hook_json /tmp/example.py)"
check_hook_silent "voice.md は自己除外" "$(hook_json "$HOME/.claude/rules/voice.md")"
check_hook_silent "ng-words.yaml は自己除外" "$(hook_json "$HOME/.claude/rules/ng-words.yaml")"
check_hook_silent "fixtures は自己除外" "$(hook_json "$FX/ng.md")"

# argv で渡していた頃は、ここで exec が Argument list too long を返して黙って死んだ
python3 -c '
import io, json, sys
payload = {"tool_name": "Write",
           "tool_input": {"file_path": sys.argv[1], "content": "x" * 1200000}}
io.open(sys.argv[2], "w", encoding="utf-8").write(json.dumps(payload))
' "$TMP/hook-target.md" "$TMP/payload-1200.json"
check_contains "1.2MB の payload を検査する" "$("$CHECK" < "$TMP/payload-1200.json")" "additionalContext"

echo "== 7. 壊れた入力でも exit 0 かつ stdout 無音 =="
mkdir -p "$TMP/dir.md"
check_hook_silent "存在しないパス" "$(hook_json "$TMP/no-such-file.md")"
check_hook_silent "ディレクトリ" "$(hook_json "$TMP/dir.md")"
check_hook_silent "file_path が空文字" "$(hook_json "")"
check_hook_silent "file_path が無い" '{"hook_event_name":"PostToolUse"}'
check_hook_silent "JSON が壊れている" 'not a json at all'
OUT_NOYAML=$(hook_json "$TMP/hook-target.md" | NG_WORDS_YAML="$TMP/no-such.yaml" "$CHECK" 2>/dev/null)
if [ -z "$OUT_NOYAML" ]; then
  ok "ルールファイルが無い: 無出力"
else
  ng "ルールファイルが無い: stdout=[$OUT_NOYAML]"
fi
OUT_NOARG=$("$CHECK" --file 2>/dev/null)
if [ -z "$OUT_NOARG" ]; then
  ok "--file に引数が無い: stdout 無音"
else
  ng "--file に引数が無い: stdout=[$OUT_NOARG]"
fi

echo "== 8. 実ファイルの検出数（表示のみ、合否には関係しない）=="
for real in "$HOME/.claude/rules/voice.md" "$HOME/.claude/handoff/current.md"; do
  if [ -f "$real" ]; then
    echo "  $real: $(count_of "$("$CHECK" --file "$real")") 件"
  else
    echo "  $real: ファイルが無い"
  fi
done

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
