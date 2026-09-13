# Claude Code Harness

Claude Code(`~/.claude/`)向けのハーネス設定一式(OSS / MIT)。日々の開発を少数の**オーケストレーションcommand**に集約し、agent・skill・防御hookでガードレールを敷いて回すための構成。そのまま導入しても、部品単位で自分の `~/.claude/` に持ち帰っても使える。

**入っているもの:**

- **オーケストレーションcommand 5本**: `/project-init` `/vibe` `/pre-pr-review` `/commit-push` `/review-prs`。日々の開発はほぼこの5つで完結する(command全体では20本)
- **specialized agent 28本**: planner / architect / tdd-guide / security-reviewer / tracer など。実装と審査を別モデル系統に分ける分業前提の構成
- **skill群**: 統合レビュー(`code-review`)、SPEC駆動開発(`spec-driven`)、合議計画(`ralplan`)、Codex収束レビュー(`skills/plan/references/codex-converge/SKILL.md` を読んで従う手順)、持続実行(`ralph`、および `skills/ralph/references/ultrawork`)ほか
- **防御hook**: `scripts/pre-tool-enforcer.sh` がコマンドをトークナイズ解析し、main直push・force push・`gh repo create --push` 等を前方一致denyでは防げない形まで含めてブロック
- **開発規範(`rules/`)とテンプレート**: coding-style / security / git-workflow / model-delegation / voice / agents / ng-words.yaml、Burn Log(同じ失敗を2回したらルール化)などの運用規約

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
- **実装・計画フェーズは基本的にCodex(`gpt-5.6-sol`)に委譲する。** コストは制約にしない。速度と正確性のトレードオフだけを見る。`plan`のPlanner/Architect passや、`ralph`/`ultrawork`/`team`の実装stepは `Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol ...")` をデフォルト経路として呼ぶ(生の `codex exec` は job登録とstatusline表示が消えるため、`scripts/pre-tool-enforcer.sh` がブロックする)
- **Critic(最終審査)だけはデフォルトでClaude Opusのまま残す。** PlannerやArchitectがSolで動いても、同じモデル系統に自己承認させると見落としが起きやすい(self-preference bias)。独立した目で見るのがCriticの存在意義。`--critic codex` で明示的にSolへ切り替えることもできるが、速度を独立性より優先する時だけの opt-in
- 役割分担の一次情報源は **Routing (Sol-centric)** セクションを持つ [`agents/<name>.md`](./agents/)(全agentのうち実装寄りの一部)と [`skills/plan/SKILL.md`](./skills/plan/SKILL.md) の Provider overrides

---

## まず覚えるのはこの5つ

この5commandだけ覚えれば、日々の開発はほぼ完結する。内部で必要なagent・skill・他commandを自動的に呼び出すため、個別の細かいcommandを直接叩く必要はほとんどない。

| # | Command | いつ使う | 何が起きる |
|---|---------|---------|-----------|
| 1 | [`/project-init`](./commands/project-init.md) | 新規 or 既存プロジェクトの立ち上げ | インタビュー → repo setup → docs生成 → CI/E2E scaffold を一括 |
| 2 | [`/vibe`](./commands/vibe.md) | 実装タスクの開始から完了まで | fetch-pull → plan → TDD → review → build/test → E2E(条件付き) → docs同期 → PR草案 を一気通貫 |
| 3 | [`/pre-pr-review`](./commands/pre-pr-review.md) | PRを作る前の最終チェック | ローカル差分を [`skills/code-review`](./skills/code-review/SKILL.md) に流し、Codex reviewに備えて弱点を潰す |
| 4 | [`/commit-push`](./commands/commit-push.md) | 変更をremoteに送る | ブランチ名ゲート → stage → commit → push → PR作成の意思確認 |
| 5 | [`/review-prs`](./commands/review-prs.md) | 溜まったPRを捌く | オープンPRを番号順に同じ `skills/code-review` へ通し、修正して出すところまで |

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

`/vibe` が中心。ほとんどのタスクはここから始まり、内部で plan / TDD / code-review / build-fix / e2e / doc-update / pr-create までを順次呼び出す。

