/* assets.js —— 图案资源管理
   图案优先级：本机导入照片(IndexedDB) > assets/manifest.json 共享照片 > 内置占位 SVG。 */
(function (global) {
  'use strict';

  var DB_NAME = 'yang-game-db';
  var STORE = 'photos';
  var THUMB = 256;
  var FACE_CACHE_VERSION = '20260905c'; // 固定资源版本；恢复原图后更新，避免命中旧压缩图缓存

  /* 默认照片清单兜底：即使 manifest 请求被离线/旧缓存干扰，也保证优先使用照片 */
  var SHARED_PHOTOS = [
    'photo-01.jpg', 'photo-02.jpg', 'photo-03.jpg', 'photo-04.jpg',
    'photo-05.jpg', 'photo-06.jpg', 'photo-07.jpg', 'photo-08.jpg',
    'photo-09.jpg', 'photo-10.jpg', 'photo-11.jpg', 'photo-12.jpg',
    'photo-13.jpg', 'photo-14.jpg', 'photo-15.jpg', 'photo-16.jpg'
  ];

  /* 内置占位：田园可爱表情 + 柔和底色（内联 SVG data URI，任何情况可玩） */
  var PLACEHOLDERS = [
    { name: '小羊', e: '🐑', c: '#fff3d6' }, { name: '小鸡', e: '🐔', c: '#ffe3d0' },
    { name: '小猪', e: '🐷', c: '#fde0ec' }, { name: '奶牛', e: '🐮', c: '#e6e0f5' },
    { name: '小鸭', e: '🦆', c: '#d8f0ff' }, { name: '兔兔', e: '🐰', c: '#ffe9f1' },
    { name: '小马', e: '🐴', c: '#e9e0d4' }, { name: '小猫', e: '🐱', c: '#fff0d6' },
    { name: '小狗', e: '🐶', c: '#e8e2d8' }, { name: '青蛙', e: '🐸', c: '#e2f5d8' },
    { name: '蜜蜂', e: '🐝', c: '#fff2c9' }, { name: '小熊', e: '🐻', c: '#f0e2cf' },
    { name: '乌龟', e: '🐢', c: '#dff0e0' }, { name: '蝴蝶', e: '🦋', c: '#f0e2fa' },
    { name: '玉米', e: '🌽', c: '#fff7d6' }, { name: '苹果', e: '🍎', c: '#ffe0e0' }
  ];

  function svgFace(e, c) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<rect width="120" height="120" rx="20" fill="' + c + '"/>' +
      '<rect width="120" height="120" rx="20" fill="url(#g)"/>' +
      '<text x="60" y="82" font-size="64" text-anchor="middle">' + e + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function buildPlaceholders() {
    return PLACEHOLDERS.map(function (p, i) {
      return { id: 'ph' + i, name: p.name, kind: 'placeholder', url: svgFace(p.e, p.c) };
    });
  }

  /* ---------- IndexedDB：本机导入照片 ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGetAll() {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readonly');
        var all = tx.objectStore(STORE).getAll();
        all.onsuccess = function () { resolve(all.result || []); };
        all.onerror = function () { resolve([]); };
      });
    }).catch(function () { return []; });
  }

  function idbPutAll(items) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        var st = tx.objectStore(STORE);
        for (var i = 0; i < items.length; i++) st.put(items[i]);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  function idbClear() {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  /* ---------- 图片读取与缩略 ---------- */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function fileToThumb(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var size = THUMB, canvas, ctx;
        try {
          canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
          var iw = img.width, ih = img.height;
          var ratio = iw / ih;         // 原图宽高比
          var sw, sh, sx, sy;
          if (ratio > 1) { sh = ih; sw = ih; sx = (iw - sw) / 2; sy = 0; }
          else { sw = iw; sh = iw; sx = 0; sy = (ih - sh) / 2; }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /* ---------- manifest（共享照片） ---------- */
  function loadManifest() {
    /* manifest 请求带版本并强制校验，避免浏览器长期沿用旧清单 */
    return fetch('assets/manifest.json?v=' + FACE_CACHE_VERSION, { cache: 'reload' })
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (j) {
        var photos = j && Array.isArray(j.photos)
          ? j.photos.filter(function (x) { return typeof x === 'string' && x.length > 0; })
          : [];
        return photos.length ? photos : SHARED_PHOTOS;
      })
      .catch(function () { return SHARED_PHOTOS; });
  }

  /* ---------- 对外 API ---------- */
  var state = { imports: [], manifest: [], ready: false, listeners: [] };
  var placeholders = buildPlaceholders();
  var preloadTasks = { total: 0, loaded: 0, failed: 0 };

  function sharedFaceUrl(name) {
    return 'assets/photos/' + encodeURIComponent(name) + '?v=' + FACE_CACHE_VERSION;
  }

  /* 后台预热共享牌面图：不阻塞 init，也不影响玩家立即开始游戏 */
  function preloadSharedFaces(urls) {
    preloadTasks = { total: urls.length, loaded: 0, failed: 0 };
    if (!urls.length) return;
    console.log('[Assets] 牌面图预加载开始：' + urls.length + ' 张');

    setTimeout(function () {
      urls.forEach(function (url) {
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () {
          preloadTasks.loaded++;
          console.log('[Assets] 牌面图进度：' + preloadTasks.loaded + '/' + preloadTasks.total +
            (preloadTasks.failed ? '，失败 ' + preloadTasks.failed : ''));
          if (preloadTasks.loaded + preloadTasks.failed === preloadTasks.total) {
            console.log('[Assets] 牌面图预加载完成：成功 ' + preloadTasks.loaded +
              '，失败 ' + preloadTasks.failed);
          }
        };
        img.onerror = function () {
          preloadTasks.failed++;
          console.warn('[Assets] 牌面图加载失败：' + url);
        };
        /* 游戏牌面用 background-image 渲染；这里的 Image 仅负责提前下载并解码 */
        img.src = url;
      });
    }, 0);
  }

  function notify() {
    for (var i = 0; i < state.listeners.length; i++) {
      try { state.listeners[i](); } catch (e) { /* noop */ }
    }
  }

  function getFaces() {
    var faces = [];
    for (var i = 0; i < state.imports.length; i++) {
      var im = state.imports[i];
      faces.push({ id: 'local_' + im.id, name: im.name, kind: 'local', url: im.dataUrl });
    }
    for (i = 0; i < state.manifest.length; i++) {
      var name = state.manifest[i];
      var clean = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
      faces.push({ id: 'shared_' + name, name: clean, kind: 'shared', url: sharedFaceUrl(name) });
    }
    for (i = 0; i < placeholders.length; i++) faces.push(placeholders[i]);
    return faces;
  }

  function counts() {
    return { local: state.imports.length, shared: state.manifest.length, placeholder: placeholders.length };
  }

  function init() {
    return Promise.all([idbGetAll(), loadManifest()]).then(function (res) {
      var imports = res[0] || [];
      imports.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      state.imports = imports;
      state.manifest = res[1];
      state.ready = true;
      /* 只预热共享照片；本机导入是大体积 DataURL，按需解码更稳 */
      preloadSharedFaces(state.manifest.map(sharedFaceUrl));
      notify();
      return getFaces();
    });
  }

  function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.resolve({ added: 0, total: state.imports.length });
    var seq = files.map(function (file, i) {
      return readFile(file)
        .then(fileToThumb)
        .then(function (thumb) {
          return {
            id: 'p' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1e6),
            name: (file.name || ('照片' + (i + 1))).replace(/\.[a-z0-9]+$/i, ''),
            dataUrl: thumb,
            ts: Date.now() + i
          };
        });
    });
    return Promise.all(seq).then(function (items) {
      var merged = state.imports.concat(items);
      return idbPutAll(merged).then(function (ok) {
        if (ok) { state.imports = merged; notify(); }
        return { added: items.length, total: state.imports.length, saved: ok };
      });
    });
  }

  function resetImports() {
    return idbClear().then(function (ok) {
      if (ok) { state.imports = []; notify(); }
      return ok;
    });
  }

  global.Assets = {
    init: init,
    getFaces: getFaces,
    counts: counts,
    importFiles: importFiles,
    resetImports: resetImports,
    onChange: function (fn) { state.listeners.push(fn); },
    isReady: function () { return state.ready; }
  };
})(window);
