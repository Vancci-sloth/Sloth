# OCR de Windows (Windows.Media.Ocr, sin instalar nada): imprime las líneas de una imagen con la caja de cada palabra,
# en JSON y en píxeles originales. Lo usa ubicar.py.
#   powershell -NoProfile -ExecutionPolicy Bypass -File ocr.ps1 <imagen> [idioma=en-US]
param([string]$Imagen, [string]$Idioma = "en-US")
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, [Type]$tipo) {
    $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    $t.Result
}

$archivo = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Imagen).Path)) ([Windows.Storage.StorageFile])
$flujo = Esperar ($archivo.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flujo)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Esperar ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Idioma))
if ($null -eq $motor) { $motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
$res = Esperar ($motor.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lineas = foreach ($l in $res.Lines) {
    [pscustomobject]@{ palabras = @(foreach ($w in $l.Words) {
        $r = $w.BoundingRect
        [pscustomobject]@{ t = $w.Text; r = @([int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height) } }) }
}
[pscustomobject]@{ ancho = $bitmap.PixelWidth; alto = $bitmap.PixelHeight; lineas = @($lineas) } | ConvertTo-Json -Depth 6 -Compress
