/* update-manifest.js —— 扫描 assets/photos 目录，自动生成 assets/manifest.json
   用法：往 assets/photos 里丢照片后执行  node scripts/update-manifest.js  */
'use strict';
const fs = require('fs');
const path = require('path');

const photoDir = path.join(__dirname, '..', 'assets', 'photos');
const manifestPath = path.join(__dirname, '..', 'assets', 'manifest.json');
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

let files = [];
try {
  files = fs.readdirSync(photoDir)
    .filter((f) => EXTS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
} catch (e) { /* 目录不存在则空列表 */ }

fs.writeFileSync(manifestPath, JSON.stringify({ photos: files }, null, 2) + '\n', 'utf8');
console.log('manifest.json 已更新，共享照片 ' + files.length + ' 张');
if (files.length) files.forEach((f) => console.log('  - ' + f));
