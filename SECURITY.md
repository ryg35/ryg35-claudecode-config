# Security Policy

## 脆弱性の報告

このリポジトリの脆弱性は、公開Issueではなく **[Private vulnerability reporting](https://github.com/ryg35/ryg35-claudecode-config/security/advisories/new)** から報告してほしい。悪用可能な情報が修正前に公開される事故を避けるため。

特に歓迎する報告:

- `scripts/pre-tool-enforcer.sh` のガードすり抜けパターン(main直push・force push・bulk add等が通ってしまうコマンド形)。再現コマンド付きだと最高
- hooks / scripts の権限・パス・インジェクション問題(例: ユーザ入力をshell文字列へ埋め込んでいる箇所)
- `settings.json` の permissions 構成で、denyリストとhooksの防衛線を回避できる組み合わせ

すり抜け報告は「このコマンドが素通りした」の1行と再現手順があれば十分。修正はトークナイズ式ガードへのケース追加として取り込む。

## 対象バージョン

リリース版の概念はなく、`main` の最新のみをサポートする。導入者は各自の `~/.claude/` に取り込んだ時点のスナップショットを使うため、修正後は再取り込みが必要。

## 前提の共有

このリポは「攻めたpermissions + denyリスト + hooks」という設計で、防衛線の実体は `settings.json` の deny と `scripts/pre-tool-enforcer.sh` にある。README の「そのまま使う前に読むこと」を読まずに導入した結果の事故は脆弱性ではなく設定ミスとして扱うが、ドキュメントの不備として改善はするので、それも報告してもらえるとありがたい。
