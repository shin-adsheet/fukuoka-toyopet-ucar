/**
 * 福岡トヨペット 中古車カード管理 - GAS Webアプリ サーバー
 *
 * Script Properties（プロジェクト設定 → スクリプト プロパティ）
 *   GH_TOKEN       : Fine-grained PAT（Contents: Read and write）
 *                    「今すぐGazoo更新」も使う場合は Actions: Read and write も付与
 *   EDITOR_KEY     : 管理画面へ入るための十分に長い編集用キー（20文字以上を推奨）
 *   GH_OWNER       : 省略時 shin-adsheet
 *   GH_REPO        : 省略時 fukuoka-toyopet-ucar
 *   GH_BRANCH      : 省略時 main
 *
 * Webアプリは「次のユーザーとして実行：自分」でデプロイしてください。
 * ブラウザへGH_TOKENを返す処理はありません。すべての操作でEDITOR_KEYを照合します。
 */

const APP = Object.freeze({
  defaultOwner: 'shin-adsheet',
  defaultRepo: 'fukuoka-toyopet-ucar',
  defaultBranch: 'main',
  dataPath: 'data/cars.json',
  workflowPath: 'update-gazoo.yml',
  draftMetaKey: 'UCAR_DRAFT_META',
  draftChunkPrefix: 'UCAR_DRAFT_',
  draftChunkSize: 7000,
  maxCars: 200,
  // 管理画面の店舗一覧・CMSの電話番号表と同じ並び。Excelの表記ゆれ検出にも使う。
  stores: ['福岡西店', '博多南店', '福岡インター店', '小倉東店', '八幡店', '飯塚店', '久留米インター店'],
});

/* ===== クリック数の記録 =====
 * CMSのカードが押されるたびにGASへ通知が届く。1件ずつGitHubへ書くと
 * コミットが増えすぎるため、いったんScript Propertiesへ日・ページ単位で
 * ためておき、公開のタイミングでまとめて data/clicks.json へ書き出す。
 * Googleの追加権限は使わない。
 */
const CLICK = Object.freeze({
  path: 'data/clicks.json',
  prefix: 'CLK_',
  sep: '__',
  maxKeysPerBucket: 400,
  kinds: { d: '詳しくはこちら', p: '電話で確認' },
});

function doPost(e) {
  // 公開ページからの計測なので編集用キーは求めない。失敗しても利用者へ影響を出さない。
  try { recordClick_(JSON.parse((e && e.postData && e.postData.contents) || '{}')); } catch (err) {}
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

// 公開中のページIDと車IDの一覧。誰でも送れる口なので、実在するものだけ数える。
// 毎回GitHubを見に行かなくて済むよう、しばらく手元に持っておく。
function validTargets_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('UCAR_TARGETS');
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { /* 壊れていたら取り直す */ }
  }
  const out = { pages: {}, uids: {} };
  try {
    const data = readPublished_();
    (data.pages || []).forEach(function (p) { if (p && p.id) out.pages[p.id] = 1; });
    (data.cars || []).forEach(function (c) { if (c && c.uid) out.uids[c.uid] = 1; });
    cache.put('UCAR_TARGETS', JSON.stringify(out), 21600);
  } catch (err) { /* 読めないときは記録を見送る */ }
  return out;
}

function recordClick_(body) {
  const page = String(body && body.p || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 40);
  const uid = String(body && body.u || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 60);
  const kind = CLICK.kinds[body && body.k] ? body.k : '';
  if (!page || !uid || !kind) return;

  // 実在しないページ・車の水増しを弾く。GitHubへの問い合わせはロックの外で済ませる。
  const valid = validTargets_();
  if (!valid.pages[page] || !valid.uids[uid]) return;

  const day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const key = CLICK.prefix + day + CLICK.sep + page;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const p = PropertiesService.getScriptProperties();
    let map = {};
    try { map = JSON.parse(p.getProperty(key) || '{}'); } catch (err) { map = {}; }
    const k = uid + '|' + kind;
    // 際限なく増えないよう、1日1ページあたりの種類数に上限を設ける
    if (map[k] == null && Object.keys(map).length >= CLICK.maxKeysPerBucket) return;
    map[k] = (map[k] || 0) + 1;
    p.setProperty(key, JSON.stringify(map));
  } finally {
    lock.releaseLock();
  }
}

// たまっている未書き出し分を { 日付: { ページ: { "uid|種類": 回数 } } } で返す
function pendingClicks_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const out = {};
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(CLICK.prefix) !== 0) return;
    const rest = key.slice(CLICK.prefix.length);
    const at = rest.indexOf(CLICK.sep);
    if (at < 0) return;
    const day = rest.slice(0, at), page = rest.slice(at + CLICK.sep.length);
    let map = {};
    try { map = JSON.parse(all[key] || '{}'); } catch (err) { return; }
    out[day] = out[day] || {};
    out[day][page] = map;
  });
  return out;
}

function readClicks_() {
  try {
    const cfg = getConfig_();
    const res = githubFetch_('/contents/' + CLICK.path + '?ref=' + encodeURIComponent(cfg.branch), 'get');
    if (res.getResponseCode() !== 200) return { version: 1, days: {} };
    const j = JSON.parse(res.getContentText());
    const json = Utilities.newBlob(Utilities.base64Decode(String(j.content || '').replace(/\s/g, ''))).getDataAsString('UTF-8');
    const data = JSON.parse(json);
    data.days = data.days && typeof data.days === 'object' ? data.days : {};
    return data;
  } catch (err) {
    return { version: 1, days: {} };
  }
}

