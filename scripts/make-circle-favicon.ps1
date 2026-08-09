# make-circle-favicon.ps1 — $0, no deps, Windows PowerShell 5.1
# Downloads https://github.com/hariomlohardev.png and saves CIRCULAR PNGs with transparent corners
# Run:  powershell -ExecutionPolicy Bypass -File scripts\make-circle-favicon.ps1
# Output: D:\temp\demo\favicon.png (512) + apple-touch-icon.png (180) + og/avatar-circle.png (512)

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

Save-Circle -url $srcUrl -outPath (Join-Path $root "favicon.png") -size 512
Save-Circle -url $srcUrl -outPath (Join-Path $root "apple-touch-icon.png") -size 180
Save-Circle -url $srcUrl -outPath (Join-Path $root "og/avatar-circle.png") -size 512

Write-Host ""
Write-Host "Done - circular favicons ready:"
Write-Host "  favicon.png (512) - tab"
Write-Host "  apple-touch-icon.png (180) - iOS"
Write-Host "  favicon.svg (already in repo) - SVG circle fallback"
Write-Host "  og/avatar-circle.png (512) - for OG/social if you want"
Write-Host ""
Write-Host "Next:"
Write-Host "  git add favicon.svg favicon.png apple-touch-icon.png og/avatar-circle.png"
Write-Host '  git commit -m "brand: circle favicon - No.01"'
Write-Host "  git push"
