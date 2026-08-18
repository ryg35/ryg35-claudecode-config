# Claude Code Harness

Claude Code(`~/.claude/`)向けのハーネス設定一式(OSS / MIT)。日々の開発を少数の**オーケストレーションcommand**に集約し、agent・skill・防御hookでガードレールを敷いて回すための構成。そのまま導入しても、部品単位で自分の `~/.claude/` に持ち帰っても使える。

**入っているもの:**

- **オーケストレーションcommand 5本**: `/project-init` `/vibe` `/pre-pr-review` `/commit-push` `/review-prs`。日々の開発はほぼこの5つで完結する
- **specialized agent 36本**: planner / architect / tdd-guide / security-reviewer / tracer など。実装と審査を別モデル系統に分ける分業前提の構成
- **skill群**: 合議計画(`ralplan`)、Codex収束レビュー(`codex-converge`)、持続実行(`ralph` / `ultrawork`)ほか
- **防御hook**: `scripts/pre-tool-enforcer.sh` がコマンドをトークナイズ解析し、main直push・force push・`gh repo create --push` 等を前方一致denyでは防げない形まで含めてブロック
- **開発規範(`rules/`)とテンプレート**: coding-style / testing / security / git-workflow、Burn Log(同じ失敗を2回したらルール化)などの運用規約

実運用中の `~/.claude/` からサニタイズして公開しているスナップショットであり、思想が強めのopinionatedな構成。まず「そのまま使う前に読むこと」(下記)を読んでから導入してほしい。

---

## 最初に知っておくべきこと

このリポジトリの設計は1つの分業モデルに基づく。

```
Claude Code (~/.claude/, ここ)     Codex CLI (~/.codex/)
─────────────────────             ─────────────────────
入口・計画・レビュー役              実装役(Sol軸)
sonnet → 大枠の判断                gpt-5.6-sol → 実装 / plan / architect
opus → Critic(独立reviewの要)      terra/luna → 軽量・機械的作業のみ
```

- **すべての実装は、実装者とは異なるモデル系統による独立reviewを前提に書かれている。** 時間より品質を優先する思想で運用している(詳細は [`CLAUDE.md`](./CLAUDE.md))
- **実装・計画フェーズは基本的にCodex(`gpt-5.6-sol`)に委譲する。** コストは制約にしない。速度と正確性のトレードオフだけを見る。`plan`のPlanner/Architect passや、`ralph`/`ultrawork`/`team`の実装stepは `Bash("codex exec -m gpt-5.6-sol ...")` をデフォルト経路として呼ぶ
- **Critic(最終審査)だけはデフォルトでClaude Opusのまま残す。** PlannerやArchitectがSolで動いても、同じモデル系統に自己承認させると見落としが起きやすい(self-preference bias)。独立した目で見るのがCriticの存在意義。`--critic codex` で明示的にSolへ切り替えることもできるが、速度を独立性より優先する時だけの opt-in
- 役割分担の一次情報源は **Routing (Sol-centric)** セクションを持つ [`agents/<name>.md`](./agents/)(全agentのうち実装寄りの一部)と [`skills/plan/SKILL.md`](./skills/plan/SKILL.md) の Provider overrides

---

## まず覚えるのはこの5つ

この5commandだけ覚えれば、日々の開発はほぼ完結する。内部で必要なagent・skill・他commandを自動的に呼び出すため、個別の細かいcommandを直接叩く必要はほとんどない。

| # | Command | いつ使う | 何が起きる |
|---|---------|---------|-----------|
| 1 | [`/project-init`](./commands/project-init.md) | 新規 or 既存プロジェクトの立ち上げ | インタビュー → repo setup → docs生成 → CI/E2E scaffold を一括 |
| 2 | [`/vibe`](./commands/vibe.md) | 実装タスクの開始から完了まで | fetch-pull → plan → TDD → build/test → E2E(条件付き) → docs同期 → PR草案 を一気通貫 |
| 3 | [`/pre-pr-review`](./commands/pre-pr-review.md) | PRを作る前の最終チェック | self-review でCodex reviewに備えて弱点を潰す |
| 4 | [`/commit-push`](./commands/commit-push.md) | 変更をremoteに送る | ブランチ名ゲート → stage → commit → push → PR作成の意思確認 |
| 5 | [`/review-prs`](./commands/review-prs.md) | 溜まったPRを捌く | オープンPRを順に review → 修正パイプラインへ流す |

