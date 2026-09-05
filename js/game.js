/* game.js —— 界面与控制：渲染牌面/卡槽、动画、道具、菜单与结果浮层 */
(function () {
  'use strict';

  /* ---------- 常量与工具 ---------- */
  var ORDER = ['easy', 'normal', 'hard'];
  var DIFF_LABEL = { easy: '简单', normal: '普通', hard: '困难' };
  var TOOL_NAMES = { undo: '撤销', shuffle: '洗牌', hint: '提示', restart: '重开' };
  var TOOL_ICONS = { undo: 'undo', shuffle: 'shuffle', hint: 'hint', restart: 'restart' };

  /*
   * 照片图鉴数据源：所有倒计时弹窗照片都在这里统一维护。
   * id 用于图鉴解锁去重；name 只做展示，不影响任何游戏逻辑。
   */
  var PHOTOS = [
    { id: 'photo-01', url: 'assets/reward-images/reward-01.jpg', name: '暗夜戏偶' },
    { id: 'photo-02', url: 'assets/reward-images/reward-02.jpg', name: '废墟探险' },
    { id: 'photo-03', url: 'assets/reward-images/reward-03.jpg', name: '昆虫秘藏' },
    { id: 'photo-04', url: 'assets/reward-images/reward-04.jpg', name: '马戏绅士' },
    { id: 'photo-05', url: 'assets/reward-images/reward-05.jpg', name: '标本猎人' },
    { id: 'photo-06', url: 'assets/reward-images/reward-06.jpg', name: '魔法书房' },
    { id: 'photo-07', url: 'assets/reward-images/reward-07.jpg', name: '假面舞者' },
    { id: 'photo-08', url: 'assets/reward-images/reward-08.jpg', name: '夜幕斗篷' },
    { id: 'photo-09', url: 'assets/reward-images/reward-09.jpg', name: '哥特法师' },
    { id: 'photo-10', url: 'assets/reward-images/reward-10.jpg', name: '操场日常' },
    { id: 'photo-11', url: 'assets/reward-images/reward-11.jpg', name: '魔法导师' },
    { id: 'photo-12', url: 'assets/reward-images/reward-12.jpg', name: '民国讲席' },
    { id: 'photo-13', url: 'assets/reward-images/reward-13.jpg', name: '赛博行者' },
    { id: 'photo-14', url: 'assets/reward-images/reward-14.jpg', name: '花园同行' },
    { id: 'photo-15', url: 'assets/reward-images/reward-15.jpg', name: '洛丽塔花园' },
    { id: 'photo-16', url: 'assets/reward-images/reward-16.jpg', name: '校长肖像' },
    { id: 'photo-17', url: 'assets/reward-images/reward-17.jpg', name: '操场晨会' }
  ];
  var REWARD_CACHE_VERSION = '20260905f'; // 稳定版本号：图鉴名称与样式更新
  var rewardEntries = [];      // 预加载状态 + 可复用 <img> 对象
  var lastRewardIndex = -1;    // 上一次展示编号，避免连续重复
  var rewardPreload = { total: 0, loaded: 0, failed: 0 };
  var galleryPhotoObserver = null; // 图鉴滚动懒挂载；关闭弹窗时释放

  /* 预加载节流参数：每批最多 2 张，批间休息 100ms，单张最多等 7 秒 */
  var REWARD_PRELOAD_BATCH_SIZE = 2;
  var REWARD_PRELOAD_INTERVAL = 100;
  var REWARD_LOAD_TIMEOUT = 7000;

  function versionedRewardUrl(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + REWARD_CACHE_VERSION;
  }

  function showRewardImage(entry) {
    var stage = $('rewardStage');
    if (!stage || !entry.image) return;
    stage.replaceChildren(entry.image);
  }

  function showRewardLoading() {
    var stage = $('rewardStage');
    if (stage) stage.innerHTML = '<div class="reward-loading">图片加载中...</div>';
  }

  function showRewardFallback() {
    var stage = $('rewardStage');
    if (stage) {
      stage.innerHTML =
        '<div class="reward-fallback"><b>图片暂时无法加载</b><span>倒计时和领取道具不受影响</span></div>';
    }
  }

  function clearRewardTimeout(entry) {
    if (entry.timeoutTimer) {
      clearTimeout(entry.timeoutTimer);
      entry.timeoutTimer = null;
    }
  }

  /* 每个 entry 只允许从 pending 进入 loaded/failed 一次，防止超时和 error 双计数 */
  function settleRewardEntry(entry, state) {
    if (!entry || entry.state !== 'pending') return false;
    entry.state = state;
    clearRewardTimeout(entry);
    if (state === 'loaded') rewardPreload.loaded++;
    else rewardPreload.failed++;

    var callback = entry.settledCallback;
    entry.settledCallback = null;
    if (callback) setTimeout(callback, 0); // 本批结束后再排队下一批
    return true;
  }

  function handleRewardLoad(entry) {
    if (!settleRewardEntry(entry, 'loaded')) return;
    console.log('[RewardImages] 进度：' + rewardPreload.loaded + '/' + rewardPreload.total +
      (rewardPreload.failed ? '，失败 ' + rewardPreload.failed : ''));
    if (rewardPreload.loaded + rewardPreload.failed === rewardPreload.total) {
      console.log('[RewardImages] 预加载完成：成功 ' + rewardPreload.loaded +
        '，失败 ' + rewardPreload.failed);
    }
    /* 若玩家在预热完成前就打开了弹窗，图片到点后自动替换文字占位 */
    if (claimState && claimState.reward === entry && !claimState.done) showRewardImage(entry);
    var previewStage = $('albumPreviewStage');
    if (previewStage) previewStage.replaceChildren(entry.image);
    refreshGalleryPhotos(entry); // 图鉴若已打开，直接复用同一个解码完成的 Image
  }

  function handleRewardError(entry) {
    if (!settleRewardEntry(entry, 'failed')) return;
    console.warn('[RewardImages] 加载失败或超时：' + entry.url);
    /* 当前弹窗正在等这张图时才重试；最多自动换图 2 次 */
    if (claimState && claimState.reward === entry && !claimState.done) selectRewardCandidate(entry);
  }

  function createRewardImage(entry) {
    /* 每张奖励图只创建一次 Image；弹窗反复打开时直接复用同一个 DOM 对象 */
    var img = new Image(800, 600);
    img.className = 'reward-image';
    img.decoding = 'async';
    img.loading = 'eager';
    img.alt = (PHOTOS[entry.id] || {}).name || '道具奖励照片';
    img.dataset.rewardId = String(entry.photoId || entry.id);
    img.addEventListener('load', function () { handleRewardLoad(entry); });
    img.addEventListener('error', function () { handleRewardError(entry); });
    entry.image = img;
    return img;
  }

  /* 发起唯一一次网络请求；后续弹窗、图鉴、预览全部复用 entry.image */
  function beginRewardImage(entry, onSettled) {
    if (entry.image) {
      if (entry.state === 'pending') entry.settledCallback = onSettled;
      else setTimeout(onSettled, 0);
      return;
    }

    createRewardImage(entry);
    entry.settledCallback = onSettled;
    entry.timeoutTimer = setTimeout(function () {
      handleRewardError(entry);
    }, REWARD_LOAD_TIMEOUT);
    entry.image.src = entry.url;
  }

  /* 页面初始化时静默预热：不在界面显示进度，也不阻塞首屏渲染 */
  function preloadRewardImages() {
    if (rewardEntries.length) return;
    rewardEntries = PHOTOS.map(function (photo, index) {
      return { id: index, photoId: photo.id, url: versionedRewardUrl(photo.url), state: 'pending', image: null };
    });
    rewardPreload = { total: rewardEntries.length, loaded: 0, failed: 0 };
    console.log('[RewardImages] 预加载开始：' + rewardPreload.total + ' 张');

    var cursor = 0;
    function loadNextBatch() {
      if (cursor >= rewardEntries.length) {
        console.log('[RewardImages] 预加载完成：成功 ' + rewardPreload.loaded +
          '，失败 ' + rewardPreload.failed);
        return;
      }

      var batch = rewardEntries.slice(cursor, cursor + REWARD_PRELOAD_BATCH_SIZE);
      cursor += batch.length;
      var remaining = batch.length;
      var releaseBatchSlot = function () {
        remaining--;
        if (remaining === 0) setTimeout(loadNextBatch, REWARD_PRELOAD_INTERVAL);
      };

      /* 一批固定最多两张；等这两张成功/失败/超时后，才隔 100ms 发下一批 */
      batch.forEach(function (entry) { beginRewardImage(entry, releaseBatchSlot); });
    }

    setTimeout(loadNextBatch, 60);
  }

  function pickRewardEntry(list) {
    if (!list.length) return null;
    var choices = list.filter(function (entry) { return entry.id !== lastRewardIndex; });
    if (!choices.length) choices = list;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  /* 优先选已加载完成的图；没有则允许用还在加载的图，图片到点后自动替换占位 */
  function selectRewardCandidate(failedEntry) {
    if (!claimState || claimState.done) return;
    if (failedEntry && claimState.reward !== failedEntry) return;

    if (failedEntry) {
      claimState.fallbackTries++;
      console.warn('[RewardImages] 自动换图第 ' + claimState.fallbackTries + ' 次');
      if (claimState.fallbackTries > 2) {
        showRewardFallback();
        return;
      }
    }

    var loaded = rewardEntries.filter(function (entry) { return entry.state === 'loaded'; });
    var pending = rewardEntries.filter(function (entry) { return entry.state === 'pending' && entry.image; });
    var selected = pickRewardEntry(loaded) || pickRewardEntry(pending);
    if (!selected) {
      showRewardFallback();
      return;
    }

    claimState.reward = selected;
    lastRewardIndex = selected.id;
    if (selected.state === 'loaded') showRewardImage(selected);
    else showRewardLoading();
  }

  function $(id) { return document.getElementById(id); }

  /* 生成内联 SVG 图标，替代 emoji，让界面更接近 iOS 扁平风格 */
  function icon(name, className) {
    return '<svg class="ico ' + (className || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function bestKey(k) { return 'yang-best-' + k; }
  function loadBest(k) { try { return parseInt(localStorage.getItem(bestKey(k)), 10) || 0; } catch (e) { return 0; } }
  function saveBest(k, v) { try { localStorage.setItem(bestKey(k), String(v)); } catch (e) { /* noop */ } }

  /* ---------- 照片图鉴：本地进度持久化 ---------- */
  var UNLOCKED_PHOTOS_KEY = 'sheep_game_unlocked_photos';
  var unlockedPhotos = loadUnlockedPhotos(); // 游戏初始化时立即读取，刷新后进度不丢

  function loadUnlockedPhotos() {
    var validIds = {};
    PHOTOS.forEach(function (photo) { validIds[photo.id] = true; });
    try {
      var saved = JSON.parse(localStorage.getItem(UNLOCKED_PHOTOS_KEY) || '[]');
      var result = new Set();
      /* 只接受当前 PHOTOS 里真实存在的 id，旧版本/脏数据不会影响图鉴数量 */
      if (Array.isArray(saved)) {
        saved.forEach(function (id) { if (typeof id === 'string' && validIds[id]) result.add(id); });
      }
      return result;
    } catch (e) {
      return new Set();
    }
  }

  function saveUnlockedPhotos() {
    try {
      localStorage.setItem(UNLOCKED_PHOTOS_KEY, JSON.stringify(Array.from(unlockedPhotos)));
    } catch (e) { /* 隐身模式或存储已满时，游戏本体仍可继续玩 */ }
  }

  function updateAlbumBadge() {
    var badge = $('albumBadge');
    if (!badge) return;
    badge.textContent = unlockedPhotos.size + '/' + PHOTOS.length;
    badge.classList.toggle('complete', unlockedPhotos.size === PHOTOS.length);
  }

  /* 只有倒计时完整结束并成功发放道具后才会调用这里 */
  function unlockPhoto(photoId) {
    if (!photoId || unlockedPhotos.has(photoId)) return;
    unlockedPhotos.add(photoId);
    saveUnlockedPhotos();
    updateAlbumBadge();

    /* 解锁瞬间点亮入口角标；玩家打开图鉴后红点消失 */
    var badge = $('albumBadge');
    if (badge) {
      badge.classList.remove('just-unlocked');
      badge.classList.add('new-unlock');
      setTimeout(function () { badge.classList.remove('just-unlocked'); }, 720);
    }
  }

  var S = null;            // 当前对局状态（来自 CORE）
  var toastTimer = null;
  var claimState = null;   // 当前道具领取弹窗（含倒计时句柄）

  /* ---------- 布局与渲染 ---------- */
  function buildBoard() {
    var board = $('board');
    board.innerHTML = '';
    var facesById = S.facesById;

    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0; i < S.tiles.length; i++) {
      var t = S.tiles[i];
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    var pad = 40;
    var LW = (maxX - minX) + CORE.GEOM.TW + pad * 2;
    var LH = (maxY - minY) + CORE.GEOM.TH + pad * 2;
    var OX = minX - pad - CORE.GEOM.TW / 2;
    var OY = minY - pad - CORE.GEOM.TH / 2;
    S.boardW = LW; S.boardH = LH;

    var wrap = $('boardWrap');
    wrap.style.width = LW + 'px';
    wrap.style.height = LH + 'px';
    board.style.width = LW + 'px';
    board.style.height = LH + 'px';

    for (i = 0; i < S.tiles.length; i++) {
      var tile = S.tiles[i];
      var el = document.createElement('div');
      el.className = 'tile';
      el.dataset.id = String(tile.id);
      el.style.left = Math.round(tile.x - OX) + 'px';
      el.style.top = Math.round(tile.y - OY) + 'px';
      el.style.zIndex = String(10 + tile.layer * 10);
      el.style.setProperty('--rot', tile.rot + 'deg');
      var face = facesById[tile.face];
      el.style.backgroundImage = "url('" + face.url + "')";
      el.title = face.name;
      board.appendChild(el);
      tile.el = el;
    }
    fit();
  }

  function renderTiles() {
    for (var i = 0; i < S.tiles.length; i++) {
      var t = S.tiles[i];
      var el = t.el;
      if (!el) continue;
      var cls = 'tile';
      if (t.removed) cls += ' gone';
      else if (CORE.isCovered(S, t)) cls += ' covered';
      el.className = cls;
    }
  }

  function renderTray() {
    var tray = $('tray');
    tray.innerHTML = '';
    var size = CORE.TRAY_SIZE;
    for (var i = 0; i < size; i++) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      if (i < S.tray.length) {
        var tile = CORE.tileById(S, S.tray[i]);
        var face = S.facesById[tile.face];
        slot.classList.add('has');
        slot.style.backgroundImage = "url('" + face.url + "')";
        slot.title = face.name;
      }
      tray.appendChild(slot);
    }
  }

  function updateHUD() {
    $('diffChip').textContent = DIFF_LABEL[S.diffKey];
    $('hudRemain').textContent = '剩余' + CORE.activeCount(S);
    $('hudMoves').textContent = '步数' + S.moves;
    $('trayCount').textContent = S.tray.length + '/' + CORE.TRAY_SIZE;
  }

  function updateTools() {
    var u = S.toolUses;
    setBadge('badgeUndo', u.undo, 'toolUndo');
    setBadge('badgeShuffle', u.shuffle, 'toolShuffle');
    setBadge('badgeHint', u.hint, 'toolHint');
    setBadge('badgeRestart', u.restart, 'toolRestart');
  }

  function setBadge(id, n, toolId) {
    var b = $(id), t = $(toolId);
    b.textContent = String(n);
    t.classList.toggle('empty', n <= 0);
  }

  /* 静音按钮使用两个 SVG 状态切换，不再依赖 emoji 文本 */
  function setMuteIcon(muted) {
    var on = document.querySelector('#btnMute .sound-on');
    var off = document.querySelector('#btnMute .sound-off');
    if (on) on.classList.toggle('hidden', muted);
    if (off) off.classList.toggle('hidden', !muted);
  }

  function renderAll() {
    renderTiles();
    renderTray();
    updateHUD();
    updateTools();
    fit();
  }

  function fit() {
    if (!S || !S.boardW) return;
    var stage = $('stage');
    var wrap = $('boardWrap');
    var sw = stage.clientWidth - 16, sh = stage.clientHeight - 16;
    var scale = Math.min(sw / S.boardW, sh / S.boardH, 1.4);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    wrap.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
  }

  /* ---------- 特效 ---------- */
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1700);
  }

  function burst(face) {
    var layer = $('burstLayer');
    var faceUrl = S.facesById[face].url;
    for (var i = 0; i < 9; i++) {
      var bit = document.createElement('span');
      bit.className = 'burst-bit';
      bit.style.backgroundImage = "url('" + faceUrl + "')";
      layer.appendChild(bit);
      var dx = (Math.random() - 0.5) * 220;
      var dy = -40 - Math.random() * 120;
      var rot = (Math.random() - 0.5) * 300;
      var anim = bit.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.1) rotate(' + rot + 'deg)', opacity: 0 }
      ], { duration: 560 + Math.random() * 300, easing: 'cubic-bezier(.2,.6,.3,1)' });
      anim.onfinish = function () { bit.remove(); };
    }
    setTimeout(function () { layer.innerHTML = ''; }, 1000);
  }

  function confetti() {
    var colors = ['#0a84ff', '#5ac8fa', '#34c759', '#ffd60a', '#ff9f0a', '#ff375f', '#fff'];
    var host = document.createElement('div');
    host.className = 'fx-host';
    document.body.appendChild(host);
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('span');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      c.style.transform = 'rotate(' + Math.floor(Math.random() * 360) + 'deg)';
      host.appendChild(c);
    }
    setTimeout(function () { host.remove(); }, 3800);
  }

  /* ---------- 浮层：菜单 / 胜负 / 照片弹窗 ---------- */
  function overlayShow(html, backdropClose) {
    var root = $('overlayRoot');
    root.innerHTML = html;
    root.classList.add('show');
    root.dataset.backdrop = backdropClose ? '1' : '0';
  }

  function hideOverlays() {
    var root = $('overlayRoot');
    root.innerHTML = '';
    root.classList.remove('show');
    var modal = $('modalRoot');
    modal.innerHTML = '';
    modal.classList.remove('show');
    hideClaim(true);
    closeAlbum();
  }

  function facesInfo() {
    var c = Assets.counts();
    return '图案：本机 <b>' + c.local + '</b> · 共享 <b>' + c.shared + '</b> · 内置 <b>' + c.placeholder + '</b>';
  }

  function showMenu() {
    overlayShow(
      '<div class="overlay menu">' +
        '<div class="panel">' +
          '<div class="logo">🐑</div>' +
          '<h1>叠叠羊</h1>' +
    '<div class="rules">' +
            '<p>1. 点击图案，收进下方卡槽</p>' +
            '<p>2. 集齐 3 个相同图案自动消除</p>' +
            '<p>3. 清空全场获胜；卡槽 7 格满则失败</p>' +
          '</div>' +
          '<p class="faces-info" id="facesInfo">' + facesInfo() + '</p>' +
          '<div class="btn-row">' +
            '<button class="btn primary" data-act="start-easy">简单</button>' +
            '<button class="btn" data-act="start-normal">普通</button>' +
            '<button class="btn" data-act="start-hard">困难</button>' +
          '</div>' +
          '<div class="btn-row">' +
            '<button class="btn ghost" data-act="open-modal">' + icon('photo') + '导入我的照片</button>' +
          '</div>' +
        '</div>' +
      '</div>', false);
  }

  function showWin() {
    var best = loadBest(S.diffKey);
    var isBest = false;
    if (!best || S.moves < best) { saveBest(S.diffKey, S.moves); best = S.moves; isBest = true; }
    var idx = ORDER.indexOf(S.diffKey);
    var html =
      '<div class="overlay result">' +
        '<div class="panel">' +
          '<div class="status-icon success">' + icon('check') + '</div>' +
          '<h1>通关啦！</h1>' +
          '<p class="stat">本局步数：<b>' + S.moves + '</b>' + (isBest ? '（新纪录！）' : '') + '</p>' +
          '<p class="stat">该难度最佳：<b>' + best + '</b> 步</p>' +
          '<div class="btn-row">' +
            '<button class="btn primary" data-act="replay">' + icon('restart') + '再来一局</button>' +
            (idx < ORDER.length - 1 ? '<button class="btn" data-act="next">下一关（' + DIFF_LABEL[ORDER[idx + 1]] + '）</button>' : '') +
            '<button class="btn ghost" data-act="menu">' + icon('menu') + '回菜单</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    overlayShow(html, false);
    confetti();
    AudioSfx.play('win');
  }

  function showLose(reason) {
    var msg = reason === 'full'
      ? '卡槽装满啦！第 7 格没有凑成三消。'
      : '牌收完了，但卡槽还没清空…';
    overlayShow(
      '<div class="overlay result">' +
        '<div class="panel">' +
        '<div class="status-icon fail">' + icon('close') + '</div>' +
          '<h1>挑战失败</h1>' +
          '<p class="stat">' + msg + '</p>' +
          '<p class="stat">本局步数：<b>' + S.moves + '</b>（最佳 ' + (loadBest(S.diffKey) || '-') + '）</p>' +
          '<div class="btn-row">' +
            '<button class="btn primary" data-act="replay">' + icon('restart') + '再试一次</button>' +
            '<button class="btn ghost" data-act="menu">' + icon('menu') + '回菜单</button>' +
          '</div>' +
        '</div>' +
      '</div>', false);
    AudioSfx.play('lose');
  }

  function openModal() {
    var c = Assets.counts();
    var html =
      '<div class="overlay modal-back">' +
        '<div class="panel modal">' +
          '<h2>' + icon('photo') + '自定义牌面</h2>' +
          '<p class="hint">把想玩的照片导进来当牌面（朋友 / 宠物 / 物品都行）。导入后<b>新开一局</b>生效；也可把照片放进 assets/photos 并更新 manifest，让所有访客看到。</p>' +
          '<label class="btn primary file-btn">' + icon('photo') + '添加照片<input type="file" id="photoInput" multiple accept="image/*"></label>' +
          '<div class="local-list" id="localList"></div>' +
          '<p class="faces-info">' + facesInfo() + '</p>' +
          '<div class="btn-row">' +
            '<button class="btn ghost" data-act="reset-import">清空本机导入</button>' +
            '<button class="btn" data-act="close-modal">完成</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    var modal = $('modalRoot');
    modal.innerHTML = html;
    modal.classList.add('show');
    renderLocalList();
    var input = $('photoInput');
    if (input) input.addEventListener('change', function () { onImport(input.files); });
  }

  function renderLocalList() {
    var holder = $('localList');
    if (!holder) return;
    var faces = Assets.getFaces().filter(function (f) { return f.kind === 'local'; });
    if (!faces.length) { holder.innerHTML = '<p class="muted">还没有本机导入的照片。</p>'; return; }
    holder.innerHTML = '';
    for (var i = 0; i < faces.length; i++) {
      var it = document.createElement('div');
      it.className = 'local-item';
      it.innerHTML = '<span class="thumb" style="background-image:url(\'' + faces[i].url + '\')"></span><span class="name">' + faces[i].name + '</span>';
      holder.appendChild(it);
    }
  }

  function closeModal() {
    var modal = $('modalRoot');
    modal.innerHTML = '';
    modal.classList.remove('show');
  }

  /* ---------- 照片图鉴：收集、浏览与大图预览 ---------- */
  function photoById(photoId) {
    for (var i = 0; i < PHOTOS.length; i++) {
      if (PHOTOS[i].id === photoId) return PHOTOS[i];
    }
    return null;
  }

  function rewardEntryByPhotoId(photoId) {
    for (var i = 0; i < rewardEntries.length; i++) {
      if (rewardEntries[i].photoId === photoId) return rewardEntries[i];
    }
    return null;
  }

  function galleryPhotoObserverRoot() {
    var root = $('galleryRoot');
    return root && root.querySelector('.gallery-scroll');
  }

  function isRewardImagePinned(entry) {
    if (!entry || !entry.image) return false;
    if (claimState && claimState.reward === entry) return true;
    var preview = document.querySelector('#galleryRoot .album-preview');
    return !!(preview && preview.contains(entry.image));
  }

  /* 只把全局缓存里已存在的 Image 节点搬进图鉴；这里绝不重新设置 src */
  function mountCachedRewardPhoto(entry, holder) {
    if (!entry || !holder) return;
    var badge = document.createElement('span');
    badge.className = 'album-state';
    badge.textContent = '已点亮';

    if (entry.state === 'loaded') {
      holder.innerHTML = '';
      holder.appendChild(entry.image);
      holder.appendChild(badge);
      return;
    }

    if (entry.state === 'failed') {
      holder.innerHTML = '<div class="reward-fallback"><b>图片暂不可用</b><span>收集进度不受影响</span></div>';
    } else {
      holder.innerHTML = '<div class="reward-loading">图片加载中...</div>';
    }
    holder.appendChild(badge);
  }

  /* 刷新当前可见卡片的缓存图；preview/倒计时正在使用同一个节点时不抢占 */
  function refreshGalleryPhotos() {
    var root = $('galleryRoot');
    if (!root || !root.classList.contains('show')) return;
    var holders = root.querySelectorAll('[data-reward-media-id]');
    for (var i = 0; i < holders.length; i++) {
      var entry = rewardEntryByPhotoId(holders[i].dataset.rewardMediaId);
      if (!entry || isRewardImagePinned(entry)) continue;
      if (entry.state === 'loaded') mountCachedRewardPhoto(entry, holders[i]);
    }
  }

  /* 图鉴只为已解锁卡建立壳；原图节点滚动到附近才挂载，未解锁永远不请求原图 */
  function setupGalleryLazyPhotos() {
    if (galleryPhotoObserver) {
      galleryPhotoObserver.disconnect();
      galleryPhotoObserver = null;
    }

    var holders = document.querySelectorAll('#galleryRoot .album-card.unlocked [data-reward-media-id]');
    if (!holders.length) return;

    /* 兜底环境：没有 IntersectionObserver 时直接挂载，仍不产生网络请求 */
    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < holders.length; i++) {
        var directEntry = rewardEntryByPhotoId(holders[i].dataset.rewardMediaId);
        mountCachedRewardPhoto(directEntry, holders[i]);
      }
      return;
    }

    galleryPhotoObserver = new IntersectionObserver(function (records) {
      records.forEach(function (record) {
        if (!record.isIntersecting) return;
        var holder = record.target;
        var entry = rewardEntryByPhotoId(holder.dataset.rewardMediaId);
        mountCachedRewardPhoto(entry, holder);
        galleryPhotoObserver.unobserve(holder);
      });
    }, { root: galleryPhotoObserverRoot(), rootMargin: '220px 0px' });

    for (var j = 0; j < holders.length; j++) galleryPhotoObserver.observe(holders[j]);
  }

  function renderGallery() {
    var count = unlockedPhotos.size;
    var completed = count === PHOTOS.length;
    var cards = '';

    for (var i = 0; i < PHOTOS.length; i++) {
      var photo = PHOTOS[i];
      var unlocked = unlockedPhotos.has(photo.id);
      if (unlocked) {
        cards +=
          '<button class="album-card unlocked" type="button" data-photo-id="' + photo.id + '" aria-label="查看 ' + photo.name + '">' +
            '<span class="album-thumb lazy-photo" data-reward-media-id="' + photo.id + '">' +
              '<span class="album-state">已点亮</span>' +
            '</span>' +
            '<span class="album-name">' + photo.name + '</span>' +
          '</button>';
      } else {
        cards +=
          '<div class="album-card locked" aria-disabled="true">' +
            '<span class="album-thumb"><span class="album-question">?</span></span>' +
            '<span class="album-name">？？？</span>' +
          '</div>';
      }
    }

    return (
      '<div class="gallery-shell">' +
        '<section class="gallery-panel" role="dialog" aria-modal="true" aria-label="照片图鉴">' +
          '<header class="gallery-head">' +
            '<div class="gallery-title-wrap">' +
              '<h2 class="gallery-title' + (completed ? ' completed' : '') + '">' +
                icon('album') + '照片图鉴' +
                (completed ? '<span class="album-complete">全部收集完成</span>' : '') +
              '</h2>' +
              '<p class="gallery-progress-text">已收集 <b>' + count + '/' + PHOTOS.length + '</b></p>' +
            '</div>' +
            '<button class="icon-btn" type="button" data-act="close-gallery" aria-label="关闭图鉴">' + icon('close') + '</button>' +
          '</header>' +
          '<div class="gallery-scroll">' +
            '<div class="album-grid">' + cards + '</div>' +
          '</div>' +
          '<footer class="gallery-foot">' +
            '<div class="album-progress"><i style="width:' + Math.round((count / PHOTOS.length) * 100) + '%"></i></div>' +
            '<span class="album-percent">' + Math.round((count / PHOTOS.length) * 100) + '%</span>' +
          '</footer>' +
        '</section>' +
      '</div>'
    );
  }

  function showAlbum() {
    var root = $('galleryRoot');
    root.innerHTML = renderGallery();
    root.classList.add('show');
    setupGalleryLazyPhotos();

    /* 打开图鉴即为“已读”：新解锁红点立刻消失，但数量角标保留 */
    var badge = $('albumBadge');
    if (badge) badge.classList.remove('new-unlock');
    AudioSfx.play('click');
  }

  function closeAlbum() {
    if (galleryPhotoObserver) {
      galleryPhotoObserver.disconnect();
      galleryPhotoObserver = null;
    }
    var root = $('galleryRoot');
    root.innerHTML = '';
    root.classList.remove('show');
  }

  function openPhotoPreview(photoId) {
    var root = $('galleryRoot');
    var photo = photoById(photoId);
    if (!photo || !unlockedPhotos.has(photoId)) return;

    /* 奖励图对象全局只创建一次；预览时复用它，避免重复下载/重复解码 */
    var entry = rewardEntryByPhotoId(photoId);
    var media = entry && entry.state === 'loaded' && entry.image
      ? entry.image
      : (entry && entry.state === 'failed'
        ? '<div class="reward-fallback"><b>图片暂不可用</b><span>倒计时和道具不受影响</span></div>'
        : '<div class="reward-loading">图片加载中...</div>');
    var oldPreview = root.querySelector('.album-preview');
    if (oldPreview) oldPreview.remove();

    var preview = document.createElement('div');
    preview.className = 'album-preview';
    preview.innerHTML =
      '<div class="album-preview-panel" role="dialog" aria-modal="true" aria-label="' + photo.name + '">' +
        '<div class="album-preview-stage" id="albumPreviewStage"></div>' +
        '<h3>' + photo.name + '</h3>' +
        '<button class="btn ghost" type="button" data-act="close-preview">' + icon('close') + '关闭</button>' +
      '</div>';

    preview.addEventListener('click', function (event) {
      /* iOS 常规交互：点空白蒙层关闭，点面板内部不关闭 */
      if (event.target === preview) closePhotoPreview();
    });
    root.appendChild(preview);

    var stage = $('albumPreviewStage');
    if (typeof media === 'string') stage.innerHTML = media;
    else stage.replaceChildren(entry.image);
  }

  function closePhotoPreview() {
    var preview = document.querySelector('#galleryRoot .album-preview');
    if (preview) preview.remove();
    refreshGalleryPhotos(); // 把全局唯一的 Image 放回当前可见的图鉴卡片
  }

  /* ---------- 道具奖励：10 秒锁定后只给当前道具 +1 ---------- */
  function hideClaim(silent) {
    var root = $('claimRoot');
    if (claimState && claimState.timer) clearInterval(claimState.timer);
    claimState = null;
    root.innerHTML = '';
    root.classList.remove('show');
    if (!silent) toast('获得1次道具机会');
  }

  function openClaim(kind) {
    var root = $('claimRoot');
    if (claimState) return;

    /*
     * 先建立弹窗和绝对时间倒计时，再选择图片。
     * 图片网络慢/失败时只影响展示区，绝不影响 10 秒计时与道具发放。
     */
    claimState = { kind: kind, deadline: Date.now() + 10000, timer: null, done: false, reward: null, fallbackTries: 0 };
    root.innerHTML =
      '<div class="overlay reward">' +
        '<div class="panel reward-panel">' +
          '<h2>' + icon(TOOL_ICONS[kind]) + TOOL_NAMES[kind] + '道具</h2>' +
          '<div class="reward-stage" id="rewardStage"><div class="reward-loading">图片加载中...</div></div>' +
          '<p class="reward-tip">观看图片 <b id="claimSeconds">10</b> 秒后可领取</p>' +
          '<button class="btn ghost" id="claimClose" disabled>倒计时结束后自动领取</button>' +
        '</div>' +
      '</div>';
    root.classList.add('show');
    AudioSfx.play('click');

    var tick = function () {
      if (!claimState) return;
      var left = Math.max(0, Math.ceil((claimState.deadline - Date.now()) / 1000));
      var label = $('claimSeconds');
      var button = $('claimClose');
      if (label) label.textContent = String(left);
      if (left > 0) return;

      /* 只恢复当前点击的道具，不影响其它三个道具 */
      claimState.done = true;
      if (claimState.timer) clearInterval(claimState.timer);
      if (S && S.toolUses) S.toolUses[claimState.kind] = (S.toolUses[claimState.kind] || 0) + 1;
      var granted = claimState.kind;
      var rewardedPhotoId = claimState.reward ? claimState.reward.photoId : null;
      unlockPhoto(rewardedPhotoId); // 图鉴解锁只追加在“完整计时成功发放”之后
      hideClaim(false);
      updateTools();
      AudioSfx.play('tool');
      if (!S) toast(TOOL_NAMES[granted] + '：获得1次道具机会');
    };

    claimState.timer = setInterval(tick, 100);
    tick();
    selectRewardCandidate();
  }

  function onImport(files) {
    if (!files || !files.length) return;
    Assets.importFiles(files).then(function (r) {
      toast(r.saved ? '已导入 ' + r.added + ' 张照片，新开一局生效' : '导入失败，请重试');
      renderLocalList();
      refreshMenuFaces();
      AudioSfx.play('click');
    });
  }

  function refreshMenuFaces() {
    var el = $('facesInfo');
    if (el) el.innerHTML = facesInfo();
    var mf = $('modalFaces');
    if (mf) mf.innerHTML = facesInfo();
  }

  /* ---------- 动作分发 ---------- */
  function handleAction(act) {
    if (!act) return;
    AudioSfx.unlock();
    if (act.indexOf('start-') === 0) { startLevel(act.slice(6)); return; }
    switch (act) {
      case 'menu': showMenu(); break;
      case 'replay': if (S) startLevel(S.diffKey); break;
      case 'next':
        if (S) {
          var idx = ORDER.indexOf(S.diffKey);
          startLevel(ORDER[Math.min(idx + 1, ORDER.length - 1)]);
        }
        break;
      case 'open-modal': openModal(); break;
      case 'close-modal': closeModal(); break;
      case 'reset-import':
        Assets.resetImports().then(function () {
          toast('已清空本机导入的照片');
          renderLocalList();
          refreshMenuFaces();
          AudioSfx.play('click');
        });
        break;
      default: break;
    }
  }

  /* ---------- 对局操作 ---------- */
  function startLevel(diffKey) {
    if (!Assets.isReady()) return;
    var faces = Assets.getFaces();
    if (!faces.length) { toast('暂无可用图案'); return; }
    S = CORE.createLevel(diffKey, faces);
    S.facesById = {};
    for (var i = 0; i < faces.length; i++) S.facesById[faces[i].id] = faces[i];
    hideOverlays();
    buildBoard();
    renderAll();
  }

  function tileTap(id) {
    if (!S || S.status !== 'playing') return;
    var t = CORE.tileById(S, id);
    if (!t || t.removed) return;
    if (CORE.isCovered(S, t)) {
      AudioSfx.play('denied');
      toast('这张牌被上面的牌压住啦');
      return;
    }
    var res = CORE.pick(S, id);
    if (!res.ok) return;
    var el = t.el;
    if (el) el.classList.add('picked');
    AudioSfx.play('pick');
    setTimeout(function () {
      renderTiles();
      renderTray();
      updateHUD();
      updateTools();
      if (res.event === 'cleared' || res.event === 'win' || res.event === 'lose') {
        if (res.face) { AudioSfx.play('clear'); burst(res.face); }
        if (res.event === 'win') setTimeout(showWin, 430);
        else if (res.event === 'lose') setTimeout(function () { showLose(res.reason); }, 430);
      }
    }, 150);
  }

  function useUndo() {
    if (!S || S.status !== 'playing') return;
    var res = CORE.undo(S);
    if (res.ok) {
      AudioSfx.play('tool');
      renderAll();
      toast('已撤销上一步');
    } else {
      AudioSfx.play('denied');
      if (res.reason === 'nothing') toast('没有可撤销的步骤');
      else if (res.reason === 'no-uses') toast('撤销次数已用完');
    }
  }

  function useShuffle() {
    if (!S || S.status !== 'playing') return;
    var res = CORE.shuffle(S);
    if (res.ok) {
      for (var i = 0; i < S.tiles.length; i++) {
        var t = S.tiles[i];
        if (!t.removed) t.el.style.backgroundImage = "url('" + S.facesById[t.face].url + "')";
      }
      AudioSfx.play('tool');
      updateTools();
      toast('已洗牌，图案重新打乱');
    } else {
      AudioSfx.play('denied');
      if (res.reason === 'no-uses') toast('洗牌次数已用完');
    }
  }

  function useHint() {
    if (!S || S.status !== 'playing') return;
    var res = CORE.hint(S);
    if (res.ok) {
      var el = CORE.tileById(S, res.id).el;
      if (el) {
        el.classList.add('hint');
        setTimeout(function () { if (el) el.classList.remove('hint'); }, 1100);
      }
      AudioSfx.play('tool');
      updateTools();
    } else {
      AudioSfx.play('denied');
      if (res.reason === 'no-uses') toast('提示次数已用完');
      else if (res.reason === 'unsafe') toast('现在没有安全牌，试试洗牌吧');
      else if (res.reason === 'none') toast('没有可点的牌');
    }
  }

  /* 四个道具共用入口：数量不足时不直接执行，而是进入本道具的领取流程 */
  function useTool(kind) {
    if (!S || S.status !== 'playing') return;
    if ((S.toolUses[kind] || 0) <= 0) { openClaim(kind); return; }
    if (kind === 'restart') {
      S.toolUses.restart--;
      startLevel(S.diffKey);
      return;
    }
    if (kind === 'undo') useUndo();
    else if (kind === 'shuffle') useShuffle();
    else if (kind === 'hint') useHint();
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    var board = $('board');
    board.addEventListener('click', function (e) {
      var d = e.target.closest ? e.target.closest('.tile') : null;
      if (!d) return;
      AudioSfx.unlock();
      tileTap(parseInt(d.dataset.id, 10));
    });

    $('toolUndo').addEventListener('click', function () { AudioSfx.unlock(); useTool('undo'); });
    $('toolShuffle').addEventListener('click', function () { AudioSfx.unlock(); useTool('shuffle'); });
    $('toolHint').addEventListener('click', function () { AudioSfx.unlock(); useTool('hint'); });
    $('toolRestart').addEventListener('click', function () { AudioSfx.unlock(); useTool('restart'); });

    $('btnMute').addEventListener('click', function () {
      var muted = AudioSfx.toggleMute();
      setMuteIcon(muted);
      AudioSfx.unlock();
    });
    $('btnPhoto').addEventListener('click', function () { AudioSfx.unlock(); openModal(); });
    $('btnAlbum').addEventListener('click', function () {
      AudioSfx.unlock();
      showAlbum();
    });
    $('btnMenu').addEventListener('click', function () {
      AudioSfx.unlock();
      if (S && S.status === 'playing') {
        if (!window.confirm('返回菜单将结束本局，确定吗？')) return;
      }
      S = null;
      showMenu();
    });

    $('overlayRoot').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (btn) { handleAction(btn.dataset.act); return; }
      if (this.dataset.backdrop === '1' && e.target === this) { this.classList.remove('show'); this.innerHTML = ''; }
    });
    $('modalRoot').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (btn) { handleAction(btn.dataset.act); return; }
      if (e.target === this) closeModal();
    });

    /* 奖励浮层吞掉全部点击：倒计时期间不能点背景、按钮或穿过浮层操作牌面 */
    $('claimRoot').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (claimState && claimState.done) hideClaim(false);
    });
    $('claimRoot').addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
    });

    /* 图鉴内按钮 / 卡片 / 空白区域统一委托，滚动列表不因重复绑定而失效 */
    $('galleryRoot').addEventListener('click', function (e) {
      var action = e.target.closest ? e.target.closest('[data-act]') : null;
      if (action) {
        if (action.dataset.act === 'close-gallery') closeAlbum();
        else if (action.dataset.act === 'close-preview') closePhotoPreview();
        return;
      }

      var card = e.target.closest ? e.target.closest('.album-card.unlocked[data-photo-id]') : null;
      if (card) {
        AudioSfx.unlock();
        openPhotoPreview(card.dataset.photoId);
        return;
      }

      /* 点图鉴面板外的深色磨砂区域直接关闭 */
      if (e.target.classList && e.target.classList.contains('gallery-shell')) closeAlbum();
    });

    /* 倒计时未结束时屏蔽键盘路径，避免 Tab + Enter 触发下层界面 */
    document.addEventListener('keydown', function (e) {
      if (!claimState || claimState.done) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    window.addEventListener('resize', fit);
  }

  /* ---------- 测试钩子 ---------- */
  function installHooks() {
    window.__game = {
      start: function (k) { startLevel(k); },
      state: function () {
        if (!S) return null;
        return {
          diffKey: S.diffKey,
          tiles: S.tiles.map(function (t) {
            return { id: t.id, face: t.face, layer: t.layer, x: t.x, y: t.y, removed: t.removed };
          }),
          tray: S.tray.slice(),
          moves: S.moves,
          status: S.status,
          reason: S.reason,
          toolUses: {
            undo: S.toolUses.undo,
            shuffle: S.toolUses.shuffle,
            hint: S.toolUses.hint,
            restart: S.toolUses.restart
          }
        };
      },
      isCovered: function (id) { return S ? CORE.isCovered(S, CORE.tileById(S, id)) : false; },
      pick: function (id) { return S ? CORE.pick(S, id) : { ok: false }; },
      undo: function () { return S ? CORE.undo(S) : { ok: false }; },
      shuffle: function () { return S ? CORE.shuffle(S) : { ok: false }; },
      hint: function () { return S ? CORE.hint(S) : { ok: false }; },
      album: function () {
        return {
          total: PHOTOS.length,
          unlocked: Array.from(unlockedPhotos),
          storageKey: UNLOCKED_PHOTOS_KEY
        };
      },
      rewardCache: function () {
        return rewardEntries.map(function (entry) {
          return { id: entry.photoId, state: entry.state, cached: !!entry.image };
        });
      },
      core: CORE
    };
  }

  /* ---------- 启动 ---------- */
  function init() {
    bindEvents();
    installHooks();
    var muted = AudioSfx.muted();
    setMuteIcon(muted);
    updateAlbumBadge();
    /* 打开页面即预热：不 await，不阻塞菜单渲染和玩家操作 */
    preloadRewardImages();
    Assets.onChange(function () {
      refreshMenuFaces();
      if (!S) showMenu();
    });
    Assets.init().then(function () {
      var d = new URLSearchParams(location.search).get('d');
      if (d && CORE.DIFFS[d]) { startLevel(d); } else { showMenu(); }
    }).catch(function () {
      showMenu();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();






