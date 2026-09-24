// 店舗名のズレを全件確認する一時的な確認用スクリプト。調査後に削除します。
import { readFile } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const data = JSON.parse(await readFile("data/cars.json", "utf8"));
const seen = new Set();
const targets = (data.cars || []).filter((c) => {
  if (!c.gazooUrl || c.soldout || seen.has(String(c.id))) return false;
  seen.add(String(c.id));
  return true;
});
console.log("調べる台数: " + targets.length);
let mismatch = 0;
for (const car of targets) {
  try {
    const res = await fetch(car.gazooUrl, { headers: { "user-agent": UA }, redirect: "follow" });
    const html = await res.text();
    const raw = (html.match(/id=["']shopNm["']\s+value=["']([^"']*)["']/) || [])[1] || "";
    const live = raw.replace(/^福岡トヨペット\s*/, "").replace(/^トヨタ認定中古車\s*/, "").trim();
    const ok = live === car.store;
    if (!ok) mismatch++;
    console.log((ok ? "OK  " : "★NG ") + car.id + " " + (car.name || "").slice(0, 16) + " | 記録: " + car.store + " | Gazoo: " + (live || "(取得不可)"));
  } catch (e) {
    console.log("エラー " + car.id + " " + e.message);
  }
  await new Promise((r) => setTimeout(r, 1200));
}
console.log("\n不一致: " + mismatch + " / " + targets.length);