function mergeClicks_(store, pending) {
  Object.keys(pending).forEach(function (day) {
    store.days[day] = store.days[day] || {};
    Object.keys(pending[day]).forEach(function (page) {
      store.days[day][page] = store.days[day][page] || {};
      const src = pending[day][page];
      Object.keys(src).forEach(function (k) {
        store.days[day][page][k] = (store.days[day][page][k] || 0) + src[k];
      });
    });
  });
  return store;
}

// たまった分をGitHubへ書き出して、書けたら手元を空にする
function flushClicks_() {
  const pending = pendingClicks_();
  const days = Object.keys(pending);
  if (!days.length) return false;
  const store = mergeClicks_(readClicks_(), pending);
  store.version = 1;
  store.updatedAt = new Date().toISOString();
  putJsonToGitHub_(CLICK.path, store, 'クリック数を記録');
  const p = PropertiesService.getScriptProperties();
  days.forEach(function (day) {
    Object.keys(pending[day]).forEach(function (page) {
      p.deleteProperty(CLICK.prefix + day + CLICK.sep + page);
    });
  });
  return true;
}

// 分析画面用。GitHubに保存済みの分と、まだ書き出していない分を合わせて返す
function getClickStats(auth) {
  requireEditor_(auth);
  const store = mergeClicks_(readClicks_(), pendingClicks_());
  return { ok: true, days: store.days || {}, updatedAt: store.updatedAt || null };
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('中古車カード管理 | 福岡トヨペット')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// クリック通知の宛先。Script Propertiesの WEBAPP_URL が優先。
function webAppUrl_() {
  const fixed = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL');
  if (fixed) return String(fixed).trim();
  try { return ScriptApp.getService().getUrl() || ''; } catch (err) { return ''; }
}

function getBootstrap(auth) {
  const editor = requireEditor_(auth);
  const cfg = getConfig_();
  let published = null;
  try { published = readPublished_(); } catch (err) { /* 初回GitHub投入前でも画面は開ける */ }
  let draft = readDraft_();
  if (!draft && published) {
    draft = writeDraft_(normalizeModel_(published), editor, null, true);
  }
  if (!draft) {
    draft = writeDraft_({ version: 2, cars: [], pages: [{ id: 'main', name: '中古車フェア', carUids: [] }] }, editor, null, true);
  }
  if (published) {
    const merged = mergeAutomatedFields_(draft.data, normalizeModel_(published));
    if (JSON.stringify(merged) !== JSON.stringify(draft.data)) {
      draft = writeDraft_(merged, editor, draft.revision, false);
    }
  }
  return {
    ok: true,
    editor: editor,
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    logUrl: webAppUrl_(),
    revision: draft.revision,
    updatedAt: draft.updatedAt,
    updatedBy: draft.updatedBy,
    data: draft.data,
  };
}

function saveDraft(auth, data, expectedRevision) {
  const editor = requireEditor_(auth);
  const model = normalizeModel_(data);
  validateModel_(model);
  return writeDraft_(model, editor, numberOrNull_(expectedRevision), false);
}

function publishCurrent(auth, expectedRevision) {
  const editor = requireEditor_(auth);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const draft = readDraftUnlocked_();
    if (!draft) throw new Error('下書きがありません。先に画面を再読み込みしてください。');
    assertRevision_(draft.revision, numberOrNull_(expectedRevision));

    let model = normalizeModel_(draft.data);
    try {
      const published = normalizeModel_(readPublished_());
      model = mergeAutomatedFields_(model, published);
    } catch (err) { /* 初回公開では既存データなしでもよい */ }

    validateModel_(model);
    model.updatedAt = new Date().toISOString();
    putJsonToGitHub_(APP.dataPath, model, '管理画面から掲載内容を公開');
    // たまったクリック数もこのタイミングでGitHubへ残す
    try { flushClicks_(); } catch (err) { /* 公開そのものは止めない */ }

    const saved = writeDraftUnlocked_(model, editor, draft.revision + 1);
    return {
      ok: true,
      revision: saved.revision,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
      data: saved.data,
    };
  } finally {
    lock.releaseLock();
  }
}

function pullPublished(auth) {
  const editor = requireEditor_(auth);
  const model = normalizeModel_(readPublished_());
  validateModel_(model);
  return writeDraft_(model, editor, null, true);
}

function uploadCarImage(auth, uid, dataUrl) {
  requireEditor_(auth);
  if (!uid || !/^car-[0-9A-Za-z_-]+$/.test(String(uid))) throw new Error('車両IDが不正です。');
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) throw new Error('対応していない画像形式です。');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('画像が大きすぎます（4MBまで）。');
  const ext = /png/i.test(m[1]) ? 'png' : (/webp/i.test(m[1]) ? 'webp' : 'jpg');
  const path = 'images/' + String(uid) + '.' + ext;
  putBase64ToGitHub_(path, m[2], '車両写真を更新: ' + uid);
  return { ok: true, path: path };
}

function runGazooNow(auth) {
  requireEditor_(auth);
  const cfg = getConfig_();
  const path = '/actions/workflows/' + encodeURIComponent(APP.workflowPath) + '/dispatches';
  const res = githubFetch_(path, 'post', { ref: cfg.branch });
  const code = res.getResponseCode();
  if (code !== 200 && code !== 204) {
    if (code === 403) throw new Error('GitHub Tokenに Actions: Read and write 権限が必要です。');
    throw githubError_(res, 'Gazoo更新を開始できませんでした');
  }
  return { ok: true, message: 'Gazoo自動更新を開始しました。通常1〜2分ほどかかります。' };
}

