#!/usr/bin/env node
// Supabase / Postgres の migration 群から entity と relation を機械抽出して model.json を作る。
// 依存パッケージなし（node:fs / node:path / node:url のみ）。
//
// 解釈する DDL は CREATE TABLE / ALTER TABLE（ADD・DROP・RENAME・ADD CONSTRAINT）/ DROP TABLE /
// CREATE VIEW / DROP VIEW / CREATE TYPE ... AS ENUM だけ。関数本体（$$ ... $$）の中は読まない。
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateModel } from './validate.mjs';

const IDENT = '(?:"[^"]*"|[A-Za-z_][A-Za-z0-9_$]*)';
const QNAME = `(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})`;

const unquote = (s) => (s == null ? s : String(s).replace(/^"([\s\S]*)"$/, '$1'));

// ---------------------------------------------------------------- 字句分解

/**
 * SQL をトップレベルの `;` で文に割る。
 * 行コメントとブロックコメントは落とし、単一引用符・二重引用符・ドル引用符の中は割らない。
 * ドル引用符の本体（関数本体や DO ブロック）は中身を捨てて `$$body$$` に潰す。
 */
export function splitStatements(sql) {
  const out = [];
  let buf = '';
  let atLineStart = true;
  let i = 0;
  const n = sql.length;
  const push = () => { const s = buf.trim(); if (s) out.push(s); buf = ''; };

  while (i < n) {
    const c = sql[i];

    // psql のメタコマンド（\restrict など）は行ごと捨てる
    if (atLineStart && c === '\\') {
      while (i < n && sql[i] !== '\n') i += 1;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i += 1;
      buf += ' ';
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth += 1; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth -= 1; i += 2; }
        else i += 1;
      }
      buf += ' ';
      atLineStart = false;
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      let lit = q;
      while (j < n) {
        if (sql[j] === q && sql[j + 1] === q) { lit += q + q; j += 2; continue; }
        if (sql[j] === q) { lit += q; j += 1; break; }
        lit += sql[j];
        j += 1;
      }
      buf += lit;
      i = j;
      atLineStart = false;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_$]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? n : end + tag.length;
        buf += ' $$body$$ ';
        atLineStart = false;
        continue;
      }
    }
    if (c === ';') { push(); i += 1; atLineStart = false; continue; }

    buf += c;
    atLineStart = c === '\n';
    i += 1;
  }
  push();
  return out;
}

