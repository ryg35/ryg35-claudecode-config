# Claude Code Harness

Claude Code(`~/.claude/`)向けの設定一式(MIT)。作者が実際に使っている `~/.claude/` から個人情報を抜いて公開している。

## できること

- **`/vibe <task>` の1行で、計画 → TDD実装 → レビュー → 検証 → PR草案まで進む**
- **レビューを並列で回す**: 差分を見て必要なレビュアーだけを選び、Codex 2本と同時に走らせる。PR前でも、溜まったPRの一括処理でも同じ経路
- **危ない操作を実行前に止める**: main への直接push、force push、`gh repo create --push` などを hook がブロックする
- **書く側と審査する側でモデルを分ける**: 実装と計画は Codex(`gpt-6.1-sol`)、最終審査は Claude Opus。同じモデルに自己承認させない
- **新規プロジェクトの立ち上げ**: docs・CI・E2E の雛形を一括で作る
- **受入基準を先に固める SPEC駆動開発**: `specs/<NNN>-<slug>/` に spec / plan / tasks を置いて実装する

中身は command 20本、agent 32本、skill 27本、開発規範(`rules/`)、hook。全部入れても、欲しいファイルだけ持ち帰っても動く。

## はじめる

```bash
git clone https://github.com/ryg35/ryg35-claudecode-config.git ~/.claude
```

既に `~/.claude` があるなら、別の場所に clone して必要なファイルだけコピーする。

**導入前に読むこと:**

