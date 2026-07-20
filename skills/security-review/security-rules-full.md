# Security Guidelines (Full)

> 2026-07-04 に `~/.claude/rules/security.md` から移設。常時ロードを避け、security-review skill の発火時にオンデマンドで読む。

Claude が実装・レビュー時に必ず確認すべきセキュリティチェック項目。
優先度 (P0 = 絶対, P1 = 強く推奨, P2 = 推奨) 付きで構造化している。

出典は各セクション末尾に記載。

---

## 0. 使い方

- **実装フェーズ**: コードを書いたら §1 → §2 → §3 の順にセルフチェック。P0 違反があれば即修正。
- **レビューフェーズ**: §9 の「攻撃者目線レビュープロンプト」をそのまま LLM に投げ、返ってきた指摘を fix。
- **コミット前**: §2 の「コミット前チェックリスト」をすべて満たしていることを確認。
- **ユーザーが "security" "脆弱性" "penetration" "threat model" などを含むリクエストを出した場合**、このファイル全体を前提として回答する。

---

## 1. 脆弱性分類別 必修チェック項目 (OWASP Top 10 / CWE Top 25 ベース)

各項目に「典型的な NG パターン」と「修正後」を併記している。LLM が書きがちなコードを特に強調している。

### 1.1 A01: Broken Access Control [P0]

CWE Top 25 でも上位。認可はエンドポイントごとに明示的にチェックする。

- [ ] すべての認証必須エンドポイントで、ハンドラ内部で `req.user` の所有権/ロールを検証している
- [ ] IDOR (Insecure Direct Object Reference) 対策: `GET /api/orders/:id` で他人の order を取得できないか
- [ ] 管理者専用エンドポイントは middleware だけに依存せず、ハンドラ内でも `user.role === 'admin'` を再確認
- [ ] Next.js: **Middleware を認可の最終防衛線にしない** (CVE-2025-29927 の教訓)。Route Handler / Server Action / Data Access Layer でも認可を行う

```typescript
// NG: middleware だけで守る
// NG: path だけで判定する
if (req.path.startsWith('/admin')) requireAdmin()

// OK: ハンドラ内で対象リソースの所有権まで確認
const order = await db.orders.findUnique({ where: { id } })
if (!order || order.userId !== req.user.id) throw new ForbiddenError()
```

### 1.2 A02: Cryptographic Failures [P0]

- [ ] パスワードは **Argon2id** でハッシュ化 (推奨: m=19 MiB, t=2, p=1 以上。セキュリティ重視なら m=128 MiB, t=3–5)
- [ ] レガシー継続なら bcrypt (cost ≥ 12, 推奨 13–14, 入力は 72 byte 以下)
- [ ] Scrypt を使う場合: N=2^17, r=8, p=1 以上
- [ ] SHA-1/MD5 をパスワードハッシュや署名に使わない
- [ ] 暗号化には AES-GCM / ChaCha20-Poly1305 など AEAD を使う。ECB モードは絶対使わない
- [ ] 乱数は `crypto.randomBytes` / `secrets.token_bytes` 等 CSPRNG。`Math.random()` や `rand()` はトークン生成に使わない
- [ ] TLS 1.2 以上必須。平文 HTTP での認証情報送信禁止

### 1.3 A03: Injection [P0]

LLM が最も間違えやすい領域。**f-string や文字列連結による SQL は即 NG**。

- [ ] SQL: パラメータ化クエリ or ORM のみ。`f"SELECT * WHERE id = {user_id}"` は絶対禁止
- [ ] Django ORM: `.filter()` / `.get()` を使う。`raw()` / `extra()` で文字列連結しない
- [ ] SQLAlchemy: `text()` に文字列連結は NG。`:param` で bind する
- [ ] NoSQL: MongoDB `$where` / `mapReduce` にユーザ入力を渡さない。オペレータインジェクション (`{$ne: null}`) を防ぐためキー名もバリデート
- [ ] OS コマンド: `subprocess.run([...], shell=False)` (リスト形式)。`shell=True` + ユーザ入力は絶対禁止
- [ ] Node.js: `child_process.execFile` / `spawn` + 引数配列を使う。`exec` + 文字列連結は NG
- [ ] LDAP/XPath/テンプレートエンジン: エスケープ関数を必ず使う

