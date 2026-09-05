/* test-core.js —— 核心玩法逻辑自动化冒烟测试（Node 直跑，无 DOM）
   运行： node tests/test-core.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
const sandbox = { module: { exports: {} }, exports: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const CORE = sandbox.CORE;
const G = CORE.GEOM;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ 断言失败: ' + msg); }
}
function section(name) { console.log('\n■ ' + name); }

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeFaces(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ id: 'f' + i, name: 'F' + i, kind: 'test', url: 'x' });
  return arr;
}
/* 独立复算：与核心同规则但由测试自行实现 */
function geoBlocked(a, b) {
  const ox = Math.min(a.x + G.TW / 2, b.x + G.TW / 2) - Math.max(a.x - G.TW / 2, b.x - G.TW / 2);
  const oy = Math.min(a.y + G.TH / 2, b.y + G.TH / 2) - Math.max(a.y - G.TH / 2, b.y - G.TH / 2);
  return ox > G.OVERLAP && oy > G.OVERLAP;
}
function mkTile(id, face, x, y, layer, removed) {
  return { id, face, layer, x, y, rot: 0, removed: !!removed };
}
function mkState() {
  return { diffKey: 'easy', faces: [], tiles: [], tray: [], history: [], moves: 0, status: 'playing', reason: '', toolUses: { undo: 1, shuffle: 1, hint: 1, restart: 1 }, rng: Math.random };
}

/* 1. 结构校验：三种难度 */
section('1. 难度结构（总数/每类张数均为 3 的倍数、几何覆盖规则）');
['easy', 'normal', 'hard'].forEach(function (k, di) {
  const faces = makeFaces(24);
  const s = CORE.createLevel(k, faces, mulberry(di + 1));
  const total = s.tiles.length;
  assert(total % 3 === 0, k + ' 总数应为 3 的倍数，实际 ' + total);
  const cnt = {};
  s.tiles.forEach((t) => { cnt[t.face] = (cnt[t.face] || 0) + 1; });
  Object.keys(cnt).forEach((f) => {
    assert(cnt[f] % 3 === 0, k + ' 图案 ' + f + ' 张数应为 3 的倍数，实际 ' + cnt[f]);
  });
  let coveredCount = 0, exposedCount = 0;
  s.tiles.forEach((t) => {
    const expected = s.tiles.some((u) => !u.removed && u.layer > t.layer && geoBlocked(t, u));
    assert(CORE.isCovered(s, t) === expected, k + ' tile#' + t.id + ' 覆盖状态错误');
    if (expected) coveredCount++; else exposedCount++;
  });
  assert(exposedCount > 0, k + ' 应存在可点牌 (exposed=' + exposedCount + ')');
  assert(coveredCount > 0, k + ' 应存在被压住的牌 (covered=' + coveredCount + ')');
  /* 布局应铺开：X/Y 范围足够宽，避免叠成一条线 */
  const xs = s.tiles.map((t) => t.x), ys = s.tiles.map((t) => t.y);
  assert(Math.max(...xs) - Math.min(...xs) > 200, k + ' 横向应铺开 (>200)');
  assert(Math.max(...ys) - Math.min(...ys) > 120, k + ' 纵向应铺开 (>120)');
  assert(
    s.toolUses.undo === 0 && s.toolUses.shuffle === 0 &&
    s.toolUses.hint === 0 && s.toolUses.restart === 0,
    k + ' 四个道具初始次数都应为 0'
  );
});

/* 2. 单一图案 → 必胜路径（连续消除直至胜利） */
section('2. 单图案必胜：三消与清空判胜');
(function () {
  const s = CORE.createLevel('easy', makeFaces(1), mulberry(2));
  const total = s.tiles.length;
  let guard = 0;
  while (s.status === 'playing' && guard < 100000) {
    guard++;
    let id = -1;
    for (let i = 0; i < s.tiles.length; i++) {
      if (!s.tiles[i].removed && !CORE.isCovered(s, s.tiles[i])) { id = s.tiles[i].id; break; }
    }
    assert(id >= 0, '应始终存在可点牌');
    const res = CORE.pick(s, id);
    assert(res.ok, 'pick 应成功');
  }
  assert(s.status === 'win', '应获胜，实际 ' + s.status + ' / ' + s.reason);
  assert(s.tray.length === 0, '获胜时卡槽应清空');
  assert(s.moves === total, '步数应等于总张数 ' + total + '，实际 ' + s.moves);
  assert(CORE.activeCount(s) === 0, '场上应无剩余牌');
})();