- `settings.json` は `Read(**)` / `Edit(**)` を許可し、deny リストと hook で守る設計。理解せずに入れると Claude にほぼ全権を渡すことになる
- 必要なツール: `jq`(hook)、`gh`(git系)、Codex CLI(Codex に回す処理)。Codex を使わないなら [`skills/plan/SKILL.md`](./skills/plan/SKILL.md) の Provider overrides と [`rules/agents.md`](./rules/agents.md) の Codex 節を外せば Claude だけで回る
- 作者の運用専用の hook が混ざっている(例: `scripts/public-export-reminder.sh`)。不要なら `settings.json` から外す
- プラグインは `codex@openai-codex` 以外すべて無効。skill の説明文はシステムプロンプトの約16,000文字の枠を取り合うため([anthropics/claude-code#13099](https://github.com/anthropics/claude-code/issues/13099))

## 覚えるのは5つ

| Command | いつ使う | 何が起きる |
|---------|---------|-----------|
| [`/project-init`](./commands/project-init.md) | プロジェクトの立ち上げ | 聞き取り → repo 準備 → docs 生成 → CI / E2E の雛形 |
| [`/vibe`](./commands/vibe.md) | 実装タスク1件 | 同期 → 計画 → TDD → レビュー → 検証 → E2E → docs 同期 → PR草案 |
| [`/pre-pr-review`](./commands/pre-pr-review.md) | PRを作る前 | ローカル差分をレビュー。直す範囲は毎回訊く |
| [`/commit-push`](./commands/commit-push.md) | remote に送る | ブランチ名の確認 → commit → push → PRを作るか確認 |
| [`/review-prs`](./commands/review-prs.md) | PRが溜まったとき | オープンPRを番号順にレビューし、修正して出す |

```
/project-init → /vibe <task> → /pre-pr-review → /commit-push → (merge待ち) → /review-prs
```

レビューの実装は [`skills/code-review`](./skills/code-review/SKILL.md) の1本だけで、`/pre-pr-review` `/review-prs` `/vibe` はその入口にすぎない。

## 重い判断のとき

日々の小タスクには使わない。認証・schema migration・公開API など戻しにくい変更のときだけ。

| 手段 | 用途 |
|------|------|
| `plan` skill の `--consensus` | Planner → Architect → Critic の合議で計画を詰める([`skills/plan`](./skills/plan/SKILL.md)) |
| `codex-converge` | 計画書や ADR を Codex 3本のレビューに、2回続けて重大指摘ゼロになるまで通す([`skills/plan/references/codex-converge`](./skills/plan/references/codex-converge/SKILL.md)) |
| `/spec-driven` | 受入基準が曖昧なまま複数ファイルに手を入れるとき([`skills/spec-driven`](./skills/spec-driven/SKILL.md)) |

## 設計の考え方

```
Claude Code (~/.claude/)          Codex CLI (~/.codex/)
入口・判断・最終審査               実装・計画・レビュー
opus 5.5                          gpt-6.1-sol
```

- すべての実装は、書いたのとは別のモデルがレビューする前提で作っている
- 最終審査(Critic)だけは Claude Opus に固定。計画を Codex が書いても、審査は別の目で行う
- 同じ手順を2箇所に書かない。command の多くは中身を持たず、agent か skill に処理を渡すだけ

原則は [`CLAUDE.md`](./CLAUDE.md) と [`ETHOS.md`](./ETHOS.md)。

## ディレクトリ

| 場所 | 中身 |
|------|------|
| [`commands/`](./commands/) | slash command(補助の `/tdd` `/verify` `/e2e` `/changelog` なども含む) |
| [`agents/`](./agents/) | subagent 定義。一覧は [`rules/agents.md`](./rules/agents.md) |
| [`skills/`](./skills/) | 必要なときだけ読まれる手順書 |
| [`rules/`](./rules/) | 常に読まれる開発規範(coding-style / security / git-workflow / voice ほか) |
| [`hooks/`](./hooks/) + [`scripts/`](./scripts/) | tool 実行の前後やセッション開始時に走る script |
| [`templates/`](./templates/) | `/project-init` が docs を作るときの雛形 |
| [`handoff/`](./handoff/) | セッション間の引き継ぎ規約(README のみ公開) |

## 含まれないもの

- 別途インストールする skill パック(plaud系、Cloudflare公式、issue-filer など)
- `security-audit` skill。[cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) から入れる
- `statusline-command.sh`(環境ごとに生成する)、`.claude.json`・`cache/`・`sessions/` などローカルの状態

## Contributing

Issue / PR 歓迎。特に hook のすり抜け(再現コマンド付き)、agent / skill が期待どおりに発火しない例、Linux や Codex なし環境での動作報告。大きな構造変更は先に Issue で相談してほしい。

## ライセンスと出典

自作部分は [MIT License](./LICENSE)。以下の外部プロジェクトの文章やコードが残っているファイルを含み、それぞれ元のライセンスに従う。ファイル一覧、著作権表示、ライセンス本文は [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) にまとめた:

| 由来 | 対象 |
|------|------|
| [garrytan/gstack](https://github.com/garrytan/gstack) (MIT) | `ETHOS.md`、`rules/voice.md`(翻訳翻案)、`skills/ask-brief`、`rules/coding-style.md` の Confusion Protocol 節 |
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (MIT) | agents: analyst / critic / designer / document-specialist / executor / scientist / verifier。skills: ai-slop-cleaner / deep-dive / deepinit / plan(references/deep-interview を含む) / ralph(references/ultrawork を含む) / team |
| [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) (MIT) | agents: architect / build-error-resolver / code-explorer / code-reviewer / code-simplifier / doc-updater / e2e-runner / harness-optimizer / planner / security-reviewer / silent-failure-hunter / tdd-guide / typescript-reviewer。skills: agent-introspection-debugging / config-gc / deep-research / eval-harness / security-review / strategic-compact |
| [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) (MIT) | agents: chaos-engineer / error-detective / sre-engineer |
| [obra/superpowers](https://github.com/obra/superpowers) (MIT) | `skills/skill-authoring`、`agents/verifier.md` の言い訳防止表 |
| [minorun365/claude-code-japanese-guard](https://github.com/minorun365/claude-code-japanese-guard) (Apache-2.0) | `hooks/japanese-guard.py`(無改変。LICENSE / NOTICE は同じディレクトリ) |
