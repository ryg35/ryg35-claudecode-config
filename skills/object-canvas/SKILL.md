---
name: object-canvas
description: 1 つの model.json から「画面 / 概念図 / ER 図」を同じキャンバスに描き、メニュー 1 つで切り替える単一 HTML を生成するスキル。3 つを別々のツールで描くと、片方だけ古くなって嘘の図が残る。元データが 1 つなら、直した側にもう片方が必ず追従する。「画面と概念図と ER 図を 1 枚で見たい」「オブジェクトの紐づきを見たい」「モデル図と画面を同じ元データから描きたい」「OOUI のオブジェクト図がほしい」「この画面はどのテーブルを触るのか知りたい」と言われたとき、既存コード（migration・型定義・routes）からモデル図を起こすとき、または /object-canvas で使う。1 枚絵は diagram-studio、スライド一式は slide-deck-studio が担当。
user_invocable: true
---

# object-canvas（1 つの元データから、画面と概念図と ER 図）

## 着手前に宣言する（例外なし）

生成に入る前に、ユーザーに 1 行で宣言する。

> 「I'm using object-canvas。model.json を正本にして、画面・概念図・ER 図を 1 枚の HTML に描く。」

## HTML を直接編集しない

生成された HTML は **使い捨て**。直すのは `model.json` だけ。
理由: 図と元データを二重に持つと、片方だけ古くなる。古い図は無いより悪い。

HTML を手で直したくなったら、それは model.json に足りない情報があるという合図。
model.json 側に足して render し直す。**例外は無い。**

---

## 手順

### 1. 元データを決める

| 状況 | やること |
| --- | --- |
| Supabase / Postgres の migration がある | `scripts/extract-sql.mjs` で entity と relation を機械抽出 → 日本語ラベルと screens を人が足す（下の「migration から機械抽出する」） |
| 動いている DB に接続できる | `scripts/extract-db.mjs` でカタログから抽出（下の「本番 DB から起こす」）。migration より実態に近い |
| 既存のコードがある（migration は無い） | `references/extract-from-code.md` の順（型定義 → routes）で起こす |
| ゼロから設計する | `examples/model.example.json` を複製して中身を入れ替える。書く順番は `examples/README.md` |

スキーマ（v1）はこの形。`screens` / `flows` / `attributes` / `group` は任意。

```jsonc
{
  "version": 1,
  "title": "不動産仲介CRM 基幹システム",
  "entities": [
    { "id": "customer", "label": "顧客", "group": "顧客",
      "attributes": [ { "name": "id", "type": "uuid", "pk": true },
                      { "name": "assignee_id", "type": "uuid", "fk": "staff" } ] }
  ],
  "relations": [
    { "from": "customer", "to": "staff", "label": "担当する", "cardinality": "N:1" }
  ],
  "screens": [
    { "id": "customer-list", "label": "顧客一覧", "route": "/customers",
      "entities": ["customer", "staff"],
      "width": 1440, "height": 1024,
      "image": "shots/customer-list.png",
      "blocks": [ { "kind": "header", "label": "顧客一覧" },
                  { "kind": "table", "entity": "customer", "columns": ["name", "phone", "assignee_id"] } ] }
  ],
  "flows": [ { "from": "customer-list", "to": "customer-detail", "label": "行をクリック" } ]
}
```

- `cardinality` は `1:1` / `1:N` / `N:1` / `N:M` のどれか。from から見た向きで書く
- `screens[].entities` は **その画面が読み書きする entity**。概念図のホバー逆引き（この概念を扱う画面）に使う
- `image` があれば画面ビューにその画像を出す。無ければ `blocks` から簡易ワイヤーを描く

#### migration から機械抽出する

テーブルが 30 を超えると、手で写すのは現実的でない。migration を適用順に読んで最終状態を組み立てる。

```bash
node ~/.claude/skills/object-canvas/scripts/extract-sql.mjs supabase/migrations \
  --schema-first supabase/schema_current.sql \
  --merge model.json --labels labels.json --include-external --report \
  --out model.json
```