```python
# NG (LLM がプロトタイプで出しがち)
sql = f"SELECT * FROM users WHERE id = {user_id}"
cursor.execute(sql)

# OK
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

```python
# NG
subprocess.run(f"convert {filename} out.png", shell=True)

# OK
subprocess.run(["convert", filename, "out.png"], shell=False, check=True)
```

### 1.4 A04: Insecure Design [P1]

- [ ] 脅威モデリング: 新機能ごとに「誰が何を悪用するか」を 1 段落で言語化
- [ ] レート制限: **すべての認証・パスワードリセット・送信系エンドポイント** に実装
- [ ] アカウント列挙対策: ログイン失敗メッセージは「メールまたはパスワードが不正」で統一
- [ ] パスワードリセットトークンは短命 (15–60 分)、ワンタイム、CSPRNG 生成

### 1.5 A05: Security Misconfiguration [P0]

- [ ] 本番で debug モード OFF (Django `DEBUG=False`, Flask `debug=False`, Next.js `NODE_ENV=production`)
- [ ] `ALLOWED_HOSTS` / `trusted_origins` を本番ドメインに限定
- [ ] デフォルト認証情報を変更 (admin/admin 等を残さない)
- [ ] 不要なエンドポイント (phpinfo, actuator, /debug, /_next/server-side dump) を無効化
- [ ] セキュリティヘッダ: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
  - [ ] **フレームワークのデフォルトでは付与されない前提**で明示設定する (Next.js / Express / FastAPI 等、ほぼ自動付与しない)。`X-Frame-Options: DENY` または CSP `frame-ancestors 'none'` でクリックジャッキング対策も忘れずに
- [ ] CORS: `Access-Control-Allow-Origin: *` と `Access-Control-Allow-Credentials: true` の併用禁止。origin は allowlist で明示
- [ ] クラウドリソースのパブリック公開チェック (S3 バケット、DB ポート)

### 1.6 A06: Vulnerable and Outdated Components [P1]

- [ ] `npm audit` / `pip-audit` / `osv-scanner` を CI で実行、CRITICAL / HIGH で fail
- [ ] Dependabot / Renovate を有効化
- [ ] ロックファイル (package-lock.json / poetry.lock / Cargo.lock) を必ずコミット
- [ ] 依存追加時は週次ダウンロード数と最終更新日を確認 (タイポスクワット対策)
- [ ] SBOM (CycloneDX / SPDX) 生成を推奨

### 1.7 A07: Identification and Authentication Failures [P0]

- [ ] JWT 関連:
  - [ ] `alg: none` を絶対に受け付けない (大文字小文字バイパス `NoNe` も弾く)
  - [ ] **algorithm allowlist** で HS256 or RS256 等を明示指定
  - [ ] HMAC 秘密鍵は 32 byte 以上の CSPRNG 生成。環境変数で管理
  - [ ] RS256 と HS256 の混在禁止 (algorithm confusion 攻撃)
  - [ ] `exp` / `iat` / `nbf` / `iss` / `aud` を検証
  - [ ] アクセストークン短命 (15–60 分) + リフレッシュトークン
- [ ] セッション Cookie: `HttpOnly; Secure; SameSite=Lax or Strict; Path=/; __Host-` prefix
- [ ] ログイン成功後はセッション ID を必ず再発行 (session fixation 対策)
- [ ] MFA / パスワードリセット / メール変更など重要操作は re-authentication を要求
- [ ] ブルートフォース対策: ログイン失敗時の指数バックオフ + アカウントロック (一時的)

### 1.8 A08: Software and Data Integrity Failures [P1]

- [ ] CI/CD: 外部アクションは SHA ピン留め (`uses: owner/action@sha`) 推奨
- [ ] 信頼できないソースからの deserialize 禁止 (Python `pickle`, Java `ObjectInputStream`, PHP `unserialize`, Node `node-serialize`, YAML `yaml.load` without SafeLoader)
- [ ] Webhook / auto-update 経路: 署名検証 (HMAC) 必須
- [ ] npm: `postinstall` スクリプトを持つ見知らぬパッケージに警戒

### 1.9 A09: Security Logging and Monitoring Failures [P1]

- [ ] 認証失敗・認可失敗・不正入力を構造化ログで記録
- [ ] **ログに秘密情報を出さない** (パスワード、トークン、セッション ID、クレカ、PII)
- [ ] 失敗回数の急増で alert
- [ ] ログ改竄防止 (append-only storage)

### 1.10 A10: SSRF [P0]

- [ ] ユーザ提供 URL に対しては **allowlist** で host を検証。blocklist は迂回可能
- [ ] DNS 解決後の IP も検証し、プライベート帯 (10.0.0.0/8, 172.16/12, 192.168/16, 169.254.169.254, ::1, fc00::/7) を拒否
- [ ] AWS は **IMDSv2** 必須化、IMDSv1 無効化
- [ ] redirect を追う場合はリダイレクト先 URL も再検証
- [ ] タイムアウトとサイズ制限を設ける

### 1.11 その他の高頻度脆弱性

#### Path Traversal [P0]
- [ ] ユーザ入力をそのままパスに使わない
- [ ] `os.path.realpath` / `fs.realpathSync` / `Path.normalize` で正規化後、**許可 base ディレクトリで始まることを検証**
- [ ] できればユーザ入力 → 内部 ID → 実ファイル名 の間接参照を使う

```python
# NG
path = os.path.join("uploads", file.filename)  # filename = "../../etc/passwd"

