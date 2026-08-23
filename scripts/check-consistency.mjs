// =============================================================
// 管理画面（gas-webapp/index.html）とCMSローダー（assets/ucar-cards.js）は
// カードを別々に描いているため、店舗電話番号・オプション枠・埋め込み版数が
// ずれると本番だけ表示が変わってしまう。ずれていたら失敗させる。
// 実行： node scripts/check-consistency.mjs
// =============================================================
import { readFile } from "node:fs/promises";

const ADMIN = "gas-webapp/index.html";
const LOADER = "assets/ucar-cards.js";
const EMBED_TEMPLATE = "gas-webapp/CMS貼り付け用コード.html";

// `var NAME={...}` / `var NAME=[...]` の中身をそのまま切り出す
function pickLiteral(source, name, open, close) {
  const start = source.indexOf(name);
  if (start < 0) throw new Error(`${name} が見つかりません`);
  const from = source.indexOf(open, start);
  if (from < 0) throw new Error(`${name} の ${open} が見つかりません`);
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) return source.slice(from, i + 1);
  }
  throw new Error(`${name} の ${close} が見つかりません`);
}

function evaluate(literal) {
  return JSON.parse(JSON.stringify(new Function("return " + literal)()));
}

function compare(label, a, b, errors) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left === right) {
    console.log(`OK  ${label}`);
    return;
  }
  errors.push(`${label} が一致しません\n  ${ADMIN}: ${left}\n  ${LOADER}: ${right}`);
}

const admin = await readFile(ADMIN, "utf8");
const loader = await readFile(LOADER, "utf8");
const template = await readFile(EMBED_TEMPLATE, "utf8");
const errors = [];

compare(
  "店舗電話番号（PHONES / PHONE_BY_STORE）",
  evaluate(pickLiteral(admin, "var PHONES=", "{", "}")),
  evaluate(pickLiteral(loader, "var PHONE_BY_STORE =", "{", "}")),
  errors
);

compare(
  "オプション枠の並び（SLOTS / BADGE_SLOT_GROUPS）",
  evaluate(pickLiteral(admin, "var SLOTS=", "[", "]")),
  evaluate(pickLiteral(loader, "var BADGE_SLOT_GROUPS =", "[", "]")),
  errors
);

// 埋め込みコードの版数は、CDNキャッシュを更新するため両方そろえる
const embedVersion = (admin.match(/var EMBED_VERSION\s*=\s*'([^']+)'/) || [])[1];
const templateVersion = (template.match(/ucar-cards\.js\?v=([^"']+)/) || [])[1];
if (!embedVersion) errors.push(`${ADMIN} の EMBED_VERSION が読み取れません`);
else if (embedVersion !== templateVersion) {
  errors.push(`埋め込み版数が一致しません\n  ${ADMIN}: ${embedVersion}\n  ${EMBED_TEMPLATE}: ${templateVersion}`);
} else {
  console.log(`OK  埋め込み版数（EMBED_VERSION = ${embedVersion}）`);
}

if (errors.length) {
  console.error("\n" + errors.join("\n\n"));
  process.exit(1);
}
console.log("\nすべて一致しています");
