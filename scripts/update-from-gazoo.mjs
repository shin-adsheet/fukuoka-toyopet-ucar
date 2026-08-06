// =============================================================
// Gazooの掲載ページを見に行って、価格と売約状況を自動更新するプログラム
// GitHub Actions（.github/workflows/update-gazoo.yml）から毎日自動で実行されます。
// 手動で試す場合： node scripts/update-from-gazoo.mjs
// =============================================================
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_FILE = "data/cars.json";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ucar-card-updater/1.0";
const WAIT_MS = 3000; // ページとページの間に3秒待つ（相手に負荷をかけないため）

// HTMLの中から「ラベルの直後にある ○○万円」を探す。
// 「ラベルから300文字以内」のように広く探すと、600.8万円を「8万円」と
// 誤読できてしまうため、価格の直前までを空白だけに限定する。
export function pickNumber(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escapedLabel + "\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*\u4e07\u5186");
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseGazoo(html) {
  // script/styleの中の数字を先に除外し、画面に表示される文字だけにしてから探す
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    priceTotal: pickNumber(text, "\u652f\u6255\u7dcf\u984d"),
    priceVehicle: pickNumber(text, "\u8eca\u4e21\u4fa1\u683c"),
  };
}

// 万一Gazoo側のHTMLが変わっても、桁違いの価格で既存データを壊さないための安全装置
export function isPlausiblePrice(next, previous) {
  if (!Number.isFinite(next) || next < 10 || next > 5000) return false;
  if (Number.isFinite(previous) && previous > 0) {
    const ratio = next / previous;
    if (ratio < 0.6 || ratio > 1.4) return false;
  }
  return true;
}

// 掲載が終了（＝売約の可能性大）かどうか
export function looksGone(status, html) {
  if (status === 404 || status === 410) return true;
  return /\u63b2\u8f09\u3092\u7d42\u4e86|\u30da\u30fc\u30b8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093|\u304a\u63a2\u3057\u306e\u30da\u30fc\u30b8\u306f|\u8a72\u5f53\u3059\u308b\u8eca\u4e21\u304c\u3042\u308a\u307e\u305b\u3093/.test(html);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
  let changed = false;

  for (const car of data.cars || []) {
    // リンクなし・自動更新オフ・すでに売約のクルマは飛ばす
    if (!car.gazooUrl || car.autoUpdate === false || car.soldout) continue;

    try {
      const res = await fetch(car.gazooUrl, { headers: { "user-agent": UA }, redirect: "follow" });
      const html = await res.text();

      if (looksGone(res.status, html)) {
        car.soldout = true;
        changed = true;
        console.log(`\u58f2\u7d04\u306b\u3057\u307e\u3057\u305f: ${car.name}\uff08${car.store}\uff09`);
      } else if (res.ok) {
        const p = parseGazoo(html);
        if (p.priceTotal == null) {
          // 価格が読み取れないときは何もしない（誤更新防止）
          console.log(`\u4fa1\u683c\u304c\u8aad\u307f\u53d6\u308c\u307e\u305b\u3093\u3067\u3057\u305f: ${car.name}`);
        } else if (!isPlausiblePrice(p.priceTotal, car.priceTotal)) {
          console.log(`\u4fa1\u683c\u306e\u8aa4\u8aad\u307f\u3092\u691c\u51fa\u3057\u305f\u306e\u3067\u66f4\u65b0\u3057\u307e\u305b\u3093: ${car.name} (${p.priceTotal}\u4e07\u5186)`);
        } else if (p.priceVehicle != null && p.priceTotal < p.priceVehicle) {
          console.log(`\u652f\u6255\u7dcf\u984d\u304c\u8eca\u4e21\u4fa1\u683c\u3088\u308a\u4f4e\u3044\u305f\u3081\u66f4\u65b0\u3057\u307e\u305b\u3093: ${car.name}`);
        } else {
          if (p.priceTotal !== car.priceTotal) {
            console.log(`\u652f\u6255\u7dcf\u984d\u3092\u66f4\u65b0: ${car.name} ${car.priceTotal} \u2192 ${p.priceTotal} \u4e07\u5186`);
            car.priceTotal = p.priceTotal;
            changed = true;
          }
          if (p.priceVehicle != null && isPlausiblePrice(p.priceVehicle, car.priceVehicle) && p.priceVehicle !== car.priceVehicle) {
            console.log(`\u8eca\u4e21\u4fa1\u683c\u3092\u66f4\u65b0: ${car.name} ${car.priceVehicle} \u2192 ${p.priceVehicle} \u4e07\u5186`);
            car.priceVehicle = p.priceVehicle;
            changed = true;
          } else if (p.priceVehicle != null && !isPlausiblePrice(p.priceVehicle, car.priceVehicle)) {
            console.log(`\u8eca\u4e21\u4fa1\u683c\u306e\u8aa4\u8aad\u307f\u3092\u691c\u51fa\u3057\u305f\u306e\u3067\u3053\u306e\u9805\u76ee\u306f\u66f4\u65b0\u3057\u307e\u305b\u3093: ${car.name} (${p.priceVehicle}\u4e07\u5186)`);
          }
        }
      } else {
        console.log(`\u78ba\u8a8d\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f（HTTP ${res.status}）: ${car.name}`);
      }
    } catch (e) {
      console.log(`\u30a8\u30e9\u30fc: ${car.name} ${e.message}`);
    }
    await sleep(WAIT_MS);
  }

  if (changed) {
    data.updatedAt = new Date().toISOString();
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
    console.log("data/cars.json \u3092\u66f4\u65b0\u3057\u307e\u3057\u305f");
  } else {
    console.log("\u5909\u66f4\u306f\u3042\u308a\u307e\u305b\u3093\u3067\u3057\u305f");
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