# OK
import os
base = os.path.realpath("uploads")
target = os.path.realpath(os.path.join(base, file.filename))
if not target.startswith(base + os.sep):
    raise ValueError("path traversal detected")
```

#### XSS (Reflected / Stored / DOM-based) [P0]
- [ ] React/Vue/Angular のテンプレートに生 HTML を挿入しない。`dangerouslySetInnerHTML` / `v-html` は最終手段
- [ ] サーバ側で HTML を返す場合はテンプレートエンジンの自動エスケープを有効化
- [ ] URL 属性 (`href`, `src`) は `javascript:` スキームを禁止
- [ ] Content-Security-Policy (nonce ベース推奨) を設定

#### CSRF [P0]
- [ ] Cookie ベース認証なら CSRF トークン or `SameSite=Lax/Strict`
- [ ] 状態変更は POST/PUT/PATCH/DELETE のみ。GET では行わない
- [ ] FastAPI など token 型ならクロスオリジンで cookie を送らない設計にする

#### Open Redirect [P0]
- [ ] `returnTo` / `next` / `redirect_uri` 等は allowlist (ドメイン or 内部パス `^/[^/]`) で検証

#### Prototype Pollution (Node.js) [P1]
- [ ] ユーザ入力で `__proto__` / `constructor` / `prototype` キーをオブジェクトに設定させない
- [ ] `Object.create(null)` / `Map` / `Set` を使う
- [ ] deep-merge / lodash.set は要注意 (脆弱バージョンあり)

#### SSTI [P0]
- [ ] Jinja2 / Handlebars / Pug 等のテンプレートにユーザ入力を渡さない
- [ ] Flask: `render_template_string(user_input)` は絶対 NG

#### XXE [P1]
- [ ] XML パーサで外部実体を無効化 (`libxml2` `LIBXML_NOENT=false`, Python `defusedxml` 推奨)

#### Clickjacking [P1]
- [ ] `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`

---

## 2. コミット前チェックリスト [P0]

> Claude はコミット実行前に必ずこのリストを暗黙的に走らせる。該当する項目が 1 つでも残っていれば、コミットを止めてユーザに報告する。

- [ ] ハードコードされた秘密情報がない (API key, password, token, private key, DB connection string)
- [ ] `.env` / `credentials.json` / `*.pem` を `git add` していない
- [ ] すべての外部入力 (HTTP body/query/header, file, env, DB, 外部 API) が validation を通っている (Zod / Pydantic / class-validator 推奨)
- [ ] SQL は ORM or parameterized query のみ (f-string / テンプレート文字列 SQL なし)
- [ ] OS コマンドは `shell=False` + list 形式
- [ ] ユーザ入力がそのままファイルパスになっていない
- [ ] エラー応答に stack trace / SQL / 内部パスが出ない (本番時)
- [ ] 新規追加エンドポイントに認証・認可・レート制限がある
- [ ] ログに秘密情報が流れていない
- [ ] `console.log` / `print` で debug 出力が残っていない
- [ ] 新規依存追加時: メンテナンス状態、既知 CVE の有無を `npm audit` / `pip-audit` で確認

---

## 3. シークレット管理 [P0]

```typescript
// NG: ハードコード
const apiKey = "sk-proj-abc123..."

