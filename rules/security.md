# Security (P0 原則)

常時ロードするのはこの原則のみ。**完全なチェックリストは security-review skill に移設済み**
(OWASP Top 10 / CWE Top 25 / JWT / SSRF / path traversal / LLM Top 10 / サプライチェーン /
攻撃者目線レビュープロンプト / Response Protocol)。
実装・レビュー時は `~/.claude/skills/security-review/security-rules-full.md` を読むこと。

## P0 (常に適用)

- シークレットをハードコードしない。1度でもコミットしたら必ずローテート(履歴を消しても漏洩は消えない)
- SQL はパラメータ化クエリ or ORM のみ。f-string / 文字列連結 SQL は絶対禁止
- OS コマンドは `shell=False` + リスト形式。ユーザ入力を直接 path / コマンド / eval に渡さない
- 認可はハンドラ内で対象リソースの所有権まで検証する(middleware だけを防衛線にしない)
- 外部入力はすべて validation を通す(Zod / Pydantic)

## 発火条件

以下のいずれかに該当したら、回答・実装の前に security-review skill をロードする:

- 認証・認可・セッション・ユーザ入力・ファイルアップロード・API エンドポイント・決済・秘密情報を扱う実装
- ユーザーのリクエストに "security" "脆弱性" "penetration" "threat model" が含まれる
- コミット前のセキュリティ最終確認(コミット前チェックリストは skill 側 §2)

**リポジトリ全体の監査は `security-audit` skill に回す(2026-09-16 導入、cloudflare/security-audit-skill)。**
「security audit」「脆弱性を探して」「ペンテスト」「監査レポートを出して」のように対象が
1変更ではなくコードベース全体なら、security-review ではなく `security-audit` をロードする。
security-review はチェックリスト(何を見るか)、security-audit は手順(偵察→探索→反証→
findings.json→独立検証→報告)。両方読ませると文脈が太るだけなので、監査では security-audit のみ。

## Response Protocol (要約)

脆弱性発見時: STOP → grep で scope 確定 → security-reviewer agent 起動(類似箇所が3件以上、または認可・テナント境界に及ぶなら `security-audit` フル監査) →
CRITICAL/HIGH を先に修正 → 漏洩シークレットは即ローテート → 再発防止(lint / Semgrep / pre-commit) → ユーザに報告。
