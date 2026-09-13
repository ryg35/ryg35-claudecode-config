#!/usr/bin/env python3
# NGワード検査の本体。入口は ng-words-check.sh（PostToolUse hook）。
#
# 背景: voice.md は毎セッション常駐しているのに、禁止語は書かれ続けた。
# 「ルールを書いた」と「ルールが守られている」は別の状態
# (coding-style.md の Self-Verification と同じ痛点)。人間の目視は必ず漏れる。
#
# 設計メモ:
# - 絶対にブロックしない。exit 0 のみ。検査器が落ちて編集が止まるのは、
#   禁止語が1つ通るより悪い。検出0件なら1文字も出さない。
# - 依存ゼロ。YAML パーサは手書き。読めるのは `rules:` 配下のリスト、
#   `- key: value`、`good:` 直下のリストだけ。アンカー、複数行スカラー、
#   ネストしたマップ、フロー記法は未対応。
# - hook の入力は必ず stdin から読む。argv で渡すと 1.2MB の payload で
#   「Argument list too long」になり、検査が黙って素通りする（実測済み）。
#
# 使い方: hook は stdin に PostToolUse の JSON。単体は --file <path>
#   (--file は人間が明示した経路なので、拡張子でも自己除外でも弾かない)
#   NG_WORDS_YAML でルールファイルを差し替えられる（テスト用）

import json
import os
import re
import sys

RULES_PATH = os.environ.get("NG_WORDS_YAML",
                            os.path.expanduser("~/.claude/rules/ng-words.yaml"))
TARGET_EXT = (".md", ".markdown", ".mdx", ".html", ".htm", ".txt")
# 対外文書と判定するパス断片。frontmatter の audience: external でも同じ扱い
EXTERNAL_MARKERS = ("/02-think-output/", "/note/", "/lp/")
# hook 経路だけ検査しない。禁止語そのものを本文に持つので必ず自爆する
SELF_EXCLUDE = ("/rules/voice.md", "/rules/ng-words.yaml", "/fixtures/ng-words/")
MAX_FINDINGS = 20   # これを超えた分は「ほか N 件」に畳む
GUARD_WINDOW = 64   # unless_line_contains を探す、マッチ直後の文字数
REPLACEMENT = "�"   # UTF-8 で読めなかったバイト。この文字を含む行は検査しない

MODE = "hook"
WARNINGS = []   # 最後にまとめて流す（--file は stdout の末尾、hook は stderr）


def warn(msg):
    WARNINGS.append(msg)


def blank(text):
    """検査から外す範囲を同じ長さの空白にする。桁がずれると guard 判定が狂う"""
    return " " * len(text)


# 値ぜんぶがクォート1組（+ 行末コメント）のときだけ剥がす。
# ダブルクォート側の (?:[^"\\]|\\.)* が、内側の未エスケープの " を弾いている
DOUBLE_QUOTED = re.compile(r'^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$')
SINGLE_QUOTED = re.compile(r"^'([^']*)'\s*(?:#.*)?$")


def unquote(value):
    v = value.strip()
    m = DOUBLE_QUOTED.match(v)
    if m:
        # 戻すのは2種類だけ。unicode_escape は日本語を壊すので使わない
        return re.sub(r'\\([\\"])', r"\1", m.group(1))
    m = SINGLE_QUOTED.match(v)
    if m:
        return m.group(1)
    return re.sub(r"\s+#.*$", "", v).strip()


def parse_rules(text):
    """YAML のサブセットを読む。範囲はファイル冒頭のコメントに書いた"""
    rules, cur = [], None
    list_key, list_indent = None, -1
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m_item = re.match(r"^(\s*)-\s+(.*)$", line)
        if m_item:
            indent = len(m_item.group(1))
            body = m_item.group(2)
            if list_key is not None and indent > list_indent:
                if cur is not None:
                    cur.setdefault(list_key, []).append(unquote(body))
                continue
            list_key, list_indent = None, -1
            m_kv = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):\s*(.+)$", body)
            if not m_kv:
                warn("読めない行を飛ばした: %s" % line.strip())
                continue
            cur = {m_kv.group(1): unquote(m_kv.group(2))}
            rules.append(cur)
            continue
        m_kv = re.match(r"^(\s*)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$", line)
        if not m_kv:
            warn("読めない行を飛ばした: %s" % line.strip())
            continue
        indent, key, val = len(m_kv.group(1)), m_kv.group(2), m_kv.group(3)
        if key == "rules" and val == "":
            continue
        if val == "":
            list_key, list_indent = key, indent
            if cur is not None:
                cur.setdefault(key, [])
            continue
        list_key, list_indent = None, -1
        if cur is not None:
            cur[key] = unquote(val)
    return rules


