---
name: backup-verification
description: "バックアップ/同期の検証。(1)同期の仕組みを作る・変える (2).gitignore や .rsync-filter の除外パターンを編集する (3)クラウド(Drive/iCloud/Dropbox等)へ送る (4)「バックアップ済み」を前提に元を消す・移す・追跡から外す、の4つで必ず起動する。宣言してから受信側を数え、一致するまで完了と言うな。2026-08-16に同日2回: .gitignoreが画像533枚141MBを14ヶ月除外し、Driveは「最新の状態です」と言いながらTotal objects: 0だった。"
---

# Backup Verification（「表示」ではなく「数」で確認する）

同期ツールの成功表示は証拠にならない。**数えるまで、バックアップは存在しない。**

## Trigger

- 同期の仕組みを作る、変更する
- `.gitignore` / `.rsync-filter` など**除外パターン**を編集する
- クラウド（Google Drive / iCloud / Dropbox / OneDrive）へ送る
- 「同期済み」を前提に、**元データを消す・移す・追跡から外す**

最後が一番危ない。**検証せず元を動かした瞬間にデータが消える。**

## 絶対ルール

**1. 完了は受信側の件数で判定する。**「同期しました」「最新の状態です」は送信側の主張。
受信側に物が在る証明ではない。

```bash
rclone check <ローカル> <リモート> --one-way   # ハッシュ照合。差分0を確認
rclone size <リモート>                          # オブジェクト数とバイト数
git -c core.quotePath=false ls-files | grep -c <パターン>   # 追跡されている実数
```

数が合わないなら、**表示が何と言っていても失敗している。**
**2. 除外パターンを書いたら実数を数える。** `.gitignore` は**既に追跡中のファイルには
効かない**。狙い通り外れたか、巻き込みが無いかを `git ls-files` で数える。

**3. 検証前に元データを動かすな。** 順番は例外なく、コピー → **受信側を数えて一致確認** →
そのあとで元を消す・移す・追跡から外す。飛ばすと**どこにもデータが無い時間**ができる。

**4. 検証を仕組みに埋め込む。** スクリプト内で検証し、一致しなければ異常終了させる。
別コマンドにすると誰も打たない。実例 `~/.claude/scripts/sync-university-pdf.sh`
（`rclone copy` の後に `rclone check`、差分あれば exit 1）。

## Burn Log（2026-08-16、同じ日に2回踏んだ）

- **1回目**: 毎時 `vault backup` 14ヶ月・コミット1,247件で回っていると信じていた。
  `.gitignore` の `*.png` `*.jpg` `*.svg` で**画像533枚・141MBが1枚も入っていなかった**。
- **2回目**: 講義PDF 588MB を Drive デスクトップ版へ `rsync`。アプリは「最新の状態に
  なっています」、`rclone size` は **Total objects: 0 / Total size: 0 B**。CLI の書き込みを
  macOS の FileProvider が検知し損ね、Drive は同期済み判定で**再試行しない状態**。先に
  `git rm --cached` を打っていたら 588MB がどこにも無くなっていた。

共通構造は、表示を読んで中身を数えていないこと（`coding-style.md` の Self-Verification と
同型）。対処: `rclone` へ移行（Drive デスクトップに検証手段が無い）/ 検証をスクリプトに
埋め込み exit 1 / 除外を触ったら `git ls-files` で数える。

関連: `~/.claude/rules/coding-style.md`（Self-Verification）/
`~/.claude/scripts/sync-university-pdf.sh`（検証込み同期の実装例）
