param(
  [string]$OutDir = "temp/linkedin/banners"
)
Add-Type -AssemblyName System.Drawing

$W = 1584
$H = 396

# colors
$paper = [System.Drawing.Color]::FromArgb(255,254,251)
$paper2 = [System.Drawing.Color]::FromArgb(243,240,232)
$sheet = [System.Drawing.Color]::White
$ink = [System.Drawing.Color]::FromArgb(11,18,32)
$muted = [System.Drawing.Color]::FromArgb(110,125,154)
$muted2 = [System.Drawing.Color]::FromArgb(138,154,182)
$grid1 = [System.Drawing.Color]::FromArgb(227,236,251)
$grid2 = [System.Drawing.Color]::FromArgb(201,216,240)
$signal = [System.Drawing.Color]::FromArgb(255,212,0)
$signalSoft = [System.Drawing.Color]::FromArgb(46,255,212,0)
$red = [System.Drawing.Color]::FromArgb(225,6,0)
$blue = [System.Drawing.Color]::FromArgb(0,80,255)
$green = [System.Drawing.Color]::FromArgb(14,159,110)

function New-Font($familyPrefs, $size, $style=[System.Drawing.FontStyle]::Regular) {
  foreach ($fam in $familyPrefs) {
    try {
      $f = New-Object System.Drawing.Font($fam, $size, $style)
      if ($f.Name -eq $fam -or $fam -eq "Segoe UI" -or $fam -eq "Arial") { return $f }
      # if exact match not found, still return first that succeeds
      return $f
    } catch {}
  }
  return New-Object System.Drawing.Font("Arial", $size, $style)
}

# font stacks — fallback to installed
$displayPrefs = @("Bricolage Grotesque","Segoe UI","Arial Black","Arial")
$monoPrefs = @("Fragment Mono","JetBrains Mono","Consolas","Courier New")
$sansPrefs = @("Instrument Sans","Segoe UI","Arial")
$serifPrefs = @("Instrument Serif","Georgia","Times New Roman")

function Draw-Grid($g, $W, $H) {
  $pen1 = New-Object System.Drawing.Pen($grid1,1)
  $pen2 = New-Object System.Drawing.Pen($grid2,1)
  for ($x=0; $x -lt $W; $x+=24) { $g.DrawLine($pen1, $x, 0, $x, $H) }
  for ($y=0; $y -lt $H; $y+=24) { $g.DrawLine($pen1, 0, $y, $W, $y) }
  for ($x=0; $x -lt $W; $x+=120) { $g.DrawLine($pen2, $x, 0, $x, $H) }
  for ($y=0; $y -lt $H; $y+=120) { $g.DrawLine($pen2, 0, $y, $W, $y) }
  $pen1.Dispose(); $pen2.Dispose()
}

function Draw-Washi($g, $x, $y, $w, $h, $rot) {
  $state = $g.Save()
  $g.TranslateTransform($x + $w/2, $y + $h/2)
  $g.RotateTransform($rot)
  $rect = New-Object System.Drawing.RectangleF([float](-$w/2), [float](-$h/2), [float]$w, [float]$h)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200,255,255,255))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(30,11,18,32),1)
  $g.FillRectangle($brush, $rect)
  $g.DrawRectangle($pen, [int](-$w/2), [int](-$h/2), [int]$w, [int]$h)
  # shadow
  $brush.Dispose(); $pen.Dispose(); $g.Restore($state)
}

function Draw-String($g, $text, $font, $brush, $x, $y) {
  $g.DrawString($text, $font, $brush, $x, $y)
}

# ensure out dir
$absOut = Join-Path (Get-Location) $OutDir
if (-not (Test-Path $absOut)) { New-Item -ItemType Directory -Force -Path $absOut | Out-Null }

# helpers for centered text measure
function Measure($g,$text,$font){ $g.MeasureString($text,$font) }

