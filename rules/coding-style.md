# Coding Style

## Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate:

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return {
    ...user,
    name
  }
}
```

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large components
- Organize by feature/domain, not by type

## Error Handling

ALWAYS handle errors with intent:

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

## Input Validation

ALWAYS validate user input:

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No console.log statements
- [ ] No hardcoded values
- [ ] No mutation (immutable patterns used)

## CSS: 部品クラスがユーティリティを後勝ちで潰す

部品クラス（`.card` / `.num` / `.stat .val` のような「モノ」を表すクラス）に
**font-size や color を持たせると、後から付けたユーティリティクラスを後勝ちで潰す**。
詳細度が同じ (0,1,0) なら、CSS の後ろに書いたほうが勝つ。

```css
/* WRONG: .num-lg が後ろにあるので、.disp-3 を付けても 32px のまま */
.disp-3 { font-size: 96px; }        /* 前 */
.num-lg { font-size: 32px; }        /* 後。こちらが勝つ */
```

```css
/* CORRECT: ユーティリティが勝つ行を対で書く */
.num-lg { font-size: 32px; }
.num.disp-3 { font-size: 96px; }    /* (0,2,0) で確実に勝つ */
```

**症状が出ない**のが最悪の性質。96px のはずが 32px でも「数字が小さめ」に見えるだけで、
色が消えていなければ壊れているように見えない。目視レビューでは通る。

検出は機械でやる。**クラスが指すトークンの値と、実際の `getComputedStyle().fontSize`
を突き合わせる**。期待値は CSS 変数から実行時に読む（px を書き写すと二重ソースになる）。

**痛点**: 2026-08-09 に1日で3回踏んだ。
`.stat .val` (0,2,0) が `.disp-1`(160px) を 53px に潰し、
`.num-lg` が `.disp-3`(96px) を 32px に潰し、
`.t1`/`.t2` の自前の色が濃い面のコンテナの `color` を無視して面と同色になった。
うち2件は **カタログ中1箇所でしか使われていないトークン** で起きたので、
「定義したのに一度も画面に出たことが無い」状態が続いていた。
使用箇所が1つしか無いトークンは、壊れていても誰も気づかない。

## Confusion Protocol

コーディング中、以下のような **高リスクの曖昧さ** に遭遇したとき:

- 同じ要件に対し、もっともらしいアーキテクチャやデータモデルが2つあって決められない
- ユーザの依頼が既存のパターンと矛盾し、どちらに従うべきか分からない
- 破壊的な操作で、影響範囲が不明確
- 知っていれば方針が大きく変わる文脈が欠落している

**STOP**。曖昧さを **1文で命名** せよ。**2-3 個の選択肢を trade-off つきで提示** せよ。
**ユーザに訊け**。アーキテクチャ判断やデータモデル判断を推測で進めるな。

これは routine なコーディング、小さな機能追加、明白な変更には適用しない。
出典: gstack `generate-confusion-protocol.ts`

## Self-Verification (最後の grep を走らせろ)

書いたものに自分のルールが守られているか、コミット前に必ず grep で検証する。
「ルールを書いた」と「ルールが守られている」は別の状態だ。

**コミット前の必須 grep:**

```bash
# voice.md 違反 (em dash, AI 語彙)
grep -nH '—' <changed-files>
grep -niE 'delve|crucial|robust|comprehensive|nuanced|multifaceted|深掘り|包括的|多面的|堅牢' <changed-files>

# 残存 TODO / FIXME / WIP コメント
grep -niE 'TODO|FIXME|WIP|XXX' <changed-files>

# console.log / print / dbg! の取り残し
grep -nE 'console\.(log|debug)|print\(|dbg!' <changed-files>

# シークレット混入の最終確認
grep -niE 'sk-[a-z0-9]|api[_-]?key|password|secret' <changed-files>
```

**痛点**: 過去に voice.md を作った直後、自分の書いた ETHOS.md / voice.md / ask-brief.md
に em dash が17箇所あった。「ルールを書いた」と「ルールが守られている」を同じだと
思い込むと、似た失敗を繰り返す。

これは routine な編集にも適用する。新規ファイル作成、既存ファイルの大幅変更時。
1行修正には不要。

## Documentation Discipline (記録は未来の自分への贈り物)

学んだことを残す責任は今日のあなたにある、明日のあなたにではない。
コンテキストはセッション境界で消える、しかし以下の場所は残る:

| 何を残すか | どこに書くか |
|---|---|
| なぜこのコードがこう書かれているか (非自明な制約、回避策) | コードコメント (1行) |
| なぜこの judgment call をしたか | commit message body |
| ユーザに見える変更 | CHANGELOG.md |
| project-specific な決定 (テストコマンド、デプロイ手順等) | プロジェクトの CLAUDE.md |
| 環境横断の知見 (gstack 由来の skill 等) | `~/.claude/rules/*.md`, `~/.claude/skills/*/SKILL.md` |
| セッション間ハンドオフ (次セッションで知りたい未解決事項) | `~/.claude/handoff/current.md` (上書き) |
| /compact 直前のスナップショット | `~/.claude/handoff/precompact-<YYYY-MM-DD-HHMM>.md` (追記) |

**memory には書かない**。memory は使わない方針。代わりに上記の永続化先で完結させる。

**memory ではなく handoff で**: セッション間で残したい情報は `~/.claude/handoff/` に markdown で書く。 JSON state や key-value memory は使わない。 markdown は読み返しやすく、 git diff で何が変わったか追える。

**何を書かないか:**
- 「便利そうだから」のコード片 (使わない知識は腐る)
- 「将来こうしたい」の願望 (yagni)
- WHAT (コードを読めば分かる)、WHY だけ書け

**痛点**: /compact が走るたびに同じ判断基準をゼロから組み立て直す。
解決策は memory ではなく、「重要な判断は必ず commit message body / CHANGELOG /
SKILL.md / rules/ のどこかに residence する」を徹底すること。

## Burn Log (痛みのないコードに学びはない)

テストが通った = 正解、ではない。同じバグを2回やったとき初めて
**自分の知識**になる。1回目の痛みを記録しなければ、2回目は来る。

**Burn の記録先:**
- 既存ファイルの **コードコメント1行** (痛みが起きた場所に貼る)
- バグ修正 commit の **body** に「再発防止: <1行>」を必ず書く
- 同じ痛みが2回起きたら、`~/.claude/rules/coding-style.md` に新規ルールを追加する

**判断基準:**
- 同じ痛みを **1回目**: コメントと commit body に記録、それで終了
- **2回目**: rules に昇格、原則化する
- **3回目**: rules を読んでないか、書き方が悪い、見直す

**痛点**: 「これ前にも見たな」と思いながら、また同じ修正を書く。
1回目の痛みを「次回は気をつけよう」で済ませると、必ず2回目が来る。
気をつけるのは記憶力ではなく、書いたものを再読する習慣だ。

## Tools

### ast-grep (`sg`)

Use `sg` for structural code search and replace when grep is not precise enough. Examples:

- Find all `console.log(...)` calls (not comments containing the string): `sg --pattern 'console.log($A)' --lang ts`
- Replace `var X = Y` with `const X = Y` in JS: `sg --pattern 'var $A = $B' --rewrite 'const $A = $B' --lang js`
- Find unused imports by structure (not text)

Install: `brew install ast-grep` (OSS, Rust, MIT). The binary is `sg`.