| オプション | 効果 |
| --- | --- |
| `--schema-first <f.sql>` | 先にこの SQL を土台として読む（pg_dump の schema。ここに migration を重ねる） |
| `--merge <model.json>` | 既存の `title` / `screens` / `flows` と、id が一致する entity の `label` / `group` を引き継ぐ。screen の `x_unmodeled_entities` のうち抽出できたテーブルは `entities` へ移す |
| `--labels <json>` | `{"applications": "応募"}` の形で日本語ラベルを当てる |
| `--include-external` | `auth.users` のような他スキーマの参照先を、属性を持たない entity として足す（付けないと、そこへの FK は relation ごと落ちる） |
| `--report` | 無視した DDL を種類別の件数と、解釈できなかった文の先頭 80 文字で stderr に出す |
| `--title` | タイトルを上書きする（`--merge` の title より優先） |

出力は最後に `validateModel` を通る。エラーがあればファイルを書かずに exit 1。

**この抽出器が読む DDL はこれだけ。**

- `CREATE TABLE`（列・`PRIMARY KEY`・`REFERENCES`・表レベルの `PRIMARY KEY` / `FOREIGN KEY` / `UNIQUE`）
- `ALTER TABLE` の `ADD [COLUMN]` / `ADD CONSTRAINT ... FOREIGN KEY` / `ADD CONSTRAINT ... PRIMARY KEY` / `UNIQUE` / `DROP [COLUMN]` / `RENAME [COLUMN] a TO b` / `RENAME TO`
- `DROP TABLE`、`CREATE [OR REPLACE] VIEW`（列は読まない。`x_kind: "view"` と、本文に出てくる既知テーブルを `x_view_of` に）
- `CREATE TYPE ... AS ENUM`（その型の列は `enum(値, 値)` と出る）

**読まないもの。** 関数本体と `DO $$ ... $$` の中（そこで作るテーブルは model に出ない）、`CREATE TABLE ... AS SELECT`、
`CREATE INDEX` / `CREATE POLICY` / `GRANT` / `COMMENT`、`ALTER COLUMN` の型変更。列の型は SQL の文字列のまま
（`timestamp with time zone` → `timestamptz` のような短縮だけする）。`label` は機械には出せないので、
既定はテーブル名そのまま。**日本語ラベルと screens は人が足す。**

`--report` の「解釈できなかった文」は必ず読む。テーブルを触る文が残っていたら、model に穴が空いている。

#### 本番 DB から起こす

migration は「そこまでの履歴」で、DB は「いまの形」。手で当てた DDL、退避テーブル（`_bak_*`）、
migration に入れ忘れた FK は、DB を読まないと出てこない。接続できるなら `scripts/extract-db.mjs` を使う。

```bash
node ~/.claude/skills/object-canvas/scripts/extract-db.mjs \
  --psql "./jsq.sh" --schema public \
  --merge model.json --groups groups.json --include-external --report \
  --title "..." --out model.json
```

`--psql` には **psql の実行コマンドをそのまま**渡す（`./jsq.sh` のような読み取り専用ロールのラッパを想定）。
接続先とパスワードはスクリプトが持たず、発行する SQL は `pg_class` / `pg_attribute` / `pg_constraint` /
`pg_index` / `pg_enum` への SELECT だけ。SELECT 以外は投げる前に落とす。列の型は `format_type` で取るので
`information_schema` のように配列や enum が `ARRAY` / `USER-DEFINED` に潰れない。NOT NULL と既定値は
`x_notnull` / `x_default`、FK 名と ON DELETE は relation の `x_fk` / `x_on_delete` に入る。
`--merge` は extract-sql.mjs と同じ引き継ぎに加えて、**entity の並び順**と、from→to が双方 1 本だけの
relation の label も引き継ぐ（図の並びと手で直した関連名が、抽出し直しで変わらない）。
`--groups` は `{"_bak_*": "backup"}` の形で group を上書きする（末尾 `*` は前方一致。`--merge` より強い）。

### 2. 検査する

```bash
node ~/.claude/skills/object-canvas/scripts/validate.mjs model.json
```

fk の綴り間違い、relation の未知 id、`screens[].entities` の未知 id、cardinality の不正値、id の重複を
「どの entity の何が」まで日本語で出す。**エラーが出た状態で render に進まない**（render 側でも止まる）。

### 3. 描く

```bash
node ~/.claude/skills/object-canvas/scripts/render.mjs model.json --out docs/object-canvas.html
# 任意: --theme themes/custom.css --title "別名モデル"
```

出力は単一 HTML。CDN もフォントも読み込まない。`screens[].image` だけは相対パスで外部ファイルを参照する。

### 4. ブラウザで 3 ビューを確認する

```bash
open docs/object-canvas.html
```

