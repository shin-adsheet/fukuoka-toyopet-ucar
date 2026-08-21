(function () {
  "use strict";

  if (window.FukuokaToyopetUcarRenderAll) {
    window.FukuokaToyopetUcarRenderAll();
    return;
  }

  var STYLE_ID = "fukuoka-toyopet-ucar-style";
  var BADGE_CLASS = { "ロングラン保証": "b-longrun", "ハイブリッド保証": "b-hv", "あんしん診断": "b-anshin" };
  var BADGE_SLOT_GROUPS = [["修無"], ["ロングラン保証"], ["整付"], ["ハイブリッド保証"], ["リ済込", "車検整備付"], ["あんしん診断"]];
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
      ".event-ucar-cards{display:flex;flex-wrap:wrap;justify-content:space-between;margin:10px auto 0;padding:0 5%;}",
      ".event-ucar-cards .utc-card{width:49%;aspect-ratio:780/714;margin-bottom:1.2%;background:#e60012;border-radius:14px;padding:6px;box-sizing:border-box;position:relative;font-family:inherit;overflow:hidden;}",
      ".event-ucar-cards .utc-card-main{display:block;height:100%;color:#222;}",
      ".event-ucar-cards .utc-head{display:flex;height:44px;box-sizing:border-box;justify-content:space-between;align-items:center;color:#fff;padding:4px 10px 6px;font-weight:bold;}",
      ".event-ucar-cards .utc-head small{font-size:12px;font-weight:normal;margin-right:6px;}",
      ".event-ucar-cards .utc-store{font-size:18px;}.event-ucar-cards .utc-id{font-size:16px;letter-spacing:.05em;}",
      ".event-ucar-cards .utc-inner{height:calc(100% - 44px);box-sizing:border-box;background:#fff;border-radius:10px;padding:10px;display:flex;flex-direction:column;overflow:hidden;}",
      ".event-ucar-cards .utc-body{display:flex;gap:10px;}.event-ucar-cards .utc-photo{width:55%;position:relative;flex:none;}",
      ".event-ucar-cards .utc-photo .ph{width:100%;aspect-ratio:4/3;background:#eee;overflow:hidden;}.event-ucar-cards .utc-photo img{width:100%;height:100%;object-fit:contain;display:block;}",
      ".event-ucar-cards .utc-stock{position:absolute;top:4px;right:4px;background:#fff;border:1px solid #333;font-size:12px;padding:0 6px;font-weight:bold;}",
      ".event-ucar-cards .utc-info{flex:1;min-width:0;}.event-ucar-cards .utc-badges{margin:0 0 8px;padding:0;list-style:none;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.8fr);gap:3px 4px;}",
      ".event-ucar-cards .utc-badges li{min-width:0;font-size:11px;line-height:1.4;padding:2px 5px;font-weight:bold;text-align:center;white-space:nowrap;background:#888;color:#fff;}.event-ucar-cards .utc-badges li.is-off{visibility:hidden;}",
      ".event-ucar-cards .utc-badges li.b-longrun{background:#1a2f80;}.event-ucar-cards .utc-badges li.b-hv{background:#1e9cd7;}.event-ucar-cards .utc-badges li.b-anshin{background:#21b8b3;color:#fff;}",
      ".event-ucar-cards .utc-price{text-align:right;}.event-ucar-cards .utc-price-label{display:block;color:#e60012;font-weight:bold;font-size:14px;}",
      ".event-ucar-cards .utc-price-main{color:#e60012;font-weight:900;font-size:44px;line-height:1;}.event-ucar-cards .utc-price-main small{font-size:26px;}.event-ucar-cards .utc-price-main .utc-unit{font-size:18px;margin-left:2px;font-weight:700;}",
      ".event-ucar-cards .utc-price-sub{display:block;font-size:12px;color:#333;margin-top:4px;}.event-ucar-cards .utc-name{font-size:20px;font-weight:bold;margin:10px 0 4px;}.event-ucar-cards .utc-specs{font-size:12px;margin:0 0 10px;line-height:1.7;}",
      ".event-ucar-cards .utc-btns{display:flex;gap:7px;margin-top:auto;}.event-ucar-cards .utc-btn{display:flex;align-items:center;justify-content:center;min-width:0;background:#e60012;color:#fff;text-align:center;text-decoration:none;font-weight:bold;font-size:17px;border-radius:999px;padding:10px 8px;position:relative;line-height:1.2;}",
      ".event-ucar-cards .utc-detail-btn{flex:1.35;}.event-ucar-cards .utc-phone-btn{flex:1;background:#2077c8;}.event-ucar-cards .utc-detail-btn::after{content:'▶';position:absolute;right:10px;font-size:11px;top:50%;transform:translateY(-50%);}",
      ".event-ucar-cards .utc-soldout-img{position:absolute;z-index:5;width:58%;max-width:270px;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;}.event-ucar-cards .utc-card.soldout a{pointer-events:none;cursor:default;opacity:.65;}",
      "@media screen and (max-width:767px){.event-ucar-cards{display:block;}.event-ucar-cards .utc-card{width:100%;margin-bottom:12px;}.event-ucar-cards .utc-price-main{font-size:38px;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function imageSource(value, base) {
    if (!value) return "";
    if (/^data:|^https?:/.test(value)) return value;
    if (value.indexOf("images/") === 0) return base + value;
    return value;
  }

  function card(car, index, pageId, base) {
    var fee = null;
    if (car.priceTotal != null && car.priceVehicle != null) {
      fee = Math.round((Number(car.priceTotal) - Number(car.priceVehicle)) * 10) / 10;
      if (isNaN(fee) || fee < 0) fee = null;
    }
    var price = car.priceTotal == null ? "" : String(car.priceTotal);
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
    var priceSub = car.priceVehicle == null ? "" : '<span class="utc-price-sub">車両価格 ' + esc(car.priceVehicle) + "万円" + (fee != null ? "<br>諸費用 " + fee + "万円" : "") + "</span>";
    var sold = car.soldout ? '<img class="utc-soldout-img" src="' + esc(base + "assets/soldout.png") + '" alt="売約済">' : "";
    var phone = PHONE_BY_STORE[car.store] || "";
    var tag = pageId + "_" + ("0" + (index + 1)).slice(-2) + "_" + (car.name || "") + "_" + (car.store || "").replace(/店$/, "");
    var detailButton = '<a class="utc-btn utc-detail-btn clicktag" data-clicktag="' + esc(tag) + '" data-clicktagaction="gazooURL" href="' + esc(car.gazooUrl || "#") + '" target="_blank" rel="noopener">詳しくはこちら</a>';
    var phoneButton = phone ? '<a class="utc-btn utc-phone-btn" href="tel:' + esc(phone.replace(/[^0-9+]/g, "")) + '" aria-label="' + esc((car.store || "") + "へ電話で確認する") + '">☎ 確認する</a>' : "";
    return '<div class="utc-card' + (car.soldout ? " soldout" : "") + '"><div class="utc-card-main">'
      + '<div class="utc-head"><span class="utc-store"><small>トヨタ認定中古車</small>' + esc(car.store || "") + '</span><span class="utc-id">' + esc(car.id || "") + "</span></div>"
      + '<div class="utc-inner"><div class="utc-body"><div class="utc-photo"><div class="ph">' + image + "</div>" + (car.stock ? '<span class="utc-stock">' + esc(car.stock) + "</span>" : "") + "</div>"
      + '<div class="utc-info"><ul class="utc-badges">' + badges + '</ul><div class="utc-price"><span class="utc-price-label">支払総額</span><span class="utc-price-main">' + esc(priceParts[0] || "") + (priceParts[1] ? "<small>." + esc(priceParts[1]) + "</small>" : "") + '<span class="utc-unit">万円</span></span>' + priceSub + "</div></div></div>"
      + '<h3 class="utc-name">' + esc(car.name || "") + '</h3><p class="utc-specs">' + specText + '</p><div class="utc-btns">' + detailButton + phoneButton + "</div></div></div>" + sold + "</div>";
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

  function renderBox(box) {
    if (!box || box.getAttribute("data-ucar-loading") === "1") return;
    var base = box.getAttribute("data-ucar-base") || "https://raw.githubusercontent.com/shin-adsheet/fukuoka-toyopet-ucar/main/";
    var pageId = box.getAttribute("data-ucar-page") || "main";
    box.setAttribute("data-ucar-loading", "1");
    fetch(base + "data/cars.json?t=" + Date.now())
      .then(function (response) { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
      .then(function (data) {
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