レビューの実装は1本しかない。`/pre-pr-review` も `/review-prs` も `/vibe` の Review フェーズも、同じ [`skills/code-review`](./skills/code-review/SKILL.md) を読んで実行する薄い入口にすぎない(詳細は下記)。

「決定が hard to reverse」(認証 / schema migration / 公開API / 破壊的変更) な時、または「実装前に plan を限界まで磨きたい」時は `/ralplan` や `codex-converge`(plan skill の references/codex-converge/SKILL.md を Read して従う)を使う。受入基準そのものが曖昧なまま複数ファイルに手を入れる規模なら `/spec-driven` から入る(いずれも詳細は下記「各commandの要点」)。日々の小タスクには重すぎるので、必要な場面でだけ起動する。

---

## 各commandの要点

### `/project-init` ... プロジェクト立ち上げ

新規 / 既存どちらにも対応。

- インタビューで tech stack と目的を確認
- `repo-scaffolder` が git init / ディレクトリ作成 / `.gitignore` を用意(既存ファイルは**絶対に上書きしない**)
- `architect` が `docs/architecture/architecture.md` を下書き
- `project-doc-gen` が [`templates/PROJECT-SEED.md`](./templates/PROJECT-SEED.md) に沿って `docs/` 全体を生成
- `ci-gen` が `.github/workflows/*.yml` を作成(UI stackなら `e2e.yml` も)
- UI frameworkを検出したら `e2e-runner` がPlaywright scaffold を追加

### `/vibe` ... 実装パイプライン

タスク1件を最初から最後まで運ぶメインcommand。フェーズ構成:

1. **Sync** ... mainを最新化し、conflictの有無を確認
2. **Plan(ゲート)** ... 既存の計画を**探してから**作る。探索順は `specs/<NNN>-<slug>/tasks.md` → `docs/plan/*.md` → 新規生成。SPEC駆動で回しているリポジトリで `docs/plan/` しか見ないと、作業リストを無視して重複plan を作ってしまうため
3. **TDD実装** ... `tdd-guide` agent主導。**テストを書き換えて突破することは明示禁止**
4. **Review** ... `skills/code-review` をpipelineモードで実行(subagent 6体 + Codex 2本を並列。ゲートは `/vibe` 側のShip gateに集約するのでここでは訊かない)
5. **Verify** ... `verify` → 失敗したら `build-fix` → `smoke-test`(テスト改竄は同じく禁止)
6. **E2E(条件付き)** ... 既存の `playwright.config.*` または `tests/e2e/` があり、かつ UI/route変更が含まれる場合だけ走らせる。無ければskip
7. **Deps / docs同期** ... 新規パッケージがあれば `dependency-check`、続けて `doc-updater` で変更点をdocs/に反映
8. **Ship gate** ... 承認後にPR作成 → 計画のstatusを `done` に。`docs/plan/` の計画は `docs/plan/done/` へ `git mv`(`backlog → active → in-progress → done` の4状態を通り、完了後も削除せず履歴として保持)、SPEC set は `specs/<NNN>-<slug>/` に置いたまま frontmatter だけ `done` にする(ディレクトリ名がブランチとの対応そのものなので動かさない)

### `/pre-pr-review` ... PR前review

ローカル差分を対象に `skills/code-review` を実行する薄い入口。既定は「指摘だけ出して直さない」で、それでも**修正範囲は必ず訊く**(既定値はゲートを消さない)。

### `/commit-push` ... 安全なcommit & push

- **ブランチ名ゲート**: main/masterなら新ブランチ作成を促す。変更内容とブランチ名が一致しない場合は `AskUserQuestion` で停止
- `git add .` の前に `git status` で再確認
- commit message は英語1文、body は不要時は書かない
- push後に **PR作成の意思確認ゲート**(必須)

### `/review-prs` ... 溜まったPRを捌く

- オープンなPRを番号順に列挙し、1本ずつ `skills/code-review` を通す(`--limit` / `--label` / `--author` で絞る、`--dry-run` で一覧だけ)
- 既定は「CRITICAL と HIGH を直す」。それでもPRごとに2つのゲートを訊く
- 1本shipしたら `gh pr checks <n> --watch` の完了を待ってから次へ

### [`skills/code-review`](./skills/code-review/SKILL.md) ... レビュー経路の単一化

