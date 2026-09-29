// validate.mjs の検査ロジック。node --test tests/ で走る（依存パッケージなし）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModel, loadModel } from '../scripts/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = join(ROOT, 'examples', 'model.example.json');

// テストごとに壊す土台。JSON 経由で深いコピーを作る
const base = () => JSON.parse(JSON.stringify({
  version: 1,
  title: 'テスト',
  entities: [
    { id: 'customer', label: '顧客', group: 'core', attributes: [
      { name: 'id', type: 'uuid', pk: true },
      { name: 'assignee_id', type: 'uuid', fk: 'staff' }
    ] },
    { id: 'staff', label: '担当者', attributes: [{ name: 'id', type: 'uuid', pk: true }] }
  ],
  relations: [{ from: 'customer', to: 'staff', label: '担当する', cardinality: 'N:1' }],
  screens: [{ id: 'customer-list', label: '顧客一覧', route: '/customers', entities: ['customer'],
    blocks: [{ kind: 'table', entity: 'customer', columns: ['assignee_id'] }] }],
  flows: []
}));

const hit = (errors, needle) => errors.some((m) => m.includes(needle));

test('正しい model はエラー 0 件', () => {
  const { errors } = validateModel(base());
  assert.deepEqual(errors, []);
});

test('同梱の例が検査を通る', () => {
  const { model, errors: loadErrors } = loadModel(EXAMPLE);
  assert.deepEqual(loadErrors, []);
  const { errors } = validateModel(model);
  assert.deepEqual(errors, []);
  assert.equal(model.entities.length, 12);
  assert.equal(model.screens.length, 6);
});

test('必須キーの欠落を検出する', () => {
  const m = base();
  delete m.version;
  delete m.title;
  delete m.entities;
  const { errors } = validateModel(m);
  assert.ok(hit(errors, 'version'));
  assert.ok(hit(errors, 'title'));
  assert.ok(hit(errors, 'entities'));
});

test('entity の id 重複を検出する', () => {
  const m = base();
  m.entities.push({ id: 'customer', label: '顧客（複製）' });
  const { errors } = validateModel(m);
  assert.ok(hit(errors, '"customer" が重複'));
});

test('relation の未知 id を、どの relation かまで出して検出する', () => {
  const m = base();
  m.relations[0].to = 'stafff';
  const { errors } = validateModel(m);
  assert.ok(hit(errors, 'stafff'));
  assert.ok(hit(errors, 'relations[0]'));
});

test('cardinality の不正値を検出する', () => {
  const m = base();
  m.relations[0].cardinality = '1:many';
  const { errors } = validateModel(m);
  assert.ok(hit(errors, '1:many'));
  assert.ok(hit(errors, 'N:M'));
});

test('screens.entities の未知 id を検出する', () => {
  const m = base();
  m.screens[0].entities = ['customer', 'invoice'];
  const { errors } = validateModel(m);
  assert.ok(hit(errors, 'screens.customer-list'));
  assert.ok(hit(errors, 'invoice'));
});

test('screen の id 重複と flow の未知 screen を検出する', () => {
  const m = base();
  m.screens.push({ id: 'customer-list', label: '重複', entities: [] });
  m.flows = [{ from: 'customer-list', to: 'customer-detail' }];
  const { errors } = validateModel(m);
  assert.ok(hit(errors, '"customer-list" が重複'));
  assert.ok(hit(errors, 'customer-detail'));
});

test('fk の参照先が存在しないと、entity.属性名 まで出して検出する', () => {
  const m = base();
  m.entities[0].attributes[1].fk = 'employee';
  const { errors } = validateModel(m);
  assert.ok(hit(errors, 'customer.assignee_id'));
  assert.ok(hit(errors, 'employee'));
});

test('属性名の重複を検出する', () => {
  const m = base();
  m.entities[0].attributes.push({ name: 'id', type: 'text' });
  const { errors } = validateModel(m);
  assert.ok(hit(errors, '属性名 "id" が重複'));
});

test('image に外部 URL を書いたら弾く', () => {
  const m = base();
  m.screens[0].image = 'https://example.com/shot.png';
  const { errors } = validateModel(m);
  assert.ok(hit(errors, '外部 URL'));
});

test('存在しない列名と entities 未指定は警告どまり', () => {
  const m = base();
  m.screens[0].blocks[0].columns = ['nope'];
  delete m.screens[0].entities;
  const { errors, warnings } = validateModel(m);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('nope')));
});

test('壊れた JSON はファイル名付きで報告する', () => {
  const { model, errors } = loadModel(join(ROOT, 'tests', 'broken.fixture.json'));
  assert.equal(model, null);
  assert.ok(errors[0].includes('JSON として読めない'));
});

test('メッセージは日本語で、AI 語彙を含まない', () => {
  const m = base();
  m.relations[0].to = 'unknown';
  const { errors } = validateModel(m);
  const joined = errors.join('\n');
  assert.ok(/[ぁ-んァ-ン一-龥]/.test(joined));
  assert.ok(!/包括的|堅牢|多面的|深掘り/.test(joined));
  assert.ok(!joined.includes(String.fromCharCode(0x2014)));
});

test('ソースに em dash が無い', () => {
  for (const f of ['scripts/validate.mjs', 'scripts/render.mjs', 'scripts/extract-sql.mjs', 'templates/canvas.html']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(!src.includes(String.fromCharCode(0x2014)), `${f} に em dash がある`);
  }
});