def compile_rules(raw_rules):
    """必須キー欠落と正規表現の失敗は、そのルールだけ落として続行する。
    selfcheck に当たらない pattern は、動いて見えてその語だけ素通りするので警告"""
    out = []
    for idx, r in enumerate(raw_rules, 1):
        rid = r.get("id", "(no-id:%d)" % idx)
        missing = [k for k in ("id", "pattern", "reason") if not r.get(k)]
        if missing:
            warn("%s: 必須キーが無いので飛ばす (%s)" % (rid, ",".join(missing)))
            continue
        goods = [g for g in r.get("good", []) if g]
        if not goods:
            warn("%s: good が無いので飛ばす" % rid)
            continue
        flags = re.IGNORECASE if "i" in (r.get("flags") or "") else 0
        try:
            rx = re.compile(r["pattern"], flags)
        except re.error as e:
            warn("%s: 正規表現が壊れているので飛ばす (%s)" % (rid, e))
            continue
        sample = r.get("selfcheck")
        if sample and not rx.search(sample):
            warn("%s: pattern が selfcheck 行に当たらない (%s)" % (rid, sample))
        guard = None
        if r.get("unless_line_contains"):
            try:
                guard = re.compile(r["unless_line_contains"])
            except re.error as e:
                warn("%s: unless_line_contains が壊れているので無視 (%s)" % (rid, e))
        out.append({
            "id": rid, "rx": rx, "reason": r["reason"], "good": goods[0],
            "scope": r.get("scope", "all"), "guard": guard,
        })
    return out


FENCE = re.compile(r"^(`{3,}|~{3,})(.*)$")
INLINE_CODE = re.compile(r"`+[^`]*`+")
HTML_PAIR = re.compile(r"<\s*(script|style)\b[^>]*>.*?<\s*/\s*\1\s*>", re.I)
HTML_OPEN = re.compile(r"<\s*(?:script|style)\b", re.I)
HTML_CLOSE = re.compile(r"<\s*/\s*(?:script|style)\s*>", re.I)
YAML_KEY = re.compile(r"^\s*(?:-\s+)?(?:id|pattern|good|selfcheck|unless_line_contains):")
BLOCK_HEAD = re.compile(r"(?:#{1,6}\s|>|\||!\[|\[)")
BULLET = re.compile(r"^\s*(?:[-*+]|\d+\.)\s")


def strip_html(line, in_tag):
    """script,style の中身を空白に潰す。同じ行で閉じるときは残りを検査に残す"""
    line = HTML_PAIR.sub(lambda m: blank(m.group(0)), line)
    if in_tag:
        m = HTML_CLOSE.search(line)
        if not m:
            return blank(line), True
        line = blank(line[:m.end()]) + line[m.end():]
    m = HTML_OPEN.search(line)
    if m:
        return line[:m.start()] + blank(line[m.start():]), True
    return line, False


