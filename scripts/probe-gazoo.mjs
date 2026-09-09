// 認定中古車／認定中古車ライトの見分け方を調べるための一時的な確認用スクリプト。
import { readFile } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const data = JSON.parse(await readFile("data/cars.json", "utf8"));
const seen = new Set();
const targets = [];
for (const c of data.cars || []) {
  const id = String(c.id || "");
  if (!c.gazooUrl || seen.has(id)) continue;
  seen.add(id);
  targets.push(c);
}
console.log("調べる台数: " + targets.length);
for (const car of targets) {
  try {
    const res = await fetch(car.gazooUrl, { headers: { "user-agent": UA }, redirect: "follow" });
    const html = await res.text();
    const h2 = (html.match(/<h2[^>]*class="pb-0"[\s\S]{0,400}?<\/h2>/) || [""])[0].replace(/\s+/g, " ");
    const icon = (h2.match(/<img[^>]*>/) || [""])[0];
    const light = /ライト/.test(html);
    const lightWhere = light
      ? [...new Set((html.match(/.{0,60}ライト.{0,40}/g) || []).map((s) => s.replace(/\s+/g, " ")))].slice(0, 4)
      : [];
    console.log(
      "\n--- " + car.id + " " + (car.name || "") + " / " + car.store + (car.soldout ? " [売約]" : "")
    );
    console.log("  HTTP " + res.status);
    console.log("  icon : " + icon);
    console.log("  ライト有無: " + light);
    lightWhere.forEach((w) => console.log("     " + w));
  } catch (e) {
    console.log("\n--- " + car.id + " エラー: " + e.message);
  }
  await new Promise((r) => setTimeout(r, 1200));
}