function getPublishedStatus(auth) {
  requireEditor_(auth);
  const data = normalizeModel_(readPublished_());
  return { ok: true, updatedAt: data.updatedAt || null, cars: data.cars.length, pages: data.pages.length };
}

/**
 * 自動モードでGazoo URLを入力した直後の初回取り込み。
 * 定期更新は従来どおりGitHub Actionsが担当する。この処理は画面への即時反映専用。
 */
function importGazooCar(auth, gazooUrl) {
  requireEditor_(auth);
  const url = String(gazooUrl || '').trim();
  if (!/^https:\/\/(?:www\.)?gazoo\.com\/(?:DealerU-Car|U-Car)\/detail(?:[/?]|$)/i.test(url)) {
    throw new Error('Gazooの車両詳細URLを入力してください。');
  }

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 fukuoka-toyopet-ucar-gas/1.2' },
  });
  const code = res.getResponseCode();
  const html = res.getContentText('UTF-8');
  if (code === 404 || code === 410 || /すでに売約済み|売約済みとなって|掲載を終了|ページが見つかりません|該当する車両がありません/.test(html)) {
    throw new Error('このクルマはGazooにまだ掲載されていないか、売約済みです。販売開始前のURLはこの画面になります。Excelから取り込んでおけば、掲載が始まった時点で自動更新へ切り替わります。');
  }
  if (code < 200 || code >= 300) throw new Error('Gazooを読み込めませんでした（HTTP ' + code + '）。');

  const car = parseGazooImport_(html, url);
  if (!car.name && car.priceTotal == null && !car.image) {
    throw new Error('Gazooから車両情報を読み取れませんでした。URLが車両詳細ページか確認してください。');
  }
  car.lastGazooCheck = new Date().toISOString();
  car.gazooStatus = 'ok';
  car.soldout = false;
  return { ok: true, car: car };
}

/**
 * 福岡トヨペットから支給される特選車Excelを読み取り、画面確認用データへ変換する。
 * Google Driveへ保存・変換しないため、Googleアカウント権限は不要。
 */
function previewExcelImport(auth, fileName, base64) {
  requireEditor_(auth);
  const name = String(fileName || '特選車データ.xlsx').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120);
  if (!/\.xlsx$/i.test(name)) throw new Error('Excelファイル（.xlsx）を選んでください。');
  const encoded = String(base64 || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  if (!encoded) throw new Error('Excelファイルを読み込めませんでした。');
  if (encoded.length > 6 * 1024 * 1024) throw new Error('Excelファイルが大きすぎます（約4MBまで）。');

  let files;
  try {
    const bytes = Utilities.base64Decode(encoded);
    const blobs = Utilities.unzip(Utilities.newBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name));
    files = {};
    blobs.forEach(function (blob) {
      const path = String(blob.getName() || '').replace(/\\/g, '/');
      if (path === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)) {
        files[path] = blob.getDataAsString('UTF-8');
      }
    });
  } catch (err) {
    throw new Error('Excelファイルを開けませんでした。壊れていない.xlsxファイルか確認してください。');
  }

  const shared = parseXlsxSharedStrings_(files['xl/sharedStrings.xml'] || '');
  const sheetPaths = Object.keys(files).filter(function (p) { return /^xl\/worksheets\/sheet\d+\.xml$/i.test(p); }).sort();
  for (let i = 0; i < sheetPaths.length; i++) {
    const parsed = parseSpecialCarsSheet_(files[sheetPaths[i]], shared, name);
    if (parsed && parsed.cars.length) return { ok: true, preview: parsed };
  }
  throw new Error('「車両NO」「車名」「GAZOOリンク先」がある特選車表を見つけられませんでした。');
}

function parseXlsxSharedStrings_(xml) {
  const out = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const parts = [];
    String(m[1]).replace(/<t\b[^>]*>([\s\S]*?)<\/t>/gi, function (_, text) {
      parts.push(xmlDecode_(text)); return _;
    });
    out.push(parts.join(''));
  }
  return out;
}

function parseXlsxRows_(xml, shared) {
  const rows = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(String(xml || '')))) {
    const rn = Number(((rowMatch[1].match(/\br="(\d+)"/i) || [])[1]) || rows.length + 1);
    const cells = {};
    const rowBody = rowMatch[2].replace(/<c\b[^>]*\/>/gi, '');
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowBody))) {
      const attrs = cellMatch[1], body = cellMatch[2];
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/i) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/\bt="([^"]+)"/i) || [])[1] || '';
      const raw = (body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i) || [])[1];
      let value = raw == null ? '' : xmlDecode_(raw);
      if (type === 's') value = shared[Number(value)] == null ? '' : shared[Number(value)];
      else if (type === 'inlineStr') {
        const parts = [];
        body.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/gi, function (_, text) { parts.push(xmlDecode_(text)); return _; });
        value = parts.join('');
      }
      cells[String(ref).toUpperCase()] = value;
    }
    rows.push({ number: rn, cells: cells });
  }
  return rows;
}

