#!/usr/bin/env node
// model.json の構造検査。エラーは「どの entity の何が」まで日本語で出す。
// 依存パッケージなし（node:fs / node:path のみ）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CARDINALITIES = ['1:1', '1:N', 'N:1', 'N:M'];

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * model を検査する。例外は投げない。
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateModel(model) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!isObj(model)) {
    return { errors: ['ルートがオブジェクトではない。{ "version": 1, ... } の形にする'], warnings };
  }

  if (model.version !== 1) {
    err(`version: 1 である必要がある（今の値: ${JSON.stringify(model.version)}）`);
  }
  if (!isStr(model.title)) {
    err('title: 空でない文字列が必要（キャンバス右上とタブに出る名前）');
  }

  // --- entities ---
  const entityIds = new Set();
  if (!Array.isArray(model.entities) || model.entities.length === 0) {
    err('entities: 1 件以上の配列が必要');
  } else {
    model.entities.forEach((e, i) => {
      const at = `entities[${i}]`;
      if (!isObj(e)) { err(`${at}: オブジェクトではない`); return; }
      if (!isStr(e.id)) { err(`${at}: id が無い（英数字とハイフンの識別子を付ける）`); }
      else if (entityIds.has(e.id)) { err(`${at}: id "${e.id}" が重複している`); }
      else { entityIds.add(e.id); }
      const who = isStr(e.id) ? e.id : at;
      if (!isStr(e.label)) err(`${who}: label が無い（図に出る日本語名）`);
      if (e.group !== undefined && !isStr(e.group)) err(`${who}: group は文字列にする（色分けのキー）`);
      if (e.attributes !== undefined) {
        if (!Array.isArray(e.attributes)) { err(`${who}: attributes は配列にする`); return; }
        const names = new Set();
        e.attributes.forEach((a, j) => {
          const aat = `${who}.attributes[${j}]`;
          if (!isObj(a)) { err(`${aat}: オブジェクトではない`); return; }
          if (!isStr(a.name)) err(`${aat}: name が無い（カラム名）`);
          else if (names.has(a.name)) err(`${who}: 属性名 "${a.name}" が重複している`);
          else names.add(a.name);
          if (a.type !== undefined && !isStr(a.type)) err(`${who}.${a.name ?? j}: type は文字列にする`);
          if (a.pk !== undefined && typeof a.pk !== 'boolean') err(`${who}.${a.name ?? j}: pk は true / false にする`);
          if (a.fk !== undefined && !isStr(a.fk)) err(`${who}.${a.name ?? j}: fk は参照先 entity の id 文字列にする`);
        });
      }
    });
  }

  // fk の参照先は entities を全部集めてから照合する
  if (Array.isArray(model.entities)) {
    model.entities.forEach((e) => {
      if (!isObj(e) || !Array.isArray(e.attributes)) return;
      e.attributes.forEach((a) => {
        if (isObj(a) && isStr(a.fk) && !entityIds.has(a.fk)) {
          err(`${e.id}.${a.name}: fk "${a.fk}" は存在しない entity を指している`);
        }
      });
    });
  }

  // --- relations ---
  if (model.relations !== undefined && !Array.isArray(model.relations)) {
    err('relations: 配列にする');
  } else if (Array.isArray(model.relations)) {
    model.relations.forEach((r, i) => {
      const at = `relations[${i}]`;
      if (!isObj(r)) { err(`${at}: オブジェクトではない`); return; }
      const name = `${at} (${r.from ?? '?'} → ${r.to ?? '?'})`;
      if (!isStr(r.from)) err(`${at}: from が無い`);
      else if (!entityIds.has(r.from)) err(`${name}: from "${r.from}" は存在しない entity`);
      if (!isStr(r.to)) err(`${at}: to が無い`);
      else if (!entityIds.has(r.to)) err(`${name}: to "${r.to}" は存在しない entity`);
      if (r.cardinality !== undefined && !CARDINALITIES.includes(r.cardinality)) {
        err(`${name}: cardinality "${r.cardinality}" は不正。${CARDINALITIES.join(' / ')} のどれかにする`);
      }
      if (r.label !== undefined && !isStr(r.label)) err(`${name}: label は文字列にする`);
    });
  }

  // --- screens ---
  const screenIds = new Set();
  if (model.screens !== undefined && !Array.isArray(model.screens)) {
    err('screens: 配列にする');
  } else if (Array.isArray(model.screens)) {
    model.screens.forEach((s, i) => {
      const at = `screens[${i}]`;
      if (!isObj(s)) { err(`${at}: オブジェクトではない`); return; }
      if (!isStr(s.id)) err(`${at}: id が無い`);
      else if (screenIds.has(s.id)) err(`${at}: id "${s.id}" が重複している`);
      else screenIds.add(s.id);
      const who = isStr(s.id) ? `screens.${s.id}` : at;
      if (!isStr(s.label)) err(`${who}: label が無い（フレーム上部に出る画面名）`);
      if (s.route !== undefined && !isStr(s.route)) err(`${who}: route は文字列にする`);
      if (s.image !== undefined) {
        if (!isStr(s.image)) err(`${who}: image は相対パスの文字列にする`);
        else if (/^[a-z]+:\/\//i.test(s.image)) err(`${who}: image "${s.image}" は外部 URL。出力 HTML から見える相対パスにする`);
      }
      for (const k of ['width', 'height']) {
        if (s[k] !== undefined && (typeof s[k] !== 'number' || !(s[k] > 0))) {
          err(`${who}: ${k} は正の数にする（既定 ${k === 'width' ? 1440 : 1024}）`);
        }
      }
      if (s.entities !== undefined) {
        if (!Array.isArray(s.entities)) err(`${who}: entities は entity id の配列にする`);
        else s.entities.forEach((id) => {
          if (!isStr(id)) err(`${who}.entities: 文字列でない要素がある`);
          else if (!entityIds.has(id)) err(`${who}.entities: "${id}" は存在しない entity`);
        });
      } else {
        warn(`${who}: entities が空。概念図のハイライトと逆引きに出てこない`);
      }
      if (s.blocks !== undefined) {
        if (!Array.isArray(s.blocks)) { err(`${who}: blocks は配列にする`); return; }
        s.blocks.forEach((b, j) => {
          const bat = `${who}.blocks[${j}]`;
          if (!isObj(b)) { err(`${bat}: オブジェクトではない`); return; }
          if (!isStr(b.kind)) err(`${bat}: kind が無い（header / table / form / list / card / text / button など）`);
          if (b.label !== undefined && !isStr(b.label)) err(`${bat}: label は文字列にする`);
          if (b.entity !== undefined) {
            if (!isStr(b.entity)) err(`${bat}: entity は文字列にする`);
            else if (!entityIds.has(b.entity)) err(`${bat}: entity "${b.entity}" は存在しない entity`);
          }
          if (b.columns !== undefined) {
            if (!Array.isArray(b.columns)) err(`${bat}: columns は文字列の配列にする`);
            else if (isStr(b.entity) && entityIds.has(b.entity)) {
              const ent = model.entities.find((e) => isObj(e) && e.id === b.entity);
              const names = new Set((ent?.attributes ?? []).filter(isObj).map((a) => a.name));
              b.columns.forEach((c) => {
                if (!isStr(c)) err(`${bat}.columns: 文字列でない要素がある`);
                else if (names.size > 0 && !names.has(c)) warn(`${bat}.columns: "${c}" は ${b.entity} の属性に無い（表示はされる）`);
              });
            }
          }
        });
      }
      if (s.image === undefined && (!Array.isArray(s.blocks) || s.blocks.length === 0)) {
        warn(`${who}: image も blocks も無い。画面ビューでは空のフレームになる`);
      }
    });
  }

  // --- flows ---
  if (model.flows !== undefined && !Array.isArray(model.flows)) {
    err('flows: 配列にする');
  } else if (Array.isArray(model.flows)) {
    model.flows.forEach((f, i) => {
      const at = `flows[${i}]`;
      if (!isObj(f)) { err(`${at}: オブジェクトではない`); return; }
      const name = `${at} (${f.from ?? '?'} → ${f.to ?? '?'})`;
      if (!isStr(f.from)) err(`${at}: from が無い`);
      else if (!screenIds.has(f.from)) err(`${name}: from "${f.from}" は存在しない screen`);
      if (!isStr(f.to)) err(`${at}: to が無い`);
      else if (!screenIds.has(f.to)) err(`${name}: to "${f.to}" は存在しない screen`);
      if (f.label !== undefined && !isStr(f.label)) err(`${name}: label は文字列にする`);
    });
  }

  return { errors, warnings };
}