def classify(path, lines):
    """行ごとに (語検査に使うか, 文体検査に使うか, 検査に使う本文) を決める。語の
    対象外は フェンス内 / インラインコード / script,style 内 / 非UTF-8 の行 /
    yaml のキー行。文体はこれに 見出し, 引用, 表, 箇条書き, frontmatter も足す"""
    is_html = path.lower().endswith((".html", ".htm"))
    is_yaml = path.lower().endswith((".yaml", ".yml"))
    SKIP = (False, False, "")
    fence_mark, fence_len = "", 0
    in_tag = False
    in_front = bool(lines) and lines[0].strip() == "---"
    good_indent = -1
    out = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        word_ok = style_ok = True
        m_fence = FENCE.match(stripped)
        if m_fence and not fence_mark:
            fence_mark, fence_len = m_fence.group(1)[0], len(m_fence.group(1))
        elif m_fence and m_fence.group(1)[0] == fence_mark and \
                len(m_fence.group(1)) >= fence_len and not m_fence.group(2).strip():
            # 閉じられるのは同じ記号で、開いたときと同じ長さ以上のときだけ
            fence_mark, fence_len = "", 0
        if m_fence or fence_mark or REPLACEMENT in line:
            out.append(SKIP)
            continue
        if in_front and i > 0 and stripped == "---":
            in_front = False
            word_ok = style_ok = False
        elif in_front:
            style_ok = False
        text = INLINE_CODE.sub(lambda m: blank(m.group(0)), line)
        if is_html:
            text, in_tag = strip_html(text, in_tag)
            if not text.strip():
                out.append(SKIP)
                continue
        if is_yaml:
            m_good = re.match(r"^(\s*)good:\s*$", line)
            if m_good:
                good_indent = len(m_good.group(1))
            elif good_indent >= 0:
                m_ind = re.match(r"^(\s*)-\s", line)
                if not (m_ind and len(m_ind.group(1)) > good_indent):
                    good_indent = -1
            if m_good or good_indent >= 0 or YAML_KEY.match(line):
                out.append(SKIP)
                continue
        if BLOCK_HEAD.match(stripped):
            style_ok = False
        elif BULLET.match(line) and "。" not in line:
            style_ok = False
        out.append((word_ok, style_ok, text))
    return out


def find_words(lines, marks, rules, external):
    findings = []
    for lineno, line in enumerate(lines, 1):
        word_ok, _, text = marks[lineno - 1]
        if not word_ok:
            continue
        for rule in rules:
            if rule["scope"] == "external" and not external:
                continue
            for m in rule["rx"].finditer(text):
                # 行のどこかに guard、では広すぎる。1行に3語並ぶと先頭を説明しただけで消える
                guard = rule["guard"]
                if guard and guard.search(text[m.end():m.end() + GUARD_WINDOW]):
                    continue
                findings.append((lineno, line.strip(), m.group(0), rule))
    return findings


def is_external(path, lines):
    """対外文書か。パス断片と frontmatter の audience: external の2経路だけ見る"""
    norm = "/" + path.replace(os.sep, "/").lstrip("/")
    if any(marker in norm for marker in EXTERNAL_MARKERS):
        return True
    if lines and lines[0].strip() == "---":
        for line in lines[1:40]:
            if line.strip() == "---":
                break
            if re.match(r"^\s*audience:\s*[\"']?external[\"']?\s*$", line):
                return True
    return False


KEIGO_END = re.compile(r"(?:ましょう|でしょう|ください|ました|でした|ません|ます|です)$")
JOTAI_END = re.compile(r"(?:である|であった|だ|た|る|ない|い|う|ろ|ぬ)$")
# 3連続を数える文末。長い順に並べる。「ました」より先に「した」を置くと run が切れる
RUN_END = re.compile(
    r"(ている|だった|である|ました|でした|する|した|ます|です|ない|た|だ|る|い)$")


def split_sentences(lines, marks):
    """句点で切る。行をまたぐ文は連結する。戻り値は (終わった行番号, 本文)"""
    sentences, buf = [], ""
    for lineno, line in enumerate(lines, 1):
        if not marks[lineno - 1][1]:
            buf = ""
            continue
        buf += marks[lineno - 1][2].strip()
        if "。" not in buf:
            continue
        parts = buf.split("。")
        buf = parts.pop()
        sentences.extend((lineno, b.strip()) for b in parts if b.strip())
    return sentences