/** s[start] の `(` に対応する `)` の位置。見つからなければ -1。引用符の中は数えない。 */
function matchParen(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const q = c;
      i += 1;
      while (i < s.length && s[i] !== q) i += 1;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/** トップレベルの区切り文字で割る（括弧と引用符の中は割らない）。 */
function splitTop(s, sep = ',') {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const q = c;
      cur += c;
      i += 1;
      while (i < s.length) {
        cur += s[i];
        if (s[i] === q) break;
        i += 1;
      }
      continue;
    }
    if (c === '(') depth += 1;
    if (c === ')') depth -= 1;
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** 括弧の中の識別子リストを配列にする（`(a, "b")` → ['a','b']）。 */
function identList(inner) {
  return splitTop(inner).map((x) => unquote(x.trim().replace(/\s+.*$/, '')));
}

// ---------------------------------------------------------------- 型の正規化

const TYPE_STOP = new Set([
  'NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'REFERENCES', 'UNIQUE', 'CHECK', 'GENERATED',
  'CONSTRAINT', 'COLLATE', 'DEFERRABLE', 'ON', 'STORAGE', 'COMPRESSION', 'IDENTITY'
]);

const TYPE_ALIAS = {
  'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp',
  'time with time zone': 'timetz',
  'time without time zone': 'time',
  'character varying': 'varchar',
  'double precision': 'double precision'
};

/** 列定義の残り部分から型名を取り出す（制約キーワードの手前まで）。 */
function readType(rest) {
  let depth = 0;
  let token = '';
  const tokens = [];
  for (let i = 0; i <= rest.length; i += 1) {
    const c = i < rest.length ? rest[i] : ' ';
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    if (depth <= 0 && /\s/.test(c)) {
      if (token) {
        const bare = unquote(token).toUpperCase();
        if (TYPE_STOP.has(bare)) break;
        tokens.push(token);
        token = '';
      }
      if (depth < 0) break;
      continue;
    }
    token += c;
  }
  return tokens.join(' ');
}

/** `"timestamp with time zone"` のような書き方を短く均す。 */
export function normalizeType(raw) {
  if (!raw) return '';
  const t = raw.replace(/"/g, '').replace(/\s+/g, ' ').trim().replace(/^public\./i, '');
  const m = /^([A-Za-z_][A-Za-z0-9_ ]*?)\s*(\([^)]*\))?\s*((?:\[\])*)$/.exec(t);
  if (!m) return t.toLowerCase();
  const head = m[1].toLowerCase().trim();
  const args = m[2] ? m[2].replace(/\s*,\s*/g, ', ') : '';
  return (TYPE_ALIAS[head] ?? head) + args + (m[3] ?? '');
}

// ---------------------------------------------------------------- 状態

export function createState() {
  return {
    tables: new Map(),   // name -> table
    enums: new Map(),    // type name -> [値]
    ignored: []          // { kind, known, head, source }
  };
}

function newTable(name, source, kind = 'table') {
  return { name, source, kind, columns: [], fks: [], pkCols: [], uniqueCols: new Set(), viewBody: '' };
}

const colIndex = (t, name) => t.columns.findIndex((c) => c.name === name);

/** `public.` と引用符を剥がす。public 以外のスキーマは `schema.name` のまま返す。 */
function refName(schema, name) {
  const s = unquote(schema);
  const n = unquote(name);
  if (!s || s.toLowerCase() === 'public') return n;
  return `${s}.${n}`;
}

// ---------------------------------------------------------------- 文の解釈

const KNOWN_IGNORED = [
  [/^CREATE\s+(OR\s+REPLACE\s+)?(TRUSTED\s+)?(PROCEDURAL\s+)?FUNCTION\b/i, 'CREATE FUNCTION'],
  [/^CREATE\s+(OR\s+REPLACE\s+)?PROCEDURE\b/i, 'CREATE PROCEDURE'],
  [/^DROP\s+FUNCTION\b/i, 'DROP FUNCTION'],
  [/^CREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b/i, 'CREATE TRIGGER'],
  [/^DROP\s+TRIGGER\b/i, 'DROP TRIGGER'],
  [/^CREATE\s+(UNIQUE\s+)?INDEX\b/i, 'CREATE INDEX'],
  [/^DROP\s+INDEX\b/i, 'DROP INDEX'],
  [/^CREATE\s+POLICY\b/i, 'CREATE POLICY'],
  [/^(DROP|ALTER)\s+POLICY\b/i, 'DROP/ALTER POLICY'],
  [/^(GRANT|REVOKE)\b/i, 'GRANT / REVOKE'],
  [/^COMMENT\s+ON\b/i, 'COMMENT'],
  [/^(SET|RESET|SELECT|INSERT|UPDATE|DELETE|WITH|TRUNCATE|ANALYZE|VACUUM|REFRESH|CALL|NOTIFY)\b/i, 'DML / SET'],
  [/^DO\b/i, 'DO ブロック'],
  [/^(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|END)\b/i, 'トランザクション'],
  [/^CREATE\s+(EXTENSION|SCHEMA|SEQUENCE|PUBLICATION|ROLE|CAST|OPERATOR|DOMAIN|AGGREGATE|SERVER)\b/i, 'CREATE 他'],
  [/^(DROP|ALTER)\s+(EXTENSION|SCHEMA|SEQUENCE|PUBLICATION|ROLE|TYPE|DOMAIN|DEFAULT|FUNCTION|MATERIALIZED)\b/i, 'DROP/ALTER 他'],
  [/^ALTER\s+DEFAULT\s+PRIVILEGES\b/i, 'ALTER DEFAULT PRIVILEGES'],
  [/^\$\$body\$\$$/i, '$$ 本体だけの断片']
];

// ALTER TABLE の中で、意図的に読み飛ばす動作
const KNOWN_IGNORED_ACTIONS = [
  [/^(ENABLE|DISABLE|FORCE|NO\s+FORCE)\b/i, 'ALTER TABLE ... ROW LEVEL SECURITY'],
  [/^OWNER\s+TO\b/i, 'ALTER TABLE ... OWNER TO'],
  [/^ALTER\s+(COLUMN\s+)?/i, 'ALTER TABLE ... ALTER COLUMN'],
  [/^DROP\s+CONSTRAINT\b/i, 'ALTER TABLE ... DROP CONSTRAINT'],
  [/^VALIDATE\s+CONSTRAINT\b/i, 'ALTER TABLE ... VALIDATE CONSTRAINT'],
  [/^SET\b/i, 'ALTER TABLE ... SET'],
  [/^(CLUSTER|INHERIT|NO\s+INHERIT|ATTACH|DETACH|REPLICA\s+IDENTITY)\b/i, 'ALTER TABLE ... その他'],
  [/^ADD\s+(CONSTRAINT\s+\S+\s+)?(CHECK|EXCLUDE)\b/i, 'ALTER TABLE ... ADD CHECK']
];

function note(state, stmt, source, kindHint, known = true) {
  let kind = kindHint ?? null;
  if (kind === null) {
    for (const [re, label] of KNOWN_IGNORED) {
      if (re.test(stmt)) { kind = label; break; }
    }
  }
  if (kind === null) { kind = '未対応'; known = false; }
  state.ignored.push({ kind, known, head: stmt.replace(/\s+/g, ' ').slice(0, 80), source });
}

/** CREATE TABLE の括弧の中身を読む。 */
function parseTableBody(state, table, inner) {
  for (const part of splitTop(inner)) {
    let item = part.replace(/^CONSTRAINT\s+(?:"[^"]*"|[A-Za-z_][\w$]*)\s+/i, '').trim();

    let m = /^PRIMARY\s+KEY\s*\(([\s\S]*?)\)/i.exec(item);
    if (m) { table.pkCols = identList(m[1]); continue; }

    m = /^UNIQUE\s*\(([\s\S]*?)\)/i.exec(item);
    if (m) { const cols = identList(m[1]); if (cols.length === 1) table.uniqueCols.add(cols[0]); continue; }

    m = new RegExp(`^FOREIGN\\s+KEY\\s*\\(([\\s\\S]*?)\\)\\s*REFERENCES\\s+${QNAME}\\s*(?:\\(([\\s\\S]*?)\\))?`, 'i').exec(item);
    if (m) {
      table.fks.push({ columns: identList(m[1]), refTable: refName(m[2], m[3]), source: table.source });
      continue;
    }

    if (/^(CHECK|EXCLUDE|LIKE|INHERITS|PARTITION)\b/i.test(item)) continue;

    const col = parseColumnDef(state, table, item);
    if (!col) continue;
    const at = colIndex(table, col.name);
    if (at >= 0) table.columns[at] = col; else table.columns.push(col);
  }
}

/** `col type ...制約` を 1 列として読む。読めなければ null。 */
function parseColumnDef(state, table, item) {
  const m = new RegExp(`^(${IDENT})\\s+([\\s\\S]+)$`).exec(item);
  if (!m) return null;
  const name = unquote(m[1]);
  const rest = m[2];
  const type = normalizeType(readType(rest));
  const col = { name, type };

  if (/\bPRIMARY\s+KEY\b/i.test(rest)) table.pkCols.push(name);
  if (/(^|\s)UNIQUE(\s|$)/i.test(rest)) table.uniqueCols.add(name);

  const ref = new RegExp(`\\bREFERENCES\\s+${QNAME}\\s*(?:\\(([\\s\\S]*?)\\))?`, 'i').exec(rest);
  if (ref) table.fks.push({ columns: [name], refTable: refName(ref[1], ref[2]), source: table.source });
  return col;
}

/** ALTER TABLE の 1 動作。解釈できたら true。 */
function applyAlterAction(state, table, action, source) {
  let m = new RegExp(`^ADD\\s+(?:CONSTRAINT\\s+(?:"[^"]*"|[A-Za-z_][\\w$]*)\\s+)?FOREIGN\\s+KEY\\s*\\(([\\s\\S]*?)\\)\\s*REFERENCES\\s+${QNAME}\\s*(?:\\(([\\s\\S]*?)\\))?`, 'i').exec(action);
  if (m) {
    table.fks.push({ columns: identList(m[1]), refTable: refName(m[2], m[3]), source });
    return true;
  }
  m = /^ADD\s+(?:CONSTRAINT\s+(?:"[^"]*"|[A-Za-z_][\w$]*)\s+)?PRIMARY\s+KEY\s*\(([\s\S]*?)\)/i.exec(action);
  if (m) { table.pkCols = identList(m[1]); return true; }

  m = /^ADD\s+(?:CONSTRAINT\s+(?:"[^"]*"|[A-Za-z_][\w$]*)\s+)?UNIQUE\s*\(([\s\S]*?)\)/i.exec(action);
  if (m) { const cols = identList(m[1]); if (cols.length === 1) table.uniqueCols.add(cols[0]); return true; }

  m = /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i.exec(action);
  if (m && !/^CONSTRAINT\b/i.test(m[1])) {
    const col = parseColumnDef(state, table, m[1].trim());
    if (!col) return false;
    const at = colIndex(table, col.name);
    if (at >= 0) table.columns[at] = col; else table.columns.push(col);
    return true;
  }

  m = new RegExp(`^DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?(${IDENT})`, 'i').exec(action);
  if (m) {
    const name = unquote(m[1]);
    const at = colIndex(table, name);
    if (at >= 0) table.columns.splice(at, 1);
    table.fks = table.fks.filter((f) => !f.columns.includes(name));
    table.pkCols = table.pkCols.filter((c) => c !== name);
    table.uniqueCols.delete(name);
    return true;
  }

  m = new RegExp(`^RENAME\\s+(?:COLUMN\\s+)?(${IDENT})\\s+TO\\s+(${IDENT})`, 'i').exec(action);
  if (m) {
    const from = unquote(m[1]);
    const to = unquote(m[2]);
    const at = colIndex(table, from);
    if (at >= 0) table.columns[at] = { ...table.columns[at], name: to };
    table.fks = table.fks.map((f) => ({ ...f, columns: f.columns.map((c) => (c === from ? to : c)) }));
    table.pkCols = table.pkCols.map((c) => (c === from ? to : c));
    if (table.uniqueCols.delete(from)) table.uniqueCols.add(to);
    return true;
  }
  return false;
}

/** テーブル名を変える（Map の並び順は保つ）。 */
function renameTable(state, from, to) {
  const entries = [...state.tables.entries()];
  state.tables.clear();
  for (const [name, t] of entries) {
    if (name === from) state.tables.set(to, { ...t, name: to });
    else state.tables.set(name, t);
  }
}

/** 1 本の SQL を state に適用する。 */
export function applySql(state, sql, source) {
  for (const stmt of splitStatements(sql)) {
    applyStatement(state, stmt, source);
  }
  return state;
}

function applyStatement(state, stmt, source) {
  // --- CREATE TABLE ---
  let m = new RegExp(`^CREATE\\s+(?:UNLOGGED\\s+|GLOBAL\\s+|LOCAL\\s+|TEMP(?:ORARY)?\\s+)*TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QNAME}([\\s\\S]*)$`, 'i').exec(stmt);
  if (m) {
    const ifNotExists = /^CREATE\s+(?:UNLOGGED\s+|GLOBAL\s+|LOCAL\s+|TEMP(?:ORARY)?\s+)*TABLE\s+IF\s+NOT\s+EXISTS/i.test(stmt);
    const schema = unquote(m[1]);
    const name = unquote(m[2]);
    if (schema && schema.toLowerCase() !== 'public') { note(state, stmt, source, 'public 以外のスキーマ', false); return; }
    const rest = m[3].trim();
    if (!rest.startsWith('(')) { note(state, stmt, source, 'CREATE TABLE AS / PARTITION OF', false); return; }
    if (state.tables.has(name) && ifNotExists) return;
    const close = matchParen(rest, 0);
    if (close === -1) { note(state, stmt, source, '括弧が閉じていない CREATE TABLE', false); return; }
    const table = newTable(name, source);
    parseTableBody(state, table, rest.slice(1, close));
    state.tables.set(name, table);
    return;
  }

  // --- CREATE VIEW ---
  m = new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QNAME}([\\s\\S]*)$`, 'i').exec(stmt);
  if (m) {
    const schema = unquote(m[1]);
    const name = unquote(m[2]);
    if (schema && schema.toLowerCase() !== 'public') { note(state, stmt, source, 'public 以外のスキーマ', false); return; }
    let rest = m[3].trim();
    if (rest.startsWith('(')) { const c = matchParen(rest, 0); rest = c === -1 ? rest : rest.slice(c + 1).trim(); }
    rest = rest.replace(/^WITH\s*\([\s\S]*?\)\s*/i, '');
    const body = rest.replace(/^AS\s+/i, '');
    const prev = state.tables.get(name);
    const view = newTable(name, prev?.source ?? source, 'view');
    view.viewBody = body;
    state.tables.set(name, view);
    return;
  }

  // --- DROP TABLE / DROP VIEW ---
  m = /^DROP\s+(TABLE|(?:MATERIALIZED\s+)?VIEW)\s+(?:IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(stmt);
  if (m) {
    const list = m[2].replace(/\s+(CASCADE|RESTRICT)\s*$/i, '');
    for (const one of splitTop(list)) {
      const q = new RegExp(`^${QNAME}`, 'i').exec(one.trim());
      if (!q) continue;
      const schema = unquote(q[1]);
      if (schema && schema.toLowerCase() !== 'public') continue;
      state.tables.delete(unquote(q[2]));
    }
    return;
  }

  // --- CREATE TYPE ... AS ENUM ---
  m = new RegExp(`^CREATE\\s+TYPE\\s+${QNAME}\\s+AS\\s+ENUM\\s*\\(([\\s\\S]*)\\)\\s*$`, 'i').exec(stmt);
  if (m) {
    const values = [...m[3].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
    state.enums.set(unquote(m[2]).toLowerCase(), values);
    return;
  }

  // --- ALTER TABLE ---
  m = new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${QNAME}\\s+([\\s\\S]+)$`, 'i').exec(stmt);
  if (m) {
    const schema = unquote(m[1]);
    const name = unquote(m[2]);
    const body = m[3].trim();
    if (schema && schema.toLowerCase() !== 'public') { note(state, stmt, source, 'public 以外のスキーマ', false); return; }

    const ren = new RegExp(`^RENAME\\s+TO\\s+${QNAME}\\s*$`, 'i').exec(body);
    if (ren) {
      if (state.tables.has(name)) renameTable(state, name, unquote(ren[2]));
      else note(state, stmt, source, '知らないテーブルの RENAME', false);
      return;
    }

    const table = state.tables.get(name);
    if (!table) { note(state, stmt, source, '知らないテーブルへの ALTER', false); return; }

    for (const action of splitTop(body)) {
      const ignored = KNOWN_IGNORED_ACTIONS.find(([re]) => re.test(action));
      if (ignored) { note(state, `ALTER TABLE ${name} ${action}`, source, ignored[1]); continue; }
      if (!applyAlterAction(state, table, action, source)) {
        note(state, `ALTER TABLE ${name} ${action}`, source, null);
      }
    }
    return;
  }

  note(state, stmt, source, null);
}

// ---------------------------------------------------------------- model 生成

const GROUP_RULES = [
  [/^agent_/, 'agent'],
  [/^discover_/, 'discover'],
  [/^es_/, 'es'],
  [/^templates$/, 'es'],
  [/^(email|mail|gmail)_/, 'mail'],
  [/^(calendar|gcal)_/, 'calendar'],
  [/^companies$/, 'companies'],
  [/^company_/, 'companies'],
  [/^profiles$/, 'profile'],
  [/^user_/, 'profile'],
  [/^(admin|funnel)_/, 'admin'],
  [/^(applications|stages|experiences)$/, 'tracker']
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function guessGroup(name) {
  for (const [re, group] of GROUP_RULES) if (re.test(name)) return group;
  return 'other';
}

/** FK の列名から関連ラベルを作る（`company_id` → `company`）。 */
function relationLabel(columns) {
  return columns.map((c) => c.replace(/_ids?$/i, '')).join(' + ') || columns.join(' + ');
}

/**
 * state から model.json（v1）を組み立てる。
 * @param {object} opts { title, labels, merge }
 */
export function buildModel(state, opts = {}) {
  const labels = opts.labels ?? {};
  const includeExternal = opts.includeExternal === true;
  const merge = opts.merge ?? null;
  const mergedLabels = new Map();
  if (merge && Array.isArray(merge.entities)) {
    for (const e of merge.entities) if (e && typeof e.id === 'string') mergedLabels.set(e.id, e);
  }

  const known = new Set(state.tables.keys());
  // 他スキーマ（auth.users など）や、この SQL 群では定義が見つからなかった参照先。
  // --include-external を付けたときだけ、属性を持たない entity として足す。
  const external = new Set();
  if (includeExternal) {
    for (const t of state.tables.values()) {
      for (const f of t.fks) if (!known.has(f.refTable)) external.add(f.refTable);
    }
    for (const name of external) known.add(name);
  }
  const entities = [];
  const relations = [];
  const droppedFks = [];

  for (const name of external) {
    const prev = mergedLabels.get(name);
    entities.push({
      id: name,
      label: labels[name] ?? prev?.label ?? name,
      group: prev?.group ?? 'external',
      x_kind: 'external',
      attributes: []
    });
  }

  for (const [name, t] of state.tables) {
    const prev = mergedLabels.get(name);
    const entity = {
      id: name,
      label: labels[name] ?? prev?.label ?? name,
      group: prev?.group ?? guessGroup(name)
    };
    if (t.kind === 'view') {
      entity.x_kind = 'view';
      entity.x_view_of = [...state.tables.keys()].filter((other) => other !== name
        && new RegExp(`(^|[^\\w."])(public\\s*\\.\\s*)?"?${escapeRe(other)}"?($|[^\\w"])`, 'i').test(t.viewBody));
    }
    const pk = new Set(t.pkCols);
    const fkByCol = new Map();
    for (const f of t.fks) {
      if (f.columns.length === 1 && known.has(f.refTable)) fkByCol.set(f.columns[0], f.refTable);
    }
    entity.attributes = t.columns.map((c) => {
      const a = { name: c.name, type: enumType(state, c.type) };
      if (pk.has(c.name)) a.pk = true;
      if (fkByCol.has(c.name)) a.fk = fkByCol.get(c.name);
      return a;
    });
    entity.x_source = t.source;
    entities.push(entity);

    const seen = new Set();
    for (const f of t.fks) {
      if (!known.has(f.refTable)) { droppedFks.push(`${name}.${f.columns.join(',')} → ${f.refTable}`); continue; }
      const key = `${f.refTable}|${f.columns.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const single = f.columns.length === 1 ? f.columns[0] : null;
      const oneToOne = single != null
        && (t.uniqueCols.has(single) || (t.pkCols.length === 1 && t.pkCols[0] === single));
      relations.push({
        from: name,
        to: f.refTable,
        label: relationLabel(f.columns),
        cardinality: oneToOne ? '1:1' : 'N:1',
        x_source: f.source
      });
    }
  }

  const model = {
    version: 1,
    title: opts.title ?? merge?.title ?? 'データモデル（migration から機械抽出）',
    entities,
    relations
  };

  const stillUnmodeled = [];
  if (merge && Array.isArray(merge.screens)) {
    model.screens = merge.screens.map((s) => {
      const screen = { ...s };
      const picked = [];
      const left = [];
      for (const id of [...(s.entities ?? []), ...(s.x_unmodeled_entities ?? [])]) {
        if (known.has(id)) { if (!picked.includes(id)) picked.push(id); }
        else if (!left.includes(id)) left.push(id);
      }
      screen.entities = picked;
      if (left.length > 0) screen.x_unmodeled_entities = left;
      else delete screen.x_unmodeled_entities;
      stillUnmodeled.push(...left);
      return screen;
    });
  }
  if (merge && Array.isArray(merge.flows)) model.flows = merge.flows;

  return { model, droppedFks, stillUnmodeled };
}

function enumType(state, type) {
  if (!type) return type;
  const base = type.replace(/\[\]$/, '').toLowerCase();
  const values = state.enums.get(base);
  if (!values) return type;
  return `enum(${values.join(', ')})`;
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { dir: null, schemaFirst: null, title: null, merge: null, labels: null, out: null, report: false, includeExternal: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--schema-first') opts.schemaFirst = argv[++i];
    else if (a === '--title') opts.title = argv[++i];
    else if (a === '--merge') opts.merge = argv[++i];
    else if (a === '--labels') opts.labels = argv[++i];
    else if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--report') opts.report = true;
    else if (a === '--include-external') opts.includeExternal = true;
    else if (a.startsWith('-')) throw new Error(`知らないオプション: ${a}`);
    else if (opts.dir === null) opts.dir = a;
    else throw new Error(`引数が多い: ${a}`);
  }
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(`エラー: ${e.message}`);
    return 2;
  }
  if (!opts.dir || !opts.out) {
    console.error('使い方: node scripts/extract-sql.mjs <migrations-dir> [--schema-first <schema.sql>] [--title "..."] [--merge <model.json>] [--labels <labels.json>] [--include-external] [--report] --out <model.json>');
    return 2;
  }

  const state = createState();
  const files = [];
  if (opts.schemaFirst) files.push(resolve(opts.schemaFirst));
  const dir = resolve(opts.dir);
  let entries;
  try {
    entries = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.sql')).sort();
  } catch (e) {
    console.error(`エラー: migration ディレクトリを読めない: ${dir}（${e.code ?? e.message}）`);
    return 1;
  }
  for (const f of entries) files.push(join(dir, f));

  for (const path of files) {
    let sql;
    try {
      sql = readFileSync(path, 'utf8');
    } catch (e) {
      console.error(`エラー: 読めない: ${path}（${e.code ?? e.message}）`);
      return 1;
    }
    applySql(state, sql, basename(path));
  }

  let merge = null;
  if (opts.merge) {
    try {
      merge = readJson(opts.merge);
    } catch (e) {
      console.error(`エラー: --merge の model.json を読めない（${e.message}）`);
      return 1;
    }
  }
  let labels = {};
  if (opts.labels) {
    try {
      labels = readJson(opts.labels);
    } catch (e) {
      console.error(`エラー: --labels の JSON を読めない（${e.message}）`);
      return 1;
    }
  }

  const { model, droppedFks, stillUnmodeled } = buildModel(state, { title: opts.title, merge, labels, includeExternal: opts.includeExternal });

  if (opts.report) {
    const unknown = state.ignored.filter((x) => !x.known);
    const byKind = new Map();
    for (const x of state.ignored) byKind.set(x.kind, (byKind.get(x.kind) ?? 0) + 1);
    console.error(`--- 無視した DDL（${state.ignored.length} 文）---`);
    for (const [kind, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
      console.error(`  ${kind}: ${n}`);
    }
    console.error(`--- 解釈できなかった文: ${unknown.length} ---`);
    for (const x of unknown) console.error(`  [${x.source}] ${x.head}`);
    if (droppedFks.length > 0) {
      console.error(`--- 参照先が model に無くて落とした FK: ${droppedFks.length} ---`);
      for (const d of droppedFks) console.error(`  ${d}`);
    }
  }

  const { errors, warnings } = validateModel(model);
  if (warnings.length > 0) console.error(`警告 ${warnings.length} 件（validate.mjs で中身を見る）`);
  if (errors.length > 0) {
    errors.forEach((m) => console.error(`エラー: ${m}`));
    console.error(`\n${errors.length} 件のエラー。model.json は書かなかった。`);
    return 1;
  }

  const outPath = resolve(opts.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');

  const groups = new Map();
  for (const e of model.entities) groups.set(e.group, (groups.get(e.group) ?? 0) + 1);
  const views = model.entities.filter((e) => e.x_kind === 'view').length;
  console.log(`→ ${outPath}`);
  console.log(`   SQL ${files.length} 本 / entity ${model.entities.length}（うち view ${views}）/ relation ${model.relations.length}`
    + (model.screens ? ` / screen ${model.screens.length}` : ''));
  console.log(`   group: ${[...groups.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(' / ')}`);
  if (stillUnmodeled.length > 0) {
    console.log(`   抽出できずに x_unmodeled_entities に残した参照: ${stillUnmodeled.length}（${[...new Set(stillUnmodeled)].join(', ')}）`);
  }
  if (droppedFks.length > 0) console.log(`   参照先が model に無くて落とした FK: ${droppedFks.length}（--report で一覧）`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