function parseSpecialCarsSheet_(xml, shared, fileName) {
  const rows = parseXlsxRows_(xml, shared);
  let headerIndex = -1, columns = null;
  for (let i = 0; i < rows.length; i++) {
    const map = {};
    Object.keys(rows[i].cells).forEach(function (col) { map[normalizeExcelHeader_(rows[i].cells[col])] = col; });
    const normalized = Object.keys(map).join('|');
    if (/車両NO/.test(normalized) && /車名/.test(normalized) && /GAZOOリンク先/.test(normalized)) {
      headerIndex = i;
      columns = map;
      break;
    }
  }
  if (headerIndex < 0) return null;

  function colBy(test) {
    const keys = Object.keys(columns);
    for (let i = 0; i < keys.length; i++) if (test(keys[i])) return columns[keys[i]];
    return '';
  }
  const col = {
    category: colBy(function (h) { return h === 'アウトレット' || h.indexOf('認定中古車') >= 0; }),
    hv: colBy(function (h) { return h === 'HV'; }),
    vehicleNo: colBy(function (h) { return h === '車両NO'; }),
    store: colBy(function (h) { return h.indexOf('店舗名') === 0; }),
    stock: colBy(function (h) { return h.indexOf('車台番号下3桁') >= 0; }),
    name: colBy(function (h) { return h === '車名'; }),
    color: colBy(function (h) { return h.indexOf('色') === 0; }),
    year: colBy(function (h) { return h.indexOf('年式') === 0; }),
    mission: colBy(function (h) { return h === 'ミッション'; }),
    km: colBy(function (h) { return h.indexOf('走行万キロ') >= 0; }),
    shaken: colBy(function (h) { return h.indexOf('車検満了月') >= 0 || h.indexOf('車検整備付') >= 0; }),
    recycle: colBy(function (h) { return h.indexOf('リ済込') >= 0; }),
    repair: colBy(function (h) { return h.indexOf('修復歴') === 0; }),
    comment: colBy(function (h) { return h.indexOf('コメント') === 0; }),
    vehiclePrice: colBy(function (h) { return h.indexOf('車両価格千円') >= 0; }),
    total: colBy(function (h) { return h.indexOf('支払総額') === 0; }),
    gazooUrl: colBy(function (h) { return h.indexOf('GAZOOリンク先') >= 0; }),
  };

  // 掲載ページ名はD2セルに入る決まり。空のときだけ、見出しより上の行から拾う。
  let pageName = '';
  const d2Row = rows.filter(function (r) { return r.number === 2; })[0];
  if (d2Row) pageName = cleanExcelText_(d2Row.cells['D']);
  if (!pageName) {
    for (let i = 0; i < headerIndex; i++) {
      const values = Object.keys(rows[i].cells).map(function (k) { return cleanExcelText_(rows[i].cells[k]); }).filter(Boolean);
      const special = values.filter(function (v) { return /特選車|商談会|フェア/.test(v); })[0];
      if (special) { pageName = special; break; }
      if (!pageName && values.length) pageName = values[0];
    }
  }
  if (!pageName) pageName = String(fileName || '特選車').replace(/\.xlsx$/i, '');

  const cars = [], warnings = [], seen = {}, storeWarned = {};
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const c = rows[i].cells;
    const id = excelId_(c[col.vehicleNo]);
    const url = cleanExcelText_(c[col.gazooUrl]);
    const name = formatExcelCarName_(c[col.name]);
    if (!id && !url && !name) continue;
    if (!id) { warnings.push((i + 1) + '行目：車両NOがないため除外'); continue; }
    if (seen[id]) { warnings.push((i + 1) + '行目：車両NO ' + id + ' が重複しているため後の行を除外'); continue; }
    seen[id] = true;

    const priceVehicle = excelPriceMan_(c[col.vehiclePrice]);
    const priceTotal = excelPriceMan_(c[col.total]);
    if (priceTotal != null && priceVehicle != null && priceTotal < priceVehicle) {
      warnings.push((i + 1) + '行目：支払総額が車両価格より小さいため価格を空欄にしました');
    }
    const badges = excelBadges_(c, col, name);
    const store = formatExcelStore_(c[col.store]);
    // 店舗名がずれると電話番号を引けず、編集画面の店舗選択にも出せない
    if (store && APP.stores.indexOf(store) < 0 && !storeWarned[store]) {
      storeWarned[store] = true;
      warnings.push('店舗名「' + store + '」は登録されている店舗と一致しません。取込後に店舗を選び直してください。');
    }
    cars.push({
      id: id,
      store: store,
      name: name,
      gazooUrl: url,
      stock: excelStock_(c[col.stock]),
      priceTotal: priceTotal != null && priceVehicle != null && priceTotal < priceVehicle ? null : priceTotal,
      priceVehicle: priceTotal != null && priceVehicle != null && priceTotal < priceVehicle ? null : priceVehicle,
      image: '',
      badges: badges,
      specs: {
        year: formatExcelYear_(c[col.year]),
        km: formatExcelKm_(c[col.km]),
        shaken: formatExcelShaken_(c[col.shaken]),
        fuel: formatExcelFuel_(c[col.hv], name),
        mission: cleanExcelText_(c[col.mission]).toUpperCase(),
        color: cleanExcelText_(c[col.color]),
      },
      comment: cleanExcelText_(c[col.comment]),
      soldout: false,
      // 販売開始前のGazooは「売約済み」画面になり取り込めない。
      // まずExcelの内容を手動管理で入れておき、掲載が始まったら自動更新へ切り替える。
      autoUpdate: false,
      autoImageUpdate: true,
      gazooPending: !!url,
      excelSource: String(fileName || ''),
    });
  }
  return { pageName: pageName, cars: cars, warnings: warnings, sourceFile: fileName };
}

