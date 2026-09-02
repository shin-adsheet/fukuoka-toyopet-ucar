(function () {
  "use strict";
  // ------------------------------------------------------------------
  // このファイルは「読み込み役」だけを担当します。中身は変えません。
  //
  // CDN（jsDelivr）は、ブラウザに対して最大7日間キャッシュするよう指示します。
  // そのため本体をこのファイルに直接書いていると、GitHubを更新しても
  // 一度見たことのある人には最大7日間ずっと古いカードが表示されていました。
  // 本体を ucar-cards.core.js に分け、1時間ごとに変わるURLで読み込むことで、
  // CMSの貼り付けコードを貼り替えなくても最大1時間で最新版に入れ替わります。
  // ------------------------------------------------------------------
  var FALLBACK = "https://cdn.jsdelivr.net/gh/shin-adsheet/fukuoka-toyopet-ucar@main/assets/";

  // すでに本体が読み込まれていれば、描き直すだけでよい
  if (window.FukuokaToyopetUcarRenderAll) {
    window.FukuokaToyopetUcarRenderAll();
    return;
  }
  if (window.FukuokaToyopetUcarLoading) return;
  window.FukuokaToyopetUcarLoading = 1;

  // 自分自身のURLから assets/ の場所を割り出す（?v=... が付いていても切り落とす）
  var here = (document.currentScript && document.currentScript.src) || "";
  var base = here ? here.replace(/[^/]*$/, "") : FALLBACK;

  // 1時間ごとに変わる文字列。ブラウザのキャッシュはURL単位なので、
  // これが変わると必ず取り直してくれる。
  var d = new Date();
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var bucket = "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours());

  var script = document.createElement("script");
  script.src = base + "ucar-cards.core.js?t=" + bucket;
  script.async = false;
  script.onerror = function () {
    window.FukuokaToyopetUcarLoading = 0;
    // 読み込めなかったときに「読み込み中…」が残り続けないようにする
    Array.prototype.forEach.call(document.querySelectorAll(".event-ucar-cards[data-ucar-page]"), function (box) {
      if (box.getAttribute("data-ucar-ready") !== "1") box.textContent = "";
    });
  };
  (document.head || document.documentElement).appendChild(script);
})();
