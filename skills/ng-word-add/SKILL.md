---
name: ng-word-add
description: NGワード辞書 ~/.claude/rules/ng-words.yaml に語や言い回しを1つ足すときの手順。「これ禁止語にして」「この表現やめて」「NGワードに追加」「この言い方が嫌い」とユーザが言った直後に必ず起動する。この手順を通さず yaml を直接編集すると、pattern の取りこぼし、既存ルールとの二重登録、期待件数のずれでテストが落ち、次の誤検知でそのルールごと消される。
user_invocable: true
---

# NGワード追加 (/ng-word-add)

ユーザが「この表現はやめてくれ」と言った瞬間が、辞書に足す唯一のタイミングだ。
その場で足さないと、同じ表現が来週また出てくる。毎回だ。

対象は3つのファイルだけ。ほかは触るな。

- `~/.claude/rules/ng-words.yaml` ... 機械照合の正
- `~/.claude/scripts/fixtures/ng-words/ng.md` ... 新ルールを踏む行
- `~/.claude/scripts/ng-words-test.sh` ... 期待件数 `EXPECT_NG`

`~/.claude/rules/voice.md` は人間向けの説明なので、語を足しただけでは書き換えない。

## 手順

### 1. 既存ルールと重なっていないか数える

```bash
grep -n '<語>' ~/.claude/rules/ng-words.yaml
grep -nc 'id:' ~/.claude/rules/ng-words.yaml
```

既存の pattern に吸収できるなら、新規ルールを作るな。その pattern を1語だけ広げろ。
ルールが増えるほど reason が薄くなり、出力が読み飛ばされる。

### 2. 中身を出してユーザに確認を取る

決めるのはユーザだ。次の5つを並べて聞け。

- `id` ... kebab-case、既存と衝突しないこと
- `pattern` ... Python の re。英単語は `(?<![A-Za-z0-9_])` と `(?![A-Za-z0-9_])` で囲む
  （`\b` はカナに接すると効かない。`DOMテスト` を取りこぼす）
- `reason` ... なぜ駄目か1行。禁止語そのものを reason に書くと自爆する
- `good` ... その語を使わずに同じ意味を言う文。ユーザが今書いていた文脈から作る
- `selfcheck` ... その pattern が必ず当たるはずの例文。1つ。ユーザが実際に書いた文がいい
- `scope` ... `all` か `external`。対外文書だけの問題なら `external`

`external` が効くのは、パスに `/02-think-output/` `/note/` `/lp/` を含む文書か、
frontmatter に `audience: external` がある文書だけだ。ディレクトリ名が external でも、
それだけでは対外扱いにならない。社内の作業ディレクトリと見分けが付かないからだ。

誤検知の幅も一緒に見せろ。「創作」を丸ごと禁止すると「創作活動」まで拾う。
拾いたくない用法があるなら pattern を絞るか、`unless_line_contains` を足す。
`unless_line_contains` はマッチ直後64文字以内しか見ない。同じ行の遠くにある説明では
見逃さない。1語を説明しただけでその行の全部が消えるのを防ぐためだ。

### 3. yaml の末尾に足して、selfcheck に当たるか確かめる

```bash
~/.claude/scripts/ng-words-check.sh --file ~/.claude/scripts/fixtures/ng-words/ok.md
```

このファイルは検出0件なので、何か出たらそれは全部ルール側の警告だ。
`警告: <id>: pattern が selfcheck 行に当たらない` が出たら、pattern か selfcheck の
どちらかが間違っている。1文字も出なければ、19ルール全部が自分の例文に当たっている。

コンパイルが通るかだけ見ていた頃は、`(?:包括的` のような書き損じは弾けても、
`包括的` を1文字打ち間違えたルールは黙って通っていた。検査器は動いているように見えて、
その語だけ素通りする。最悪の壊れ方だ。

### 4. フィクスチャに1行足して、テストを通す

新ルールを踏む行を `fixtures/ng-words/ng.md` に1行足し、`ng-words-test.sh` の
`EXPECT_NG` を +1 する。そのうえで走らせる。

```bash
~/.claude/scripts/ng-words-test.sh
```

手順4を飛ばしたルールは、次の誤検知で黙って消される。毎回だ。
テストに1行も無いルールは、誰かが「これ誤検知だから」と削ったとき、
削っていいのか判断する材料が無い。pass=N fail=0 を見るまで終わりではない。

`selfcheck` と `ng.md` の1行は役割が違う。selfcheck は pattern が生きているかを
ルール単体で見る。`ng.md` は他の18ルールと同居させたときに、件数が1件だけ増えるかを見る。
片方だけでは、二重登録も、他のルールを巻き込む pattern も見つからない。

### 5. 1行で報告する

何を足したか、テストが何件通ったかを1行で返せ。

```
ng-words.yaml に <id> を追加。ng-words-test.sh pass=11 fail=0。
```

## やらないこと

- `~/.claude/settings.json` は触らない。hook の登録は別手順
- 語を消すときも同じ手順を通す。フィクスチャの行と `EXPECT_NG` を必ず一緒に直す
- ユーザが言っていない語を「ついでに」足さない。辞書が太ると出力が読まれなくなる