/* 3. 卡槽爆满判负 */
section('3. 卡槽 7 格爆满判负');
(function () {
  const s = mkState();
  for (let i = 0; i < 7; i++) s.tiles.push(mkTile(i, 'f' + i, i * 400, 0, 0, false));
  let last = null;
  for (let i = 0; i < 7; i++) last = CORE.pick(s, i);
  assert(last.event === 'lose' && last.reason === 'full', '第 7 格无三消应判负');
  assert(s.status === 'lose' && s.reason === 'full', '状态应为 lose/full');
})();

/* 4. 三消 + 撤销恢复（含已消除） */
section('4. 三消消除与撤销还原');
(function () {
  const s = mkState();
  s.tiles.push(
    mkTile(0, 'a', 0, 0, 0, true),
    mkTile(1, 'a', 400, 0, 0, true),
    mkTile(2, 'a', 800, 0, 0, false),
    mkTile(3, 'b', 1200, 0, 0, false),
    mkTile(4, 'c', 1600, 0, 0, false)
  );
  s.tray = [0, 1];
  const res = CORE.pick(s, 2);
  assert(res.event === 'cleared', '集齐 3 张应消除，实际 ' + res.event);
  assert(s.tray.length === 0 && s.tray.indexOf(2) < 0, '消除后卡槽应清空该图案');
  assert(s.status === 'playing', '场上仍有牌时应继续');
  const undoRes = CORE.undo(s);
  assert(undoRes.ok, '撤销应成功');
  assert(s.tray.length === 2 && s.tray[0] === 0 && s.tray[1] === 1, '撤销应恢复卡槽 [0,1]');
  assert(CORE.tileById(s, 2).removed === false, '撤销应把 tile#2 放回场上');
  assert(s.toolUses.undo === 0, '撤销次数应扣减');
})();

/* 5. 洗牌保持剩余图案数量分布 */
section('5. 洗牌不改变数量分布');
(function () {
  const s = CORE.createLevel('normal', makeFaces(16), mulberry(5));
  s.toolUses.shuffle = 1;
  const before = {};
  s.tiles.forEach((t) => { if (!t.removed) before[t.face] = (before[t.face] || 0) + 1; });
  const beforeActive = CORE.activeCount(s);
  const res = CORE.shuffle(s);
  assert(res.ok, '洗牌应成功');
  const after = {};
  s.tiles.forEach((t) => { if (!t.removed) after[t.face] = (after[t.face] || 0) + 1; });
  assert(JSON.stringify(Object.keys(before).sort()) === JSON.stringify(Object.keys(after).sort()), '洗牌后图案种类集合应一致');
  let same = true;
  Object.keys(before).forEach((k) => { if (before[k] !== after[k]) same = false; });
  assert(same, '洗牌后每种剩余张数应一致');
  assert(CORE.activeCount(s) === beforeActive, '洗牌不改变场上张数');
  assert(s.toolUses.shuffle === 0, '洗牌次数已扣减');
})();

/* 6. 提示：优先推荐能凑三消的牌 */
section('6. 提示优先三消 / 安全牌');
(function () {
  const s = mkState();
  s.tiles.push(
    mkTile(0, 'a', 0, 0, 0, true),
    mkTile(1, 'a', 400, 0, 0, true),
    mkTile(2, 'a', 800, 0, 0, false),
    mkTile(3, 'b', 1200, 0, 0, false),
    mkTile(4, 'b', 1600, 0, 0, false)
  );
  s.tray = [0, 1];
  const res = CORE.hint(s);
  assert(res.ok && res.id === 2, '应推荐能凑三消的 tile#2，实际 ' + res.id);
  assert(s.toolUses.hint === 0, '提示次数应扣减');

  const s2 = mkState();
  s2.toolUses.hint = 1;
  const faces7 = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (let i = 0; i < 6; i++) s2.tiles.push(mkTile(i, faces7[i], i * 400, 0, 0, true));
  s2.tiles.push(mkTile(6, 'z', 2400, 0, 0, false));
  s2.tray = [0, 1, 2, 3, 4, 5];
  const res2 = CORE.hint(s2);
  assert(res2.ok === false && res2.reason === 'unsafe', '无安全牌应返回 unsafe');
  assert(s2.toolUses.hint === 1, '无建议时不消耗提示');
})();

/* 7. 被压住的牌不可点 */
section('7. 覆盖牌不可点');
(function () {
  const s = CORE.createLevel('easy', makeFaces(10), mulberry(7));
  const covered = s.tiles.filter((t) => CORE.isCovered(s, t));
  assert(covered.length > 0, '多层布局应存在被压住的牌');
  const res = CORE.pick(s, covered[0].id);
  assert(res.ok === false && res.reason === 'covered', '被压住的牌不可点');
  assert(s.moves === 0 && s.tray.length === 0, '失败点击不应改变状态');
})();

console.log('\n========================================');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) { process.exit(1); }
console.log('全部通过 ✅');
