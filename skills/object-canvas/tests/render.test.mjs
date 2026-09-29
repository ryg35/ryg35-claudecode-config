// render.mjs の出力 HTML。単一ファイルで完結していること（外部参照ゼロ）まで見る
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderHtml } from '../scripts/render.mjs';
import { loadModel } from '../scripts/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = join(ROOT, 'examples', 'model.example.json');
const RENDER = join(ROOT, 'scripts', 'render.mjs');
const { model } = loadModel(EXAMPLE);
const html = renderHtml(model);
const work = mkdtempSync(join(tmpdir(), 'object-canvas-test-'));

test('title が HTML に埋まる', () => {
  assert.ok(html.includes('<title>' + model.title + '</title>'));
  assert.ok(html.includes(model.title));
});

test('model JSON がそのまま埋まる（3 ビューはこの 1 か所から描く）', () => {
  const m = html.match(/<script type="application\/json" id="oc-model">([\s\S]*?)<\/script>/);
  assert.ok(m, 'model の script 要素が無い');
  const embedded = JSON.parse(m[1]);
  assert.deepEqual(embedded, model);
  assert.equal(embedded.entities.length, model.entities.length);
});

test('3 ビューの DOM 骨格がある', () => {
  for (const v of ['screens', 'concept', 'er']) {
    assert.ok(html.includes(`data-view="${v}"`), `${v} のコンテナが無い`);
  }
  assert.ok(html.includes('id="oc-viewport"'));
  assert.ok(html.includes('data-act="relayout"'));
});

test('外部 URL がゼロ（CDN・フォント・画像 URL を持たない）', () => {
  const urls = html.match(/https?:\/\//g) || [];
  assert.deepEqual(urls, []);
});

test('テンプレートの差し込みが残っていない', () => {
  assert.deepEqual(html.match(/\{\{[A-Z_]+\}\}/g), null);
});

test('テーマのトークンが入り、描画側は生の色コードを使わない', () => {
  for (const t of ['--oc-bg', '--oc-surface', '--oc-border', '--oc-text', '--oc-muted',
    '--oc-accent', '--oc-group-1', '--oc-group-6', '--oc-radius', '--oc-font']) {
    assert.ok(html.includes(t), `${t} が無い`);
  }
  // 生の色コードはテーマ CSS の中だけ。それ以外の部分には出てこない
  // （&#8722; のような文字実体参照は色ではないので除く）
  const themeCss = readFileSync(join(ROOT, 'themes', 'neutral.css'), 'utf8');
  const withoutTheme = html.split(themeCss).join('');
  assert.deepEqual(withoutTheme.match(/(?<![&\w])#[0-9a-fA-F]{3,8}\b/g), null);
});

test('--theme で渡した CSS に差し替わる', () => {
  const themePath = join(work, 'custom.css');
  writeFileSync(themePath, ':root { --oc-bg: #101014; --oc-accent: #ff7a1a; }\n', 'utf8');
  const out = renderHtml(model, { theme: themePath });
  assert.ok(out.includes('--oc-accent: #ff7a1a'));
  assert.ok(!out.includes('--oc-accent: #2f6df6'));
});

test('title は HTML エスケープされる', () => {
  const evil = JSON.parse(JSON.stringify(model));
  evil.title = '<img src=x onerror=alert(1)>';
  const out = renderHtml(evil);
  assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!out.includes('<title><img'));
});

test('埋め込み JSON は script を閉じられない', () => {
  const evil = JSON.parse(JSON.stringify(model));
  evil.entities[0].label = '</script><script>alert(1)</script>';
  const out = renderHtml(evil);
  assert.equal((out.match(/<\/script>/g) || []).length, 2); // model の script と本体の script だけ
  assert.ok(out.includes('\\u003c/script\\u003e'));
});

test('CLI: --out に書き出して終了コード 0', () => {
  const out = join(work, 'out.html');
  const r = spawnSync(process.execPath, [RENDER, EXAMPLE, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(out));
  assert.ok(readFileSync(out, 'utf8').includes('data-view="concept"'));
});

test('CLI: --title でタイトルを上書きできる', () => {
  const out = join(work, 'retitled.html');
  const r = spawnSync(process.execPath, [RENDER, EXAMPLE, '--out', out, '--title', '別名モデル'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const written = readFileSync(out, 'utf8');
  assert.ok(written.includes('<title>別名モデル</title>'));
  const embedded = JSON.parse(written.match(/id="oc-model">([\s\S]*?)<\/script>/)[1]);
  assert.equal(embedded.title, '別名モデル'); // 埋め込み JSON 側も同じ値（二重化しない）
});

test('CLI: 不正な model は render せず終了コード 1', () => {
  const bad = join(work, 'bad.json');
  const out = join(work, 'bad.html');
  writeFileSync(bad, JSON.stringify({
    version: 1, title: 'ダメな例',
    entities: [{ id: 'a', label: 'A' }],
    relations: [{ from: 'a', to: 'b' }]
  }), 'utf8');
  const r = spawnSync(process.execPath, [RENDER, bad, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('存在しない entity'));
  assert.ok(!existsSync(out), 'エラー時に HTML を書いてはいけない');
});
