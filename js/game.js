/* game.js —— 界面与控制：渲染牌面/卡槽、动画、道具、菜单与结果浮层 */
(function () {
  'use strict';

  /* ---------- 常量与工具 ---------- */
  var CELL_W = 56, CELL_H = 60, TILE_W = 50, TILE_H = 54;
  var ORDER = ['easy', 'normal', 'hard'];
  var DIFF_LABEL = { easy: '简单', normal: '普通', hard: '困难' };

  function $(id) { return document.getElementById(id); }

  function bestKey(k) { return 'yang-best-' + k; }
  function loadBest(k) { try { return parseInt(localStorage.getItem(bestKey(k)), 10) || 0; } catch (e) { return 0; } }
  function saveBest(k, v) { try { localStorage.setItem(bestKey(k), String(v)); } catch (e) { /* noop */ } }

  var S = null;            // 当前对局状态（来自 CORE）
  var toastTimer = null;

  /* ---------- 布局与渲染 ---------- */
  function buildBoard() {
    var board = $('board');
    board.innerHTML = '';
    var facesById = S.facesById;

    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0; i < S.tiles.length; i++) {
      var t = S.tiles[i];
      t.x = t.gc * CELL_W + CELL_W / 2 + t.jx;
      t.y = t.gr * CELL_H + CELL_H / 2 + t.jy + t.layer * 3;
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    var pad = 40;
    var LW = (maxX - minX) + TILE_W + pad * 2;
    var LH = (maxY - minY) + TILE_H + pad * 2;
    var OX = minX - pad - TILE_W / 2;
    var OY = minY - pad - TILE_H / 2;
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
    $('hudRemain').textContent = '剩余 ' + CORE.activeCount(S);
    $('hudMoves').textContent = '步数 ' + S.moves;
    $('trayCount').textContent = S.tray.length + '/' + CORE.TRAY_SIZE;
  }

  function updateTools() {
    var u = S.toolUses;
    setBadge('badgeUndo', u.undo, 'toolUndo');
    setBadge('badgeShuffle', u.shuffle, 'toolShuffle');
    setBadge('badgeHint', u.hint, 'toolHint');
  }

  function setBadge(id, n, toolId) {
    var b = $(id), t = $(toolId);
    b.textContent = String(n);
    t.classList.toggle('empty', n <= 0);
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
    var colors = ['#ffd54a', '#ff8a65', '#4dd0e1', '#aed581', '#f48fb1', '#9575cd', '#fff'];
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
          '<p class="sub">羊了个羊同款 · 休闲三消小游戏</p>' +
          '<div class="rules">' +
            '<p>1. 点击图案，收进下方卡槽</p>' +
            '<p>2. 集齐 3 个相同图案自动消除</p>' +
            '<p>3. 清空全场获胜；卡槽 7 格满则失败</p>' +
          '</div>' +
          '<p class="faces-info" id="facesInfo">' + facesInfo() + '</p>' +
          '<div class="btn-row">' +
            '<button class="btn primary" data-act="start-easy">😊 简单</button>' +
            '<button class="btn" data-act="start-normal">🙂 普通</button>' +
            '<button class="btn" data-act="start-hard">😈 困难</button>' +
          '</div>' +
          '<div class="btn-row">' +
            '<button class="btn ghost" data-act="open-modal">🖼️ 导入我的照片</button>' +
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
          '<div class="big-emoji">🎉</div>' +
          '<h1>通关啦！</h1>' +
          '<p class="stat">本局步数：<b>' + S.moves + '</b>' + (isBest ? '（新纪录！）' : '') + '</p>' +
          '<p class="stat">该难度最佳：<b>' + best + '</b> 步</p>' +
          '<div class="btn-row">' +
            '<button class="btn primary" data-act="replay">🔁 再来一局</button>' +
            (idx < ORDER.length - 1 ? '<button class="btn" data-act="next">➡️ 下一关（' + DIFF_LABEL[ORDER[idx + 1]] + '）</button>' : '') +
            '<button class="btn ghost" data-act="menu">☰ 回菜单</button>' +
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
          '<div class="big-emoji">😵</div>' +
          '<h1>挑战失败</h1>' +
          '<p class="stat">' + msg + '</p>' +
          '<p class="stat">本局步数：<b>' + S.moves + '</b>（最佳 ' + (loadBest(S.diffKey) || '-') + '）</p>' +
          '<div class="btn-row">' +
            '<button class="btn primary" data-act="replay">🔁 再试一次</button>' +
            '<button class="btn ghost" data-act="menu">☰ 回菜单</button>' +
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
          '<h2>🖼️ 自定义牌面</h2>' +
          '<p class="hint">把想玩的照片导进来当牌面（朋友 / 宠物 / 物品都行）。导入后<b>新开一局</b>生效；也可把照片放进 assets/photos 并更新 manifest，让所有访客看到。</p>' +
          '<label class="btn primary file-btn">➕ 添加照片<input type="file" id="photoInput" multiple accept="image/*"></label>' +
          '<div class="local-list" id="localList"></div>' +
          '<p class="faces-info">' + facesInfo() + '</p>' +
          '<div class="btn-row">' +
            '<button class="btn ghost" data-act="reset-import">🧹 清空本机导入</button>' +
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

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    var board = $('board');
    board.addEventListener('click', function (e) {
      var d = e.target.closest ? e.target.closest('.tile') : null;
      if (!d) return;
      AudioSfx.unlock();
      tileTap(parseInt(d.dataset.id, 10));
    });

    $('toolUndo').addEventListener('click', function () { AudioSfx.unlock(); useUndo(); });
    $('toolShuffle').addEventListener('click', function () { AudioSfx.unlock(); useShuffle(); });
    $('toolHint').addEventListener('click', function () { AudioSfx.unlock(); useHint(); });
    $('toolRestart').addEventListener('click', function () {
      AudioSfx.unlock();
      if (S && S.status === 'playing') { if (window.confirm('确定重新开始本局吗？')) startLevel(S.diffKey); }
      else if (S) startLevel(S.diffKey);
    });

    $('btnMute').addEventListener('click', function () {
      var muted = AudioSfx.toggleMute();
      $('btnMute').textContent = muted ? '🔇' : '🔊';
      AudioSfx.unlock();
    });
    $('btnPhoto').addEventListener('click', function () { AudioSfx.unlock(); openModal(); });
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
            return { id: t.id, face: t.face, layer: t.layer, gr: t.gr, gc: t.gc, removed: t.removed };
          }),
          tray: S.tray.slice(),
          moves: S.moves,
          status: S.status,
          reason: S.reason,
          toolUses: { undo: S.toolUses.undo, shuffle: S.toolUses.shuffle, hint: S.toolUses.hint }
        };
      },
      isCovered: function (id) { return S ? CORE.isCovered(S, CORE.tileById(S, id)) : false; },
      pick: function (id) { return S ? CORE.pick(S, id) : { ok: false }; },
      undo: function () { return S ? CORE.undo(S) : { ok: false }; },
      shuffle: function () { return S ? CORE.shuffle(S) : { ok: false }; },
      hint: function () { return S ? CORE.hint(S) : { ok: false }; },
      core: CORE
    };
  }

  /* ---------- 启动 ---------- */
  function init() {
    bindEvents();
    installHooks();
    var muted = AudioSfx.muted();
    $('btnMute').textContent = muted ? '🔇' : '🔊';
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