function normalizeExcelHeader_(value) {
  return String(value == null ? '' : value).normalize('NFKC').replace(/[\s　\n\r・.／/_-]/g, '').toUpperCase();
}

function cleanExcelText_(value) {
  return String(value == null ? '' : value).normalize('NFKC').replace(/[\s　]+/g, ' ').trim();
}

function excelId_(value) {
  const s = cleanExcelText_(value).replace(/\.0$/, '').replace(/[^0-9]/g, '');
  return s ? s.slice(-7) : '';
}

function excelStock_(value) {
  const s = cleanExcelText_(value).replace(/\.0$/, '');
  if (!s) return '';
  return /^\d+$/.test(s) ? ('000' + s).slice(-3) : s.slice(0, 12);
}

function formatExcelStore_(value) {
  let s = cleanExcelText_(value).replace(/^トヨタ認定中古車\s*/, '').replace(/^福岡トヨペット\s*/, '');
  // Excelでは「久留米I」のように略される。表記がずれると電話番号を引けないため、
  // 管理画面の店舗一覧・CMSの電話番号表と同じ正式名へ揃える。
  s = s.replace(/[Ii](?:ンター)?(店)?$/, 'インター$1');
  if (s && !/店$/.test(s)) s += '店';
  return s;
}

function formatExcelCarName_(value) {
  // 「C-HRHEV」「アクアHEV」のようにくっついた表記を、車名とエンジン表記に分ける。
  // 「PHEV」を「P HEV」に割らないよう、直前がPのHEVだけは触らない。
  return cleanExcelText_(value)
    .replace(/([0-9A-Za-zァ-ヶ一-龠々ー])(PHEV|PHV|HEV)\b/g, function (whole, before, word) {
      if (word === 'HEV' && /[Pp]/.test(before)) return whole;
      return before + ' ' + word;
    })
    .replace(/\s+/g, ' ');
}

function formatExcelYear_(value) {
  const s = cleanExcelText_(value).toUpperCase();
  let m = s.match(/^R(\d{1,2})$/); if (m) return String(2018 + Number(m[1])) + '年式';
  m = s.match(/^H(\d{1,2})$/); if (m) return String(1988 + Number(m[1])) + '年式';
  m = s.match(/(19\d{2}|20\d{2})/); if (m) return m[1] + '年式';
  return s;
}

function formatExcelKm_(value) {
  const s = cleanExcelText_(value).replace(/,/g, '');
  const n = Number(s);
  if (!isFinite(n)) return s;
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '') + '万km';
}

function formatExcelShaken_(value) {
  const s = cleanExcelText_(value);
  if (!s) return '';
  if (/車検整備付/.test(s)) return '車検整備付';
  const serial = Number(s);
  if (isFinite(serial) && serial > 20000 && serial < 90000) {
    const d = new Date(Math.round((serial - 25569) * 86400000));
    return '車検 ' + d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月';
  }
  return /^車検/.test(s) ? s : '車検 ' + s;
}

function formatExcelFuel_(hv, name) {
  const text = (cleanExcelText_(hv) + ' ' + cleanExcelText_(name)).toUpperCase();
  if (/PHEV|PHV/.test(text)) return 'PHEV';
  if (/HEV|HYBRID|ハイブリッド/.test(text)) return 'ハイブリッド';
  return 'ガソリン';
}

function excelPriceMan_(value) {
  // 空欄は「未入力」。0扱いにすると支払総額が車両価格を下回った判定になり、価格が消える。
  const s = cleanExcelText_(value).replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return Math.round(n) / 10;
}

function excelBadges_(cells, col, name) {
  const out = [];
  if (/無|なし/.test(cleanExcelText_(cells[col.repair]))) out.push('修無');
  if (/○|済/.test(cleanExcelText_(cells[col.recycle]))) out.push('リ済込');
  if (/車検整備付/.test(cleanExcelText_(cells[col.shaken]))) out.push('車検整備付');
  if (/認定中古車/.test(cleanExcelText_(cells[col.category]))) out.push('ロングラン保証', 'あんしん診断');
  if (/HEV|ハイブリッド|PHEV|PHV/i.test(cleanExcelText_(cells[col.hv]) + ' ' + String(name || ''))) out.push('ハイブリッド保証');
  return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
}

function xmlDecode_(value) {
  return String(value == null ? '' : value)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
}

