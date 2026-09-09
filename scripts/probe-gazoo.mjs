// 認定中古車／認定中古車ライトの見分け方を調べるための一時的な確認用スクリプト。
// GitHub Actions から実行してHTMLの手がかりを出力する。
import { readFile } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const data = JSON.parse(await readFile("data/cars.json", "utf8"));
const targets = (data.cars || []).filter((c) => c.gazooUrl && !c.soldout).slice(0, 6);
for (const car of targets) {
  console.log("\n================ " + car.name + " / " + car.store + " / " + car.id);
  try {
    const res = await fetch(car.gazooUrl, { headers: { "user-agent": UA }, redirect: "follow" });
    const html = await res.text();
    console.log("HTTP " + res.status + " / " + html.length + " bytes");
    // 「認定」を含む箇所の前後を出す
    const hits = [];
    const re = /認定/g;
    let m;
    while ((m = re.exec(html)) && hits.length < 14) {
      hits.push(html.slice(Math.max(0, m.index - 160), m.index + 120).replace(/\s+/g, " "));
    }
    hits.forEach((h, i) => console.log("  [認定 " + (i + 1) + "] " + h));
    // 画像やアイコンのファイル名にも手がかりがあるかもしれない
    const imgs = [...new Set((html.match(/[\w./-]*(?:certif|nintei|light|mark|logo|icon)[\w./-]*\.(?:png|svg|jpg|gif)/gi) || []))];
    console.log("  [画像候補] " + JSON.stringify(imgs.slice(0, 25)));
  } catch (e) {
    console.log("  エラー: " + e.message);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