def check_style(lines, marks):
    """同じ文末の連続と、敬体常体の混在を数える"""
    runs = []   # (文末, 開始行, 終了行, 連続数)。3連続以上は run 単位で1回だけ報告する
    keigo = jotai = 0
    for lineno, body in split_sentences(lines, marks):
        if KEIGO_END.search(body):
            keigo += 1
        elif JOTAI_END.search(body):
            jotai += 1
        m = RUN_END.search(body)
        token = m.group(1) if m else None
        if token and runs and token == runs[-1][0]:
            head = runs[-1]
            runs[-1] = (token, head[1], lineno, head[3] + 1)
        else:
            runs.append((token, lineno, lineno, 1))
    msgs = ["L%d-%d: 同じ文末が %d 連続（%s）。文末を散らせ" % (start, end, n, token)
            for token, start, end, n in runs if token and n >= 3]
    total = keigo + jotai
    minor = min(keigo, jotai)
    # 少ない方が1文だけの混在は誤検知。締めの1文が丁寧なだけ、が多い
    if total >= 10 and minor >= 2 and minor / total >= 0.10:
        msgs.append("敬体 %d文 / 常体 %d文 が混在。どちらかに揃えろ" % (keigo, jotai))
    return msgs


def build_report(path, findings, style_msgs):
    out = ["NGワード検査: %s で %d 件" % (os.path.basename(path), len(findings))]
    for lineno, text, matched, rule in findings[:MAX_FINDINGS]:
        out.append("L%d: %s" % (lineno, text[:80]))
        out.append("  語: %s / 理由: %s / 書き直し例: %s"
                   % (matched, rule["reason"], rule["good"]))
    if len(findings) > MAX_FINDINGS:
        out.append("ほか %d 件" % (len(findings) - MAX_FINDINGS))
    if style_msgs:
        out.extend(["", "文体:"] + style_msgs)
    out.extend(["",
                "語だけ置換するな。該当文を丸ごと書き直せ。語の置換だけだと"
                "同じ調子の文が次の段落で再発する。毎回だ。",
                "書き直したら同じファイルを Edit して再検査を受けろ。"])
    return "\n".join(out)


def read_lines(path):
    """非UTF-8 でも落ちない。読めなかった行は classify が検査から外す"""
    with open(path, "rb") as f:
        data = f.read()
    try:
        return data.decode("utf-8").splitlines()
    except UnicodeDecodeError:
        warn("UTF-8 として読めない。文字化けした範囲は検査していない: %s"
             % os.path.basename(path))
        return data.decode("utf-8", errors="replace").splitlines()


def target_path():
    """検査するパスを1つ返す。対象外なら None"""
    if MODE == "file":
        if len(sys.argv) > 2 and sys.argv[2]:
            return sys.argv[2]
        sys.stderr.write("usage: ng-words-check.py --file <path>\n")
        return None
    data = json.loads(sys.stdin.read())
    path = data.get("tool_input", {}).get("file_path", "") or ""
    if not path.lower().endswith(TARGET_EXT):
        return None
    norm = "/" + path.replace(os.sep, "/").lstrip("/")
    if any(marker in norm for marker in SELF_EXCLUDE):
        return None
    return path


def emit(report):
    if MODE == "file":
        chunks = ([report] if report else []) + ["警告: %s" % w for w in WARNINGS]
        if chunks:
            print("\n".join(chunks))
        return
    for w in WARNINGS:
        sys.stderr.write("ng-words-check: %s\n" % w)
    if report:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": report,
        }}, ensure_ascii=False))


def main():
    path = target_path()
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(RULES_PATH, encoding="utf-8") as f:
            rules = compile_rules(parse_rules(f.read()))
    except OSError as e:
        warn("ルールファイルを読めない: %s" % e)
        return None
    if not rules:
        warn("有効なルールが1つも無い: %s" % RULES_PATH)
        return None
    lines = read_lines(path)
    marks = classify(path, lines)
    findings = find_words(lines, marks, rules, is_external(path, lines))
    style_msgs = check_style(lines, marks)
    if findings or style_msgs:
        return build_report(path, findings, style_msgs)
    return None


if __name__ == "__main__":
    if sys.argv[1:2] == ["--file"]:
        MODE = "file"
    report = None
    try:
        report = main()
    except Exception as e:  # hook が落ちて編集が止まるのが最悪。全部飲む
        warn("検査に失敗した: %s" % e)
    emit(report)
    sys.exit(0)
