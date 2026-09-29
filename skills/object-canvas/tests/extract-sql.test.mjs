// extract-sql.mjs の SQL 解釈。node --test tests/*.test.mjs で走る（依存パッケージなし）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createState, applySql, buildModel, splitStatements, guessGroup } from '../scripts/extract-sql.mjs';
import { validateModel } from '../scripts/validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'sql');

// fixtures の migration をファイル名順に全部当てた最終状態
const runFixtures = () => {
  const state = createState();
  for (const f of readdirSync(FIXTURES).filter((x) => x.endsWith('.sql')).sort()) {
    applySql(state, readFileSync(join(FIXTURES, f), 'utf8'), f);
  }
  return state;
};

const entity = (model, id) => model.entities.find((e) => e.id === id);
const attr = (model, id, name) => (entity(model, id)?.attributes ?? []).find((a) => a.name === name);

test('最終状態のテーブルは users / orders / notes / order_summary の 4 つ', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  assert.deepEqual(model.entities.map((e) => e.id).sort(), ['notes', 'order_summary', 'orders', 'users']);
});

test('関数本体と DO ブロックの中の CREATE TABLE / DROP TABLE は効かない', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  assert.equal(entity(model, 'should_not_exist'), undefined);
  assert.equal(entity(model, 'also_not_exist'), undefined);
  assert.ok(entity(model, 'orders'), '関数本体の DROP TABLE public.orders が効いてしまっている');
});

test('DROP TABLE したテーブルは消える。RENAME TO は名前が変わる', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  assert.equal(entity(model, 'coupons'), undefined);
  assert.equal(entity(model, 'scratch'), undefined);
  assert.ok(entity(model, 'notes'));
  assert.deepEqual(entity(model, 'notes').attributes.map((a) => a.name), ['id', 'note']);
});

test('列の追加・削除・改名が反映される', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  const users = entity(model, 'users').attributes.map((a) => a.name);
  assert.deepEqual(users, ['id', 'login_email', 'created_at', 'nickname', 'age']);
  const orders = entity(model, 'orders').attributes.map((a) => a.name);
  assert.equal(orders.includes('memo'), false, 'DROP COLUMN memo が効いていない');
  assert.equal(orders.includes('coupon_id'), true);
});

test('型は正規化する（timestamptz / numeric の桁 / ENUM の値）', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  assert.equal(attr(model, 'users', 'created_at').type, 'timestamptz');
  assert.equal(attr(model, 'orders', 'total').type, 'numeric(10, 2)');
  assert.equal(attr(model, 'orders', 'status').type, 'enum(draft, paid, shipped)');
});

test('PRIMARY KEY は pk、生きている FK だけ fk と relation になる', () => {
  const { model, droppedFks } = buildModel(runFixtures(), { title: 'テスト' });
  assert.equal(attr(model, 'orders', 'id').pk, true);
  assert.equal(attr(model, 'orders', 'user_id').fk, 'users');
  assert.equal(attr(model, 'orders', 'coupon_id').fk, undefined, '消えた coupons への fk が残っている');
  assert.deepEqual(model.relations.map((r) => `${r.from}→${r.to}`), ['orders→users']);
  assert.equal(model.relations[0].cardinality, 'N:1');
  assert.equal(model.relations[0].label, 'user');
  assert.equal(droppedFks.length, 1);
});

test('x_source は定義されたファイル名を持つ', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  assert.equal(entity(model, 'orders').x_source, '001_init.sql');
  assert.equal(entity(model, 'notes').x_source, '001_init.sql');
  assert.equal(model.relations[0].x_source, '001_init.sql');
});

test('VIEW は x_kind: view と x_view_of を持つ', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  const v = entity(model, 'order_summary');
  assert.equal(v.x_kind, 'view');
  assert.deepEqual(v.x_view_of.sort(), ['orders', 'users']);
});

test('解釈できない文は捨てて ignored に残す（CREATE TABLE AS）', () => {
  const state = runFixtures();
  const unknown = state.ignored.filter((x) => !x.known);
  assert.equal(unknown.some((x) => x.head.includes('orders_backup_20260101')), true);
  // 意図的に無視するものは known で数える
  const kinds = state.ignored.map((x) => x.kind);
  assert.ok(kinds.includes('CREATE FUNCTION'));
  assert.ok(kinds.includes('CREATE POLICY'));
  assert.ok(kinds.includes('CREATE INDEX'));
});

test('生成した model は validate を通る', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト' });
  assert.deepEqual(validateModel(model).errors, []);
});

test('--merge の screens / flows を引き継ぎ、抽出できたテーブルを entities へ移す', () => {
  const merge = {
    version: 1,
    title: '元のタイトル',
    entities: [{ id: 'users', label: '利用者', group: '人' }],
    screens: [{ id: 'order-list', label: '注文一覧', entities: ['users'], x_unmodeled_entities: ['orders', 'coupons'] }],
    flows: [{ from: 'order-list', to: 'order-list', label: '再読み込み' }]
  };
  const { model, stillUnmodeled } = buildModel(runFixtures(), { merge });
  assert.equal(model.title, '元のタイトル');
  assert.deepEqual(model.screens[0].entities, ['users', 'orders']);
  assert.deepEqual(model.screens[0].x_unmodeled_entities, ['coupons']);
  assert.deepEqual(stillUnmodeled, ['coupons']);
  assert.equal(model.flows.length, 1);
  // 既存の日本語ラベルと group は残す
  assert.equal(entity(model, 'users').label, '利用者');
  assert.equal(entity(model, 'users').group, '人');
  assert.deepEqual(validateModel(model).errors, []);
});

