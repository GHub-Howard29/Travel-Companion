Set-Location -Path 'D:\Project\Travel-Companion'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'replicate-link-style.xlsx'
$tmp = 'tmp_replicate_link_style'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
Write-Host '--- sheet1.xml ---'
Get-Content "$tmp\xl\worksheets\sheet1.xml" | Select-String '<c |<hyperlinks|<hyperlink|<f|<v|r:id|Target|Tooltip|s=' | Select-Object -First 200
Write-Host '--- styles.xml ---'
Get-Content "$tmp\xl\styles.xml" | Select-String '<font|<color|underline|<xf|<cellXfs|<fonts' | Select-Object -First 200
Remove-Item $tmp -Recurse -Force
