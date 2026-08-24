// =============================================================
// Gazooの掲載ページを見に行って、価格・車両情報・売約状況・メイン画像を自動更新するプログラム
// GitHub Actions（.github/workflows/update-gazoo.yml）から毎日自動で実行されます。
// 手動で試す場合： node scripts/update-from-gazoo.mjs
// =============================================================
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_FILE = "data/cars.json";
const IMAGE_DIR = "images";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ucar-card-updater/1.1";
const WAIT_MS = 3000; // ページとページの間に3秒待つ（相手に負荷をかけないため）
const SOLDOUT_RECHECK_DAYS = 14; // 売約にした車を、この日数だけは念のため見に行く

// HTMLの中から「ラベルの近くにある ○○万円」を探す
export function pickNumber(text, label) {
  const re = new RegExp(label + "[\\s\\S]{0,300}?([\\d,]+(?:\\.\\d+)?)\\s*万円");
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 「写真でクルマをチェック」の先頭の写真を、高画質から順に探す。
// _L（大）→ _M（中）→ _S（小）の順。GAS側 gazooMainImage_ と同じ優先順位。
// 取れなければ null を返し、既存の写真は変更しない。
export function pickMainImage(html) {
  const patterns = [
    /(?:https?:\/\/gazoo\.com)?\/U-Car\/carImg\/[^"'<>\s?]+?_L\.jpe?g(?:\?[^"'<>\s]*)?/i,
    /(?:https?:\/\/gazoo\.com)?\/U-Car\/carImg\/[^"'<>\s?]+?_M\.jpe?g(?:\?[^"'<>\s]*)?/i,
    /(?:https?:\/\/gazoo\.com)?\/U-Car\/carImg\/[^"'<>\s?]+?_S\.jpe?g(?:\?[^"'<>\s]*)?/i,
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (!m) continue;
    const url = m[0].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    return url.startsWith("http") ? url : "https://gazoo.com" + url;
  }
  return null;
}

// 支払総額と車両価格を取る。GAS側 gazooPrices_ と同じ考え方で、
// まず価格ブロック（sum-price / base-price）から読み、駄目ならラベル近接で探す。
// 支払総額が車両価格を下回る組み合わせは読み違いとみなし、どちらも更新しない。
export function pickPrices(html, text) {
  function fromBlock(className) {
    const re = new RegExp('<div[^>]*class=["\'][^"\']*\\b' + className + '\\b[^"\']*["\'][^>]*>([\\s\\S]{0,600}?)<\\/div>', "i");
    const block = (html.match(re) || [])[1];
    if (!block) return null;
    const plain = compactText(block).replace(/(\d)\s+(?=[.\d])/g, "$1");
    const raw = (plain.match(/([\d,]+(?:\.\d+)?)\s*万円/) || [])[1];
    if (!raw) return null;
    const n = Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const total = fromBlock("sum-price") ?? pickNumber(text, "支払総額");
  const vehicle = fromBlock("base-price") ?? pickNumber(text, "車両価格");
  if (total != null && vehicle != null && total < vehicle) {
    return { priceTotal: null, priceVehicle: null };
  }
  return { priceTotal: total, priceVehicle: vehicle };
}

function compactText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function formatKm(raw) {
  const n = Number(String(raw || "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n < 10000) return n.toLocaleString("ja-JP") + "km";
  const man = Math.round((n / 10000) * 10) / 10;
  return String(man).replace(/\.0$/, "") + "万km";
}

function parseSpecs(text) {
  const year = firstMatch(text, [
    /年式\s*[:：]?\s*(\d{4})年(?:\([^)]*\))?/,
    /初度登録(?:年月)?\s*[:：]?\s*(\d{4})年/,
  ]);
  const kmRaw = firstMatch(text, [
    /走行距離\s*[:：]?\s*([\d,]+)\s*km/i,
    /走行\s*[:：]?\s*([\d,]+)\s*km/i,
  ]);
  const shakenRaw = firstMatch(text, [
    /車検(?:有効期限)?\s*[:：]?\s*(\d{4}年\s*\d{1,2}月)/,
    /車検\s*[:：]?\s*(車検整備付)/,
  ]);
  const fuelRaw = firstMatch(text, [
    /エンジン(?:タイプ|種別)?\s*[:：]?\s*(ハイブリッド|ガソリン|ディーゼル|電気|EV|PHEV|PHV)/i,
    /燃料(?:種類)?\s*[:：]?\s*(ハイブリッド|ガソリン|ディーゼル|電気|EV|PHEV|PHV)/i,
  ]);
  const mission = firstMatch(text, [
    /ミッション\s*[:：]?\s*(CVT|AT|MT|[0-9]+AT|[0-9]+MT)/i,
    /トランスミッション\s*[:：]?\s*(CVT|AT|MT|[0-9]+AT|[0-9]+MT)/i,
  ]);
  const color = firstMatch(text, [
    /(?:ボディ)?カラー\s*[:：]?\s*([^ ]{2,40})/,
    /色\s*[:：]?\s*([^ ]{2,40})/,
  ]);

  return {
    year: year ? year + "年式" : null,
    km: kmRaw ? formatKm(kmRaw) : null,
    shaken: shakenRaw ? (shakenRaw === "車検整備付" ? shakenRaw : "車検 " + shakenRaw.replace(/\s+/g, "")) : null,
    fuel: fuelRaw ? fuelRaw.toUpperCase().replace(/^HYBRID$/, "ハイブリッド") : null,
    mission: mission ? mission.toUpperCase() : null,
    color: color || null,
  };
}

function parseBadges(text) {
  const badges = [];
  if (/修復歴\s*[:：]?\s*なし/.test(text)) badges.push("修無");
  if (/定期点検整備付|法定整備\s*[:：]?\s*付/.test(text)) badges.push("整付");
  if (/リサイクル[\s\S]{0,80}(?:預託済|料金預託済)/.test(text)) badges.push("リ済込");
  if (/車検整備付/.test(text)) badges.push("車検整備付");
  if (/ロングラン保証/.test(text)) badges.push("ロングラン保証");
  if (/ハイブリッド保証/.test(text)) badges.push("ハイブリッド保証");
  if (/あんしん診断/.test(text)) badges.push("あんしん診断");
  return badges;
}

export function parseGazoo(html) {
  // タグを取り除いて文字だけにしてから探す。NFKCで半角カナ等も揃える。
  const text = compactText(html);
  const prices = pickPrices(html, text);
  return {
    priceTotal: prices.priceTotal,
    priceVehicle: prices.priceVehicle,
    imageUrl: pickMainImage(html),
    specs: parseSpecs(text),
    badges: parseBadges(text),
  };
}

// Gazooがそのクルマを表示していない状態かどうか。
// 販売開始前と売約済みは同じ「売約済み」画面になるため、ここでは区別しない。
// どちらとして扱うかは、掲載待ち（gazooPending）かどうかで呼び出し側が決める。
export function looksGone(status, html, finalUrl) {
  if (status === 404 || status === 410) return true;
  if (/\/DealerU-Car\/error\//i.test(String(finalUrl || ""))) return true;
  return /すでに売約済み|売約済みとなって|掲載を終了|ページが見つかりません|お探しのページは|該当する車両がありません/.test(html);
}

// Excelから取り込んだ直後の「掲載開始待ち」かどうか
export function isPending(car) {
  return car.autoUpdate === false && car.gazooPending === true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function imageFileName(car, imageUrl) {
  const safeId = String(car.id || "car").replace(/[^a-zA-Z0-9_-]/g, "") || "car";
  const ext = new URL(imageUrl).pathname.match(/\.(jpe?g|png|webp)$/i)?.[0] || ".jpg";
  return path.join(IMAGE_DIR, "gazoo-" + safeId + ext.toLowerCase());
}

async function updateImage(car, imageUrl) {
  // 車ごとに画像自動更新を止めたい場合は、cars.jsonで
  // "autoImageUpdate": false を設定する。
  if (!imageUrl || car.autoImageUpdate === false) return false;

  const imageFile = imageFileName(car, imageUrl);
  const needsDownload =
    car.gazooImageUrl !== imageUrl ||
    car.image !== imageFile ||
    !(await fileExists(imageFile));

  if (!needsDownload) return false;

  const response = await fetch(imageUrl, { headers: { "user-agent": UA }, redirect: "follow" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.startsWith("image/")) {
    throw new Error("画像を取得できませんでした（HTTP " + response.status + "）");
  }

  await mkdir(IMAGE_DIR, { recursive: true });
  await writeFile(imageFile, Buffer.from(await response.arrayBuffer()));
  car.image = imageFile;
  car.gazooImageUrl = imageUrl;
  console.log("メイン画像を更新: " + car.name + "（" + car.store + "）");
  return true;
}

// 売約にした車を再確認する期間かどうか。
// 掲載終了の誤判定から戻せるように、売約にしてから一定期間だけ見に行く。
export function shouldRecheckSoldout(car, now = Date.now()) {
  const marked = Date.parse(String(car.soldoutAt || car.lastGazooCheck || ""));
  if (!Number.isFinite(marked)) return true; // 記録がなければ一度は確認する
  return now - marked < SOLDOUT_RECHECK_DAYS * 24 * 60 * 60 * 1000;
}

// Gazooで読み取れた内容をクルマへ反映する。読めなかった項目は既存値を残す。
async function applyGazooData(car, html) {
  const p = parseGazoo(html);
  let changed = false;

  if (p.priceTotal == null) {
    // 価格が読み取れないときは価格を変えない（誤更新防止）
    console.log(`価格が読み取れませんでした: ${car.name}`);
  } else {
    if (p.priceTotal !== car.priceTotal) {
      console.log(`支払総額を更新: ${car.name} ${car.priceTotal} → ${p.priceTotal}万円`);
      car.priceTotal = p.priceTotal;
      changed = true;
    }
    if (p.priceVehicle != null && p.priceVehicle !== car.priceVehicle) {
      console.log(`車両価格を更新: ${car.name} ${car.priceVehicle} → ${p.priceVehicle}万円`);
      car.priceVehicle = p.priceVehicle;
      changed = true;
    }
  }

  car.specs = car.specs || {};
  for (const key of ["year", "km", "shaken", "fuel", "mission", "color"]) {
    if (p.specs[key] && p.specs[key] !== car.specs[key]) {
      console.log(`車両情報を更新: ${car.name} ${key} ${car.specs[key] || "（空）"} → ${p.specs[key]}`);
      car.specs[key] = p.specs[key];
      changed = true;
    }
  }

  // 保証・整備等は1つでもGazooで検出できた場合だけ同期する。
  if (p.badges.length && JSON.stringify(p.badges) !== JSON.stringify(car.badges || [])) {
    console.log(`表示バッジを更新: ${car.name} → ${p.badges.join(" / ")}`);
    car.badges = p.badges;
    changed = true;
  }

  // 画像取得エラーだけで価格・売約更新全体を止めない。
  try {
    if (await updateImage(car, p.imageUrl)) changed = true;
  } catch (e) {
    console.log(`画像は更新しませんでした: ${car.name} ${e.message}`);
  }
  return changed;
}

export async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
  let changed = false;

  for (const car of data.cars || []) {
    if (!car.gazooUrl) continue;
    const pending = isPending(car);
    if (!pending) {
      // 手動管理のクルマは触らない
      if (car.autoUpdate === false) continue;
      // 売約済みは再確認期間を過ぎたら飛ばす
      if (car.soldout && !shouldRecheckSoldout(car)) continue;
    }

    try {
      const res = await fetch(car.gazooUrl, { headers: { "user-agent": UA }, redirect: "follow" });
      const html = await res.text();
      const unavailable = looksGone(res.status, html, res.url);
      const now = new Date().toISOString();

      if (pending) {
        // 掲載開始待ち。売約済み画面なら販売開始前なので、まだ何もしない。
        if (unavailable) {
          console.log(`掲載開始を待っています: ${car.name}（${car.store}）`);
        } else if (res.ok) {
          car.autoUpdate = true;
          delete car.gazooPending;
          car.lastGazooCheck = now;
          car.gazooStatus = "ok";
          changed = true;
          console.log(`掲載が始まったので自動更新へ切り替え: ${car.name}（${car.store}）`);
          if (await applyGazooData(car, html)) changed = true;
        } else {
          console.log(`確認できませんでした（HTTP ${res.status}）: ${car.name}`);
        }
      } else if (unavailable) {
        car.lastGazooCheck = now;
        car.gazooStatus = "soldout";
        if (!car.soldout) {
          car.soldout = true;
          car.soldoutAt = now;
          changed = true;
          console.log(`売約にしました: ${car.name}（${car.store}）`);
        } else if (!car.soldoutAt) {
          // 以前からの売約分にも起点を残す。これがないと再確認の期限が延び続ける。
          car.soldoutAt = now;
          changed = true;
        }
      } else if (res.ok) {
        car.lastGazooCheck = now;
        car.gazooStatus = "ok";
        if (car.soldout) {
          // 掲載が戻っていたら売約表示を解除する
          car.soldout = false;
          delete car.soldoutAt;
          changed = true;
          console.log(`掲載が戻っていたので売約を解除: ${car.name}（${car.store}）`);
        }
        if (await applyGazooData(car, html)) changed = true;
      } else {
        console.log(`確認できませんでした（HTTP ${res.status}）: ${car.name}`);
      }
    } catch (e) {
      console.log(`エラー: ${car.name} ${e.message}`);
    }
    await sleep(WAIT_MS);
  }

  if (changed) {
    data.updatedAt = new Date().toISOString();
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
    console.log("data/cars.json と画像を更新しました");
  } else {
    console.log("変更はありませんでした");
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
