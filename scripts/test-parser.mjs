// =============================================================
// Gazoo解析部分の動作確認。ネットにはつながず、手元のHTML断片で確かめる。
// 実行： node scripts/test-parser.mjs
// =============================================================
import {
  pickMainImage,
  pickPrices,
  parseGazoo,
  looksGone,
  shouldRecheckSoldout,
  isPending,
  jstHour,
  normalizeHours,
  lastScheduledTime,
  shouldRunNow,
} from "./update-from-gazoo.mjs";

let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`OK  ${label}`);
  } else {
    console.error(`NG  ${label}\n    期待: ${e}\n    実際: ${a}`);
    failed++;
  }
}

const IMG = "/U-Car/carImg/18101/8345111/83451112026050914225101";

// --- メイン画像：高画質から順に選ぶ ---
check(
  "画像は _L を最優先",
  pickMainImage(`<img src="${IMG}_S.jpg"><img src="${IMG}_M.jpg"><img src="${IMG}_L.jpg">`),
  "https://gazoo.com" + IMG + "_L.jpg"
);
check(
  "_L がなければ _M",
  pickMainImage(`<img src="${IMG}_S.jpg"><img src="${IMG}_M.jpg">`),
  "https://gazoo.com" + IMG + "_M.jpg"
);
check("_S しかなければ _S", pickMainImage(`<img src="${IMG}_S.jpg">`), "https://gazoo.com" + IMG + "_S.jpg");
check("画像がなければ null", pickMainImage("<p>写真はありません</p>"), null);

// --- 価格：ブロック優先、ラベル近接はフォールバック ---
const priceBlocks = `
  <div class="price-area">
    <div class="sum-price">支払総額 <span>585.8</span> 万円</div>
    <div class="base-price">車両価格 <span>574.9</span> 万円</div>
  </div>`;
check("価格ブロックから読む", pickPrices(priceBlocks, ""), { priceTotal: 585.8, priceVehicle: 574.9 });

check(
  "ブロックがなければラベル近接で読む",
  pickPrices("<p>ラベルのみ</p>", "支払総額 358.6 万円 車両価格 349.0 万円"),
  { priceTotal: 358.6, priceVehicle: 349 }
);

const reversed = `
  <div class="sum-price">支払総額 <span>300.0</span> 万円</div>
  <div class="base-price">車両価格 <span>574.9</span> 万円</div>`;
check("支払総額 < 車両価格 なら価格を更新しない", pickPrices(reversed, ""), { priceTotal: null, priceVehicle: null });

check("価格が読めなければ null", pickPrices("<p>準備中</p>", "準備中"), { priceTotal: null, priceVehicle: null });

// --- parseGazoo 全体 ---
const page = `
  <div class="sum-price">支払総額 <span>585.8</span> 万円</div>
  <div class="base-price">車両価格 <span>574.9</span> 万円</div>
  <img src="${IMG}_L.jpg">
  <dl><dt>年式</dt><dd>2024年</dd><dt>走行距離</dt><dd>32,000km</dd>
  <dt>修復歴</dt><dd>なし</dd></dl>
  <p>ロングラン保証</p>`;
const parsed = parseGazoo(page);
check("parseGazoo の価格", [parsed.priceTotal, parsed.priceVehicle], [585.8, 574.9]);
check("parseGazoo の画像は _L", parsed.imageUrl, "https://gazoo.com" + IMG + "_L.jpg");
check("parseGazoo の年式・走行距離", [parsed.specs.year, parsed.specs.km], ["2024年式", "3.2万km"]);
check("parseGazoo のバッジ", parsed.badges, ["修無", "ロングラン保証"]);