### 標準の流れ

```
(新規プロジェクト)    /project-init
                          ↓
(日々の実装サイクル)  /vibe <task>
                          ↓
                     /pre-pr-review
                          ↓
                     /commit-push
                          ↓
                     (GitHubでmerge待ち)
                          ↓
(PRが溜まったら)      /review-prs
```

`/vibe` が中心。ほとんどのタスクはここから始まり、内部で plan / TDD / build-fix / e2e / doc-update / pr-create までを順次呼び出す。

「決定が hard to reverse」(認証 / schema migration / 公開API / 破壊的変更) な時、または「実装前に plan を限界まで磨きたい」時は `/ralplan` や `/codex-converge` を使う(詳細は下記「各commandの要点」)。日々の小タスクには重すぎるので、必要な場面でだけ起動する。

---

## 各commandの要点

### `/project-init` — プロジェクト立ち上げ

新規 / 既存どちらにも対応。

- インタビューで tech stack と目的を確認
- `repo-scaffolder` が git init / ディレクトリ作成 / `.gitignore` を用意(既存ファイルは**絶対に上書きしない**)
- `architect` が `docs/architecture/architecture.md` を下書き
- `project-doc-gen` が [`templates/PROJECT-SEED.md`](./templates/PROJECT-SEED.md) に沿って `docs/` 全体を生成
- `ci-gen` が `.github/workflows/*.yml` を作成(UI stackなら `e2e.yml` も)
- UI frameworkを検出したら `e2e-runner` がPlaywright scaffold を追加

### `/vibe` — 実装パイプライン

タスク1件を最初から最後まで運ぶメインcommand。フェーズ構成:

1. **fetch-pull** — mainを最新化
2. **plan** — `planner` agentで計画、ユーザ承認で `status: active` に
3. **TDD実装** — `tdd-guide` agent主導。**テストを書き換えて突破することは明示禁止**
4. **build/test** — 失敗したら `build-error-resolver` で自動修復(テスト改竄は同じく禁止)
5. **E2E(条件付き)** — 既存の `playwright.config.*` または `tests/e2e/` があり、かつ UI/route変更が含まれる場合だけ走らせる。無ければskip
6. **docs同期** — `doc-updater` で変更点をdocs/に反映
7. **Ship gate** — 承認後にPR作成 → plan を `done` に遷移 → `docs/plan/done/` へ `git mv`(planは `backlog → active → in-progress → done` の4状態を通り、完了後も削除せず履歴として保持)

### `/pre-pr-review` — PR前self-review

Codexの独立reviewに晒される前提の緊張感を持って、自分の変更を厳しく見直すためのcommand。

- 仕様との齟齬 / エラーハンドリング / テストの薄さ / セキュリティ / 未使用コード / コメント品質などを点検
- 必要に応じて `code-reviewer` `typescript-reviewer` `security-reviewer` `silent-failure-hunter` を起動

### `/commit-push` — 安全なcommit & push

- **ブランチ名ゲート**: main/masterなら新ブランチ作成を促す。変更内容とブランチ名が一致しない場合は `AskUserQuestion` で停止
- `git add .` の前に `git status` で再確認
- commit message は英語1文、body は不要時は書かない
- push後に **PR作成の意思確認ゲート**(必須)

### `/review-prs` — 溜まったPRを捌く

- オープンなPRを列挙し、順に review → 修正 → push を回す
- 内部で `skills/code-review`(特化agent群) と `/build-fix` 等を呼び出す

### `/ralplan`: Planner→Architect→Critic の多視点合議で plan を詰める

`/plan --consensus` のシュートカット。vague な `ralph X` `team X` を **gate** として intercept する役目も持つ。

- **Planner** が初版plan + RALPLAN-DR summary(Principles / Drivers / Options 各 pros/cons)。デフォルトCodex(`gpt-5.6-sol`)
- **Architect** が steelman antithesis、trade-off tension を提示。デフォルトCodex(`gpt-5.6-sol`)
- **Critic** が testability / risk mitigation / 代替案探索の十分さを判定。デフォルトClaude Opus固定(独立reviewの要、Solでの自己承認を避ける)
- APPROVE になるまで Planner → Architect → Critic を **最大5 iter** 反復(sequential、parallel ではない)
- `--deliberate` で pre-mortem (3シナリオ) + 拡張テスト計画 (unit / integration / e2e / observability) を強制
- `--planner claude` / `--architect claude` でCodexからClaude Opusに戻す、`--critic codex` でCriticだけ独立性より速度を優先してCodexに切り替える(いずれもopt-in)
- `--with-codex` で APPROVE 後に **`/codex-converge` を自動接続** (下記)

