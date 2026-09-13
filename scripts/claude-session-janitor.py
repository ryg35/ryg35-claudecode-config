#!/usr/bin/env python3
"""
定期タスク(scheduled-task)のセッションプロセスが、仕事を終えても常駐し続ける問題の掃除役。

背景 (2026-08-28 実測):
  na-sync は 15分ごとに走り、1回あたり 60〜120秒で正常完了する。
  ところが完了後もプロセスが残り、実測で 2.2〜16.3時間居座っていた。
  1本 約225MB。16時間で69本・16GBまで積み上がり、PhysMemの空きが59MBになった。
  Stopフック(persistent-mode.sh)は .ralph-active が無く不発、原因ではないことを確認済み。
  設定ファイルにもフックにも止める場所が無いアプリ側の挙動なので、外から刈る。

安全設計 (誤爆したら人の作業中セッションが飛ぶので、迷ったら殺さない):
  1. プロセス起動時刻とセッション記録の先頭タイムスタンプを突き合わせて紐付ける
  2. 一致が1本に定まらない(候補0本 or 2本以上)なら対象外
  3. 記録の中に <scheduled-task name=...> が在ることを確認できたものだけ対象
     ("対話セッションでないこと"では判定しない。在ることで判定する)
  4. 最後のイベントから IDLE_MIN 分たっているものだけ対象(作業中を殺さない)
  5. kill は必ずPID指定のSIGTERM。pkill/killall は使わない(他プロジェクトを巻き込む)
"""
import subprocess, json, glob, os, re, sys, datetime

IDLE_MIN = 15          # 最後のイベントからこれだけ経ったら終了扱い
MATCH_WINDOW = 45      # プロセス起動時刻と記録開始時刻の許容ずれ(秒)
LOG = os.path.expanduser("~/.claude/logs/session-janitor.log")

# jsonl の中では <scheduled-task name=\"na-sync\"> とエスケープされている。
# ここを name=" だけで書くと全件を対話セッションと誤判定し、一生掃除しない。
SCHED_RE = re.compile(r'<scheduled-task name=\\?"([^"\\]+)')
PS_RE = re.compile(r'\s*(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d+:\d+:\d+\s+\d{4})\s+(\d+)\s')


def live_sessions():
    out = subprocess.run(['ps', '-eo', 'pid=,lstart=,rss=,command='],
                         capture_output=True, text=True).stdout
    procs = []
    for line in out.splitlines():
        if 'claude-code/' not in line or 'MacOS/claude ' not in line:
            continue
        if 'disclaimer' in line:      # 親のラッパーは対象外
            continue
        m = PS_RE.match(line)
        if m:
            procs.append({
                'pid': int(m.group(1)),
                'start': datetime.datetime.strptime(m.group(2), '%a %b %d %H:%M:%S %Y'),
                'rss_mb': int(m.group(3)) // 1024,
            })
    return procs


def transcripts(max_age_h=48):
    """直近の記録だけ読む。開始時刻・最終イベント時刻・定期タスク名を返す。"""
    cut = datetime.datetime.now().timestamp() - max_age_h * 3600
    out = []
    for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
        try:
            if os.path.getmtime(f) < cut:
                continue
        except OSError:
            continue
        first = last = None
        kind = None
        try:
            with open(f, errors='ignore') as fh:
                for i, line in enumerate(fh):
                    if kind is None and i < 80:
                        m = SCHED_RE.search(line)
                        if m:
                            kind = m.group(1)
                    if '"timestamp"' in line:
                        try:
                            ts = json.loads(line).get('timestamp')
                        except Exception:
                            continue
                        if ts:
                            if first is None:
                                first = ts
                            last = ts
        except OSError:
            continue
        if not first:
            continue
        def parse(s):
            return (datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
                    .astimezone().replace(tzinfo=None))
        out.append({'file': f, 'sid': os.path.basename(f)[:8],
                    'first': parse(first), 'last': parse(last), 'kind': kind})
    return out


def main():
    dry = '--dry-run' in sys.argv or '-n' in sys.argv
    procs, sess = live_sessions(), transcripts()
    now = datetime.datetime.now()
    killed, kept, skipped = [], [], []

    # 双方向で一意なときだけ紐付けを信じる。
    # 片方向(プロセス→記録)だけだと、起動が近い別セッション2本が同じ記録に一致し、
    # 片方が誤って定期タスク扱いになる。実際に 13:10 開始の2本で発生した (2026-08-28)。
    match = {}
    for p in procs:
        cands = [s for s in sess
                 if abs((p['start'] - s['first']).total_seconds()) <= MATCH_WINDOW]
        match[p['pid']] = cands
    claims = {}
    for pid, cands in match.items():
        if len(cands) == 1:
            claims.setdefault(cands[0]['file'], []).append(pid)

    for p in procs:
        cands = match[p['pid']]
        if len(cands) != 1:                                   # 安全弁2a: 記録が定まらない
            skipped.append((p, '一致%d件' % len(cands)))
            continue
        s = cands[0]
        if len(claims.get(s['file'], [])) != 1:               # 安全弁2b: 記録の取り合い
            skipped.append((p, '記録%s を%dプロセスが共有' % (s['sid'], len(claims[s['file']]))))
            continue
        if not s['kind']:                                     # 安全弁3
            kept.append((p, s, '対話セッション'))
            continue
        idle = (now - s['last']).total_seconds() / 60
        if idle < IDLE_MIN:                                   # 安全弁4
            kept.append((p, s, '%s 作業中(%.0f分)' % (s['kind'], idle)))
            continue
        if not dry:
            try:
                os.kill(p['pid'], 15)                         # 安全弁5: PID指定のSIGTERM
            except ProcessLookupError:
                pass
            except PermissionError:
                skipped.append((p, '権限なし'))
                continue
        killed.append((p, s, idle))

    # backup-verification.md の原則: 「送った」ではなく受け側を数える。
    survivors = []
    if not dry and killed:
        import time
        time.sleep(3)
        for p, _, _ in killed:
            try:
                os.kill(p['pid'], 0)
                survivors.append(p['pid'])
            except OSError:
                pass

    freed = sum(p['rss_mb'] for p, _, _ in killed)
    stamp = now.strftime('%Y-%m-%d %H:%M:%S')
    lines = ["[%s]%s 生存%d / 回収%d (%dMB) / 温存%d / 判定不能%d"
             % (stamp, ' DRYRUN' if dry else '', len(procs), len(killed), freed,
                len(kept), len(skipped))]
    for p, s, idle in killed:
        lines.append("  kill  pid=%-6d %-9s %-22s %4dMB 放置%.0f分"
                     % (p['pid'], s['sid'], s['kind'], p['rss_mb'], idle))
    for p, s, why in kept:
        lines.append("  keep  pid=%-6d %-9s %s (%dMB)" % (p['pid'], s['sid'], why, p['rss_mb']))
    for p, why in skipped:
        lines.append("  skip  pid=%-6d %s (%dMB)" % (p['pid'], why, p['rss_mb']))
    if not dry:
        if survivors:
            lines.append("  !! SIGTERM後も生存: %s (次回に再試行)"
                         % ','.join(str(x) for x in survivors))
        elif killed:
            lines.append("  検証: 回収した%dプロセスの生存0を確認" % len(killed))
    text = "\n".join(lines)
    print(text)
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, 'a') as fh:
        fh.write(text + "\n")


if __name__ == '__main__':
    main()
