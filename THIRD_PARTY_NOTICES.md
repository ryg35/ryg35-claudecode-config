# THIRD_PARTY_NOTICES

このリポジトリには、外部プロジェクトの文章やコードが残っているファイルがある。該当ファイルは元のライセンスに従う。自作部分のライセンスは [LICENSE](./LICENSE) (MIT)。

載せる基準は「上流の文章が実際に残っている」こと。ファイル自身に出典・翻案の記載があるか、上流と並べて比べて章立てと多くの文が一致するものだけを載せた。名前だけ同じで中身を書き直したファイルは載せていない (2026-10-01 時点で上流と照合)。

ライセンス本文は上流の LICENSE をそのまま転記している (英語原文)。

## gstack

- 上流: https://github.com/garrytan/gstack
- ライセンス: MIT
- 著作権表示: Copyright (c) 2026 Garry Tan
- 変更: 日本語化・改変あり
- 対象ファイル:
  - `ETHOS.md` (上流 ETHOS.md の翻訳・翻案)
  - `rules/voice.md` (上流 scripts/resolvers/preamble/generate-voice-directive.ts の翻訳・翻案)
  - `skills/ask-brief/SKILL.md` (上流 generate-ask-user-format.ts の AskUserQuestion Format を元にしている)
  - `rules/coding-style.md` の「Confusion Protocol」節 (上流 generate-confusion-protocol.ts を元にしている)

```text
MIT License

Copyright (c) 2026 Garry Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## oh-my-claudecode

- 上流: https://github.com/Yeachan-Heo/oh-my-claudecode
- ライセンス: MIT
- 著作権表示: Copyright (c) 2025 Yeachan Heo
- 変更: 改変あり (Claude Code 標準の道具だけで動くよう書き換え、ルーティング節などを追加)
- 対象ファイル:
  - `agents/analyst.md`
  - `agents/critic.md`
  - `agents/designer.md`
  - `agents/document-specialist.md`
  - `agents/executor.md`
  - `agents/scientist.md`
  - `agents/verifier.md`
  - `skills/ai-slop-cleaner/SKILL.md`
  - `skills/deep-dive/SKILL.md`
  - `skills/deepinit/SKILL.md`
  - `skills/plan/SKILL.md`
  - `skills/plan/references/deep-interview/SKILL.md`
  - `skills/ralph/SKILL.md`
  - `skills/ralph/references/ultrawork/SKILL.md`
  - `skills/team/SKILL.md`

```text
MIT License

Copyright (c) 2025 Yeachan Heo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## everything-claude-code

- 上流: https://github.com/affaan-m/everything-claude-code
- ライセンス: MIT
- 著作権表示: Copyright (c) 2026 Affaan Mustafa
- 変更: 改変あり (モデル指定、ルーティング節、この環境向けの手順を追加)
- 対象ファイル:
  - `agents/architect.md`
  - `agents/build-error-resolver.md`
  - `agents/code-explorer.md`
  - `agents/code-reviewer.md`
  - `agents/code-simplifier.md`
  - `agents/doc-updater.md`
  - `agents/e2e-runner.md`
  - `agents/harness-optimizer.md`
  - `agents/planner.md`
  - `agents/security-reviewer.md`
  - `agents/silent-failure-hunter.md`
  - `agents/tdd-guide.md`
  - `agents/typescript-reviewer.md`
  - `skills/agent-introspection-debugging/SKILL.md`
  - `skills/config-gc/SKILL.md`
  - `skills/deep-research/SKILL.md`
  - `skills/eval-harness/SKILL.md`
  - `skills/security-review/SKILL.md`
  - `skills/security-review/cloud-infrastructure-security.md`
  - `skills/strategic-compact/SKILL.md`

```text
MIT License

Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## awesome-claude-code-subagents

- 上流: https://github.com/VoltAgent/awesome-claude-code-subagents
- ライセンス: MIT
- 著作権表示: Copyright (c) 2025 VoltAgent
- 変更: 改変あり (モデル指定とルーティング節を追加)
- 対象ファイル:
  - `agents/chaos-engineer.md`
  - `agents/error-detective.md`
  - `agents/sre-engineer.md`

```text
MIT License

Copyright (c) 2025 VoltAgent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## superpowers

- 上流: https://github.com/obra/superpowers
- ライセンス: MIT
- 著作権表示: Copyright (c) 2025 Jesse Vincent
- 変更: 改変あり (要約・再構成)
- 対象ファイル:
  - `skills/skill-authoring/SKILL.md` (上流 skills/writing-skills/persuasion-principles.md の要約)
  - `agents/verifier.md` の言い訳防止表 (上流 verification-before-completion の要約)

```text
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## claude-code-japanese-guard

- 上流: https://github.com/minorun365/claude-code-japanese-guard
- ライセンス: Apache-2.0
- 著作権表示: Copyright 2026 Minoru Onda
- 変更: 無改変
- 対象ファイル:
  - `hooks/japanese-guard.py`

ライセンス本文と NOTICE は同じディレクトリの [hooks/japanese-guard.LICENSE](./hooks/japanese-guard.LICENSE) と [hooks/japanese-guard.NOTICE](./hooks/japanese-guard.NOTICE) にある。
