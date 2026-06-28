Set-Location -Path 'D:\Project\Travel-Companion'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'replicate-link.xlsx'
$tmp = 'tmp_replicate_link'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
Write-Host '--- sheet1.xml ---'
Get-Content "$tmp\xl\worksheets\sheet1.xml" | Select-String '<c |<hyperlinks|<hyperlink|<f|<v|r:id|Target|Tooltip' | Select-Object -First 200
Write-Host '--- sheet1.xml.rels ---'
Get-Content "$tmp\xl\worksheets\_rels\sheet1.xml.rels" | Select-String 'Id|Target|TargetMode' | Select-Object -First 50
Write-Host '--- styles.xml ---'
Get-Content "$tmp\xl\styles.xml" | Select-String '<font|<color|underline|<xf|<cellXfs|<fonts|<fills|<borders' | Select-Object -First 200
Remove-Item $tmp -Recurse -Force