レビューの実装はここ1本だけ。以前はレビューを持つcommandが並列起動ブロックを各自コピーして抱えており、コピーは既にずれていた(`/vibe` だけsubagentを5体しか起動せず、コメント/TODO担当が回っていなかった)。入口は `/pre-pr-review` `/review-prs` `/vibe` のReviewフェーズ、そしてskill直呼びの4つで、実行されるのは同じ1本。

- **並列レビュー**: Codex 2本(standard / adversarial)をbackgroundで先に投げ、Claude subagent 6体(`code-reviewer` / `security-reviewer` / `silent-failure-hunter` / `typescript-reviewer` / `code-simplifier` / コメント・TODO担当)を**1メッセージで**同時起動。main agentは集約役で、自分でレビューして代わりにすることを禁止している
- **resilience 3-pack(条件付き)**: migration / infra / 新規APIエンドポイント / 500行超 などの条件に当たったときだけ `sre-engineer` `chaos-engineer` `error-detective` を追加起動し、Resilience Gate(PASS / WARN / BLOCK)を出す
- **確認ゲート2段**: 「どこまで直すか」(指摘だけ / C・H / C・H・M / 番号指定)と「どう出すか」(push / GitHubに投稿 / commitのみ / 何もしない)。既定値はどのオプションを先頭に出すかを決めるだけで、質問自体は消えない。飛ばすのは `/vibe` のpipelineモードだけ(そこではCRITICALとHIGHを直し、判断はShip gateに集約する)
- **実行ログ**: 1回のレビューにつき1行を記録し、`/review-status` で「このPRはもうレビューしたか」を引ける

### `/ralplan`: Planner→Architect→Critic の多視点合議で plan を詰める

`/plan --consensus` のショートカット。vague な `ralph X` `team X` を **gate** として intercept する役目も持つ。

- **Planner** が初版plan + RALPLAN-DR summary(Principles / Drivers / Options 各 pros/cons)。デフォルトCodex(`gpt-5.6-sol`)
- **Architect** が steelman antithesis、trade-off tension を提示。デフォルトCodex(`gpt-5.6-sol`)
- **Critic** が testability / risk mitigation / 代替案探索の十分さを判定。デフォルトClaude Opus固定(独立reviewの要、Solでの自己承認を避ける)
- APPROVE になるまで Planner → Architect → Critic を **最大5 iter** 反復(sequential、parallel ではない)
- `--deliberate` で pre-mortem (3シナリオ) + 拡張テスト計画 (unit / integration / e2e / observability) を強制
- `--planner claude` / `--architect claude` でCodexからClaude Opusに戻す、`--critic codex` でCriticだけ独立性より速度を優先してCodexに切り替える(いずれもopt-in)
- `--with-codex` で APPROVE 後に **`codex-converge`(plan skill の references/)を自動接続** (下記)

### `codex-converge`(plan skill の references/codex-converge/SKILL.md を Read して従う) ... Codex 独立reviewで docs を限界まで磨く

単一 docs (plan / ADR / RFC / spec) に対して Codex 3本 (standard / adversarial / spec-diff) を並列起動し、指摘を反映して再 review、を繰り返す。

- **終了条件**:
  - CONVERGED: **連続2ラウンド P1=0** (1回clean では止めない、flakyな見落としを吸収)
  - MAX-ROUNDS: `--max-rounds 15` 到達
  - STUCK: 同じP1が **3ラウンド連続** で残る → ユーザに escalate
  - USER STOP: 各ラウンド末の AskUserQuestion で停止選択 (`--auto` で skip)
- **severity**: `--severity P0|P1|P2` (default P1)。 P0 only で軽量、P2 で strict
- **opt-in flag**: `--no-adversarial` / `--no-spec-diff` で reviewer を絞れる
- 単体使用 (plan skill の references/codex-converge/SKILL.md を Read して手順に従う) と `/ralplan --with-codex` 経由の自動起動の両対応
- 出力: 各ラウンドの Codex 出力 (`/tmp/codex-converge-*-r<N>-*.md`) + 収束テーブル(R毎の P1 件数) を chat に提示

### `/spec-driven` ... 受入基準を先に固めてから実装する

「動いた」の判定がテスト成功にすり替わる問題を潰すための経路。`specs/<NNN>-<slug>/` に `spec.md` + `plan.md` + `tasks.md` の3点セットを置く。

