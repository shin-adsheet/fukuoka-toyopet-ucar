// あんしん診断の目印を調べる一時的な確認用スクリプト。調査後に削除します。
import { readFile } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const data = JSON.parse(await readFile("data/cars.json", "utf8"));
const seen = new Set();
const targets = (data.cars || []).filter((c) => {
  if (!c.gazooUrl || c.soldout || seen.has(String(c.id))) return false;
  seen.add(String(c.id)); return true;
}).slice(0, 6);
for (const car of targets) {
  console.log("\n======== " + car.id + " " + car.name + " cert=" + (car.cert || ""));
  const html = await (await fetch(car.gazooUrl, { headers: { "user-agent": UA } })).text();
  for (const word of ["診断", "安心", "あんしん", "relief", "検査", "鑑定", "評価"]) {
    const hits = [...html.matchAll(new RegExp(word, "g"))].slice(0, 4)
      .map((m) => html.slice(Math.max(0, m.index - 110), m.index + 90).replace(/\s+/g, " "));
    if (hits.length) { console.log(" [" + word + "]"); hits.forEach((h) => console.log("    " + h)); }
  }
  await new Promise((r) => setTimeout(r, 1200));
}
