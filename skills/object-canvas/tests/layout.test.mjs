// 自動配置の純関数。templates/canvas.html の oc-layout 区間を抜き出して、そのまま動かして検査する
// （テスト用にコードを写すと、写した側だけ古くなる。正本は 1 か所）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = readFileSync(join(ROOT, 'templates', 'canvas.html'), 'utf8');

function loadLayout() {
  const after = TEMPLATE.split('oc-layout:start')[1];
  assert.ok(after, 'canvas.html に oc-layout:start が無い');
  const body = after.slice(after.indexOf('*/') + 2).split('/* === oc-layout:end')[0];
  assert.ok(body.includes('function ocLayoutGraph'), 'oc-layout 区間に ocLayoutGraph が無い');
  const names = ['OC_LAYOUT_DEFAULTS', 'ocDegrees', 'ocPickHubs', 'ocChunk', 'ocLayerize',
    'ocPackBlock', 'ocOrderBlocks', 'ocLayoutGraph', 'ocLayoutRow', 'ocBlockFrames'];
  // eslint 相当の静的検査は無いので、区間が外の変数に触っていないことは実行で確かめる
  return new Function(`${body}\nreturn { ${names.join(', ')} };`)();
}

const L = loadLayout();

// 幅と高さは概念図のノードに近い値にしておく
const node = (id, group, extra = {}) => ({
  id, x: 0, y: 0, w: 160, h: 54, data: { id, label: id, group, ...extra }
});
const edge = (from, to) => ({ id: `${from}>${to}`, from, to, label: '', card: null });

test('ハブ判定: 次数が閾値を超えるノードと external を層から外す', () => {
  // 20 ノード。閾値は max(8, 20 * 0.15) = 8 なので、次数 9 以上がハブ
  const nodes = [];
  for (let i = 0; i < 20; i += 1) nodes.push(node(`n${i}`, 'g'));
  nodes.push(node('auth.users', 'external', { x_kind: 'external' }));
  const edges = [];
  for (let i = 1; i <= 10; i += 1) edges.push(edge(`n${i}`, 'n0')); // n0 の次数 10
  edges.push(edge('n1', 'auth.users')); // external は次数 1 でもハブ
  edges.push(edge('n2', 'n3'));

  const hubs = L.ocPickHubs(nodes, edges, null).map((n) => n.id);
  assert.deepEqual(hubs, ['n0', 'auth.users']); // 次数の多い順
  assert.ok(!hubs.includes('n1'), '次数 2 のノードをハブにしてはいけない');
});

test('折り返し: 1 層 6 ノードで次の列へ送る', () => {
  assert.deepEqual(L.ocChunk([1, 2, 3, 4, 5, 6, 7, 8], 6), [[1, 2, 3, 4, 5, 6], [7, 8]]);

  // 関連ゼロの 14 ノードは 1 層。6 / 6 / 2 の 3 列になる
  const nodes = [];
  for (let i = 0; i < 14; i += 1) nodes.push(node(`n${i}`, 'g'));
  const packed = L.ocPackBlock(nodes, [], null);
  assert.equal(packed.columns.length, 3);
  assert.deepEqual(packed.columns.map((c) => c.length), [6, 6, 2]);
  const xs = [...new Set(nodes.map((n) => n.x))];
  assert.equal(xs.length, 3, `列は 3 本のはず: ${xs}`);
  // 1 列に積むのは 6 個まで。高さは 6 * 54 + 5 * 44 = 544
  assert.equal(packed.h, 6 * 54 + 5 * 44);
});

test('group ブロックの並び: relation が多い group どうしが隣に来る', () => {
  const blocks = [
    { group: 'a', nodes: [node('a1', 'a'), node('a2', 'a'), node('a3', 'a')] },
    { group: 'b', nodes: [node('b1', 'b')] },
    { group: 'c', nodes: [node('c1', 'c')] },
    { group: 'd', nodes: [node('d1', 'd')] }
  ];
  // a-c が 3 本、c-d が 2 本、b はどこにもつながらない
  const edges = [edge('a1', 'c1'), edge('a2', 'c1'), edge('a3', 'c1'), edge('c1', 'd1'), edge('d1', 'c1')];
  const order = L.ocOrderBlocks(blocks, edges).map((b) => b.group);
  assert.deepEqual(order, ['a', 'c', 'd', 'b']); // 起点は最大ブロックの a、孤立した b は最後
});

test('全体配置: ハブは上端の一列、残りは group ごとの格子', () => {
  const nodes = [node('hub', 'external', { x_kind: 'external' })];
  ['x', 'y'].forEach((g) => {
    for (let i = 0; i < 9; i += 1) nodes.push(node(`${g}${i}`, g));
  });
  const edges = nodes.filter((n) => n.id !== 'hub').map((n) => edge(n.id, 'hub'));
  edges.push(edge('x0', 'x1'), edge('y0', 'y1'));

  const out = L.ocLayoutGraph(nodes, edges, null);
  assert.deepEqual(out.hubs.map((n) => n.id), ['hub']);
  assert.deepEqual(out.blocks.map((b) => b.group), ['x', 'y']);

  const hub = nodes.find((n) => n.id === 'hub');
  assert.equal(hub.y, 0);
  nodes.filter((n) => n.id !== 'hub').forEach((n) => {
    assert.ok(n.y > hub.y + hub.h, `${n.id} がハブ列に重なっている`);
  });
  // ブロックは横に並ぶ（x が y の左）。縦 1 列に積み上がらない
  const bx = out.blocks.find((b) => b.group === 'x');
  const by = out.blocks.find((b) => b.group === 'y');
  assert.ok(bx.x + bx.w <= by.x, 'ブロックが横に並んでいない');
  assert.ok(new Set(nodes.map((n) => n.x)).size >= 4, '列が 4 本未満。折り返せていない');
});

test('枠はノード位置から作る（ドラッグや保存位置の復元でも追従する）', () => {
  const nodes = [node('a1', 'a'), node('a2', 'a'), node('b1', null)];
  nodes[0].x = 0; nodes[0].y = 0;
  nodes[1].x = 0; nodes[1].y = 100;
  nodes[2].x = 500; nodes[2].y = 0;
  const frames = L.ocBlockFrames(nodes, new Set(), null);
  assert.deepEqual(frames.map((f) => f.group), ['a', 'other']); // group 無しは other
  assert.equal(frames[1].color, null);
  const a = frames[0];
  assert.ok(a.x < 0 && a.y < 0, '枠は内側余白のぶんノードより外に出る');
  assert.ok(a.x + a.w >= 160 && a.y + a.h >= 154, '枠が全ノードを含んでいない');
});

test('画面ビュー: 30 枚までは一列、超えたら 10 枚で折り返す', () => {
  const mk = (count) => {
    const out = [];
    for (let i = 0; i < count; i += 1) out.push({ id: `s${i}`, x: 0, y: 0, w: 490, h: 348, data: {} });
    return out;
  };
  const thirty = mk(30);
  L.ocLayoutRow(thirty, null);
  assert.equal(new Set(thirty.map((n) => n.y)).size, 1, '30 枚は 1 行のまま');

  const many = mk(31);
  L.ocLayoutRow(many, null);
  const rows = [...new Set(many.map((n) => n.y))];
  assert.equal(rows.length, 4, '31 枚は 10 / 10 / 10 / 1 の 4 行');
  assert.equal(many[0].x, 0);
  assert.equal(many[10].x, 0, '11 枚目は次の行の先頭');
});