// NG: LLM が "環境変数に変えてね" とコメントしながら実鍵を残す典型パターン
const apiKey = process.env.OPENAI_API_KEY || "sk-proj-real-key-fallback"

// OK
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error("OPENAI_API_KEY is required")
```

チェックポイント:
- [ ] `.env` は `.gitignore` 済み。`.env.example` のみコミット
- [ ] リポジトリに **gitleaks** を pre-commit hook として導入 (`gitleaks protect --staged`)
- [ ] 定期的に **TruffleHog** で full history スキャン (git 履歴含む)
- [ ] 秘密情報が 1 度でも commit されたら **必ずローテート** (rebase や force push で消しても漏洩履歴は消えない)
- [ ] 本番シークレットは AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault / Doppler で管理。コードから直接アクセスしない
- [ ] CI のシークレットは GitHub Actions Secrets / OIDC (短命トークン) を使用

---

## 4. 認証・認可の実装ルール [P0]

### 4.1 パスワード
- Argon2id (m=19 MiB, t=2, p=1 以上) または bcrypt (cost ≥ 12)
- 平文ログ出力禁止
- パスワード 12 文字以上推奨、NIST 準拠の blocklist (Pwned Passwords) でチェック

### 4.2 セッション
- サーバ側セッション or JWT のいずれかで一貫。混在させない
- ログイン直後・権限変更後にセッション ID 再発行
- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/; __Host-SID=...`
- アイドルタイムアウト (15–30 分) + 絶対タイムアウト (8–24 時間)

### 4.3 JWT 実装時の必須チェック
```typescript
// NG: verify のアルゴリズムを指定しない
jwt.verify(token, secret)

// OK: allowlist で algorithm を固定
jwt.verify(token, secret, {
  algorithms: ["HS256"],
  issuer: "my-app",
  audience: "my-api",
})
```

### 4.4 OAuth 2.0 / OIDC
- `state` パラメータで CSRF 対策
- **PKCE** (S256) を public client (SPA / ネイティブ) で必須
- `redirect_uri` は完全一致で allowlist
- Implicit flow は使わない。Authorization Code + PKCE を使う

---

## 5. AI / LLM 特有の脆弱性 (OWASP Top 10 for LLM 2025) [P0]

LLM を組み込むアプリでは以下を追加でチェック。

- [ ] **LLM01 Prompt Injection**: ユーザ入力とシステム指示を明確に分離。ユーザ入力を instructions として解釈させない。直接出力をブラウザにレンダリングしない
- [ ] **LLM02 Sensitive Information Disclosure**: システムプロンプトに API キー・個人情報を埋めない。RAG のソースをユーザ権限でフィルタ
- [ ] **LLM03 Supply Chain**: モデル・LoRA・埋め込みモデルの出所を検証
- [ ] **LLM04 Data and Model Poisoning**: 学習/ファインチューン用データの取得経路を信頼できるもののみに
- [ ] **LLM05 Improper Output Handling**: LLM 出力をそのまま `eval` / SQL / shell に渡さない。必ず validation + サニタイズ
- [ ] **LLM06 Excessive Agency**: Tool use / function calling では「LLM が呼び出せる関数」を最小権限化。副作用のあるツールは人間の承認を挟む
- [ ] **LLM07 System Prompt Leakage**: システムプロンプトに秘密情報を埋めない (漏洩前提で設計)
- [ ] **LLM08 Vector and Embedding Weaknesses**: RAG で返すドキュメントのアクセス制御。埋め込みからの情報漏洩
- [ ] **LLM09 Misinformation**: LLM 出力に citation を強制、hallucination の監視
- [ ] **LLM10 Unbounded Consumption**: トークン数・同時接続数・コスト上限。DoS / wallet exhaustion 対策

---

## 6. 言語・フレームワーク別の定番ミス [P1]