// --- 掲載されていない状態の判定 ---
check("404 は掲載なし", looksGone(404, ""), true);
check("掲載終了の文言", looksGone(200, "この車両は掲載を終了しました"), true);
check(
  "販売開始前の「売約済み」画面",
  looksGone(200, "お選びのU-Car（中古車）はすでに売約済みとなっております。"),
  true
);
check(
  "error/disabled へ飛ばされた場合",
  looksGone(200, "<p>なにか</p>", "https://gazoo.com/DealerU-Car/error/disabled?Sdlr=18101&Scn="),
  true
);
check("通常ページは掲載ありとみなす", looksGone(200, "<p>販売中</p>", "https://gazoo.com/DealerU-Car/detail?Id=1"), false);

// --- 掲載開始待ちの判定 ---
check("Excel取込直後は掲載待ち", isPending({ autoUpdate: false, gazooPending: true }), true);
check("手動管理は掲載待ちではない", isPending({ autoUpdate: false }), false);
check("自動更新中は掲載待ちではない", isPending({ autoUpdate: true, gazooPending: true }), false);

// --- 売約の再確認期間 ---
const now = Date.parse("2026-08-23T00:00:00Z");
check("売約直後は再確認する", shouldRecheckSoldout({ soldoutAt: "2026-08-20T00:00:00Z" }, now), true);
check("14日を過ぎたら再確認しない", shouldRecheckSoldout({ soldoutAt: "2026-08-01T00:00:00Z" }, now), false);
check("記録がなければ一度は確認する", shouldRecheckSoldout({}, now), true);
check(
  "soldoutAt がなければ lastGazooCheck を使う",
  shouldRecheckSoldout({ lastGazooCheck: "2026-08-01T00:00:00Z" }, now),
  false
);

// --- 自動更新を動かす時刻の判定 ---
// GitHubの定期実行は最大数時間ずれるため、「予定時刻ちょうど」ではなく
// 「予定時刻を過ぎてまだ動かしていないか」で判定する。
const jst = (s) => new Date(Date.parse(s + "+09:00"));

check("日本時間の時を取り出す", jstHour(jst("2026-09-07T06:30:00")), 6);
check("時刻の並び替えと重複除去", normalizeHours([20, 6, 20, 99, "x"]), [6, 20]);
check("空なら既定値", normalizeHours([]), [6, 20]);

check(
  "13時なら直近の予定は今日6時",
  new Date(lastScheduledTime([6, 20], jst("2026-09-07T13:00:00"))).toISOString(),
  jst("2026-09-07T06:00:00").toISOString()
);
check(
  "3時なら直近の予定は前日20時",
  new Date(lastScheduledTime([6, 20], jst("2026-09-07T03:00:00"))).toISOString(),
  jst("2026-09-06T20:00:00").toISOString()
);

check(
  "予定時刻を過ぎていて未実行なら動かす",
  shouldRunNow([6, 20], jst("2026-09-07T07:50:00"), jst("2026-09-06T20:05:00").toISOString(), "schedule"),
  true
);
check(
  "同じ予定分をすでに実行済みなら動かさない",
  shouldRunNow([6, 20], jst("2026-09-07T09:30:00"), jst("2026-09-07T06:40:00").toISOString(), "schedule"),
  false
);
check(
  "次の予定時刻が来たらまた動かす",
  shouldRunNow([6, 20], jst("2026-09-07T22:10:00"), jst("2026-09-07T06:40:00").toISOString(), "schedule"),
  true
);
check(
  "記録がなければ動かす",
  shouldRunNow([6, 20], jst("2026-09-07T09:30:00"), "", "schedule"),
  true
);
check(
  "手動実行はいつでも動かす",
  shouldRunNow([6, 20], jst("2026-09-07T09:30:00"), jst("2026-09-07T09:00:00").toISOString(), "workflow_dispatch"),
  true
);
// 以前の不具合の再現：6時ちょうどに起動しなくても取りこぼさない
check(
  "6時に起動できず7時50分になっても動かす",
  shouldRunNow([6, 20], jst("2026-09-07T07:50:00"), jst("2026-09-06T20:00:00").toISOString(), "schedule"),
  true
);

if (failed) {
  console.error(`\n${failed}件失敗しました`);
  process.exit(1);
}
console.log("\nすべて通りました");