# ---------- Variant 01 ----------
function Make-Variant01 {
  $bmp = New-Object System.Drawing.Bitmap($W,$H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($paper)
  Draw-Grid $g $W $H
  # top ink bar
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($ink)), 0,0,$W,38)
  $fontMonoSmall = New-Font $monoPrefs 9
  $brushPaper = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200,210,230))
  $brushSignal = New-Object System.Drawing.SolidBrush($signal)
  $g.DrawString("LAB NOTEBOOK No.01  -  HARIOM LOHAR  -  HARIOMLOHARDEV.GITHUB.IO  -  INDIA UTC+5:30", $fontMonoSmall, $brushPaper, 18,12)
  # washi top center
  Draw-Washi $g ([int]($W/2 - 60)) (-6) 120 14 (-1)
  # large left title — shifted right to clear LinkedIn profile photo (left ~300px safe)
  $fontDisplayHuge = New-Font $displayPrefs 92 ([System.Drawing.FontStyle]::Bold)
  $fontDisplayHuge2 = New-Font $displayPrefs 92 ([System.Drawing.FontStyle]::Bold)
  $brushInk = New-Object System.Drawing.SolidBrush($ink)
  # HARIOM — safe left 360
  $g.DrawString("HARIOM", $fontDisplayHuge, $brushInk, 360, 52)
  # LOHAR in outline style — simulate with signal bg
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($signal)), 360, 158, 520, 84)
  $g.DrawRectangle((New-Object System.Drawing.Pen($ink,2)), 360,158,520,84)
  $fontDisplayWhite = New-Font $displayPrefs 78 ([System.Drawing.FontStyle]::Bold)
  $brushWhite = New-Object System.Drawing.SolidBrush($ink)
  $g.DrawString("LOHAR", $fontDisplayWhite, $brushWhite, 372, 164)
  # right side meta — shifted right to avoid overlap with new title
  $fontMono = New-Font $monoPrefs 11
  $fontSans = New-Font $sansPrefs 12
  $brushMuted = New-Object System.Drawing.SolidBrush($muted)
  $brushBlue = New-Object System.Drawing.SolidBrush($blue)
  $g.DrawString("PYTHON  |  DJANGO  |  FLUTTER  x  AGI RESEARCH", $fontMono, $brushMuted, 940, 78)
  $fontSansBold = New-Font $sansPrefs 18 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("Harvard CS50P  2026  -  9 psets + final", $fontSansBold, $brushInk, 940, 104)
  $g.DrawString("hariomlohardev  on  GitHub  -  @HariomloharAGI", $fontMono, $brushMuted, 940, 138)
  $fontMonoSmall2 = New-Font $monoPrefs 9
  $g.DrawString("548 DAYS  :  1 JUL 2026  ->  31 DEC 2027  -  DAILY LOGS  -  INDEXNOW", $fontMonoSmall2, $brushMuted, 940, 172)
  # pill LIVE
  $pillRect = New-Object System.Drawing.RectangleF(940, 202, 110, 24)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(14,159,110))), $pillRect.X, $pillRect.Y, $pillRect.Width, $pillRect.Height)
  $g.DrawRectangle((New-Object System.Drawing.Pen($green,1)), [int]$pillRect.X, [int]$pillRect.Y, [int]$pillRect.Width, [int]$pillRect.Height)
  $fontMonoBold = New-Font $monoPrefs 9 ([System.Drawing.FontStyle]::Bold)
  $brushWhite2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.DrawString("  LIVE BENCH", $fontMonoBold, $brushWhite2, 940, 208)
  # bottom signal line
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($signal)), 0, $H-6, $W, 6)
  $g.Dispose()
  $path = Join-Path $absOut "01-classic-lab-header.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "-> $path"
}

