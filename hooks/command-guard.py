#!/usr/bin/env python3
"""Claude Code の Stop hook。利用者に実行を頼むコマンドが、チャット本文に出ていなければ差し戻す。

wrap_up の recap・ask・ボタンの message は次の一手の箱にしか出ず、コマンドとしては見えない。
「上の push を実行してください」と書きながら、どこにもコマンドを出していないこともある。
どちらも、そのターンの本文にコードブロックが1つもなければ差し戻す。

差し戻しは1ターンにつき1回だけ（stop_hook_active が立っていたら通す）。

単体で試す: python3 command-guard.py --check <transcript.jsonl>
"""

import importlib.util
import json
import os
import re
import sys

_spec = importlib.util.spec_from_file_location(
    "japanese_guard", os.path.join(os.path.dirname(os.path.abspath(__file__)), "japanese-guard.py")
)
jg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(jg)

CODE_BLOCK = re.compile(r"```.*?```", re.S)
QUOTED = re.compile(r"「[^」]*」")
INLINE_CODE = re.compile(r"`{3,}|`[^`\n]*`")
COMMANDISH = re.compile(r"\bgit (?:push|pull|merge)\b|\bcd [~/]|&&|\bgh pr merge\b|\bsudo\b|\brm -")
ASKS_TO_RUN = re.compile(
    r"(?:上|下|以下|次)の[^`\n]{0,15}(?:コマンド|push|command)"
    r"|(?:コマンド|command|push).{0,10}(?:を)?(?:実行|叩|貼|打)(?:って|して)(?:ください|ほしい|もらえ)"
)

REASON = (
    "このターンで利用者にコマンドの実行を頼んでいますが、チャット本文にコマンドがありません。\n"
    "{why}\n"
    "利用者が実行するコマンドを、今この本文に ```bash のコードブロックで出してください（1ブロック1コマンド、"
    "push ならリモートとブランチも書く）。wrap_up の recap やボタンに書いた分は、利用者にはコマンドとして見えていません。"
    "言い訳や原因の説明は書かないこと。"
)


def turn_slice(entries):
    start = 0
    for i, entry in enumerate(entries):
        if jg.is_user_turn(entry):
            start = i + 1
    return entries[start:]


def check_turn(turn):
    texts, wrap_inputs = [], []
    for entry in turn:
        if entry.get("type") != "assistant":
            continue
        for block in entry.get("message", {}).get("content") or []:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text":
                texts.append(block.get("text", ""))
            elif block.get("type") == "tool_use" and block.get("name", "").endswith("wrap_up"):
                wrap_inputs.append(json.dumps(block.get("input", {}), ensure_ascii=False))
    body = "\n".join(texts)
    if CODE_BLOCK.search(body):
        return None
    for w in wrap_inputs:
        m = COMMANDISH.search(w)
        if m:
            return f"wrap_up の中にだけコマンドがあります（「{m.group(0)}」）。"
    m = ASKS_TO_RUN.search(INLINE_CODE.sub("`c`", QUOTED.sub("", body)))
    if m:
        return f"本文で「{m.group(0)}」と書いていますが、コマンドのコードブロックがありません。"
    return None


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--check":
        entries = jg.read_entries(sys.argv[2])
        turn, n = [], 0
        for entry in entries + [{"type": "user", "message": {"content": "END"}}]:
            if jg.is_user_turn(entry):
                why = check_turn(turn)
                if why:
                    n += 1
                    print(f"--- {why}")
                turn = []
            else:
                turn.append(entry)
        print(f"差し戻し対象のターン: {n}")
        return
    data = json.load(sys.stdin)
    if data.get("stop_hook_active"):
        return
    path = data.get("transcript_path")
    if not path:
        return
    try:
        why = check_turn(turn_slice(jg.wait_for_final(path)))
    except OSError:
        return
    if why:
        print(json.dumps({"decision": "block", "reason": REASON.format(why=why)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
