# make-circle-favicon.ps1 — $0, no deps, Windows PowerShell 5.1
# Downloads https://github.com/hariomlohardev.png and saves CIRCULAR PNGs + self-contained SVG (photo embedded as data URI)
# Run:  powershell -ExecutionPolicy Bypass -File scripts\make-circle-favicon.ps1
# Output: favicon.png (512) + apple-touch-icon.png (180) + og/avatar-circle.png (512) + favicon.svg (embedded)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$srcUrl = "https://github.com/hariomlohardev.png"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Save-Circle {
  param(
    [string]$url,
    [string]$outPath,
    [int]$size
  )
  Write-Host "-> $outPath ($size x $size) from $url"
  $wc = New-Object System.Net.WebClient
  $bytes = $wc.DownloadData($url)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $src = [System.Drawing.Image]::FromStream($ms)

  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0,0,$size,$size)
  $g.SetClip($path)
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.ResetClip()

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(20,11,18,32), 2)
  $g.DrawEllipse($pen, 1,1,$size-2,$size-2)

  $dir = Split-Path $outPath -Parent
  if($dir -and -not (Test-Path $dir)){ New-Item -ItemType Directory -Force $dir | Out-Null }
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $src.Dispose()
  $ms.Dispose()
  Write-Host "  saved ok"
}

# 1) PNGs — circular with transparent corners
Save-Circle -url $srcUrl -outPath (Join-Path $root "favicon.png") -size 512
Save-Circle -url $srcUrl -outPath (Join-Path $root "apple-touch-icon.png") -size 180
Save-Circle -url $srcUrl -outPath (Join-Path $root "og/avatar-circle.png") -size 512

# 2) SVG — photo EMBEDDED as base64 so it works offline (no external fetch, no placeholder)
try {
  Write-Host "-> favicon.svg (embedding photo as data URI)"
  $wc2 = New-Object System.Net.WebClient
  $bytes2 = $wc2.DownloadData($srcUrl)
  $b64 = [Convert]::ToBase64String($bytes2)
  $svgPath = Join-Path $root "favicon.svg"
  $svg = @"
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" role="img" aria-label="Hariom Lohar">
  <defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>
  <image href="data:image/png;base64,$b64" xlink:href="data:image/png;base64,$b64" width="100" height="100" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>
  <circle cx="50" cy="50" r="49.5" fill="none" stroke="#0B1220" stroke-opacity=".08"/>
</svg>
"@
  # Write UTF-8 no BOM
  [System.IO.File]::WriteAllText($svgPath, $svg, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "  favicon.svg saved (self-contained, no placeholder)"
} catch {
  Write-Host "  favicon.svg embed failed, keeping fallback HL badge: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done - circular favicons ready:"
Write-Host "  favicon.png (512) - tab PNG circle"
Write-Host "  apple-touch-icon.png (180) - iOS"
Write-Host "  favicon.svg (embedded data URI) - SVG circle, works offline"
Write-Host "  og/avatar-circle.png (512) - for OG/social if you want"
Write-Host ""
Write-Host "Next:"
Write-Host "  git add favicon.svg favicon.png apple-touch-icon.png og/avatar-circle.png"
Write-Host '  git commit -m "brand: circle favicon - No.01"'
Write-Host "  git push"
