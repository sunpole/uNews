#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$InputPath,
    [Parameter(Position=1)]
    [string]$PatchnotePath,
    [string]$OutputPath,
    [ValidateSet("TelegramChannel")]
    [string]$Preset = "TelegramChannel",
    [int]$TargetWidth = 1600,
    [int]$TargetHeight = 1000,
    [switch]$Open
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
Add-Type -AssemblyName System.Drawing

function Get-FullPath([string]$Path) {
    return [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
}

function Set-FrontMatterValue {
    param([string]$Text,[string]$Name,[string]$Value)

    if ($Text -notmatch "\\A---\\s*\\r?\\n") {
        throw "Patchnote must start with YAML front matter."
    }

    $pattern = "(?m)^" + [regex]::Escape($Name) + ":.*$"
    $line = $Name + ": " + $Value

    if ([regex]::IsMatch($Text, $pattern)) {
        return [regex]::Replace(
            $Text,
            $pattern,
            [Text.RegularExpressions.MatchEvaluator]{ param($m) $line },
            1
        )
    }

    $second = $Text.IndexOf("---", 3)
    if ($second -lt 0) { throw "Cannot find closing YAML front matter delimiter." }
    return $Text.Insert($second, $line + [Environment]::NewLine)
}

$inputFull = Get-FullPath $InputPath
$patchFull = $null
if ($PatchnotePath) { $patchFull = Get-FullPath $PatchnotePath }

if (-not $OutputPath) {
    if (-not $patchFull) {
        throw "Provide -OutputPath or a patchnote with image: in front matter."
    }
    $patchText = [IO.File]::ReadAllText($patchFull, [Text.Encoding]::UTF8)
    $match = [regex]::Match($patchText, "(?m)^image:\\s*([^\\r\\n]+)\\s*$")
    if (-not $match.Success) { throw "Patchnote has no image: field." }

    $imageName = $match.Groups[1].Value.Trim()
    if ($imageName -match "[\\/]" -or $imageName.Contains("..")) {
        throw "image: must be a simple file name in the same news folder."
    }
    $OutputPath = Join-Path (Split-Path -Parent $patchFull) $imageName
}
elseif (-not [IO.Path]::IsPathRooted($OutputPath) -and $patchFull) {
    $OutputPath = Join-Path (Split-Path -Parent $patchFull) $OutputPath
}

$outputFull = [IO.Path]::GetFullPath($OutputPath)
$ext = [IO.Path]::GetExtension($outputFull).ToLowerInvariant()
if ($ext -notin @(".png", ".jpg", ".jpeg")) {
    throw "Output must be PNG or JPEG."
}

$source = [Drawing.Image]::FromFile($inputFull)
try {
    if ($source.Width -lt 1200 -or $source.Height -lt 700) {
        throw "Use a full Telegram Desktop screenshot of at least 1200x700."
    }
    if ($source.Width -le $source.Height) {
        throw "TelegramChannel preset expects a landscape desktop screenshot."
    }

    # Tested capture contract:
    # target post near the top; private chat list stays left of this crop.
    $cropX = [Math]::Round($source.Width * 0.195)
    $cropY = [Math]::Round($source.Height * 0.030)
    $cropW = [Math]::Round($source.Width * 0.580)
    $cropH = [Math]::Round($cropW * $TargetHeight / $TargetWidth)

    if ($cropY + $cropH -gt $source.Height) {
        $cropH = $source.Height - $cropY
        $cropW = [Math]::Round($cropH * $TargetWidth / $TargetHeight)
    }
    if ($cropX + $cropW -gt $source.Width) {
        throw "Calculated Telegram crop exceeds screenshot bounds."
    }

    $dest = New-Object Drawing.Bitmap $TargetWidth, $TargetHeight, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    try {
        $g = [Drawing.Graphics]::FromImage($dest)
        try {
            $g.Clear([Drawing.Color]::White)
            $g.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality

            $srcRect = New-Object Drawing.Rectangle ([int]$cropX), ([int]$cropY), ([int]$cropW), ([int]$cropH)
            $dstRect = New-Object Drawing.Rectangle 0, 0, $TargetWidth, $TargetHeight
            $g.DrawImage($source, $dstRect, $srcRect, [Drawing.GraphicsUnit]::Pixel)
        }
        finally { $g.Dispose() }

        New-Item -ItemType Directory -Path (Split-Path -Parent $outputFull) -Force | Out-Null

        if ($ext -eq ".png") {
            $dest.Save($outputFull, [Drawing.Imaging.ImageFormat]::Png)
        }
        else {
            $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                Where-Object { $_.MimeType -eq "image/jpeg" } |
                Select-Object -First 1
            $quality = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), 88L
            $params = New-Object Drawing.Imaging.EncoderParameters 1
            $params.Param[0] = $quality
            try { $dest.Save($outputFull, $codec, $params) }
            finally { $quality.Dispose(); $params.Dispose() }
        }
    }
    finally { $dest.Dispose() }

    $sourceHash = (Get-FileHash -LiteralPath $inputFull -Algorithm SHA256).Hash
    $outputHash = (Get-FileHash -LiteralPath $outputFull -Algorithm SHA256).Hash
    $metaName = [IO.Path]::GetFileNameWithoutExtension($outputFull) + ".selfshot.json"
    $metaPath = Join-Path (Split-Path -Parent $outputFull) $metaName

    $meta = [ordered]@{
        schema = 1
        pipeline = "unews-selfshot-v1"
        origin = "real"
        subject = "telegram-channel"
        source_name = [IO.Path]::GetFileName($inputFull)
        source_sha256 = $sourceHash
        source_size = @([int]$source.Width, [int]$source.Height)
        crop = [ordered]@{
            x = [int]$cropX
            y = [int]$cropY
            width = [int]$cropW
            height = [int]$cropH
        }
        output_name = [IO.Path]::GetFileName($outputFull)
        output_sha256 = $outputHash
        output_size = @($TargetWidth, $TargetHeight)
        operations = @("crop", "resize")
        processed_utc = [DateTime]::UtcNow.ToString("o")
        raw_source_committed = $false
    }

    [IO.File]::WriteAllText(
        $metaPath,
        ($meta | ConvertTo-Json -Depth 6) + [Environment]::NewLine,
        (New-Object Text.UTF8Encoding($false))
    )

    if ($patchFull) {
        $text = [IO.File]::ReadAllText($patchFull, [Text.Encoding]::UTF8)
        $text = Set-FrontMatterValue $text "image" ([IO.Path]::GetFileName($outputFull))
        $text = Set-FrontMatterValue $text "image_origin" "real"
        $text = Set-FrontMatterValue $text "image_subject" "telegram-channel"
        $text = Set-FrontMatterValue $text "image_pipeline" "unews-selfshot-v1"
        $text = Set-FrontMatterValue $text "image_meta" $metaName
        [IO.File]::WriteAllText($patchFull, $text, (New-Object Text.UTF8Encoding($false)))
    }

    Write-Host "[OK] uNews SelfShot prepared"
    Write-Host "Image: $outputFull"
    Write-Host "Meta:  $metaPath"
    Write-Host "SHA256: $outputHash"
    Write-Host "Crop: x=$cropX y=$cropY w=$cropW h=$cropH"
    Write-Host "Raw screenshot was not copied into the repository."

    if ($Open) { Start-Process -FilePath $outputFull }
}
finally { $source.Dispose() }