- **置き場はリポジトリ直下の `specs/`**。`docs/` の下ではないので、`specs/<NNN>-<slug>/plan.md` と planner規約の `docs/plan/<verb>-<topic>.md` が衝突しない。連番はブランチ名(`feat/<NNN>-<slug>`)と一致させ、名前だけで対応が読める
- **FRはEARS記法の6パターンで書く。** 「速い」「適切に処理する」のような曖昧な要求をAIの解釈で確定させないため。数値境界(以上 / 超える)は毎回原文と突き合わせて確認するゲートつき
- **要件ID → タスクID のトレーサビリティ**を `tasks.md` のタスク一覧表で保つ。spec.md の全ID(US / AS / FR / SEC / SC / EC / ASM)が1回以上タスク側に現れるかを grep で検査する
- **仕様は凍らせない。** 実装中に仕様が変わったら「本文を更新 + 変更前の原文を引用 + 仕様変更ログに追記」の3点セットで残す
- **9工程のうち新設は specify と tasks の2つだけ**。clarify は `deep-interview`(plan skill の references/deep-interview)/ `ask-brief`、plan は `planner` agent、checklist と analyze は `critic` agent、implement は `tdd-guide` + `executor`、converge は `verifier` と、既存資産の再配線で組んでいる
- 雛形は [`skills/spec-driven/references/`](./skills/spec-driven/references/) に3本(spec / plan / tasks)、既に `docs/plan/` で走っているリポジトリ向けの移行手順も同ディレクトリの `migration.md` にある
- `/vibe` の Plan フェーズは `specs/` を先に探すので、SPEC駆動で回しているリポジトリでは自動的にこの作業リストが使われる

---

## 補助commandとagent

上記5つの裏で呼び出されるが、単体でも使える。

### 補助command(単体でも使用可)

| Command | 用途 |
|---------|------|
| `/plan` | 実装計画のみを作る(vibeの外で計画だけ欲しい時、1 pass) |
| `/spec-driven` | `specs/<NNN>-<slug>/` に spec / plan / tasks の3点セットを作って実装に入る |
| `codex-converge`(plan skill の references/) | 単一docs(plan / ADR / RFC)を Codex 3本収束ループで磨く(連続2R P1=0で停止) |
| `/tdd` | Red-Green-Refactor の実装のみ(80%閾値を下回るファイルのcoverage sweep込み) |
| `/build-fix` `/verify` | `build-error-resolver` / `verifier` agentへの委譲(修復と、fresh outputでのPASS/FAIL判定) |
| `/fetch-pull` | mainの最新化だけ |
| `/pr-create` | PR本文をcommit履歴から生成 |
| `/update-docs` | docs/ と codemap を実コードから同期(codemapを飛ばすなら `--skip-codemaps`) |
| `/e2e` | Playwrightのjourney生成と実行(artifact込み) |
| `/review-status` | レビュー実行履歴の記録と閲覧(「このPRはもうレビューしたか」) |
| `/harness-audit` | このハーネス自体を `harness-optimizer` agentでscoring |
| `/changelog` | conventional commitsから CHANGELOG.md を生成 |
| `/dependency-check` `/conflict-check` `/smoke-test` | 単発の健全性チェック |

`/build-fix` `/verify` `/pre-pr-review` `/review-prs` `/update-docs` は、いずれも中身を持たずagentかskillに委譲する薄膜。同じ手順を2箇所に書かないため、実装は必ず1本に寄せている。

### 代表的なagent

| Agent | 役割 |
|-------|------|
| `planner` | 実装計画の立案 |
| `architect` | アーキテクチャ設計 |
| `tdd-guide` | TDD enforcement、**テスト改竄の検出と拒否** |
| `code-reviewer` / `typescript-reviewer` / `security-reviewer` / `silent-failure-hunter` / `code-simplifier` | レビュー各種(`skills/code-review` が並列起動する面々) |
| `build-error-resolver` | ビルド/型エラーの最小修正 |
| `e2e-runner` | Playwright scaffold と実行 |
| `doc-updater` | docs/ と codemap の更新 |
| `chaos-engineer` / `sre-engineer` / `error-detective` | resilience 3-pack |
| `harness-optimizer` | `~/.claude/` のauditと改善提案 |