| 操作 | 結果 |
| --- | --- |
| 左上のメニュー / キー `1` `2` `3` | 画面 / 概念図 / ER 図を切り替え |
| メニュー下段「自動配置」 / キー `R` | 並べ直す（保存した位置を捨てる） |
| ドラッグ | キャンバスのパン、ノードの移動（位置は localStorage にビューごとに保存） |
| ctrl・command + ホイール、右下の ± | ズーム（右下に % 表示） |
| 右上「全体を見る」 | 全体が入るところまで引く。entity 30 超の初期表示は最初の group ブロック寄りなので、俯瞰したいときに押す |
| 概念図・ER 図でノードにホバー | 関連のハイライト + その概念を扱う画面の一覧。ハブ宛の薄い線もここで浮かぶ |

`#concept` を URL に付けて開くとそのビューから始まる（`docs/object-canvas.html#er` など）。

**直すときは model.json だけ直して、手順 2 から繰り返す。** HTML を手で直さない。

---

## デザインシステムと合わせる

プロジェクトに正典のトークン CSS がある場合（例: 対象プロダクトの
`docs/brand/colors_and_type.css`）、`themes/README.md` の手順で `--oc-*` に写した
theme CSS を作り、`--theme` で渡す。正典の CSS 自体は編集しない。

描画側が読むのは `--oc-bg` / `--oc-surface` / `--oc-border` / `--oc-text` / `--oc-muted` / `--oc-accent` /
`--oc-group-1..6` / `--oc-radius` / `--oc-font` の 12 個だけ。生の色コードはテーマ CSS にしか無い。

## PNG に書き出す

diagram-studio の Chrome headless 手順をそのまま使える。ビューは `#` で指定する。

```bash
~/.claude/skills/diagram-studio/references/render.sh docs/object-canvas.html docs/concept.png 2000 1200
```

`render.sh` は `#` を渡せないので、ビューを選ぶときは Chrome を直接叩く。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --force-device-scale-factor=2 --window-size=2000,1200 --hide-scrollbars --virtual-time-budget=2500 \
  --screenshot=docs/er.png "file://$PWD/docs/object-canvas.html#er"
```

## 自分で直すとき

```bash
cd ~/.claude/skills/object-canvas
node --test tests/*.test.mjs   # 62 件。Node 26 では `--test tests/` は通らない。glob で渡す
```

依存パッケージは入れない（`package.json` も置かない）。`node:test` / `node:fs` / `node:path` / `node:url` だけで動く。

## 制約と未対応

- **画像はプロジェクト側に置く。** HTML には埋め込まない。HTML から見た相対パスで解決する
- **配置の決め方（概念図 / ER）。** 次数が `max(8, entity 数 × 15%)` を超える entity と `x_kind: "external"` の entity は**ハブ**として層の計算から外し、上端に横一列で置く。ハブ宛の線はラベルと多重度を省いて細く薄く描き、ホバーしたときだけ浮かせる。残りは `group` ごとのブロックに分け、ブロック内は relations の from→to で層を作り、1 層 6 ノードで折り返した格子にする。ブロックは group 間の relation が多い順に隣へ並べ、幅 3000 で次の行に折り返す。`group` が無い entity は `other` ブロックに入る
- **ハブが図の主役なら向かない。** 「auth.users に何がぶら下がるか」を見たい場合、その線は薄くなる。ホバーで浮かせるか、その entity だけの図を別に起こす
- **線は直線で、交差はゼロにならない。** ブロックをまたぐ relation は他のブロックの上を横切る。最後の詰めはノードをドラッグする（位置は保存され、group の枠も追従する）
- **ワイヤーは矩形とラベルだけ。** 実画面の再現ではない。見た目を詰めるなら実画面の PNG を `image` に置く
- **規模は entity 82 / relation 96 / screen 30 で実測済み**（2026-09-16、Chrome headless 1600×1000）。entity 200 超は未検証
- **entity 30 超の初期表示は全体ではない。** 最初の group ブロックが画面に収まるズームで開く（全体に合わせると 10% 台まで落ちてラベルが読めない）。俯瞰は右上の「全体を見る」。自動配置（R）の直後も同じ寄り方をする
- **保存されるのはノードの位置だけ。** ブラウザの localStorage に `oc:v2:title:ビュー名` のキーで入る。title を変えると位置は初期化される。`v2` は配置の世代で、自動配置を作り替えたときに上げる（古い位置が復元されて新しい配置が見えないのを防ぐ）
- **循環する relation** があっても止まらない（層の計算に上限を入れてある）が、線は重なりやすい