### `/codex-converge` — Codex 独立reviewで docs を限界まで磨く

単一 docs (plan / ADR / RFC / spec) に対して Codex 3本 (standard / adversarial / spec-diff) を並列起動し、指摘を反映して再 review、を繰り返す。

- **終了条件**:
  - CONVERGED: **連続2ラウンド P1=0** (1回clean では止めない、flakyな見落としを吸収)
  - MAX-ROUNDS: `--max-rounds 15` 到達
  - STUCK: 同じP1が **3ラウンド連続** で残る → ユーザに escalate
  - USER STOP: 各ラウンド末の AskUserQuestion で停止選択 (`--auto` で skip)
- **severity**: `--severity P0|P1|P2` (default P1)。 P0 only で軽量、P2 で strict
- **opt-in flag**: `--no-adversarial` / `--no-spec-diff` で reviewer を絞れる
- 単体使用 (`/codex-converge docs/plan/xxx.md`) と `/ralplan --with-codex` 経由の自動起動の両対応
- 出力: 各ラウンドの Codex 出力 (`/tmp/codex-converge-*-r<N>-*.md`) + 収束テーブル(R毎の P1 件数) を chat に提示

---

## 補助commandとagent

上記5つの裏で呼び出されるが、単体でも使える。

### 補助command(単体でも使用可)

| Command | 用途 |
|---------|------|
| `/plan` | 実装計画のみを作る(vibeの外で計画だけ欲しい時、1 pass) |
| `/codex-converge` | 単一docs(plan / ADR / RFC)を Codex 3本収束ループで磨く(連続2R P1=0で停止) |
| `/tdd` | Red-Green-Refactor の実装のみ(80%閾値を下回るファイルのcoverage sweep込み) |
| `/fetch-pull` | mainの最新化だけ |
| `/pr-create` | PR本文をcommit履歴から生成 |
| `/update-docs` | docs/ と codemap を実コードから同期(codemapを飛ばすなら `--skip-codemaps`) |
| `/harness-audit` | このハーネス自体を `harness-optimizer` agentでscoring |
| `/changelog` | conventional commitsから CHANGELOG.md を生成 |
| `/dependency-check` `/conflict-check` `/smoke-test` | 単発の健全性チェック |

### 代表的なagent

| Agent | 役割 |
|-------|------|
| `planner` | 実装計画の立案 |
| `architect` | アーキテクチャ設計 |
| `tdd-guide` | TDD enforcement、**テスト改竄の検出と拒否** |
| `code-reviewer` / `typescript-reviewer` / `security-reviewer` / `silent-failure-hunter` | レビュー各種 |
| `build-error-resolver` | ビルド/型エラーの最小修正 |
| `e2e-runner` | Playwright scaffold と実行 |
| `doc-updater` | docs/ と codemap の更新 |
| `refactor-cleaner` | 死にコード削除 |
| `chaos-engineer` / `sre-engineer` / `error-detective` | resilience 3-pack |
| `harness-optimizer` | `~/.claude/` のauditと改善提案 |

全agentの一覧は [`rules/agents.md`](./rules/agents.md)、個別定義は [`agents/<name>.md`](./agents/)。

---

## ディレクトリ構成

| ディレクトリ | 役割 |
|------|------|
| [`commands/`](./commands/) | slash command 定義(`/vibe` `/project-init` 等) |
| [`agents/`](./agents/) | specialized subagent 定義 |
| [`skills/`](./skills/) | Progressive Disclosureで呼ばれる知識パッケージ(例: `vercel-react-best-practices`) |
| [`rules/`](./rules/) | 常時ロードされる開発規範(coding-style / testing / security / git-workflow 等) |
| [`templates/`](./templates/) | プロジェクト初期化seed。[`PROJECT-SEED.md`](./templates/PROJECT-SEED.md) が単一のsource of truth |
| [`hooks/`](./hooks/) + [`scripts/`](./scripts/) | PreToolUse / PostToolUse / Stop 等で走るshell/python script |
| [`handoff/`](./handoff/) | セッション間ハンドオフ規約(実データは非公開、README のみ公開) |
| [`CLAUDE.md`](./CLAUDE.md) | 全プロジェクト共通の核となる原則 |
| `settings.json` | permissions / hooks / MCP / statusline 設定 |

