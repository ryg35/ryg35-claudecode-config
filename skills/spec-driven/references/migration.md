# 既存リポジトリを specs/ へ移す

`SKILL.md` の「7.3 既存リポジトリを specs/ へ移す」の実体。SKILL.md 側には状況判定の1問しか置いていない。
`docs/plan/<verb>-<topic>.md` や `docs/specs/*.md` で動いている作業を、
`specs/<NNN>-<slug>/` の3点セット (spec.md + plan.md + tasks.md) へ割り直すときの手順・対応表・検証コマンドが全部ここにある。

**実測 (2026-08-17)**: `<dev-root>` 配下で `specs/` と `docs/plan/` の両方を持つリポジトリは **0件**。
`specs/` を持つのは `chrome-extensions/repo-A` と `repo-B` の2つだけで、どちらも `docs/plan/` が無い。
`docs/plan/` を持つ17箇所には `specs/` が無い。**つまり本当の二重化 (状況3) は現時点で該当ゼロ。**
別枠で `docs/specs/*.md` を持つリポジトリが5つある (`agent-company` / `agent-company-plan2a-heartbeat-ttl` /
`2b` / `2c` / `hackathon-agent`、中身はどれも `agent-config-ui.md` と `cliphub-plan.md` の2ファイル)。
`~/.claude/rules/directory-conventions.md` Rule 6 の置き場でも3点セットでもないので、状況1と同じ扱いにする。

まず数える。該当しなければ何もしない。

## 状況判定 (1問で決める)

```bash
ls -d specs docs/plan docs/specs 2>/dev/null
```

- `specs/` だけ → 移行不要。既に規約どおり
- `docs/plan/` だけ、または `docs/specs/` だけ → **状況1**
- 両方ある → もう1問。「その `specs/<NNN>-<slug>/` と `docs/plan/<file>.md` は**同じ作業**か」
  - 別の作業 → **状況2** (共存。畳まない)
  - 同じ作業 → **状況3** (二重化。片方を畳む)

「同じ作業か」も数えられる事実で決める。次のどれか1つでも当たれば同じ作業とみなす。

```bash
# a. 片方がもう片方を参照している
grep -l 'specs/[0-9]\{3\}-' docs/plan/*.md
grep -rl 'docs/plan/' specs/*/

# b. 触るソースファイルの集合が1つ以上重なる
comm -12 \
  <(grep -ohE '[A-Za-z0-9_/.-]+\.(ts|tsx|js|py|rs|go|md)' docs/plan/<file>.md | sort -u) \
  <(grep -ohE '[A-Za-z0-9_/.-]+\.(ts|tsx|js|py|rs|go|md)' specs/<NNN>-<slug>/plan.md | sort -u)

# c. frontmatter の branch が一致する
grep -h '^branch:' docs/plan/<file>.md specs/<NNN>-<slug>/spec.md
```

## 状況1: `docs/plan/` しか無く、これから SPEC駆動に移りたい

既存の1ファイルを spec / plan / tasks の3つへ割り直す。対応表は
`~/.claude/templates/plan/_template-feature.md` の実物の節と、`references/*.md` の実物の節の写像。

