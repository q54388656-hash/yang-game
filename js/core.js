/* core.js —— 羊了个羊风格三消核心逻辑（纯函数，无 DOM）
   浏览器与 Node 测试共用：挂到 window.CORE / globalThis.CORE，并支持 CommonJS。 */
(function (global) {
  'use strict';

  var DIFFS = {
    easy:   { label: '简单', layers: [[8,4],[6,3],[4,2]],                  target: 3.0, tools: { undo: 5, shuffle: 5, hint: 5 } },
    normal: { label: '普通', layers: [[8,5],[7,4],[6,3],[4,2]],            target: 2.6, tools: { undo: 4, shuffle: 4, hint: 4 } },
    hard:   { label: '困难', layers: [[9,5],[8,4],[7,3],[5,2]],            target: 2.4, tools: { undo: 4, shuffle: 4, hint: 4 } }
  };
  var TRAY_SIZE = 7;

  function randInt(rng, n) { return Math.floor(rng() * n); }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(rng, i + 1);
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* 同心矩形多层布局：每层居中铺格子，同一 (gr,gc) 上下叠放；格子带 ±5px 抖动 */
  function buildCells(diff, rng) {
    var layers = diff.layers;
    var maxC = 0, maxR = 0, i;
    for (i = 0; i < layers.length; i++) { maxC = Math.max(maxC, layers[i][0]); maxR = Math.max(maxR, layers[i][1]); }
    var cells = [];
    var jitter = {};
    for (i = 0; i < layers.length; i++) {
      var cols = layers[i][0], rows = layers[i][1];
      var offC = Math.floor((maxC - cols) / 2);
      var offR = Math.floor((maxR - rows) / 2);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var gr = r + offR, gc = c + offC, key = gr + '_' + gc;
          var j = jitter[key];
          if (!j) { j = { x: Math.round(rng() * 10 - 5), y: Math.round(rng() * 8 - 4) }; jitter[key] = j; }
          cells.push({ layer: i, gr: gr, gc: gc, jx: j.x, jy: j.y });
        }
      }
    }
    /* 总数裁到 3 的倍数（从最底层移除，最多 2 个） */
    var total = cells.length;
    while (total % 3 !== 0) {
      var bottom = [];
      for (i = 0; i < cells.length; i++) if (cells[i].layer === 0) bottom.push(i);
      cells.splice(bottom[randInt(rng, bottom.length)], 1);
      total--;
    }
    return cells;
  }

  /* 每种图案张数为 3 的倍数；图案种类 ≈ 总组数 / target */
  function distributeTypes(n, faces, target, rng) {
    var triples = n / 3;
    var want = Math.max(1, Math.min(faces.length, Math.floor(triples), Math.round(triples / target)));
    var chosen = faces.slice(0, want);
    var units = [];
    for (var i = 0; i < want; i++) units.push(1);
    var left = triples - want;
    while (left > 0) { units[randInt(rng, want)]++; left--; }
    var bag = [];
    for (i = 0; i < want; i++) {
      for (var k = 0; k < units[i] * 3; k++) bag.push(chosen[i]);
    }
    return shuffle(bag, rng);
  }

  function createLevel(diffKey, faces, rng) {
    rng = rng || Math.random;
    var diff = DIFFS[diffKey];
    if (!diff) throw new Error('未知难度: ' + diffKey);
    if (!faces || !faces.length) throw new Error('缺少可用图案');
    var cells = buildCells(diff, rng);
    var types = distributeTypes(cells.length, faces, diff.target, rng);
    shuffle(cells, rng);
    var tiles = [];
    for (var i = 0; i < cells.length; i++) {
      tiles.push({
        id: i,
        face: types[i].id,
        layer: cells[i].layer,
        gr: cells[i].gr,
        gc: cells[i].gc,
        jx: cells[i].jx,
        jy: cells[i].jy,
        removed: false
      });
    }
    return {
      diffKey: diffKey,
      faces: faces,
      tiles: tiles,
      tray: [],
      history: [],
      moves: 0,
      status: 'playing',   // playing | win | lose
      reason: '',
      toolUses: { undo: diff.tools.undo, shuffle: diff.tools.shuffle, hint: diff.tools.hint },
      rng: rng
    };
  }

  function tileById(s, id) { return s.tiles[id] || null; }

  function activeCount(s) {
    var n = 0;
    for (var i = 0; i < s.tiles.length; i++) if (!s.tiles[i].removed) n++;
    return n;
  }

  function isCovered(s, t) {
    for (var i = 0; i < s.tiles.length; i++) {
      var u = s.tiles[i];
      if (!u.removed && u.layer > t.layer && u.gr === t.gr && u.gc === t.gc) return true;
    }
    return false;
  }

  function trayFaces(s) {
    var out = [];
    for (var i = 0; i < s.tray.length; i++) out.push(tileById(s, s.tray[i]).face);
    return out;
  }

  function snapshot(s) {
    var removed = [];
    for (var i = 0; i < s.tiles.length; i++) if (s.tiles[i].removed) removed.push(s.tiles[i].id);
    return { removed: removed, tray: s.tray.slice(), moves: s.moves };
  }

  function countInTray(s, face) {
    var n = 0;
    for (var i = 0; i < s.tray.length; i++) if (tileById(s, s.tray[i]).face === face) n++;
    return n;
  }

  function pick(s, id) {
    if (s.status !== 'playing') return { ok: false, reason: 'not-playing' };
    var t = tileById(s, id);
    if (!t || t.removed) return { ok: false, reason: 'invalid' };
    if (isCovered(s, t)) return { ok: false, reason: 'covered' };

    s.history.push(snapshot(s));
    t.removed = true;
    s.moves++;
    s.tray.push(id);

    var face = t.face;
    if (countInTray(s, face) >= 3) {
      var cleared = [];
      var kept = [];
      for (var i = 0; i < s.tray.length; i++) {
        if (tileById(s, s.tray[i]).face === face) cleared.push(s.tray[i]); else kept.push(s.tray[i]);
      }
      s.tray = kept;
      var rem = activeCount(s);
      if (rem === 0 && s.tray.length === 0) { s.status = 'win'; return { ok: true, event: 'win', cleared: cleared, face: face }; }
      if (rem === 0) { s.status = 'lose'; s.reason = 'stuck'; return { ok: true, event: 'lose', cleared: cleared, face: face, reason: 'stuck' }; }
      return { ok: true, event: 'cleared', cleared: cleared, face: face };
    }
    if (s.tray.length >= TRAY_SIZE) { s.status = 'lose'; s.reason = 'full'; return { ok: true, event: 'lose', reason: 'full' }; }
    return { ok: true, event: 'pick' };
  }

  function undo(s) {
    if (s.status !== 'playing') return { ok: false, reason: 'not-playing' };
    if (s.toolUses.undo <= 0) return { ok: false, reason: 'no-uses' };
    if (!s.history.length) return { ok: false, reason: 'nothing' };
    var snap = s.history.pop();
    var remSet = {};
    for (var i = 0; i < snap.removed.length; i++) remSet[snap.removed[i]] = 1;
    for (i = 0; i < s.tiles.length; i++) s.tiles[i].removed = !!remSet[s.tiles[i].id];
    s.tray = snap.tray.slice();
    s.moves = snap.moves;
    s.toolUses.undo--;
    s.status = 'playing';
    s.reason = '';
    return { ok: true };
  }

  function shuffleTiles(s) {
    if (s.status !== 'playing') return { ok: false, reason: 'not-playing' };
    if (s.toolUses.shuffle <= 0) return { ok: false, reason: 'no-uses' };
    var act = [];
    for (var i = 0; i < s.tiles.length; i++) if (!s.tiles[i].removed) act.push(s.tiles[i]);
    var faces = [];
    for (i = 0; i < act.length; i++) faces.push(act[i].face);
    shuffle(faces, s.rng);
    for (i = 0; i < act.length; i++) act[i].face = faces[i];
    s.toolUses.shuffle--;
    return { ok: true };
  }

  function hint(s) {
    if (s.status !== 'playing') return { ok: false, reason: 'not-playing' };
    if (s.toolUses.hint <= 0) return { ok: false, reason: 'no-uses' };
    var exposed = [];
    for (var i = 0; i < s.tiles.length; i++) {
      var t = s.tiles[i];
      if (!t.removed && !isCovered(s, t)) exposed.push(t);
    }
    if (!exposed.length) return { ok: false, reason: 'none' };
    var pickTile = null, j;
    for (j = 0; j < exposed.length; j++) if (countInTray(s, exposed[j].face) >= 2) { pickTile = exposed[j]; break; }
    if (!pickTile) {
      for (j = 0; j < exposed.length; j++) {
        if (!(s.tray.length >= 6 && countInTray(s, exposed[j].face) < 2)) { pickTile = exposed[j]; break; }
      }
    }
    if (!pickTile) return { ok: false, reason: 'unsafe' };
    s.toolUses.hint--;
    return { ok: true, id: pickTile.id };
  }

  var core = {
    DIFFS: DIFFS,
    TRAY_SIZE: TRAY_SIZE,
    createLevel: createLevel,
    pick: pick,
    undo: undo,
    shuffle: shuffleTiles,
    hint: hint,
    isCovered: isCovered,
    activeCount: activeCount,
    tileById: tileById,
    trayFaces: trayFaces,
    countInTray: countInTray,
    _buildCells: buildCells,
    _distribute: distributeTypes,
    _shuffle: shuffle
  };

  global.CORE = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : globalThis);

