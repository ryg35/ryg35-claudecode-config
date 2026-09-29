// extract-db.mjs のカタログ行 → model 変換。DB には繋がない（pg カタログの戻り値を直に食わせる）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStateFromRows, applyGroupOverrides, preferMergeRelationLabels,
  attachColumnFacts, attachFkMeta, splitCommand, runQuery, queries
} from '../scripts/extract-db.mjs';
import { buildModel } from '../scripts/extract-sql.mjs';
import { validateModel } from '../scripts/validate.mjs';

// pg_class / pg_attribute / pg_constraint から返る形の最小セット
const rows = () => ({
  relations: [
    { name: 'users', kind: 'r', viewdef: null },
    { name: 'orders', kind: 'r', viewdef: null },
    { name: '_bak_orders_20260620', kind: 'r', viewdef: null },
    { name: 'order_summary', kind: 'v', viewdef: ' SELECT o.id FROM orders o;' }
  ],
  columns: [
    { table: 'users', name: 'id', type: 'uuid', notnull: true, default: 'gen_random_uuid()' },
    { table: 'users', name: 'auth_id', type: 'uuid', notnull: true, default: null },
    { table: 'users', name: 'kind', type: 'user_kind', notnull: false, default: null },
    { table: 'orders', name: 'id', type: 'bigint', notnull: true, default: null },
    { table: 'orders', name: 'user_id', type: 'uuid', notnull: true, default: null },
    { table: 'orders', name: 'placed_at', type: 'timestamp with time zone', notnull: false, default: 'now()' },
    { table: '_bak_orders_20260620', name: 'id', type: 'bigint', notnull: false, default: null },
    { table: 'order_summary', name: 'id', type: 'bigint', notnull: false, default: null }
  ],
  constraints: [
    { table: 'users', type: 'p', name: 'users_pkey', columns: ['id'], ref_schema: null, ref_table: null, ref_columns: null, on_delete: null },
    { table: 'users', type: 'f', name: 'users_auth_id_fkey', columns: ['auth_id'], ref_schema: 'auth', ref_table: 'users', ref_columns: ['id'], on_delete: 'c' },
    { table: 'orders', type: 'p', name: 'orders_pkey', columns: ['id'], ref_schema: null, ref_table: null, ref_columns: null, on_delete: null },
    { table: 'orders', type: 'f', name: 'orders_user_id_fkey', columns: ['user_id'], ref_schema: 'public', ref_table: 'users', ref_columns: ['id'], on_delete: 'a' }
  ],
  uniqueIndexes: [{ table: 'users', column: 'auth_id' }],
  enums: [{ name: 'user_kind', values: ['student', 'staff'] }]
});

const model = (opts = {}) => {
  const { state, fkMeta } = buildStateFromRows(rows(), opts);
  const built = buildModel(state, { title: 'テスト', includeExternal: true, ...opts.build });
  attachColumnFacts(built.model, state);
  attachFkMeta(built.model, fkMeta);
  return built.model;
};

const entity = (m, id) => m.entities.find((e) => e.id === id);

test('テーブル・ビュー・他スキーマの参照先が entity になる', () => {
  const m = model();
  assert.deepEqual(m.entities.map((e) => e.id).sort(),
    ['_bak_orders_20260620', 'auth.users', 'order_summary', 'orders', 'users']);
  assert.equal(entity(m, 'order_summary').x_kind, 'view');
  assert.deepEqual(entity(m, 'order_summary').x_view_of, ['orders']);
  assert.equal(entity(m, 'auth.users').x_kind, 'external');
  assert.equal(validateModel(m).errors.length, 0);
});

test('列は型を均し、enum は値まで出す。pk / fk が付く', () => {
  const m = model();
  const users = entity(m, 'users').attributes;
  assert.deepEqual(users.find((a) => a.name === 'id'), { name: 'id', type: 'uuid', pk: true, x_notnull: true, x_default: 'gen_random_uuid()' });
  assert.equal(users.find((a) => a.name === 'kind').type, 'enum(student, staff)');
  assert.equal(entity(m, 'orders').attributes.find((a) => a.name === 'placed_at').type, 'timestamptz');
  assert.equal(entity(m, 'orders').attributes.find((a) => a.name === 'user_id').fk, 'users');
});

test('ユニーク列の FK は 1:1、そうでなければ N:1。ON DELETE と FK 名が付く', () => {
  const m = model();
  const toAuth = m.relations.find((r) => r.to === 'auth.users');
  assert.equal(toAuth.cardinality, '1:1');
  assert.equal(toAuth.x_on_delete, 'CASCADE');
  assert.equal(toAuth.x_fk, 'users_auth_id_fkey');
  const toUsers = m.relations.find((r) => r.from === 'orders' && r.to === 'users');
  assert.equal(toUsers.cardinality, 'N:1');
  assert.equal(toUsers.label, 'user');
  assert.equal(toUsers.x_on_delete, undefined, 'NO ACTION は書かない');
});

test('--groups は末尾 * の前方一致で group を上書きする', () => {
  const m = model();
  assert.equal(entity(m, '_bak_orders_20260620').group, 'other');
  assert.equal(applyGroupOverrides(m, { '_bak_*': 'backup', orders: 'tracker' }), 2);
  assert.equal(entity(m, '_bak_orders_20260620').group, 'backup');
  assert.equal(entity(m, 'orders').group, 'tracker');
});

test('--merge の group と、1 本しかない relation の label を引き継ぐ', () => {
  const merge = {
    version: 1,
    title: '旧',
    entities: [{ id: 'orders', label: '注文', group: 'tracker' }],
    relations: [{ from: 'orders', to: 'users', label: '注文者', cardinality: 'N:1' }]
  };
  const m = model({ build: { merge } });
  assert.equal(entity(m, 'orders').label, '注文');
  assert.equal(entity(m, 'orders').group, 'tracker');
  assert.equal(preferMergeRelationLabels(m, merge), 1);
  assert.equal(m.relations.find((r) => r.from === 'orders').label, '注文者');
});

test('--merge の entity 順を守って並べる（図の並びが前回と大きく変わらない）', () => {
  const { state } = buildStateFromRows(rows(), { order: ['order_summary', 'orders'] });
  assert.deepEqual([...state.tables.keys()], ['order_summary', 'orders', 'users', '_bak_orders_20260620']);
});

test('発行する SQL は SELECT だけ。それ以外は投げる前に落とす', () => {
  for (const sql of Object.values(queries('public'))) assert.match(sql, /^\s*select\b/i);
  assert.throws(() => runQuery('./psql.sh', 'delete from users'), /SELECT 以外/);
});

test('psql コマンドは引用符ごと分解する', () => {
  assert.deepEqual(splitCommand('  ./jsq.sh  '), ['./jsq.sh']);
  assert.deepEqual(splitCommand('psql -d "my db" -U ro'), ['psql', '-d', 'my db', '-U', 'ro']);
});