test('--title は --merge の title より優先する', () => {
  const merge = { version: 1, title: '元', entities: [], screens: [], flows: [] };
  const { model } = buildModel(runFixtures(), { merge, title: '新' });
  assert.equal(model.title, '新');
});

test('--labels の日本語ラベルを当てる', () => {
  const { model } = buildModel(runFixtures(), { title: 'テスト', labels: { orders: '注文' } });
  assert.equal(entity(model, 'orders').label, '注文');
  assert.equal(entity(model, 'users').label, 'users');
});

test('文字列とドル引用符の中の ; では文を割らない', () => {
  const stmts = splitStatements("SELECT 'a;b'; CREATE FUNCTION f() AS $$ SELECT 1; SELECT 2; $$; SELECT 3;");
  assert.equal(stmts.length, 3);
  assert.equal(stmts[1].includes('$$body$$'), true);
  assert.equal(stmts[1].includes('SELECT 1'), false);
});

test('行コメントとブロックコメントは落ちる', () => {
  const stmts = splitStatements('-- 捨てる\nCREATE TABLE t (id uuid); /* これも */ DROP TABLE t;');
  assert.equal(stmts.length, 2);
  assert.equal(stmts[0].includes('捨てる'), false);
  assert.equal(stmts[1].includes('これも'), false);
});

test('psql のメタコマンド（\\restrict）は行ごと捨てる', () => {
  const stmts = splitStatements('\\restrict abc\n\nCREATE TABLE t (id uuid);');
  assert.equal(stmts.length, 1);
  assert.equal(stmts[0].startsWith('CREATE TABLE'), true);
});

test('group は名前規則で決まる', () => {
  assert.equal(guessGroup('agent_messages'), 'agent');
  assert.equal(guessGroup('discover_sessions'), 'discover');
  assert.equal(guessGroup('es_questions'), 'es');
  assert.equal(guessGroup('templates'), 'es');
  assert.equal(guessGroup('email_cache'), 'mail');
  assert.equal(guessGroup('calendar_sync_queue'), 'calendar');
  assert.equal(guessGroup('companies'), 'companies');
  assert.equal(guessGroup('company_master'), 'companies');
  assert.equal(guessGroup('profiles'), 'profile');
  assert.equal(guessGroup('user_events'), 'profile');
  assert.equal(guessGroup('admin_email_allowlist'), 'admin');
  assert.equal(guessGroup('applications'), 'tracker');
  assert.equal(guessGroup('share_links'), 'other');
});

test('UNIQUE な FK 列は 1:1 になる', () => {
  const state = createState();
  applySql(state, `
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.user_settings (
      user_id uuid PRIMARY KEY REFERENCES public.users(id),
      theme text
    );
    CREATE TABLE public.user_cards (
      id uuid PRIMARY KEY,
      user_id uuid UNIQUE REFERENCES public.users(id)
    );
  `, 'x.sql');
  const { model } = buildModel(state, { title: 'テスト' });
  assert.deepEqual(model.relations.map((r) => `${r.from} ${r.cardinality}`),
    ['user_settings 1:1', 'user_cards 1:1']);
});

test('複合 PRIMARY KEY と表レベル FOREIGN KEY を読む', () => {
  const state = createState();
  applySql(state, `
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.usage_daily (
      user_id uuid NOT NULL,
      day date NOT NULL,
      n int DEFAULT 0,
      PRIMARY KEY (user_id, day),
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
    );
  `, 'y.sql');
  const { model } = buildModel(state, { title: 'テスト' });
  const t = entity(model, 'usage_daily');
  assert.deepEqual(t.attributes.filter((a) => a.pk).map((a) => a.name), ['user_id', 'day']);
  assert.equal(attr(model, 'usage_daily', 'user_id').fk, 'users');
  assert.deepEqual(model.relations.map((r) => r.cardinality), ['N:1']);
});

test('public 以外のスキーマ（auth.users）への FK は relation にしない', () => {
  const state = createState();
  applySql(state, 'CREATE TABLE public.notes (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id));', 'z.sql');
  const { model, droppedFks } = buildModel(state, { title: 'テスト' });
  assert.deepEqual(model.relations, []);
  assert.equal(attr(model, 'notes', 'user_id').fk, undefined);
  assert.deepEqual(droppedFks, ['notes.user_id → auth.users']);
});

test('--include-external を付けると auth.users を属性なしの entity として足す', () => {
  const state = createState();
  applySql(state, 'CREATE TABLE public.notes (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id));', 'z.sql');
  const { model, droppedFks } = buildModel(state, { title: 'テスト', includeExternal: true });
  assert.deepEqual(droppedFks, []);
  const ext = entity(model, 'auth.users');
  assert.equal(ext.x_kind, 'external');
  assert.deepEqual(ext.attributes, []);
  assert.equal(ext.group, 'external');
  assert.deepEqual(model.relations.map((r) => `${r.from}→${r.to}`), ['notes→auth.users']);
  assert.equal(attr(model, 'notes', 'user_id').fk, 'auth.users');
  assert.deepEqual(validateModel(model).errors, []);
});