全agentの一覧は [`rules/agents.md`](./rules/agents.md)、個別定義は [`agents/<name>.md`](./agents/)。

---

## ディレクトリ構成

| ディレクトリ | 役割 |
|------|------|
| [`commands/`](./commands/) | slash command 定義20本(`/vibe` `/project-init` 等)。実装を持つものと、agent/skillへ委譲する薄膜が混在 |
| [`agents/`](./agents/) | specialized subagent 定義28本 |
| [`skills/`](./skills/) | Progressive Disclosureで呼ばれる知識パッケージ26本(例: [`code-review`](./skills/code-review/SKILL.md) / [`spec-driven`](./skills/spec-driven/SKILL.md) / `ralph`)。`codex-converge` / `deep-interview` / `autopilot` は `skills/plan/references/` に同梱 |
| [`rules/`](./rules/) | 常時ロードされる開発規範(coding-style / security / git-workflow / model-delegation / voice / agents / ng-words.yaml) |
| [`templates/`](./templates/) | プロジェクト初期化seed。[`PROJECT-SEED.md`](./templates/PROJECT-SEED.md) が単一のsource of truth |
| [`hooks/`](./hooks/) + [`scripts/`](./scripts/) | PreToolUse / PostToolUse / Stop / SessionStart 等で走るshell/python script |
| [`bin/`](./bin/) | 手で叩ける小物(レビュー実行ログの追記など) |
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
- **作者の運用に紐づくhookが混ざっている。** 例えば `scripts/public-export-reminder.sh` は、この設定リポ自体にcommitが入ったときだけ「公開ミラーへ反映するか」を毎回確認させるPostToolUse hook。手元で設定を育てるだけなら `settings.json` から外していい
- **含まれないもの**: インストール由来のスキルパック(plaud系 / issue-filer / Cloudflare公式 等)は別途インストール前提で、このリポには実体を含まない。`deployment-automation` / `expo-deployment` / `find-skills` / `supabase-postgres-best-practices` / `vercel-react-best-practices` は2026-09-13のharness GCで削除済み(60日間使用実績ゼロ)。GCログと削除物の退避先はローカルにのみ残り、リポには含まれない
- `statusline-command.sh` は生成物のため未収録。statusline は各自の環境で再生成が必要
- **`settings.json` の `enabledPlugins` は `codex@openai-codex` 以外すべて `false`。** skillの説明文は全システムプロンプトに文書化されていない約16,000文字の予算内で注入される([anthropics/claude-code#13099](https://github.com/anthropics/claude-code/issues/13099))。無効化した4プラグイン(`llm-application-dev` / `example-skills` / `cloudflare`、および社内marketplace経由の1本)は60日間の使用実績ゼロのまま62,531文字を消費していた。このハーネスを薄く保つための設計判断で、有効化するプラグインは使用実績で選ぶこと

---

## 関連ドキュメント

- [`CLAUDE.md`](./CLAUDE.md) ... 全プロジェクト共通原則(Codex review前提、品質優先、Output Language等)
- [`rules/`](./rules/) ... coding-style / security / git-workflow / model-delegation / voice / agents / ng-words.yaml。`directory-conventions`(`specs/` と `docs/plan/` の振り分け)と `backup-verification`(同期は表示ではなく受信側の件数で確認する)は [`skills/directory-conventions/`](./skills/directory-conventions/) と [`skills/backup-verification/`](./skills/backup-verification/) に同梱
- [`skills/code-review/SKILL.md`](./skills/code-review/SKILL.md) ... レビュー経路の実装(subagent 6体 + Codex 2本 + 確認ゲート2段)
- [`skills/spec-driven/SKILL.md`](./skills/spec-driven/SKILL.md) ... SPEC駆動開発の手順と雛形
- [`templates/PROJECT-SEED.md`](./templates/PROJECT-SEED.md) ... docs生成の単一source of truth
- [`handoff/README.md`](./handoff/README.md) ... セッション間ハンドオフ規約(memory は使わない方針)

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

インストール由来のスキルパック(plaud系 / Cloudflare公式 / issue-filer 等)は依存物として `.gitignore` で管理外(このリポには含まれない)。