| `_template-feature.md` の節 | 移す先 | 移した先の節 |
|---|---|---|
| frontmatter `status` / `branch` | spec.md | frontmatter (同じ2キーのまま。directory-conventions.md Rule 5 の lifecycle を流用) |
| `# 実装計画: {タイトル}` | spec.md | `# spec.md ... <機能名>` |
| `## 概要` | spec.md | `## 概要 / 解決したい課題` |
| `## 要件` > `### 機能要件` の `- [ ]` | spec.md | `## Functional Requirements (EARS)` の `FR-00N`。EARS 6パターンに書き直す。技術名は落として plan.md へ (SKILL.md 規則1) |
| `## 要件` > `### 非機能要件` | spec.md + plan.md | 数値目標は spec.md `## Success Criteria` の `SC-N`、実現手段側の配分は plan.md `## 3.2 タイミング予算` |
| `## 要件` > `### ビジュアル要件` | spec.md + plan.md | 画面から観測できる Before/After は spec.md `## Acceptance Scenarios` (AS-N)、色や余白の指定値は plan.md `## 2. アーキテクチャ` |
| `## アーキテクチャレビュー` > `### 影響するコンポーネント` | plan.md | `## 0. 参照した既存実装` と `## 2. アーキテクチャ` |
| `## アーキテクチャレビュー` > `### 依存関係` | plan.md | `## 5. 外部依存との接続設計` |
| `## 実装ステップ` > `### Phase N` | tasks.md | `## Phase N` の `### T-0NN`。1 Step を 1 T にしない。test と impl に割る (SKILL.md 規則3) |
| `## データモデル変更` | plan.md | `## 4. 中核ロジックの方式選定`。型定義は実装の領分なので spec.md には書かない |
| `## エッジケースとリスク` | spec.md + plan.md | ユーザーから見える異常系は spec.md `## Edge Cases` の `EC-N` と対応する FR、開発側のリスクは plan.md `## 10. リスクと未決事項` の `R-N` |
| `## テスト戦略` | plan.md + tasks.md | 方針は plan.md `## 8. テスト戦略`、個々のケースは tasks.md の `[test]` タスク |
| `## 備考` | spec.md + plan.md | 前提は spec.md `## Assumptions` の `ASM-N`、棄却した案は plan.md `### 棄却した選択肢` |

**移し先が無い節は1つも無い。逆に、移行元に無い節が4つある。**
`## User Stories` (US-N) / `## Acceptance Scenarios` (AS-N) / `## Success Criteria` の数値 /
tasks.md の `## タスク一覧` のトレーサビリティ列。plan テンプレートに存在しないので、写経では埋まらない。
**この4つが SPEC駆動で増える部分の全て。** ここを飛ばすと、置き場を変えただけで受入基準は言語化されないまま。

手順。

1. `<NNN>` を決める。`ls specs/ 2>/dev/null` の最大値 +1、無ければ `001`。`<slug>` は元ファイル名の `<topic>` をそのまま使う (ブランチ名と揃う)
2. 対応表どおりに3ファイルへ割る。空欄を残さない。判断できない項目は `[要確認: ...]` を置く
3. SKILL.md Step 2 の clarify ゲートを必ず通す。元の `- [ ]` に「速い」「適切に処理する」が残っていたら EARS に直す
4. SKILL.md Step 5 で T を採番する。`T-001` から。元の Phase 番号は引き継がない
5. SKILL.md Step 6 の analyze ゲートを通す。移行直後は3ファイル間の食い違いが一番出やすい

ファイル操作は**ユーザーが実行する。skill も AI も実行しない** (`~/.claude/CLAUDE.md` の `<file_deletion>`)。
提示して止まる。

```bash
mkdir -p specs/001-<slug> docs/plan/done
git mv docs/plan/<verb>-<topic>.md docs/plan/done/<verb>-<topic>.md   # Rule 5 の lifecycle
```

`rm` は使わない。元ファイルを消すと、移し損ねた節を後から取り戻せない。
`docs/plan/done/` に残っていれば diff で照合できる。

## 状況2: 両方あるが、別の作業を指している

移行ではない。共存が正しい。**何もしない。**

やることは1つだけ。今後どちらに書くかを directory-conventions.md Rule 6 の表で決めて、**両方のファイルに1行メモを置く**。

```markdown
<!-- docs/plan/<file>.md の冒頭 -->
- 別作業: `specs/<NNN>-<slug>/` は無関係な作業。畳まない
```

書かないと、次に見た人 (3か月後の自分) が二重化と誤読して片方を畳む。

## 状況3: 両方が同じ作業を指している (本当の二重化)

どちらを正とするか、上から順に評価して**最初に当たったところで確定する**。数えられる事実だけを使う。

1. **実装が既に始まっているほう**が正。`git log --oneline -20 -- <両者が触るソースファイル>` を取り、
   commit メッセージが片方の ID (`T-0NN` / `FR-00N`) を参照していれば、その側