function parseGazooImport_(html, url) {
  const text = compactGazooText_(html);
  const prices = gazooPrices_(html);
  let name = gazooAttr_(html, 'data-productname');
  if (!name) name = gazooFirst_(html, [/<(?:h1|span)[^>]*class=["'][^"']*\bcar_name\b[^"']*["'][^>]*>([\s\S]{0,120}?)<\/(?:h1|span)>/i]);
  name = decodeGazoo_(String(name || '').replace(/<[^>]*>/g, ' ')).replace(/^トヨタ[\s　]*/, '');

  let store = gazooAttr_(html, 'data-shopnm') || gazooAttr_(html, 'data-dealershopnm');
  if (!store) store = gazooFirst_(text, [/福岡トヨペット\s*トヨタ認定中古車\s*([^ ]{2,30}店)/]);
  store = decodeGazoo_(store).replace(/^福岡トヨペット\s*/, '').replace(/^トヨタ認定中古車\s*/, '').trim();

  let fullId = gazooAttr_(html, 'data-productid');
  if (!fullId) fullId = gazooFirst_(url, [/[?&]Id=(\d{10,14})/i, /\/detail\/(\d{10,14})(?:\/|$)/i]);
  if (!fullId) fullId = gazooFirst_(html, [/\/U-Car\/carImg\/\d+\/(\d{6,12})\//i]);
  const id = fullId ? String(fullId).slice(-7) : '';

  return {
    name: name || '',
    store: store || '',
    id: id,
    priceTotal: prices.priceTotal,
    priceVehicle: prices.priceVehicle,
    image: gazooMainImage_(html) || '',
    gazooImageUrl: gazooMainImage_(html) || '',
    specs: gazooSpecs_(text),
    badges: gazooBadges_(text),
  };
}

function gazooPrices_(html) {
  function fromBlock(className) {
    const re = new RegExp('<div[^>]*class=["\'][^"\']*\\b' + className + '\\b[^"\']*["\'][^>]*>([\\s\\S]{0,600}?)<\\/div>', 'i');
    const block = (html.match(re) || [])[1];
    if (!block) return null;
    const plain = compactGazooText_(block).replace(/(\d)\s+(?=[.\d])/g, '$1');
    const raw = (plain.match(/([\d,]+(?:\.\d+)?)\s*万円/) || [])[1];
    if (!raw) return null;
    const n = Number(raw.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  // 価格ブロックが見つからないページ向けに、ラベル近接でも探す（Node側 pickPrices と同じ）
  function nearLabel(label) {
    const text = compactGazooText_(html);
    const m = text.match(new RegExp(label + '[\\s\\S]{0,300}?([\\d,]+(?:\\.\\d+)?)\\s*万円'));
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  let total = fromBlock('sum-price');
  if (total == null) total = nearLabel('支払総額');
  let vehicle = fromBlock('base-price');
  if (vehicle == null) vehicle = nearLabel('車両価格');
  if (total != null && vehicle != null && total < vehicle) return { priceTotal: null, priceVehicle: null };
  return { priceTotal: total, priceVehicle: vehicle };
}

function gazooMainImage_(html) {
  const patterns = [
    /(?:https?:\/\/gazoo\.com)?\/U-Car\/carImg\/[^"'<>\s?]+?_L\.jpe?g(?:\?[^"'<>\s]*)?/i,
    /(?:https?:\/\/gazoo\.com)?\/U-Car\/carImg\/[^"'<>\s?]+?_M\.jpe?g(?:\?[^"'<>\s]*)?/i,
    /(?:https?:\/\/gazoo\.com)?\/U-Car\/carImg\/[^"'<>\s?]+?_S\.jpe?g(?:\?[^"'<>\s]*)?/i,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = html.match(patterns[i]);
    if (!m) continue;
    const found = m[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');
    return /^https?:/i.test(found) ? found : 'https://gazoo.com' + found;
  }
  return null;
}

function compactGazooText_(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .trim();
}

function decodeGazoo_(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function gazooAttr_(html, name) {
  const m = String(html || '').match(new RegExp(name + '=["\']([^"\']*)["\']', 'i'));
  return m ? decodeGazoo_(m[1]) : '';
}

function gazooFirst_(text, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    const m = String(text || '').match(patterns[i]);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function gazooKm_(raw) {
  const n = Number(String(raw || '').replace(/,/g, ''));
  if (!isFinite(n)) return '';
  if (n < 10000) return String(n) + 'km';
  const man = Math.round((n / 10000) * 10) / 10;
  return String(man).replace(/\.0$/, '') + '万km';
}

function gazooSpecs_(text) {
  const year = gazooFirst_(text, [/年式\s*[:：]?\s*(\d{4})年(?:\([^)]*\))?/, /初度登録(?:年月)?\s*[:：]?\s*(\d{4})年/]);
  const km = gazooFirst_(text, [/走行距離\s*[:：]?\s*([\d,]+)\s*km/i, /走行\s*[:：]?\s*([\d,]+)\s*km/i]);
  const shaken = gazooFirst_(text, [/車検(?:有効期限)?\s*[:：]?\s*(\d{4}年\s*\d{1,2}月)/, /車検\s*[:：]?\s*(車検整備付)/]);
  const fuel = gazooFirst_(text, [/エンジン(?:タイプ|種別)?\s*[:：]?\s*(ハイブリッド|ガソリン|ディーゼル|電気|EV|PHEV|PHV)/i, /燃料(?:種類)?\s*[:：]?\s*(ハイブリッド|ガソリン|ディーゼル|電気|EV|PHEV|PHV)/i]);
  const mission = gazooFirst_(text, [/ミッション\s*[:：]?\s*(CVT|AT|MT|[0-9]+AT|[0-9]+MT)/i, /トランスミッション\s*[:：]?\s*(CVT|AT|MT|[0-9]+AT|[0-9]+MT)/i]);
  const color = gazooFirst_(text, [/(?:ボディ)?カラー\s*[:：]?\s*([^ ]{2,40})/, /色\s*[:：]?\s*([^ ]{2,40})/]);
  return {
    year: year ? year + '年式' : '',
    km: km ? gazooKm_(km) : '',
    shaken: shaken ? (shaken === '車検整備付' ? shaken : '車検 ' + shaken.replace(/\s+/g, '')) : '',
    fuel: fuel ? fuel.toUpperCase() : '',
    mission: mission ? mission.toUpperCase() : '',
    color: color || '',
  };
}

function gazooBadges_(text) {
  const out = [];
  if (/修復歴\s*[:：]?\s*なし/.test(text)) out.push('修無');
  if (/定期点検整備付|法定整備\s*[:：]?\s*付/.test(text)) out.push('整付');
  if (/リサイクル[\s\S]{0,80}(?:預託済|料金預託済)/.test(text)) out.push('リ済込');
  if (/車検整備付/.test(text)) out.push('車検整備付');
  if (/ロングラン保証/.test(text)) out.push('ロングラン保証');
  if (/ハイブリッド保証/.test(text)) out.push('ハイブリッド保証');
  if (/あんしん診断/.test(text)) out.push('あんしん診断');
  return out;
}

function getConfig_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('GH_TOKEN');
  if (!token) throw new Error('初期設定が未完了です。Script Properties に GH_TOKEN を登録してください。');
  return {
    owner: p.getProperty('GH_OWNER') || APP.defaultOwner,
    repo: p.getProperty('GH_REPO') || APP.defaultRepo,
    branch: p.getProperty('GH_BRANCH') || APP.defaultBranch,
    token: token,
  };
}

function requireEditor_(auth) {
  const p = PropertiesService.getScriptProperties();
  const expected = String(p.getProperty('EDITOR_KEY') || '');
  if (expected.length < 16) throw new Error('初期設定が未完了です。Script Properties に16文字以上の EDITOR_KEY を登録してください。');
  const received = String(auth && auth.key || '');
  if (!secureEqual_(expected, received)) throw new Error('ACCESS_DENIED: 編集用キーが違います。');
  const name = String(auth && auth.name || '担当者').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 40);
  return name || '担当者';
}

function secureEqual_(a, b) {
  const x = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(a), Utilities.Charset.UTF_8);
  const y = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(b), Utilities.Charset.UTF_8);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function readPublished_() {
  const cfg = getConfig_();
  const path = '/contents/' + APP.dataPath + '?ref=' + encodeURIComponent(cfg.branch);
  const res = githubFetch_(path, 'get');
  if (res.getResponseCode() !== 200) throw githubError_(res, '公開データを読み込めませんでした');
  const j = JSON.parse(res.getContentText());
  const json = Utilities.newBlob(Utilities.base64Decode(String(j.content || '').replace(/\s/g, ''))).getDataAsString('UTF-8');
  return JSON.parse(json);
}

function putJsonToGitHub_(path, obj, message) {
  const json = JSON.stringify(obj, null, 2);
  const b64 = Utilities.base64Encode(json, Utilities.Charset.UTF_8);
  return putBase64ToGitHub_(path, b64, message);
}

function putBase64ToGitHub_(path, base64, message) {
  const cfg = getConfig_();
  const getRes = githubFetch_('/contents/' + path + '?ref=' + encodeURIComponent(cfg.branch), 'get');
  let sha = null;
  if (getRes.getResponseCode() === 200) sha = JSON.parse(getRes.getContentText()).sha;
  else if (getRes.getResponseCode() !== 404) throw githubError_(getRes, 'GitHubのファイル確認に失敗しました');
  const payload = { message: message, content: base64, branch: cfg.branch };
  if (sha) payload.sha = sha;
  const putRes = githubFetch_('/contents/' + path, 'put', payload);
  if (putRes.getResponseCode() !== 200 && putRes.getResponseCode() !== 201) throw githubError_(putRes, 'GitHubへの保存に失敗しました');
  return JSON.parse(putRes.getContentText());
}

function githubFetch_(path, method, payload) {
  const cfg = getConfig_();
  const url = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + path;
  const opt = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'fukuoka-toyopet-ucar-gas',
    },
  };
  if (payload != null) {
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  return UrlFetchApp.fetch(url, opt);
}

function githubError_(res, prefix) {
  let message = '';
  try { message = JSON.parse(res.getContentText()).message || ''; } catch (err) { message = res.getContentText(); }
  return new Error(prefix + '（HTTP ' + res.getResponseCode() + (message ? '：' + message : '') + '）');
}

function readDraft_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return readDraftUnlocked_(); }
  finally { lock.releaseLock(); }
}

function readDraftUnlocked_() {
  const p = PropertiesService.getScriptProperties();
  const metaRaw = p.getProperty(APP.draftMetaKey);
  if (!metaRaw) return null;
  const meta = JSON.parse(metaRaw);
  const parts = [];
  for (let i = 0; i < Number(meta.chunks || 0); i++) {
    const chunk = p.getProperty(APP.draftChunkPrefix + pad3_(i));
    if (chunk == null) return null;
    parts.push(chunk);
  }
  const bytes = Utilities.base64DecodeWebSafe(parts.join(''));
  const data = JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
  return {
    data: normalizeModel_(data),
    revision: Number(meta.revision || 0),
    updatedAt: meta.updatedAt || null,
    updatedBy: meta.updatedBy || '',
  };
}

function writeDraft_(data, email, expectedRevision, force) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const old = readDraftUnlocked_();
    if (!force && old) assertRevision_(old.revision, expectedRevision);
    const next = old ? old.revision + 1 : 1;
    return writeDraftUnlocked_(data, email, next);
  } finally {
    lock.releaseLock();
  }
}

function writeDraftUnlocked_(data, email, revision) {
  const p = PropertiesService.getScriptProperties();
  const json = JSON.stringify(normalizeModel_(data));
  const encoded = Utilities.base64EncodeWebSafe(json, Utilities.Charset.UTF_8);
  const chunks = [];
  for (let i = 0; i < encoded.length; i += APP.draftChunkSize) chunks.push(encoded.slice(i, i + APP.draftChunkSize));

  const oldMetaRaw = p.getProperty(APP.draftMetaKey);
  let oldChunks = 0;
  if (oldMetaRaw) { try { oldChunks = Number(JSON.parse(oldMetaRaw).chunks || 0); } catch (err) {} }
  const props = {};
  chunks.forEach(function (chunk, i) { props[APP.draftChunkPrefix + pad3_(i)] = chunk; });
  const now = new Date().toISOString();
  props[APP.draftMetaKey] = JSON.stringify({ revision: revision, chunks: chunks.length, updatedAt: now, updatedBy: email });
  p.setProperties(props, false);
  for (let i = chunks.length; i < oldChunks; i++) p.deleteProperty(APP.draftChunkPrefix + pad3_(i));
  return { ok: true, data: normalizeModel_(data), revision: revision, updatedAt: now, updatedBy: email };
}

function assertRevision_(current, expected) {
  if (expected == null) return;
  if (Number(current) !== Number(expected)) {
    throw new Error('CONFLICT: 別の担当者が先に更新しました。最新データを読み込み直してください。');
  }
}

function mergeAutomatedFields_(draft, published) {
  const out = JSON.parse(JSON.stringify(normalizeModel_(draft)));
  const byUid = {};
  published.cars.forEach(function (c) { if (c.uid) byUid[c.uid] = c; });
  const fields = ['name', 'store', 'id', 'priceTotal', 'priceVehicle', 'image', 'gazooImageUrl', 'soldout', 'soldoutAt', 'lastGazooCheck', 'gazooStatus', 'specs', 'badges'];
  // 掲載開始日は分析に使う。先に記録された方を正とし、上書きしない。
  out.cars.forEach(function (c) {
    // URL直入力やExcel取込の直後は、画面で取得した新しい値を優先する。
    // Actionsの確認時刻が取込時刻を越えたら、通常の自動同期へ戻す。
    // 掲載待ちの車は手動管理だが、掲載開始をActionsが検知するので同期対象に含める。
    const waitingForListing = c.autoUpdate === false && c.gazooPending === true;
    if ((c.autoUpdate === false && !waitingForListing) || !c.uid || !byUid[c.uid]) return;
    const src = byUid[c.uid];
    const pendingAt = Date.parse(String(c.syncPendingAt || ''));
    const checkedAt = Date.parse(String(src.lastGazooCheck || ''));
    if (c.syncPending === true && !isFinite(pendingAt)) return;
    if (isFinite(pendingAt) && (!isFinite(checkedAt) || checkedAt <= pendingAt)) return;
    delete c.syncPending;
    delete c.syncPendingAt;
    // 掲載が始まってActions側が自動更新へ切り替えていたら、この画面にも反映する
    if (waitingForListing && src.autoUpdate === true) {
      c.autoUpdate = true;
      delete c.gazooPending;
    }
    fields.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(src, k)) c[k] = src[k]; });
    if (!c.listedAt && src.listedAt) c.listedAt = src.listedAt;
  });
  return out;
}

function normalizeModel_(input) {
  const d = input && typeof input === 'object' ? JSON.parse(JSON.stringify(input)) : {};
  d.version = 2;
  d.cars = Array.isArray(d.cars) ? d.cars : [];
  const used = {};
  d.cars.forEach(function (c, i) {
    if (!c.uid) c.uid = 'car-' + String(c.id || (Date.now() + '-' + i)).replace(/[^0-9A-Za-z_-]/g, '');
    let uid = String(c.uid).replace(/[^0-9A-Za-z_-]/g, '-');
    if (uid.indexOf('car-') !== 0) uid = 'car-' + uid;
    while (used[uid]) uid += '-' + (i + 1);
    c.uid = uid; used[uid] = true;
    if (c.autoUpdate == null) c.autoUpdate = true;
    if (c.autoImageUpdate == null) c.autoImageUpdate = true;
    // 売約解除後に再確認用の記録が残らないようにする
    if (c.soldout !== true) delete c.soldoutAt;
    // 自動更新に切り替わった車に「掲載待ち」の印を残さない
    if (c.autoUpdate === true) delete c.gazooPending;
  });
  const valid = {};
  d.cars.forEach(function (c) { valid[c.uid] = true; });
  d.pages = Array.isArray(d.pages) && d.pages.length ? d.pages : [{ id: 'main', name: '中古車フェア', carUids: d.cars.map(function (c) { return c.uid; }) }];
  const pageIds = {};
  d.pages = d.pages.map(function (p, i) {
    let id = String(p.id || ('page-' + (i + 1))).replace(/[^0-9A-Za-z_-]/g, '-');
    if (!id) id = 'page-' + (i + 1);
    while (pageIds[id]) id += '-' + (i + 1);
    pageIds[id] = true;
    const seen = {};
    const uids = (Array.isArray(p.carUids) ? p.carUids : []).filter(function (uid) {
      if (!valid[uid] || seen[uid]) return false;
      seen[uid] = true; return true;
    });
    return { id: id, name: String(p.name || ('ページ' + (i + 1))), carUids: uids };
  });
  return d;
}

function validateModel_(d) {
  if (!d || !Array.isArray(d.cars) || !Array.isArray(d.pages) || !d.pages.length) throw new Error('データ形式が不正です。');
  if (d.cars.length > APP.maxCars) throw new Error('登録台数が上限を超えています。');
  const ids = {};
  d.pages.forEach(function (p) {
    if (!p.id || ids[p.id]) throw new Error('ページIDが重複しています。');
    ids[p.id] = true;
  });
}

function numberOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function pad3_(n) { return ('000' + n).slice(-3); }
