param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawing = [Console]::In.ReadToEnd() | ConvertFrom-Json
$bitmap = [System.Drawing.Bitmap]::new([int]$drawing.width, [int]$drawing.height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
try {
    foreach ($command in $drawing.commands) {
        $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
        try {
            $px = 0.0; $py = 0.0
            foreach ($segment in $command.path) {
                switch ($segment[0]) {
                    'M' { $path.StartFigure(); $px = [double]$segment[1]; $py = [double]$segment[2] }
                    'L' { $path.AddLine([single]$px,[single]$py,[single]$segment[1],[single]$segment[2]); $px = [double]$segment[1]; $py = [double]$segment[2] }
                    'Q' {
                        $cx = [double]$segment[1]; $cy = [double]$segment[2]; $qx = [double]$segment[3]; $qy = [double]$segment[4]
                        $path.AddBezier([single]$px,[single]$py,[single]($px+($cx-$px)*2/3),[single]($py+($cy-$py)*2/3),[single]($qx+($cx-$qx)*2/3),[single]($qy+($cy-$qy)*2/3),[single]$qx,[single]$qy)
                        $px = $qx; $py = $qy
                    }
                    'C' { $path.AddBezier([single]$px,[single]$py,[single]$segment[1],[single]$segment[2],[single]$segment[3],[single]$segment[4],[single]$segment[5],[single]$segment[6]); $px = [double]$segment[5]; $py = [double]$segment[6] }
                    'Z' { $path.CloseFigure() }
                    default { throw ('Unsupported path segment: '+$segment[0]) }
                }
            }
            $color = [System.Drawing.ColorTranslator]::FromHtml([string]$command.style)
            if ($command.kind -eq 'fill') {
                $brush = [System.Drawing.SolidBrush]::new($color)
                try { $graphics.FillPath($brush,$path) } finally { $brush.Dispose() }
            } else {
                $pen = [System.Drawing.Pen]::new($color,[single]$command.lineWidth)
                try { $graphics.DrawPath($pen,$path) } finally { $pen.Dispose() }
            }
        } finally { $path.Dispose() }
    }
    $rectangle = [System.Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height)
    $locked = $bitmap.LockBits($rectangle,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $bytes = [byte[]]::new([Math]::Abs($locked.Stride)*$bitmap.Height)
        [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0,$bytes,0,$bytes.Length)
        [Console]::Out.Write([Convert]::ToBase64String($bytes))
    } finally { $bitmap.UnlockBits($locked) }
} finally { $graphics.Dispose(); $bitmap.Dispose() }