### Node.js / Express / Next.js
- [ ] `express-rate-limit`, `helmet`, `express-validator` を導入
- [ ] Next.js Middleware を認可の唯一防衛線にしない (CVE-2025-29927)
- [ ] `dangerouslySetInnerHTML` に user input を渡さない
- [ ] App Router: Server Action で `'use server'` 関数は認可チェックを必ず入れる
- [ ] localStorage にセッショントークン保存禁止 (httpOnly Cookie を使う)
- [ ] CVE-2025-55182 / 66478 (React/Next.js RCE) に該当するバージョンを使わない

### Python / Django / FastAPI / Flask
- [ ] Django: `raw()` / `extra()` で文字列連結しない
- [ ] FastAPI: Pydantic で型検証。CSRF は token ベース前提で設計 (session cookie 使うなら別途対策)
- [ ] Flask: `render_template_string(user_input)` 禁止。`session` に `SECRET_KEY` を強く
- [ ] `pickle.loads`, `yaml.load` (SafeLoader なし), `eval`, `exec` は基本禁止
- [ ] `subprocess.Popen(shell=True)` 禁止

### Go
- [ ] `database/sql` の `Query` / `Exec` は `?` プレースホルダ必須
- [ ] `html/template` を使う (text/template は auto-escape しない)
- [ ] `exec.Command(name, args...)` 形式。shell 経由しない

### Rust
- [ ] `unwrap` を本番パスで避ける、エラーを握り潰さない
- [ ] `unsafe` ブロックはレビュー必須
- [ ] `std::process::Command::new` + `.arg()` で引数渡し

### React / Vue (フロントエンド XSS)
- [ ] `dangerouslySetInnerHTML` / `v-html` は DOMPurify で sanitize
- [ ] `href={userInput}` は `javascript:` スキームを拒否
- [ ] `window.postMessage` は origin を厳格に検証

---

## 7. サプライチェーンセキュリティ [P1]

2025 年は npm / PyPI / Docker Hub で大規模なクレデンシャル窃取型攻撃が連発している (CanisterSprawl, termncolor, colorama typosquat 等)。

- [ ] Dependabot / Renovate で自動更新 PR
- [ ] lockfile をコミット
- [ ] 依存追加前: GitHub stars, 最終 commit, ダウンロード数, 作者履歴を確認
- [ ] 怪しい `postinstall` / `preinstall` スクリプトをもつパッケージは避ける
- [ ] CI では `npm ci --ignore-scripts` / `pip install --no-compile` 相当で install scripts を無効化する選択肢を検討
- [ ] SBOM (CycloneDX) を定期生成
- [ ] コンテナイメージは Trivy / Grype でスキャン
- [ ] GitHub Actions は SHA ピン留め (`@v3` ではなく `@abc123sha`)

---

## 8. 検証ツールと自動化 [P1]

CI に組み込むべき最低限:

| レイヤー | ツール | タイミング |
|---|---|---|
| Secret scanning | **gitleaks** (pre-commit + CI), TruffleHog (週次 full scan) | 毎コミット + 週次 |
| SAST | **Semgrep** (OSS ルール + カスタム), CodeQL (GitHub) | PR 毎 |
| Dependency (SCA) | **npm audit** / **pip-audit** / **osv-scanner** / Snyk | PR 毎 + 日次 |
| Container | **Trivy** / Grype | ビルド時 |
| DAST | OWASP ZAP / Burp Suite | ステージングで定期 |
| License | license-checker / ort | PR 毎 |

推奨セット: **Semgrep (SAST) + osv-scanner (SCA) + gitleaks (secrets) + Trivy (container)**。すべて OSS で完結できる。

---

## 9. 攻撃者目線レビュー プロンプトテンプレート [P1]

Claude 自身が自分の実装をレビューする際、または別モデルにレビューさせる際に使うテンプレート。

### 9.1 汎用テンプレート (このまま使える)

```
あなたは熟練のペネトレーションテスターです。これから提示するコードベースを
**攻撃者目線**でレビューしてください。具体的には:

1. OWASP Top 10 (2021) および CWE Top 25 (2024) の観点でスキャン
2. 各脆弱性に対し「実際の攻撃ベクター」(どう送れば悪用できるか) を具体的な
   HTTP リクエスト / ペイロード例として提示
3. 深刻度 (P0 = RCE/認可バイパス/データ漏洩, P1 = 部分的情報漏洩, P2 = 軽微) を付与
4. 修正案を最小 diff 形式で示す
5. false positive を避けるため、「防御がすでに存在するか」を各指摘ごとに確認

対象範囲:
- 認証・認可・セッション管理
- すべての外部入力 (HTTP, file, env, 3rd-party API)
- SQL/NoSQL/OS コマンド/テンプレート/path に関わる箇所
- 秘密情報の取り扱い (env, log, error, response)
- 依存ライブラリの既知脆弱性
- LLM を使っていれば prompt injection / excessive agency

出力:
- 表形式: [ファイル:行] [脆弱性] [攻撃例] [深刻度] [修正案]
- 最後に「攻撃者として最初に狙う 3 箇所」をランキング
```