2. **`specs/<NNN>-<slug>/spec.md` の frontmatter が `status: in-progress` または `done`** → specs/ 側が正。
   SKILL.md 規則4 の3点セット規律が既に効いているので、後から巻き戻すと変更履歴が消える。
   frontmatter が無い spec (実測: 既存2件が該当) は本文の `- ステータス:` 行を代わりに読む
3. **参照している ID の数が多いほう**が正。
   `grep -cE '(US|AS|FR|SEC|SC|EC|ASM)-[0-9]+' specs/<NNN>-<slug>/spec.md` と
   `grep -cE '^- \[[ x]\]' docs/plan/<file>.md` を比べる
4. **最終更新が新しいほう**が正。`git log -1 --format=%cI -- <path>` を両方で取る。
   ファイルの mtime は使わない。checkout で動く
5. 4つとも同点 → **`specs/` 側を正にする。** 3点セットのほうが受け皿の節が多く、
   逆向き (specs → docs/plan) の移行は必ず情報を捨てる

決めたら、**負けた側に在って勝った側に無い節を先に写す。** 畳んでから気づいても遅い。
そのうえで負けた側を畳む。コマンドはユーザーが実行する。

```bash
# specs/ が正のとき
git mv docs/plan/<verb>-<topic>.md docs/plan/done/<verb>-<topic>.md
```

`docs/plan/` が正のときは、**spec ディレクトリを移動も削除もしない** (連番とブランチ名の対応が壊れる)。
`spec.md` の frontmatter を `status: backlog` に戻し、`## 着手の前提` に
「この作業は `docs/plan/<verb>-<topic>.md` で進行中」と書く。

## 移行しない判断も正当

動いている `docs/plan/` を触るコストのほうが高い場合がある。
残りが `- [ ]` 3個なら、移行に使う時間で残り3個が終わる。**次の作業から `specs/` にする**、で十分。
移行はリポジトリ単位ではなく作業単位でよい。

## 移行後の検証 (「移行した」と「移行できている」は別の状態)

`~/.claude/rules/backup-verification.md` と同じ思想。**表示ではなく数で確認する。**
宣言しただけのものは通っていない。

```bash
# 1. 3点セットが揃っているか (期待: 3)
ls specs/<NNN>-<slug>/{spec,plan,tasks}.md 2>/dev/null | wc -l

# 2. docs/plan/ 側に同じ作業の残骸が無いか (期待: 出力なし)
grep -l '<slug>' docs/plan/*.md 2>/dev/null

# 3. tasks.md が spec.md に実在しない ID を指していないか (期待: 出力なし)
comm -13 \
  <(grep -ohE '(US|AS|FR|SEC|SC|EC|ASM)-[0-9]+' specs/<NNN>-<slug>/spec.md | sort -u) \
  <(grep -ohE '(US|AS|FR|SEC|SC|EC|ASM)-[0-9]+' specs/<NNN>-<slug>/tasks.md | sort -u)

# 4. vibe が拾うか (期待: tasks.md のパスが出て、status 行も出る)
ls specs/*/tasks.md
grep -m1 '^status:' specs/<NNN>-<slug>/spec.md
```

4 で2行目まで見る理由: `/vibe` は `specs/*/tasks.md` を Glob したあと、
**`spec.md` の frontmatter から `status` を読む** (`~/.claude/commands/vibe.md:96`)。
frontmatter が無い spec は Glob には出るが status が読めない。
実測 (2026-08-17): 既存2件 (`repo-A/specs/001-side-preview-translation/spec.md`、
`repo-B/specs/002-remote-mcp-and-cloudflare/spec.md`) はどちらも YAML frontmatter を持たず、
本文の `- ステータス: 確定` で状態を書いている。移行で作る spec.md には
`references/spec-template.md` どおり frontmatter を置く。

3 で出力が出たら、それは spec.md に無い ID を tasks.md が参照している状態。SKILL.md Step 6 の analyze ゲートに戻る。