# ---------- Variant 02 ----------
function Make-Variant02 {
  $bmp = New-Object System.Drawing.Bitmap($W,$H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($paper)
  Draw-Grid $g $W $H
  # watermark BAYES large stroked
  $fontWatermark = New-Font $displayPrefs 220 ([System.Drawing.FontStyle]::Bold)
  $brushStroke = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24,201,216,240))
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  # simulate stroke by drawing offset? just fill with very light
  $g.DrawString("BAYES", $fontWatermark, $brushStroke, [float]($W/2), 40.0, $fmt)
  # centered sheet card — shifted right to clear profile photo left ~320px
  $cardW = 980; $cardH = 300; $cardX = 380; $cardY = 56
  $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18,11,18,32))
  $g.FillRectangle($shadow, $cardX+6, $cardY+6, $cardW, $cardH)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($sheet)), $cardX, $cardY, $cardW, $cardH)
  $g.DrawRectangle((New-Object System.Drawing.Pen($ink,1)), [int]$cardX, [int]$cardY, [int]$cardW, [int]$cardH)
  Draw-Washi $g ([int]($W/2 - 60)) ([int]($cardY - 7)) 120 14 (-1)
  # inside card content
  $fontMonoLabel = New-Font $monoPrefs 10
  $brushMuted = New-Object System.Drawing.SolidBrush($muted)
  $brushInk = New-Object System.Drawing.SolidBrush($ink)
  $brushBlue = New-Object System.Drawing.SolidBrush($blue)
  $g.DrawString("LAB NOTEBOOK No.01  -  HARIOM LOHAR  (hariomlohardev)  -  INDIA", $fontMonoLabel, $brushMuted, $cardX+22, $cardY+20)
  $fontDisplay = New-Font $displayPrefs 52 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("Hariom Lohar", $fontDisplay, $brushInk, $cardX+22, $cardY+46)
  $fontSans = New-Font $sansPrefs 14
  $g.DrawString("Python  |  Django  |  Flutter  x  AGI Research", $fontSans, $brushInk, $cardX+22, $cardY+116)
  $fontMono2 = New-Font $monoPrefs 11
  $g.DrawString("Harvard CS50P 2026  -  9 psets + final  -  Verify: cs50.harvard.edu  -  548 days log", $fontMono2, $brushMuted, $cardX+22, $cardY+146)
  # signal pill bottom of card
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($signal)), $cardX+22, $cardY+182, 420, 28)
  $g.DrawRectangle((New-Object System.Drawing.Pen($ink,1)), [int]($cardX+22), [int]($cardY+182), 420, 28)
  $fontMonoBold = New-Font $monoPrefs 10 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("hariomlohardev.github.io  -  hariomlohardev  on GitHub", $fontMonoBold, $brushInk, $cardX+32, $cardY+190)
  $fontMonoSmall = New-Font $monoPrefs 9
  $g.DrawString("SPAM CLASSIFIER  -  CNN FROM SCRATCH  -  ATTENTION BY HAND  -  DAILY LOGS", $fontMonoSmall, $brushMuted, $cardX+22, $cardY+226)
  # bottom ink bar inside card
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($ink)), $cardX, $cardY+$cardH-28, $cardW, 28)
  $brushPaper = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200,210,230))
  $fontMonoSmall2 = New-Font $monoPrefs 8
  $g.DrawString("NAIVE BAYES  -  LAPLACE k=1  -  PYODIDE  -  PANDAS  -  TOKENIZE  SCORE  FILTER  STAMP", $fontMonoSmall2, $brushPaper, $cardX+22, $cardY+$cardH-19)
  $g.Dispose()
  $path = Join-Path $absOut "02-washi-polaroid.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "-> $path"
}

