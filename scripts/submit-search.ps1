# submit-search.ps1 — one-command wrapper for ping-search.js (Google ping retired 2023)
# See: https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/submit-search.ps1
param([switch]$Verbose)
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
if(Get-Command node -ErrorAction SilentlyContinue){
  if($Verbose){ node scripts/ping-search.js --verbose } else { node scripts/ping-search.js }
} else {
  Write-Host "Node not found — Bing ping fallback" -ForegroundColor Yellow
  $sitemap = "https://hariomlohardev.github.io/sitemap.xml"
  Write-Host "Google ping is retired (2023) — rely on robots.txt + lastmod + Search Console" -ForegroundColor Cyan
  try { $r = Invoke-WebRequest "https://www.bing.com/ping?sitemap=$sitemap" -UseBasicParsing -TimeoutSec 8; Write-Host "Bing ping $($r.StatusCode) ok" -ForegroundColor Green } catch { Write-Host "Bing ping failed: $_" -ForegroundColor Red }
  Write-Host "Install Node.js for full check: https://nodejs.org"
}
