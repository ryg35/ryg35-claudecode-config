---
name: meeting-5p
version: 1.0.0
description: "Structure every meeting with the 5P framework (Purpose / Payoff / Probable Issues / Process / Participants) BEFORE the meeting happens. Use when the user says '5Pを詰めたい', '会議の準備', 'アジェンダ作って', 'ミーティングの目的を整理したい', or mentions an upcoming meeting they need to prepare for. Meetings prepared without 5P drift into idea-sprawl and end with no owners or deadlines. Every time."
---

# meeting-5p

会議の前に5P（Purpose / Payoff / Probable Issues / Process / Participants）を必ず詰める。
テンプレートのマスターは `~/.claude/templates/meeting-5p.md`。**内容を再発明せず、必ずマスターからコピーして埋める。**

## Trigger (MANDATORY)

ユーザが会議・ミーティングの準備、アジェンダ作成、議題整理に言及したら、このスキルを使うことを1行で宣言してから始める:
「meeting-5p を使って5Pを詰めます」

宣言せずにアジェンダ風の箇条書きを出し始めるのは禁止。5Pなしで作ったアジェンダは
「話す項目リスト」にしかならず、担当と期限が決まらないまま終わる。毎回そうなる。

## Workflow

1. `~/.claude/templates/meeting-5p.md` を読む（このSKILL.mdの記憶で代用しない。テンプレートが更新されている可能性がある）
2. 既知の文脈（Vault内の議事録、直近の会話）から埋められるPを先に埋める
3. 埋まらないPだけをユーザに質問する。**質問は1メッセージにバッチ**（`~/.claude/CLAUDE.md` question_batching に従う）
4. 完成した5Pを、対象プロジェクトのミーティングフォルダ（例: `<Vault>/projects/<PJ>/meetings/`）に保存する。保存先が不明ならユーザに確認する
5. 会議後に議事録が来たら、同じファイルの「議事録」セクションに追記し、Payoffの各項目が実際に決まったかを ✅/❌ で判定して見せる

## Quality gates (no exceptions)

- **会議名は「〜について」禁止**。決めることを文で書く（例: 「販売開始ゲート・担当・期限を確定する」）
- **Payoffは「決まっている状態」の箇条書き**で書く。判定不能なPayoff（「認識を合わせる」等）はそのまま採用せず、「何が決まれば合ったと言えるか」を問い返す
- **Probable Issuesは最低3つ**。空欄のまま出さない。過去の会議の脱線パターン（アイデアへの発散、細部実装の議論、担当・期限が決まらず終了）を流用してよい
- **Processの最後は必ず「決定内容の読み上げ」**（未解決事項 / 次回確認日 / 主要期日）
- **Participantsは判断責任つき**で書く。「参加する人」ではなく「何を決める人」か

## Related

- Template master: `~/.claude/templates/meeting-5p.md`
- 初出: 2026-08-02 の社内会議で運用開始。以後すべての会議に適用