# ---------- Variant 03 ----------
function Make-Variant03 {
  $bmp = New-Object System.Drawing.Bitmap($W,$H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($ink)
  # grid in ink — subtle
  $pen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(30,255,255,255),1)
  $pen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18,255,255,255),1)
  for ($x=0; $x -lt $W; $x+=24) { $g.DrawLine($pen1, $x,0,$x,$H) }
  for ($y=0; $y -lt $H; $y+=24) { $g.DrawLine($pen1, 0,$y,$W,$y) }
  for ($x=0; $x -lt $W; $x+=120) { $g.DrawLine($pen2, $x,0,$x,$H) }
  for ($y=0; $y -lt $H; $y+=120) { $g.DrawLine($pen2, 0,$y,$W,$y) }
  # top mono line
  $fontMono = New-Font $monoPrefs 9
  $brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(138,154,182))
  $brushPaper = New-Object System.Drawing.SolidBrush($paper)
  $brushSignal = New-Object System.Drawing.SolidBrush($signal)
  $g.DrawString("LAB NOTEBOOK No.01  -  BENCH  -  INDIA  UTC+5:30  -  NAIVE BAYES  -  LAPLACE k=1", $fontMono, $brushMuted, 18,14)
  # large display left — shifted right to clear photo
  $fontDisplay = New-Font $displayPrefs 86 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("HARIOM", $fontDisplay, $brushPaper, 360, 44)
  $g.DrawString("LOHAR", $fontDisplay, $brushSignal, 360, 128)
  # right side details in paper — shifted right to 900
  $fontSans = New-Font $sansPrefs 13
  $fontMonoSmall = New-Font $monoPrefs 10
  $g.DrawString("hariomlohardev  on  GitHub  -  X @HariomloharAGI", $fontMonoSmall, $brushMuted, 900, 68)
  $fontSansBold = New-Font $sansPrefs 17 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("Python  |  Django  |  Flutter  x  AGI Research", $fontSansBold, $brushPaper, 900, 92)
  $g.DrawString("Harvard CS50P 2026  -  548 days  (1 Jul 2026 -> 31 Dec 2027)", $fontMonoSmall, $brushPaper, 900, 124)
  $g.DrawString("Portfolio: hariomlohardev.github.io  -  9 psets + final verified", $fontMonoSmall, $brushMuted, 900, 150)
  # bottom signal bar with repeating words
  $g.FillRectangle($brushSignal, 0, $H-34, $W, 34)
  $brushInk2 = New-Object System.Drawing.SolidBrush($ink)
  $fontMonoBold = New-Font $monoPrefs 9 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("BAYES  -  LAPLACE  -  DATA.CSV  -  5,572 ROWS  -  PYODIDE  -  P(SPAM|MESSAGE)  -  TOKENIZE  SCORE  FILTER  STAMP  -  DAILY LOGS", $fontMonoBold, $brushInk2, 18, $H-24)
  $g.Dispose()
  $path = Join-Path $absOut "03-grid-blueprint-ink.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "-> $path"
}

# ---------- Variant 04 ----------
function Make-Variant04 {
  $bmp = New-Object System.Drawing.Bitmap($W,$H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($paper)
  Draw-Grid $g $W $H
  # large HL watermark top right stroked
  $fontWatermark = New-Font $displayPrefs 280 ([System.Drawing.FontStyle]::Bold)
  $brushW = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26,201,216,240))
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Far
  $g.DrawString("HL", $fontWatermark, $brushW, [float]($W-18), -10.0, $fmt)
  # top washi — shifted right clear of photo
  Draw-Washi $g 360 12 96 14 (-1)
  # mono kicker — safe
  $fontMono = New-Font $monoPrefs 10
  $brushMuted = New-Object System.Drawing.SolidBrush($muted)
  $brushInk = New-Object System.Drawing.SolidBrush($ink)
  $brushBlue = New-Object System.Drawing.SolidBrush($blue)
  $g.DrawString("HARIOM LOHAR  -  HARIOMLOHARDEV  -  LAB NOTEBOOK No.01", $fontMono, $brushMuted, 360, 42)
  # big name with signal highlight behind LOHAR — safe
  $fontDisplay = New-Font $displayPrefs 88 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("HARIOM", $fontDisplay, $brushInk, 360, 64)
  # measure HARIOM to place LOHAR highlight
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($signal)), 360, 176, 600, 78)
  $g.DrawRectangle((New-Object System.Drawing.Pen($ink,1.5)), 360,176,600,78)
  $fontDisplay2 = New-Font $displayPrefs 80 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("LOHAR", $fontDisplay2, $brushInk, 372, 182)
  # right side mono stack — moved to far right to avoid overlap
  $fontMonoSmall = New-Font $monoPrefs 10
  $fontSans = New-Font $sansPrefs 13
  $g.DrawString("Python  -  Django  -  Flutter  x  AGI", $fontSans, $brushInk, 1060, 98)
  $g.DrawString("Harvard CS50P 2026  -  9 psets + final  (verified)", $fontMonoSmall, $brushMuted, 1060, 128)
  $g.DrawString("hariomlohardev.github.io  -  @HariomloharAGI", $fontMonoSmall, $brushMuted, 1060, 152)
  # bottom line 1px ink — safe
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($ink)), 360, $H-56, $W-390, 1)
  $fontMonoTiny = New-Font $monoPrefs 8
  $g.DrawString("548 DAYS: 1 JUL 2026 -> 31 DEC 2027  -  DAILY LOGS  -  FILE-BASED  -  RSS  -  INDEXNOW  -  PYODIDE BENCH", $fontMonoTiny, $brushMuted, 360, $H-38)
  $fontMonoTiny2 = New-Font $monoPrefs 8
  $brushInk2 = New-Object System.Drawing.SolidBrush($ink)
  $g.DrawString("NAIVE BAYES  -  CNN FROM SCRATCH  -  ATTENTION BY HAND", $fontMonoTiny2, $brushInk2, 360, $H-20)
  $g.Dispose()
  $path = Join-Path $absOut "04-typographic-signal.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "-> $path"
}

