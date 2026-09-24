// 店舗名・車名の取得方法を調べる一時的な確認用スクリプト。調査後に削除します。
import { readFile } from "node:fs/promises";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const data = JSON.parse(await readFile("data/cars.json", "utf8"));
const targets = (data.cars || []).filter((c) => c.gazooUrl && !c.soldout).slice(0, 3);
for (const car of targets) {
  console.log("\n================ " + car.name + " / store=" + car.store + " / id=" + car.id);
  try {
    const res = await fetch(car.gazooUrl, { headers: { "user-agent": UA }, redirect: "follow" });
    const html = await res.text();
    console.log("HTTP " + res.status + " / " + html.length + " bytes");
    console.log("  [title] " + (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    console.log("  [data-productname] " + (html.match(/data-productname=["']([^"']*)["']/) || [])[1]);
    console.log("  [data-shopnm] " + (html.match(/data-shopnm=["']([^"']*)["']/) || [])[1]);
    console.log("  [data-dealershopnm] " + (html.match(/data-dealershopnm=["']([^"']*)["']/) || [])[1]);
    console.log("  [data-productid] " + (html.match(/data-productid=["']([^"']*)["']/) || [])[1]);
    console.log("  [shopNm hidden] " + (html.match(/id=["']shopNm["']\s+value=["']([^"']*)["']/) || [])[1]);
    console.log("  [carNm hidden] " + (html.match(/id=["']carNm["']\s+value=["']([^"']*)["']/) || [])[1]);
    console.log("  [carId hidden] " + (html.match(/id=["']carId["']\s+value=["']([^"']*)["']/) || [])[1]);
    // car_name クラスの周辺をもう少し広く見る
    const m = html.match(/<h2[^>]*class="pb-0"[\s\S]{0,600}?<\/h2>/);
    console.log("  [h2.pb-0全体] " + (m ? m[0].replace(/\s+/g, " ") : "(なし)"));
  } catch (e) {
    console.log("  エラー: " + e.message);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
