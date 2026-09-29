# 例

## model.example.json

不動産仲介 CRM を想定した例。entity 12 / relation 15 / screen 6 / flow 5。
`group` は「組織・顧客・物件・商談・契約」の 5 つで、概念図と ER 図の色分けに使う。

```bash
cd ~/.claude/skills/object-canvas
node scripts/validate.mjs examples/model.example.json
node scripts/render.mjs examples/model.example.json --out /tmp/crm.html
open /tmp/crm.html
```

開いたら 1・2・3 キーでビューを切り替える。ノードをドラッグすると位置が残る（ブラウザの localStorage、
キーは title + ビュー名）。位置を捨てたいときはメニューの「自動配置（並べ直す）」。

## 新しいモデルを作るとき

この JSON をコピーして中身を入れ替えるのが速い。書く順番は次のとおり。

1. `entities`: まず id と label だけ全部並べる。属性は後でよい
2. `relations`: from が「参照する側」、to が「参照される側」。`cardinality` は from から見た書き方（顧客 N 対 担当者 1 なら `"N:1"`）
3. `attributes`: pk と fk を先に入れる。fk を入れると ER 図に参照先が出る
4. `screens`: `entities` にその画面が読み書きする entity を並べる。これが概念図のホバー逆引きになる
5. `flows`: 画面から画面への遷移。画面ビューの並び順もこれで決まる

## blocks で使える kind

`image` を指定しない画面は `blocks` から簡易ワイヤーを描く。kind は次を認識する。

| kind | 描かれるもの |
| --- | --- |
| `header` | 全幅の帯 + タイトル |
| `toolbar` / `filter` / `tabs` / `search` | 全幅の細い帯 + ラベル |
| `table` / `list` | 列名の見出し行 + 6 行のダミー行（`columns` が列名になる） |
| `form` | `columns` の数だけラベル + 入力欄 |
| `button` | アクセント色のボタン |
| `text` | 3 行のテキスト帯 |
| `footer` | 画面下端の帯 |
| 上記以外（`card` / `panel` / `chart` / `calendar` など） | ラベル付きの箱 |

知らない kind を書いてもエラーにはならない。ラベル付きの箱になる。

## 実画面のスクリーンショットを使う

```jsonc
{ "id": "customer-list", "label": "顧客一覧", "route": "/customers",
  "image": "shots/customer-list.png", "entities": ["customer", "staff"] }
```

`image` は **出力 HTML から見た相対パス**。HTML を `docs/canvas.html` に置くなら
`docs/shots/customer-list.png` に画像を置いて `"shots/customer-list.png"` と書く。
画像は HTML に埋め込まれない（外部 URL は検査で弾く。相対パスの画像だけが対象）。
