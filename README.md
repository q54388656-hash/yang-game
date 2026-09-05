# 🐑 叠叠羊 —— 羊了个羊同款休闲三消

纯静态网页小游戏，无构建、无依赖，双击即可玩（Chrome / Edge 等现代浏览器）。

## 玩法
1. 点击场上图案，收进底部卡槽；
2. 集齐 **3 个相同图案**自动消除；
3. **清空全场**获胜；卡槽 7 格满且未消除则失败。

提供 **简单 / 普通 / 困难** 三档难度，以及 **撤销 / 洗牌 / 提示** 三种道具（每局限次），并在本机记录各难度最佳步数。

## 文件结构
```
index.html            入口页面
css/style.css         样式
js/core.js            核心玩法逻辑（纯逻辑，浏览器与 Node 测试共用）
js/assets.js          图案加载：本机导入照片 / 共享照片 / 内置占位
js/audio.js           WebAudio 合成音效
js/game.js            界面与控制
assets/manifest.json  共享照片清单（列出 assets/photos 下的文件名）
assets/photos/        放入要“全站共享”的照片
scripts/deploy.ps1    一键部署到 GitHub Pages
scripts/update-manifest.js  扫描照片目录并自动生成 manifest.json
tests/test-core.js    核心逻辑自动化冒烟测试
```

## 本地运行
- **直接双击 index.html**：内置占位图案即可游玩；
- 想看到 `assets/photos/` 的共享照片，需用本地静态服务器（浏览器对 file:// 的 fetch 有限制）：
  ```bash
  npx http-server . -p 8080
  # 或 npx serve .
  ```
  然后访问 `http://localhost:8080`。

## 自定义照片（两种方式）
**A. 游戏内导入（仅本机浏览器可见）**
打开游戏 → “导入我的照片”→ 多选照片 → 新开一局生效；可随时“清空本机导入”。

**B. 放入仓库（所有访客可见）**
1. 把照片复制到 `assets/photos/`（支持 jpg/png/webp/gif/bmp）；
2. 生成清单：`node scripts/update-manifest.js`；
3. 提交并部署即可。照片会作为牌面图案公开，请确保你有使用权。

## 测试
```bash
node tests/test-core.js
```
覆盖：三种难度的张数倍数与覆盖规则、必胜消除路径、卡槽爆满判负、撤销还原（含已消除）、洗牌守恒、提示安全牌、被压牌不可点。

## 部署到 GitHub Pages（公开）
1. 安装 GitHub CLI（需网络）：`winget install --id GitHub.cli`
2. 登录授权：`gh auth login`（按提示在浏览器完成）
3. 一键部署（仓库名默认 `yang-game`，被占用可改）：
   ```powershell
   .\scripts\deploy.ps1
   # 或指定仓库名
   .\scripts\deploy.ps1 -RepoName yang-game-2
   ```
完成后会打印类似 `https://<你的用户名>.github.io/yang-game/` 的分享链接。