---

## セットアップ

このリポは `~/.claude/` 配下をそのまま保持する構成。

```bash
# まるごと導入 (~/.claude が未作成の場合)
git clone https://github.com/ryg35/ryg35-claudecode-config.git ~/.claude

# 既存の ~/.claude を残したい場合は任意の場所にcloneしてsymlink
git clone https://github.com/ryg35/ryg35-claudecode-config.git ~/dotfiles/claude
ln -s ~/dotfiles/claude ~/.claude
```

まるごとではなく**部品単位で取り込むのも正攻法**。`agents/` `skills/` `commands/` の各ファイルは独立して動くので、欲しいものだけ自分の `~/.claude/` にコピーすればいい。ただし `settings.json` の hooks に依存するもの(pre-tool-enforcer 等)は対応する hooks 設定も一緒に持っていくこと。

自分用に育てていくなら fork を推奨。Codex CLI 前提のモデルルーティング(冒頭の分業モデル)は、Codex を使わないなら `skills/plan/SKILL.md` の Provider overrides と `rules/agents.md` の Codex 節を外せば Claude 単体でも成立する。

secret系やローカル固有の状態(`.claude.json`, `cache/`, `sessions/`, `todos/` 等)は `.gitignore` で除外済み。

### そのまま使う前に読むこと

- **`settings.json` の permissions は攻めた構成。** `Read(**)` / `Edit(**)` を許可し、denyリストと hooks(`scripts/pre-tool-enforcer.sh` 等)をガードレールにする設計。この前提を理解せずに流用すると、Claudeにほぼフル書き込み権限を渡すことになる。導入前に `permissions` セクションと deny リストを必ず読むこと
- **前提ツール**: `jq`(hooks必須)、`gh`(git系skill)、Codex CLI(`codex-*` scripts / second-opinion)、`cmux` / `yazi`(statusline・ペイン連携、無くても他は動く)
- **含まれないもの**: インストール由来スキルパック(plaud系、Cloudflare公式11本 等)と一部スキル(deployment-automation / expo-deployment / find-skills / supabase-postgres-best-practices)は別途インストール前提で、このリポには実体を含まない
- `statusline-command.sh` は生成物のため未収録。statusline は各自の環境で再生成が必要

---

## 関連ドキュメント

- [`CLAUDE.md`](./CLAUDE.md) — 全プロジェクト共通原則(Codex review前提、品質優先、Output Language等)
- [`rules/`](./rules/) — coding-style / testing / security / git-workflow / performance / agents
- [`templates/PROJECT-SEED.md`](./templates/PROJECT-SEED.md) — docs生成の単一source of truth
- [`handoff/README.md`](./handoff/README.md) — セッション間ハンドオフ規約(memory は使わない方針)

## Contributing

Issue / PR 歓迎。特に歓迎するもの:

- hook・enforcer のすり抜けパターン報告(再現コマンド付きだと最高)
- agent / skill の発火条件が期待とずれるケース
- 他環境(Linux / Codex なし構成)での動作報告

このリポは作者の実運用 `~/.claude/` のサニタイズ済みスナップショットとして更新されるため、大きな構造変更のPRは先にIssueで方向性を相談してほしい。

## ライセンスと出典

自作部分は [MIT License](./LICENSE)。以下の外部プロジェクト由来・翻案のファイルを含む(いずれも MIT、元ライセンスに従う):

| 由来 | 対象 |
|------|------|
| [garrytan/gstack](https://github.com/garrytan/gstack) (MIT) | `rules/voice.md`(翻訳翻案)、ask-brief / Confusion Protocol の原型 |
| [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (MIT) | agents の一部(executor / verifier / critic / analyst 等)、skills の一部(ralph / ultrawork / team / ralplan / sciomc 等) |
| [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) (MIT) | `origin: ECC` 表記のファイル(eval-harness 等) |
| Vercel (MIT) | `skills/vercel-react-best-practices/` |
| Supabase (MIT) | `skills/supabase-postgres-best-practices/`(別途インストール、実体は未収録) |

インストール由来のスキルパック(plaud系7本、Cloudflare公式11本、issue-filer)は依存物として `.gitignore` で管理外(このリポには含まれない)。
