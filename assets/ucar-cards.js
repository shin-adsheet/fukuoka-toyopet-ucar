(function () {
  "use strict";

  if (window.FukuokaToyopetUcarRenderAll) {
    window.FukuokaToyopetUcarRenderAll();
    return;
  }

  var STYLE_ID = "fukuoka-toyopet-ucar-style";
  var BADGE_CLASS = { "ロングラン保証": "b-longrun", "ハイブリッド保証": "b-hv", "あんしん診断": "b-anshin" };
  var BADGE_SLOT_GROUPS = [["修無"], ["ロングラン保証"], ["整付"], ["ハイブリッド保証"], ["リ済込", "車検整備付"], ["あんしん診断"]];
  // 受話器の絵文字（☎）は古く見えるため、線の細い今どきのアイコンを埋め込む
  var PHONE_ICON = '<svg class="utc-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>';
  // カードの色。ページごとに選べる。custom は #rrggbb をそのまま使う。
  var THEMES = {
    red:    { accent: "#e60012", phone: "#2077c8" },
    blue:   { accent: "#1462b4", phone: "#0f8a6a" },
    black:  { accent: "#222629", phone: "#2077c8" },
    orange: { accent: "#e2650f", phone: "#2077c8" },
    green:  { accent: "#127a45", phone: "#2077c8" }
  };
  function themeOf(value) {
    var v = String(value || "red").trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return { accent: v, phone: THEMES.red.phone };
    return THEMES[v] || THEMES.red;
  }

  var PHONE_BY_STORE = {
    "福岡西店": "092-894-8639",
    "博多南店": "092-581-3131",
    "福岡インター店": "092-938-1422",
    "小倉東店": "093-472-1234",
    "八幡店": "093-621-5352",
    "飯塚店": "0948-82-2594",
    "久留米インター店": "0942-44-6144"
  };

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      // カードは 780:714 の比率で固定。中の文字と余白はカード幅（cqw）に比例させ、
      // どの幅でも同じ見た目のまま拡大縮小する。固定pxのままだと、幅が縮んだときに
      // 中身が入りきらず、スマホでボタンが切れてしまう。
      // ※カード自身の padding / border-radius に cqw は使えない（外側の基準になるため）。
      ".event-ucar-cards{display:flex;flex-wrap:wrap;justify-content:space-between;margin:10px auto 0;padding:0 5%;}",
      ".event-ucar-cards .utc-card{width:49%;aspect-ratio:780/714;margin-bottom:1.2%;background:var(--utc-accent,#e60012);border-radius:14px;padding:6px;box-sizing:border-box;position:relative;font-family:inherit;overflow:hidden;container-type:inline-size;}",
      ".event-ucar-cards .utc-card-main{display:block;height:100%;color:#222;}",
      ".event-ucar-cards .utc-head{display:flex;height:9.1cqw;box-sizing:border-box;justify-content:space-between;align-items:center;color:#fff;padding:0.8cqw 2.1cqw 1.2cqw;font-weight:bold;}",
      ".event-ucar-cards .utc-head small{font-size:2.8cqw;font-weight:normal;margin-right:1.2cqw;}",
      ".event-ucar-cards .utc-store{font-size:4.3cqw;}.event-ucar-cards .utc-id{font-size:3.8cqw;letter-spacing:.05em;}",
      ".event-ucar-cards .utc-inner{height:calc(100% - 9.1cqw);box-sizing:border-box;background:#fff;border-radius:2.1cqw;padding:2.1cqw;display:flex;flex-direction:column;overflow:hidden;}",
      ".event-ucar-cards .utc-body{display:flex;gap:2.1cqw;}.event-ucar-cards .utc-photo{width:52%;position:relative;flex:none;}",
      ".event-ucar-cards .utc-photo .ph{width:100%;aspect-ratio:4/3;background:#eee;overflow:hidden;}.event-ucar-cards .utc-photo img{width:100%;height:100%;object-fit:contain;display:block;}",
      ".event-ucar-cards .utc-stock{position:absolute;top:0.8cqw;right:0.8cqw;background:#fff;border:1px solid #333;font-size:2.8cqw;padding:0 1.2cqw;font-weight:bold;}",
      ".event-ucar-cards .utc-info{flex:1;min-width:0;}.event-ucar-cards .utc-badges{margin:0 0 1.4cqw;padding:0;list-style:none;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.8fr);gap:0.6cqw 0.8cqw;}",
      ".event-ucar-cards .utc-badges li{min-width:0;font-size:2.6cqw;line-height:1.4;padding:0.4cqw 1cqw;font-weight:bold;text-align:center;white-space:nowrap;background:#888;color:#fff;}.event-ucar-cards .utc-badges li.is-off{visibility:hidden;}",
      ".event-ucar-cards .utc-badges li.b-longrun{background:#1a2f80;}.event-ucar-cards .utc-badges li.b-hv{background:#1e9cd7;}.event-ucar-cards .utc-badges li.b-anshin{background:#21b8b3;color:#fff;}",
      ".event-ucar-cards .utc-price{text-align:right;}.event-ucar-cards .utc-price-label{display:block;color:var(--utc-accent,#e60012);font-weight:bold;font-size:3.3cqw;}",
      ".event-ucar-cards .utc-price-main{color:var(--utc-accent,#e60012);font-weight:900;font-size:10.4cqw;line-height:1;}.event-ucar-cards .utc-price-main small{font-size:6.2cqw;}.event-ucar-cards .utc-price-main .utc-unit{font-size:4.3cqw;margin-left:0.4cqw;font-weight:700;}",
      ".event-ucar-cards .utc-price-sub{display:block;font-size:2.9cqw;color:#333;margin-top:0.8cqw;line-height:1.5;}.event-ucar-cards .utc-name{font-size:4.7cqw;font-weight:bold;margin:1.6cqw 0 0.6cqw;}.event-ucar-cards .utc-specs{font-size:2.9cqw;margin:0 0 1.6cqw;line-height:1.7;}",
      ".event-ucar-cards .utc-btns{display:flex;gap:1.4cqw;margin-top:auto;}.event-ucar-cards .utc-btn{display:flex;align-items:center;justify-content:center;min-width:0;background:var(--utc-accent,#e60012);color:#fff;text-align:center;text-decoration:none;font-weight:bold;font-size:4cqw;border-radius:999px;padding:2.1cqw 1.6cqw;position:relative;line-height:1.2;}",
      ".event-ucar-cards .utc-btn-icon{width:1.15em;height:1.15em;margin-right:.35em;flex:none;fill:currentColor;}",
      ".event-ucar-cards .utc-detail-btn{flex:1.35;}.event-ucar-cards .utc-phone-btn{flex:1;background:var(--utc-phone,#2077c8);}.event-ucar-cards .utc-detail-btn::after{content:'▶';position:absolute;right:2.1cqw;font-size:2.3cqw;top:50%;transform:translateY(-50%);}",
      ".event-ucar-cards .utc-soldout-img{position:absolute;z-index:5;width:58%;max-width:270px;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;}.event-ucar-cards .utc-card.soldout a{pointer-events:none;cursor:default;opacity:.65;}",
      // スマホは1列。文字はカード幅に連動するので、ここで大きさを指定し直す必要はない。
      "@media screen and (max-width:767px){.event-ucar-cards{display:block;padding:0 4%;}.event-ucar-cards .utc-card{width:100%;margin-bottom:12px;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var SITE_ORIGIN = "https://fukuoka-toyopet.jp";

  function imageSource(value, base) {
    if (!value) return "";
    if (/^data:|^https?:/.test(value)) return value;
    if (value.indexOf("images/") === 0) return base + value;
    // CMS内のパス（/file/... など）は本サイト側の絶対URLにする。
    // 管理画面プレビュー（index.html の imgSrc）と表示を揃えるため。
    if (value.charAt(0) === "/") return SITE_ORIGIN + value;
    return value;
  }

  function card(car, index, pageId, base) {
    var fee = null;
    if (car.priceTotal != null && car.priceVehicle != null) {
      fee = Math.round((Number(car.priceTotal) - Number(car.priceVehicle)) * 10) / 10;
      if (isNaN(fee) || fee < 0) fee = null;
    }
    // 支払総額がまだ無い間（掲載開始前など）は、車両価格を主役にして「万円」だけが
    // 残らないようにする。どちらも無ければ価格欄そのものを出さない。
    var showTotal = car.priceTotal != null;
    var mainPrice = showTotal ? car.priceTotal : car.priceVehicle;
    var priceLabel = showTotal ? "支払総額" : "車両価格";
    var price = mainPrice == null ? "" : String(mainPrice);
    var priceParts = price.split(".");
    var specs = car.specs || {};
    var specText = [specs.year, specs.km, specs.shaken, specs.fuel, specs.mission, specs.color ? "色：" + specs.color : ""]
      .filter(Boolean).map(function (value) { return "■" + esc(value); }).join("　");
    var active = car.badges || [];
    var badges = BADGE_SLOT_GROUPS.map(function (group) {
      var label = group.filter(function (badge) { return active.indexOf(badge) >= 0; })[0] || group[0];
      var enabled = active.indexOf(label) >= 0;
      return '<li class="' + ((BADGE_CLASS[label] || "") + (enabled ? "" : " is-off")).trim() + '">' + esc(label) + "</li>";
    }).join("");
    var source = imageSource(car.image, base);
    var image = source ? '<img src="' + esc(source) + '" alt="' + esc((car.store || "") + " " + (car.name || "") + " " + price + "万円") + '" loading="lazy">' : "";
    var priceSub = !showTotal || car.priceVehicle == null ? "" : '<span class="utc-price-sub">車両価格 ' + esc(car.priceVehicle) + "万円" + (fee != null ? "<br>諸費用 " + fee + "万円" : "") + "</span>";
    var priceBlock = price === "" ? "" : '<div class="utc-price"><span class="utc-price-label">' + priceLabel + '</span><span class="utc-price-main">' + esc(priceParts[0] || "") + (priceParts[1] ? "<small>." + esc(priceParts[1]) + "</small>" : "") + '<span class="utc-unit">万円</span></span>' + priceSub + "</div>";
    var sold = car.soldout ? '<img class="utc-soldout-img" src="' + esc(base + "assets/soldout.png") + '" alt="売約済">' : "";
    var phone = PHONE_BY_STORE[car.store] || "";
    var tag = pageId + "_" + ("0" + (index + 1)).slice(-2) + "_" + (car.name || "") + "_" + (car.store || "").replace(/店$/, "");
    var detailButton = '<a class="utc-btn utc-detail-btn clicktag" data-clicktag="' + esc(tag) + '" data-clicktagaction="gazooURL" href="' + esc(car.gazooUrl || "#") + '" target="_blank" rel="noopener">詳しくはこちら</a>';
    var phoneButton = phone ? '<a class="utc-btn utc-phone-btn" href="tel:' + esc(phone.replace(/[^0-9+]/g, "")) + '" aria-label="' + esc((car.store || "") + "へ電話で確認する") + '">' + PHONE_ICON + "確認する</a>" : "";
    return '<div class="utc-card' + (car.soldout ? " soldout" : "") + '" data-uid="' + esc(car.uid || "") + '"><div class="utc-card-main">'
      + '<div class="utc-head"><span class="utc-store"><small>トヨタ認定中古車</small>' + esc(car.store || "") + '</span><span class="utc-id">' + esc(car.id || "") + "</span></div>"
      + '<div class="utc-inner"><div class="utc-body"><div class="utc-photo"><div class="ph">' + image + "</div>" + (car.stock ? '<span class="utc-stock">' + esc(car.stock) + "</span>" : "") + "</div>"
      + '<div class="utc-info"><ul class="utc-badges">' + badges + "</ul>" + priceBlock + "</div></div>"
      + '<h3 class="utc-name">' + esc(car.name || "") + '</h3><p class="utc-specs">' + specText + '</p><div class="utc-btns">' + detailButton + phoneButton + "</div></div></div>" + sold + "</div>";
  }

  function pageThemeOf(data, pageId) {
    var pages = (data && data.pages) || [];
    var found = pages.filter(function (p) { return p && p.id === pageId; })[0];
    return themeOf(found && found.theme);
  }

  function carsForPage(data, pageId) {
    var all = data && Array.isArray(data.cars) ? data.cars : [];
    if (!data || !Array.isArray(data.pages) || !data.pages.length) return all;
    var selectedPage = data.pages.filter(function (page) { return page && page.id === pageId; })[0];
    if (!selectedPage) return [];
    var byUid = {};
    all.forEach(function (car) { if (car && car.uid) byUid[car.uid] = car; });
    return (selectedPage.carUids || []).map(function (uid) { return byUid[uid]; }).filter(Boolean);
  }

  // どのカードのどのボタンが押されたかを管理画面へ知らせる。
  // 表示や遷移を邪魔しないよう、送信の失敗は黙って捨てる。
  function sendClick(logUrl, pageId, uid, kind) {
    if (!logUrl || !uid) return;
    try {
      var body = JSON.stringify({ p: pageId, u: uid, k: kind });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(logUrl, new Blob([body], { type: "text/plain;charset=UTF-8" }));
      } else {
        fetch(logUrl, { method: "POST", body: body, mode: "no-cors", keepalive: true });
      }
    } catch (e) {}
  }

  // class名は前方一致だと utc-card-main が utc-card に引っかかるため、区切り込みで見る
  function hasClass(node, name) {
    return node && node.nodeType === 1 && (" " + (node.className || "") + " ").indexOf(" " + name + " ") >= 0;
  }
  function closestBy(node, stop, match) {
    while (node && node !== stop) {
      if (match(node)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function bindClickLog(box, pageId) {
    var logUrl = box.getAttribute("data-ucar-log") || "";
    if (!logUrl || box.getAttribute("data-ucar-logging") === "1") return;
    box.setAttribute("data-ucar-logging", "1");
    box.addEventListener("click", function (event) {
      var btn = closestBy(event.target, box, function (n) {
        return hasClass(n, "utc-detail-btn") || hasClass(n, "utc-phone-btn");
      });
      if (!btn) return;
      var card = closestBy(btn, box, function (n) {
        return n.nodeType === 1 && n.getAttribute && n.getAttribute("data-uid");
      });
      if (!card) return;
      sendClick(logUrl, pageId, card.getAttribute("data-uid"), hasClass(btn, "utc-phone-btn") ? "p" : "d");
    });
  }

  function renderBox(box) {
    if (!box || box.getAttribute("data-ucar-loading") === "1") return;
    var base = box.getAttribute("data-ucar-base") || "https://raw.githubusercontent.com/shin-adsheet/fukuoka-toyopet-ucar/main/";
    var pageId = box.getAttribute("data-ucar-page") || "main";
    bindClickLog(box, pageId);
    box.setAttribute("data-ucar-loading", "1");
    fetch(base + "data/cars.json?t=" + Date.now())
      .then(function (response) { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
      .then(function (data) {
        var theme = pageThemeOf(data, pageId);
        box.style.setProperty("--utc-accent", theme.accent);
        box.style.setProperty("--utc-phone", theme.phone);
        box.innerHTML = carsForPage(data, pageId).map(function (car, index) { return card(car, index, pageId, base); }).join("");
        box.setAttribute("data-ucar-ready", "1");
      })
      .catch(function () { box.textContent = ""; })
      .finally(function () { box.removeAttribute("data-ucar-loading"); });
  }

  window.FukuokaToyopetUcarRenderAll = function () {
    addStyle();
    Array.prototype.forEach.call(document.querySelectorAll(".event-ucar-cards[data-ucar-page]"), renderBox);
  };

  window.FukuokaToyopetUcarRenderAll();
})();