# ---------- Variant 05 ----------
function Make-Variant05 {
  $bmp = New-Object System.Drawing.Bitmap($W,$H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($paper2)
  Draw-Grid $g $W $H
  # outer sheet
  $cardX=18; $cardY=18; $cardW=$W-36; $cardH=$H-36
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($sheet)), $cardX,$cardY,$cardW,$cardH)
  $g.DrawRectangle((New-Object System.Drawing.Pen($ink,1.2)), [int]$cardX,[int]$cardY,[int]$cardW,[int]$cardH)
  Draw-Washi $g ([int]($W/2 - 60)) ([int]($cardY - 7)) 120 14 (-1)
  # header inside sheet: left LNB No.01, right bench india — left shifted safe
  $fontMono = New-Font $monoPrefs 9
  $brushMuted = New-Object System.Drawing.SolidBrush($muted)
  $brushInk = New-Object System.Drawing.SolidBrush($ink)
  $g.DrawString("LAB NOTEBOOK No.01  -  BENCH  -  INDIA UTC+5:30", $fontMono, $brushMuted, 360, $cardY+14)
  $g.DrawString("NAIVE BAYES  -  LAPLACE k=1  -  N=5,572", $fontMono, $brushMuted, $cardX+$cardW-260, $cardY+14)
  # title row: HARIOM LOHAR left, pill right — left safe
  $fontDisplay = New-Font $displayPrefs 64 ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("HARIOM LOHAR", $fontDisplay, $brushInk, 360, $cardY+36)
  # pill shipped 2026 top right
  $pillX = $cardX+$cardW-190; $pillY=$cardY+54; $pillW=170; $pillH=26
  $g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(14,159,110))), $pillX,$pillY,$pillW,$pillH)
  $g.DrawRectangle((New-Object System.Drawing.Pen($green,1)), [int]$pillX,[int]$pillY,[int]$pillW,[int]$pillH)
  $fontMonoBold = New-Font $monoPrefs 9 ([System.Drawing.FontStyle]::Bold)
  $brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.DrawString("  SHIPPED 2026", $fontMonoBold, $brushWhite, $pillX+6, $pillY+7)
  # sub mono under title — safe
  $fontMonoSmall = New-Font $monoPrefs 10
  $g.DrawString("hariomlohardev  on  GitHub  -  Harvard CS50P 2026  -  Python | Django | Flutter x AGI", $fontMonoSmall, $brushMuted, 360, $cardY+112)
  # chips row like sample-chips — safe left
  $chips = @("SPAM CLASSIFIER","CNN FROM SCRATCH","ATTENTION BY HAND","DAILY LOG 040")
  $cx = 360; $cy = $cardY+146
  $fontChip = New-Font $monoPrefs 9
  foreach ($c in $chips) {
    $sz = $g.MeasureString($c, $fontChip)
    $w = [int]($sz.Width + 18)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($paper)), $cx,$cy,$w,22)
    $g.DrawRectangle((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(185,200,226),1)), [int]$cx,[int]$cy,[int]$w,22)
    # left accent bar red for spam, green for others alternating
    $accent = if ($c -eq "SPAM CLASSIFIER") { $red } else { $green }
    $g.FillRectangle((New-Object System.Drawing.SolidBrush($accent)), $cx, $cy, 3, 22)
    $g.DrawString($c, $fontChip, $brushInk, $cx+9, $cy+5)
    $cx += $w + 10
  }
  # bottom data strip style — text safe from photo
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($ink)), $cardX, $cardY+$cardH-42, $cardW, 42)
  $brushPaper = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230,240,255))
  $fontMonoTiny = New-Font $monoPrefs 8
  $g.DrawString("PORTFOLIO  hariomlohardev.github.io  -  BLOG  /blog.html  -  FEED  /feed.xml  -  548 DAYS  1 JUL 2026 -> 31 DEC 2027  -  SITEMAP  -  INDEXNOW", $fontMonoTiny, $brushPaper, 360, $cardY+$cardH-26)
  $g.Dispose()
  $path = Join-Path $absOut "05-data-strip-inspect.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "-> $path"
}

