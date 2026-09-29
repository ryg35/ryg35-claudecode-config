# 既存コードから model.json を起こす

対象は Supabase + TypeScript + React Router 構成を想定。
読む順番は **migration → 型定義 → routes**。この順で読むと、テーブルの真の姿を先に掴める。

| 取り出すもの | 読むファイル |
| --- | --- |
| entity と attributes | `supabase/migrations/*.sql`（`CREATE TABLE`） |
| 型の確認と補完 | `src/types/database.ts`（Supabase 生成型の `Row`） |
| relations | migration の `REFERENCES` / 生成型の `Relationships` |
| screens と route | `src/routes.tsx` |
| screens[].entities | 各画面コンポーネントの `.from('table')` / RPC 呼び出し |

## 0. migration があるなら、まず機械抽出する

手で写すのは migration が無いときだけ。**migration が正典なら `extract-sql.mjs` に読ませる。**

```bash
node ~/.claude/skills/object-canvas/scripts/extract-sql.mjs supabase/migrations \
  --schema-first supabase/schema_current.sql \
  --merge model.json --include-external --report --out model.json
```

ファイル名の昇順に適用して最終状態を組み立てる。`ALTER TABLE ... DROP COLUMN` も `RENAME` も
`DROP TABLE` も効くので、**生成型（`database.ts`）や古い schema dump より新しい**。
生成型や schema dump は更新が止まっていることが多く、migration から起こした方がテーブル数が多くなるのが普通。

機械が出せるのはここまで。

| 機械が出す | 人が足す |
| --- | --- |
| entity（テーブル名が id・label）、attributes（列名・型・pk・fk）、relations（FK ごとに N:1 か 1:1）、`x_source`（定義元の migration） | 日本語の `label`（`--labels` で当てる）、`screens` と `flows`、relation の業務ラベル、図に載せないテーブルの間引き |

**読まない DDL がある。** 関数本体と `DO $$ ... $$` の中の DDL、`CREATE TABLE ... AS SELECT`、
`ALTER COLUMN` の型変更は無視する。`--report` を付けて「解釈できなかった文」を必ず目視する。
`auth.users` のような他スキーマへの FK は、`--include-external` を付けたときだけ entity になる
（Supabase 構成では FK の半数以上がこれになることもある）。

抽出したあとは、下の 3 以降（screens / screens[].entities / flows）を人が足す。
`--merge` で既存 model の `title` / `screens` / `flows` と、id が一致する entity の日本語ラベルは引き継がれる。

## 1. entity と attributes（手で写すとき）

```bash
grep -n "CREATE TABLE" supabase/migrations/*.sql
```

`CREATE TABLE public.customers (...)` の中身をそのまま写す。

- テーブル名 `customers` → `id: "customer"`（単数形にすると図が読みやすい）
- `label` は日本語の業務名。コードから機械的には出ない。**推測で埋めず、画面の見出しか用語集から取る**
- `PRIMARY KEY` の列 → `"pk": true`
- `REFERENCES public.staff(id)` → `"fk": "staff"`
- 型は SQL のまま（`uuid` / `text` / `integer` / `timestamptz`）でよい

`created_at` / `updated_at` / `deleted_at` は全テーブルに付いていることが多い。
ER 図に毎行出ると読みにくいので、**時刻列は代表 1 つだけ載せるか、落とす**。図の目的は監査列の確認ではない。

生成型から確認するときはここを見る。

```bash
grep -n "customers: {" -A 40 src/types/database.ts
```

`Row` が実体、`Insert` / `Update` は書き込み用なので無視する。

## 2. relations

`Relationships` 配列が外部キーをそのまま持っている。

```bash
grep -n "Relationships" -A 12 src/types/database.ts
```

```jsonc
// foreignKeyName: "customers_assignee_id_fkey", columns: ["assignee_id"], referencedRelation: "staff"
{ "from": "customer", "to": "staff", "label": "担当する", "cardinality": "N:1" }
```

- 向きは **参照する側が from**。`customers.assignee_id → staff.id` なら from は customer
- `cardinality` は fk 列に `UNIQUE` が付いていれば `1:1`、付いていなければ `N:1`
- 中間テーブル（両方が fk で、他に業務列がない）は `N:M` の 1 本にまとめてよい。まとめたら中間テーブルは entity から外す。属性を持っているなら entity として残す
- `label` は業務の言い方（「担当する」「申し込む」）。`fkey` 名をそのまま入れない。読めない図になる

## 3. screens

```bash
grep -n "path:" src/routes.tsx
```

```jsonc
{ "id": "customer-list", "label": "顧客一覧", "route": "/customers", "entities": ["customer", "staff"] }
```

- `id` は route から機械的に作る（`/customers/:id` → `customer-detail`）
- `label` は画面の `<h1>` かナビゲーションの文言から取る
- レイアウト用の親ルート（`element` が `<Outlet />` だけ）は画面ではない。落とす

## 4. screens[].entities（逆引きの元）

画面コンポーネントが触るテーブルを拾う。

```bash
grep -rn "\.from('" src/pages/customers/
grep -rn "useQuery\|useMutation" src/pages/customers/
```

`.from('customers')` と `.from('staff')` が出てくれば `"entities": ["customer", "staff"]`。
`select('*, staff(name)')` のような join 先も含める。**ここが埋まっていないと、概念図のホバーで
「この概念を扱う画面」が出ない。** このスキルの値打ちの半分はこの逆引きにあるので、手を抜かない。

## 5. flows

画面間の遷移。`navigate('/customers/' + id)` や `<Link to=...>` を拾う。

```bash
grep -rn "navigate('/\|<Link to=" src/pages/ | head -50
```

全部は要らない。**主要な導線だけ**（一覧 → 詳細、詳細 → 作成）。flows は画面ビューの並び順も決めるので、
入れ過ぎると横に伸びて読めなくなる。

## 6. 検査して描く

```bash
node ~/.claude/skills/object-canvas/scripts/validate.mjs model.json
node ~/.claude/skills/object-canvas/scripts/render.mjs model.json --out docs/object-canvas.html
```

fk の綴り間違い、存在しない entity、cardinality の不正値は validate が「どの entity の何が」まで出す。

## 大きいコードベースのとき

テーブルが 40 を超えるなら、SQL の読み取りだけを別プロセス（サブエージェントかローカル LLM）に回し、
**出てきた JSON を必ず validate にかける**。丸投げした JSON は fk の綴りが落ちる。検査が最後の砦になる。

## やらないこと

- **DB の全テーブルを写さない。** 監査ログ、セッション、キュー、マイグレーション管理テーブルは図に載せない。業務の概念だけ載せる
- **生成した HTML を直さない。** 直しても次の render で消える。model.json を直す
