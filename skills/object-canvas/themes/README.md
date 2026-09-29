# テーマの作り方

`--theme <css>` に渡した CSS は、出力 HTML の `<style>` にそのまま埋め込まれる。
描画側は `var(--oc-*)` しか読まない。だから **トークンを定義した CSS を 1 枚作れば見た目が変わる**。

## 必要なトークン

| トークン | 用途 |
| --- | --- |
| `--oc-bg` | キャンバスの地とドット背景 |
| `--oc-surface` | entity ボックス・画面フレームの面 |
| `--oc-border` | 枠線・関連線・ドット |
| `--oc-text` | ラベル本文 |
| `--oc-muted` | 型名・route・属性の補助表示 |
| `--oc-accent` | 矢印・ハイライト・現在ビューの印 |
| `--oc-group-1` 〜 `--oc-group-6` | entity の `group` ごとの淡い塗り |
| `--oc-radius` | 角丸 |
| `--oc-font` | フォント指定（端末にあるものだけ。`@import` や webfont の URL は書かない） |

12 個すべてを `:root` に書く。1 つでも欠けると、その部分だけブラウザ既定の色になる。

## プロジェクトのデザインシステムから写す

正典のトークン CSS がある場合（例: 対象プロダクトの `docs/brand/colors_and_type.css`）、
**そのファイルを編集しない**。写し先の新しいファイルを作る。

```css
/* themes/<product>.css */
@import は使わない。正典 CSS の中身を先にここへコピーしてから、下の対応付けを足す。

:root {
  --oc-bg:      var(--color-bg-subtle);
  --oc-surface: var(--color-bg-default);
  --oc-border:  var(--color-border-default);
  --oc-text:    var(--color-fg-default);
  --oc-muted:   var(--color-fg-muted);
  --oc-accent:  var(--color-brand-600);
  --oc-group-1: var(--color-blue-50);
  --oc-group-2: var(--color-green-50);
  --oc-group-3: var(--color-orange-50);
  --oc-group-4: var(--color-purple-50);
  --oc-group-5: var(--color-pink-50);
  --oc-group-6: var(--color-teal-50);
  --oc-radius:  var(--radius-md);
  --oc-font:    var(--font-sans);
}
```

正典 CSS が `:root` にトークンを定義していれば、`var()` の参照はそのまま解決される。
定義が `.theme-light` などのクラス配下にある場合は、その宣言を `:root` にコピーしてから参照する。

```bash
node scripts/render.mjs model.json --out out.html --theme themes/<product>.css
```

## 確認

出力 HTML をブラウザで開いて、3 ビューとも文字が読めるかを見る。
背景と文字のコントラストは surface と text の組で決まる。淡い group 色の上に muted の文字が乗るので、
group 色は彩度を落とした淡色にする。濃い色を group に入れると属性名が沈む。

## 暗いテーマ

`--oc-bg` と `--oc-surface` を暗く、`--oc-text` を明るくするだけで動く。
group 色は「暗い地に対して少し明るい」側へ寄せる（淡色のまま使うと文字が白飛びする）。