Make-Variant01
Make-Variant02
Make-Variant03
Make-Variant04
Make-Variant05

Write-Host "`nDone - 5 banners in $absOut"
Get-ChildItem $absOut | Format-Table Name, Length

# build preview html — minimal to avoid here-string parse issues
$previewPath = Join-Path $absOut "preview.html"
$previewHtml = "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>LinkedIn Banners - Lab Notebook No.01</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Segoe UI,system-ui,sans-serif;background:#FFFEFB;color:#0B1220;padding:24px}h1{font-size:22px;letter-spacing:-.02em;margin-bottom:6px}p{color:#6E7D9A;font-size:13px;margin-bottom:18px}.grid{display:grid;gap:22px}.card{border:1px solid #0B1220;background:#fff;padding:12px;box-shadow:6px 6px 0 rgba(11,18,32,.08)}.card img{width:100%;height:auto;border:1px solid #D9E2EF;display:block}.meta{display:flex;justify-content:space-between;gap:12px;margin-top:10px;font-family:Consolas,monospace;font-size:11px;color:#6E7D9A}.meta b{color:#0B1220}.pick{display:inline-flex;align-items:center;gap:6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid #0B1220;padding:5px 10px;background:#FFD400;color:#0B1220;font-weight:700}.reco{border-color:#0E9F6E;background:#E6F5EF;color:#0E9F6E}</style><h1>LinkedIn Banners - Hariom Lohar x Lab Notebook No.01</h1><p>1584 x 396 - pick one for linkedin.com/in/hariomlohar. Recommended: 01 or 04 for mobile legibility (center-safe).</p><div class='grid'><div class='card'><img src='01-classic-lab-header.png'><div class='meta'><span><b>01 - Classic Lab Header</b> - ink bar + signal LOHAR + live pill. Strongest for hariom lohar search.</span><span class='pick reco'>RECOMMENDED</span></div></div><div class='card'><img src='02-washi-polaroid.png'><div class='meta'><span><b>02 - Washi Polaroid</b> - sheet card + BAYES watermark.</span><span class='pick'>ALT</span></div></div><div class='card'><img src='03-grid-blueprint-ink.png'><div class='meta'><span><b>03 - Blueprint Ink</b> - dark ink, max contrast.</span><span class='pick'>ALT - DARK</span></div></div><div class='card'><img src='04-typographic-signal.png'><div class='meta'><span><b>04 - Typographic Signal</b> - minimal HL watermark, most legible.</span><span class='pick reco'>RECOMMENDED</span></div></div><div class='card'><img src='05-data-strip-inspect.png'><div class='meta'><span><b>05 - Data Strip Inspect</b> - bench chrome + chips.</span><span class='pick'>ALT - TECH</span></div></div></div><p style='margin-top:18px'>Upload: LinkedIn -> Me -> View Profile -> pencil on banner -> Upload photo -> pick PNG -> adjust center-safe (keep name in middle 60%).</p>"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($previewPath, $previewHtml, $utf8)
Write-Host 'preview -> preview.html'