/** ファイルを読んでパースする。JSON 構文エラーも errors に入れて返す。 */
export function loadModel(path) {
  const abs = resolve(path);
  let raw;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch (e) {
    return { model: null, errors: [`ファイルを読めない: ${abs}（${e.code ?? e.message}）`] };
  }
  try {
    return { model: JSON.parse(raw), errors: [] };
  } catch (e) {
    return { model: null, errors: [`JSON として読めない: ${abs}（${e.message}）`] };
  }
}

function main(argv) {
  const path = argv[0];
  if (!path) {
    console.error('使い方: node scripts/validate.mjs <model.json>');
    return 2;
  }
  const { model, errors: loadErrors } = loadModel(path);
  if (loadErrors.length > 0) {
    loadErrors.forEach((m) => console.error(`エラー: ${m}`));
    return 1;
  }
  const { errors, warnings } = validateModel(model);
  warnings.forEach((m) => console.warn(`警告: ${m}`));
  if (errors.length > 0) {
    errors.forEach((m) => console.error(`エラー: ${m}`));
    console.error(`\n${errors.length} 件のエラー。model.json を直してから render する。`);
    return 1;
  }
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  console.log(`OK: ${model.title}（画面 ${n(model.screens)} / entity ${n(model.entities)} / relation ${n(model.relations)} / flow ${n(model.flows)}）`);
  if (warnings.length > 0) console.log(`警告 ${warnings.length} 件。描画はできる。`);
  return 0;
}

// 直接実行されたときだけ CLI として動く（パスに空白があっても壊れない比較）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