### 9.2 LLM 生成コード特化版 (重要)

```
以下のコードは AI アシスタントが生成したものです。AI コード特有の
アンチパターンに重点を置いてレビューしてください:

1. f-string / テンプレート文字列による SQL 組み立て
2. "環境変数に変えてね" とコメントしつつ残った実シークレット
3. ユーザ入力をそのままパス/コマンド/URL/eval に渡している
4. "プロトタイプだから" で省略されているバリデーション・認可
5. `shell=True`, `eval`, `exec`, `pickle.loads`, `yaml.load` の誤用
6. 既存の正解パターンを無視した独自実装の crypto / auth
7. エラーメッセージ/ログ/レスポンスへの秘密漏洩
8. TODO / FIXME / "後で" で punt された security-critical な箇所

各指摘に「本番に出たら何が起きるか」の 1 文シナリオを添えること。
```

### 9.3 レッドチーム演習 (クリティカルシステム向け)

```
このシステムに対し、あなたは APT 的な攻撃者です。以下のキルチェーンを
想定して攻撃シナリオを作ってください:

1. Initial access (認証バイパス / public endpoint 経由)
2. Privilege escalation (IDOR / 設定ミス利用)
3. Lateral movement (SSRF → 内部サービス / IMDS)
4. Credential harvesting (環境変数 / config / DB)
5. Persistence (webhook / cron / admin user 作成)
6. Exfiltration (PII / 秘密情報 / モデル重み)

各ステップで「この防御があれば止まる」という観点で防御側のチェック項目も
合わせて出力してください。
```

---

## 10. Security Response Protocol [P0]

セキュリティ問題を発見したら:

1. **STOP** — 実装を止める
2. **scope を確定** — 他の類似箇所がないか grep
3. **security-reviewer エージェントを起動** (`Agent` → `security-reviewer`)
4. **CRITICAL / HIGH を先に修正** — MEDIUM 以下は別タスク
5. **秘密情報が漏洩していた場合は即ローテート** — git 履歴を消しても漏洩履歴は消えない前提
6. **再発防止** — lint ルール / Semgrep カスタムルール / pre-commit hook を追加
7. **ユーザに報告** — 何が起きうるか、何を修正したか、ローテートが必要か

---

## 参考文献

- [OWASP Top 10:2021](https://owasp.org/Top10/2021/)
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)
- [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [CWE Top 25 Most Dangerous Software Weaknesses (2024)](https://cwe.mitre.org/top25/archive/2024/2024_cwe_top25.html)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Prototype Pollution Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [PortSwigger Web Security Academy — JWT attacks](https://portswigger.net/web-security/jwt)
- [Next.js CVE-2025-29927 (Middleware auth bypass)](https://strobes.co/blog/understanding-next-js-vulnerability/)
- [Next.js Security Best Practices](https://nextjs.org/blog/security-update-2025-12-11)
- [Semgrep — Python Command Injection cheat sheet](https://semgrep.dev/docs/cheat-sheets/python-command-injection)
- [TruffleHog vs. Gitleaks 比較](https://www.jit.io/resources/appsec-tools/trufflehog-vs-gitleaks-a-detailed-comparison-of-secret-scanning-tools)
- [GitGuardian — 2025 npm/PyPI/Docker supply chain campaigns](https://blog.gitguardian.com/three-supply-chain-campaigns-hit-npm-pypi-and-docker-hub-in-48-hours/)
- [Promptfoo — LLM red teaming guide](https://www.promptfoo.dev/docs/red-team/)
- [AWS IMDSv2 による SSRF 軽減](https://www.resecurity.com/blog/article/ssrf-to-aws-metadata-exposure-how-attackers-steal-cloud-credentials)
