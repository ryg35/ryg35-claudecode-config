#!/usr/bin/env node
// 稼働中の Postgres（本番 DB）のカタログから entity と relation を機械抽出して model.json を作る。
// migration 版（extract-sql.mjs）と違い、読むのは「いま実際にある形」。migration に無い手動 DDL や
// 退避テーブル（_bak_* など）もそのまま出る。
//
// 発行する SQL は SELECT だけ。接続は psql の実行コマンドを丸ごと引数で受け取る形で、
// ホスト・ユーザ・パスワードはこのスクリプトが一切持たない（読み取り専用ロールのラッパを渡す想定）。
//
// 依存パッケージなし（node:child_process / node:fs / node:path / node:url のみ）。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createState, buildModel, normalizeType } from './extract-sql.mjs';
import { validateModel } from './validate.mjs';

// ---------------------------------------------------------------- SQL（SELECT のみ）

/** スキーマを 1 つ受け取り、JSON 配列を 1 行で返すクエリ群。 */
export function queries(schema) {
  const s = `'${String(schema).replace(/'/g, "''")}'`;
  const asJson = (inner) => `select coalesce(json_agg(t), '[]'::json)::text from (${inner}) t`;
  return {
    // テーブル・ビュー本体。relkind は r=テーブル p=パーティション親 v=ビュー m=マテビュー
    relations: asJson(`
      select c.relname as name, c.relkind::text as kind,
             case when c.relkind in ('v','m') then pg_get_viewdef(c.oid) else null end as viewdef
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${s} and c.relkind in ('r','p','v','m')
      order by c.relname`),
    // 列（information_schema.columns ではなく pg_attribute。ARRAY / USER-DEFINED に潰れず実型が出る）
    columns: asJson(`
      select c.relname as "table", a.attname as name,
             format_type(a.atttypid, a.atttypmod) as type,
             a.attnotnull as notnull,
             pg_get_expr(d.adbin, d.adrelid) as "default"
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = ${s} and c.relkind in ('r','p','v','m')
        and a.attnum > 0 and not a.attisdropped
      order by c.relname, a.attnum`),
    // 主キー・ユニーク・外部キー。列は conkey の順番どおりに並べる
    constraints: asJson(`
      select c.relname as "table", co.contype::text as type, co.conname as name,
             (select array_agg(att.attname order by k.ord)
                from unnest(co.conkey) with ordinality k(attnum, ord)
                join pg_attribute att on att.attrelid = co.conrelid and att.attnum = k.attnum) as columns,
             fn.nspname as ref_schema, f.relname as ref_table,
             (select array_agg(att.attname order by k.ord)
                from unnest(co.confkey) with ordinality k(attnum, ord)
                join pg_attribute att on att.attrelid = co.confrelid and att.attnum = k.attnum) as ref_columns,
             co.confdeltype::text as on_delete
      from pg_constraint co
      join pg_class c on c.oid = co.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_class f on f.oid = co.confrelid
      left join pg_namespace fn on fn.oid = f.relnamespace
      where n.nspname = ${s} and co.contype in ('p','u','f')
      order by c.relname, co.conname`),
    // 単一列のユニークインデックス（制約になっていないものも 1:1 の判定に使う。部分インデックスは除く）
    uniqueIndexes: asJson(`
      select c.relname as "table", att.attname as "column"
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute att on att.attrelid = i.indrelid and att.attnum = i.indkey[0]
      where n.nspname = ${s} and i.indisunique and i.indnkeyatts = 1 and i.indpred is null
      order by c.relname, att.attname`),
    // enum 型（列の型を enum(値, 値) と出すため）
    enums: asJson(`
      select t.typname as name,
             array_agg(e.enumlabel::text order by e.enumsortorder) as values
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = ${s}
      group by t.typname
      order by t.typname`)
  };
}

const DELETE_ACTION = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };

