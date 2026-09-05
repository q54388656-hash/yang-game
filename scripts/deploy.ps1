# deploy.ps1 —— 一键部署到公开 GitHub Pages
# 用法： .\scripts\deploy.ps1 [-RepoName yang-game]
param(
  [string]$RepoName = "yang-game"
)
$ErrorActionPreference = "Stop"

function Fail($msg) {
  Write-Host "❌ $msg" -ForegroundColor Red
  exit 1
}

# 1) 检查 gh
gh --version | Out-Null 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail "未安装 GitHub CLI。请先运行： winget install --id GitHub.cli ，然后 gh auth login"
}

# 2) 检查登录
gh auth status | Out-Null 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail "尚未登录 GitHub。请先运行： gh auth login"
}

# 3) 统一默认分支为 main
git branch -M main

# 4) 有照片则刷新 manifest
if (Get-Command node -ErrorAction SilentlyContinue) {
  node "$PSScriptRoot\update-manifest.js"
}

# 5) 创建仓库（若已有 origin 则直接推送）
$remote = git remote get-url origin 2>$null
if (-not $remote) {
  Write-Host "创建公开仓库 $RepoName 并推送…" -ForegroundColor Cyan
  gh repo create $RepoName --public --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) {
    Fail "建仓失败（可能仓库名已被占用）。可用： .\scripts\deploy.ps1 -RepoName $RepoName-2"
  }
} else {
  Write-Host "检测到已有远程，直接推送…" -ForegroundColor Cyan
  git push -u origin main
}

# 6) 开启 GitHub Pages（main 分支 / 根目录）
$owner = gh api user -q .login
if (-not $owner) { Fail "无法获取 GitHub 用户名" }
Write-Host "开启 GitHub Pages…" -ForegroundColor Cyan
try {
  gh api -X POST "repos/$owner/$RepoName/pages" -f "source[branch]=main" -f "source[path]=/" | Out-Null
} catch {
  Write-Host "（Pages 可能已开启，尝试读取状态）" -ForegroundColor Yellow
}

Start-Sleep -Seconds 3
$url = "https://$owner.github.io/$RepoName/"
Write-Host ""
Write-Host "✅ 部署完成！" -ForegroundColor Green
Write-Host "仓库： https://github.com/$owner/$RepoName"
Write-Host "游戏： $url"
Write-Host ""
Write-Host "提示：首次开启 Pages 后，页面可能需要 1~2 分钟生效。" -ForegroundColor Yellow
