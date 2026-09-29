#!/usr/bin/env node
// model.json → 単一 HTML（画面 / 概念図 / ER 図を 1 キャンバスで切り替え）。
// 依存パッケージなし（node:fs / node:path / node:url のみ）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModel, validateModel } from './validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(HERE, '..');
const TEMPLATE = join(SKILL_ROOT, 'templates', 'canvas.html');
const DEFAULT_THEME = join(SKILL_ROOT, 'themes', 'neutral.css');

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// script 要素の中に安全に置ける JSON にする（</script> と行区切り文字を潰す）。
const embedJson = (obj) => JSON.stringify(obj)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// 置換値に $& などが含まれても壊れないよう、String.replace を使わず分割して繋ぐ。
const fill = (tpl, key, value) => tpl.split(`{{${key}}}`).join(value);

export function renderHtml(model, { theme } = {}) {
  const template = readFileSync(TEMPLATE, 'utf8');
  const themeCss = readFileSync(theme ? resolve(theme) : DEFAULT_THEME, 'utf8');
  let html = template;
  html = fill(html, 'TITLE', escapeHtml(model.title));
  html = fill(html, 'THEME_CSS', themeCss);
  html = fill(html, 'MODEL_JSON', embedJson(model));
  return html;
}

function parseArgs(argv) {
  const opts = { input: null, out: null, theme: null, title: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--theme') opts.theme = argv[++i];
    else if (a === '--title') opts.title = argv[++i];
    else if (a.startsWith('-')) throw new Error(`知らないオプション: ${a}`);
    else if (opts.input === null) opts.input = a;
    else throw new Error(`引数が多い: ${a}`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(`エラー: ${e.message}`);
    return 2;
  }
  if (!opts.input) {
    console.error('使い方: node scripts/render.mjs <model.json> --out <出力先.html> [--theme <css>] [--title <タイトル>]');
    return 2;
  }

  const { model, errors: loadErrors } = loadModel(opts.input);
  if (loadErrors.length > 0) {
    loadErrors.forEach((m) => console.error(`エラー: ${m}`));
    return 1;
  }
  if (opts.title) model.title = opts.title;

  const { errors, warnings } = validateModel(model);
  warnings.forEach((m) => console.warn(`警告: ${m}`));
  if (errors.length > 0) {
    errors.forEach((m) => console.error(`エラー: ${m}`));
    console.error(`\n${errors.length} 件のエラー。render は中止した。`);
    return 1;
  }

  const inAbs = resolve(opts.input);
  const outPath = resolve(opts.out ?? join(dirname(inAbs), `${basename(inAbs).replace(/\.json$/i, '')}.html`));
  let html;
  try {
    html = renderHtml(model, { theme: opts.theme });
  } catch (e) {
    console.error(`エラー: テンプレートかテーマを読めない（${e.message}）`);
    return 1;
  }
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    console.error(`エラー: テンプレートの差し込みが残っている: ${[...new Set(leftover)].join(', ')}`);
    return 1;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');

  const n = (a) => (Array.isArray(a) ? a.length : 0);
  console.log(`→ ${outPath}`);
  console.log(`   ${model.title}（画面 ${n(model.screens)} / entity ${n(model.entities)} / relation ${n(model.relations)}）, ${(html.length / 1024).toFixed(1)} KB`);
  if (n(model.screens) > 0 && model.screens.some((s) => s.image)) {
    console.log('   image を使っている画面がある。HTML から見える相対パスに画像を置く。');
  }
  return 0;
}

// 直接実行されたときだけ CLI として動く（パスに空白があっても壊れない比較）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