/** `./jsq.sh` のような psql 実行コマンドを空白で割って引数配列にする。 */
export function splitCommand(cmd) {
  const parts = String(cmd).trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return parts.map((p) => p.replace(/^["']([\s\S]*)["']$/, '$1'));
}

/** SQL を 1 本投げて JSON をもらう。SELECT 以外は投げない。 */
export function runQuery(cmd, sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error('SELECT 以外の SQL は投げない');
  const argv = splitCommand(cmd);
  const out = execFileSync(argv[0], [...argv.slice(1), '-Atc', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  return JSON.parse(out.trim() || '[]');
}

// ---------------------------------------------------------------- 組み立て

/**
 * カタログの行から extract-sql.mjs と同じ state を組み立てる。
 * @param {object} rows { relations, columns, constraints, uniqueIndexes, enums }
 * @param {object} opts { schema, order } order はテーブル名の並び順（model の entity 順になる）
 * @returns {{state: object, fkMeta: Map<string, object>, counts: object}}
 */
export function buildStateFromRows(rows, opts = {}) {
  const schema = opts.schema ?? 'public';
  const source = `db:${schema}`;
  const state = createState();
  const order = opts.order ?? [];
  const byName = new Map();
  for (const r of rows.relations ?? []) byName.set(r.name, r);

  const names = [
    ...order.filter((n) => byName.has(n)),
    ...[...byName.keys()].filter((n) => !order.includes(n))
  ];
  for (const name of names) {
    const r = byName.get(name);
    state.tables.set(name, {
      name,
      source,
      kind: r.kind === 'v' || r.kind === 'm' ? 'view' : 'table',
      columns: [],
      fks: [],
      pkCols: [],
      uniqueCols: new Set(),
      viewBody: r.viewdef ?? ''
    });
  }

  for (const e of rows.enums ?? []) {
    state.enums.set(String(e.name).toLowerCase(), e.values ?? []);
  }

  for (const c of rows.columns ?? []) {
    const t = state.tables.get(c.table);
    if (!t) continue;
    const col = { name: c.name, type: normalizeType(c.type) };
    if (c.notnull === true || c.notnull === 't') col.notnull = true;
    if (c.default != null) col.default = String(c.default);
    t.columns.push(col);
  }

  const fkMeta = new Map();
  let fkCount = 0;
  for (const co of rows.constraints ?? []) {
    const t = state.tables.get(co.table);
    if (!t) continue;
    const cols = co.columns ?? [];
    if (co.type === 'p') t.pkCols = cols;
    else if (co.type === 'u') { if (cols.length === 1) t.uniqueCols.add(cols[0]); }
    else if (co.type === 'f') {
      const refTable = co.ref_schema && co.ref_schema !== schema
        ? `${co.ref_schema}.${co.ref_table}`
        : co.ref_table;
      t.fks.push({ columns: cols, refTable, refColumns: co.ref_columns ?? [], source });
      fkCount += 1;
      fkMeta.set(`${co.table}|${refTable}|${cols.join(',')}`, {
        name: co.name,
        onDelete: DELETE_ACTION[co.on_delete] ?? co.on_delete,
        refColumns: co.ref_columns ?? []
      });
    }
  }
  for (const u of rows.uniqueIndexes ?? []) {
    const t = state.tables.get(u.table);
    if (t) t.uniqueCols.add(u.column);
  }

  const counts = {
    tables: [...state.tables.values()].filter((t) => t.kind === 'table').length,
    views: [...state.tables.values()].filter((t) => t.kind === 'view').length,
    fks: fkCount
  };
  return { state, fkMeta, counts };
}

/** FK 列名から relation の label を作る（buildModel と同じ規則）。 */
const relationKeyLabel = (columns) => columns.map((c) => c.replace(/_ids?$/i, '')).join(' + ');

/** relation に FK 名と ON DELETE を貼る。 */
export function attachFkMeta(model, fkMeta) {
  let hit = 0;
  for (const r of model.relations ?? []) {
    for (const [key, meta] of fkMeta) {
      const [from, to, cols] = key.split('|');
      if (from !== r.from || to !== r.to) continue;
      if (relationKeyLabel(cols.split(',')) !== r.label) continue;
      r.x_fk = meta.name;
      if (meta.onDelete && meta.onDelete !== 'NO ACTION') r.x_on_delete = meta.onDelete;
      hit += 1;
      break;
    }
  }
  return hit;
}

/**
 * group を上書きする。キーは entity id そのまま、または末尾 `*` の前方一致（`_bak_*`）。
 * --merge で引き継いだ group よりも強い（人が明示した割り当てだから）。
 */
export function applyGroupOverrides(model, groups) {
  if (!groups) return 0;
  const exact = new Map();
  const prefixes = [];
  for (const [k, v] of Object.entries(groups)) {
    if (k.endsWith('*')) prefixes.push([k.slice(0, -1), v]);
    else exact.set(k, v);
  }
  let n = 0;
  for (const e of model.entities ?? []) {
    let g = exact.get(e.id);
    if (g === undefined) {
      const p = prefixes.find(([pre]) => e.id.startsWith(pre));
      if (p) g = p[1];
    }
    if (g !== undefined && e.group !== g) { e.group = g; n += 1; }
  }
  return n;
}

/**
 * 同じ from→to が双方に 1 本ずつしか無い relation は、--merge 側の label を優先する
 * （人が日本語に直した関連名を、抽出し直しで潰さないため）。
 */
export function preferMergeRelationLabels(model, merge) {
  if (!merge || !Array.isArray(merge.relations)) return 0;
  const count = (list) => {
    const m = new Map();
    for (const r of list) {
      const k = `${r.from}|${r.to}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const mine = count(model.relations ?? []);
  const theirs = count(merge.relations);
  let n = 0;
  for (const [k, list] of mine) {
    const other = theirs.get(k);
    if (!other || other.length !== 1 || list.length !== 1) continue;
    if (typeof other[0].label !== 'string' || other[0].label === list[0].label) continue;
    list[0].label = other[0].label;
    n += 1;
  }
  return n;
}

/** 属性に NOT NULL と既定値を写す（既定値は 80 文字で切る）。 */
export function attachColumnFacts(model, state) {
  for (const e of model.entities ?? []) {
    const t = state.tables.get(e.id);
    if (!t) continue;
    const byName = new Map(t.columns.map((c) => [c.name, c]));
    for (const a of e.attributes ?? []) {
      const c = byName.get(a.name);
      if (!c) continue;
      if (c.notnull) a.x_notnull = true;
      if (c.default != null) a.x_default = c.default.length > 80 ? `${c.default.slice(0, 77)}...` : c.default;
    }
  }
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { psql: null, schema: 'public', title: null, merge: null, labels: null, groups: null, out: null, report: false, includeExternal: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--psql') opts.psql = argv[++i];
    else if (a === '--schema') opts.schema = argv[++i];
    else if (a === '--title') opts.title = argv[++i];
    else if (a === '--merge') opts.merge = argv[++i];
    else if (a === '--labels') opts.labels = argv[++i];
    else if (a === '--groups') opts.groups = argv[++i];
    else if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--report') opts.report = true;
    else if (a === '--include-external') opts.includeExternal = true;
    else throw new Error(`知らないオプション: ${a}`);
  }
  return opts;
}

const readJson = (path) => JSON.parse(readFileSync(resolve(path), 'utf8'));

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(`エラー: ${e.message}`);
    return 2;
  }
  if (!opts.psql || !opts.out) {
    console.error('使い方: node scripts/extract-db.mjs --psql "<psql 実行コマンド>" [--schema public] [--title "..."] [--merge <model.json>] [--labels <json>] [--groups <json>] [--include-external] [--report] --out <model.json>');
    return 2;
  }

  const q = queries(opts.schema);
  const rows = {};
  for (const [key, sql] of Object.entries(q)) {
    try {
      rows[key] = runQuery(opts.psql, sql);
    } catch (e) {
      console.error(`エラー: ${key} のクエリに失敗（${e.message.split('\n')[0]}）`);
      return 1;
    }
  }

  let merge = null;
  if (opts.merge) {
    try { merge = readJson(opts.merge); } catch (e) { console.error(`エラー: --merge を読めない（${e.message}）`); return 1; }
  }
  let labels = {};
  if (opts.labels) {
    try { labels = readJson(opts.labels); } catch (e) { console.error(`エラー: --labels を読めない（${e.message}）`); return 1; }
  }
  let groups = null;
  if (opts.groups) {
    try { groups = readJson(opts.groups); } catch (e) { console.error(`エラー: --groups を読めない（${e.message}）`); return 1; }
  }

  const order = merge && Array.isArray(merge.entities) ? merge.entities.map((e) => e.id) : [];
  const { state, fkMeta, counts } = buildStateFromRows(rows, { schema: opts.schema, order });
  const { model, droppedFks, stillUnmodeled } = buildModel(state, {
    title: opts.title, merge, labels, includeExternal: opts.includeExternal
  });
  attachColumnFacts(model, state);
  const relabeled = preferMergeRelationLabels(model, merge);
  const regrouped = applyGroupOverrides(model, groups);
  attachFkMeta(model, fkMeta);

  if (opts.report) {
    console.error(`--- ${opts.schema} スキーマ ---`);
    console.error(`  テーブル: ${counts.tables} / ビュー: ${counts.views} / FK: ${counts.fks}`);
    console.error(`  entity: ${model.entities.length} / relation: ${model.relations.length}`);
    if (merge) {
      const before = new Set(merge.entities.map((e) => e.id));
      const after = new Set(model.entities.map((e) => e.id));
      const added = [...after].filter((x) => !before.has(x));
      const removed = [...before].filter((x) => !after.has(x));
      console.error(`  --merge との差分: 追加 ${added.length}（${added.join(', ') || 'なし'}）`);
      console.error(`                    削除 ${removed.length}（${removed.join(', ') || 'なし'}）`);
      console.error(`  label を引き継いだ relation: ${relabeled}`);
    }
    if (groups) console.error(`  group を上書きした entity: ${regrouped}`);
    if (droppedFks.length) {
      console.error(`--- 落とした FK（参照先が model に無い）: ${droppedFks.length} ---`);
      for (const x of droppedFks) console.error(`  ${x}`);
    }
    if (stillUnmodeled.length) {
      console.error(`--- screens が指す未知の entity: ${[...new Set(stillUnmodeled)].join(', ')}`);
    }
  }

  const { errors, warnings } = validateModel(model);
  for (const w of warnings) console.error(`警告: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`エラー: ${e}`);
    console.error('検査に落ちたのでファイルは書かない');
    return 1;
  }

  const outPath = resolve(opts.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  console.log(`書いた: ${outPath}（entity ${model.entities.length} / relation ${model.relations.length}）`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
