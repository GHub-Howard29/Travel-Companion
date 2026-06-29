Set-Location -Path 'D:\Project\Travel-Companion'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'replicate-array.xlsx'
$tmp = 'tmp_replicate_array'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
Get-Content "$tmp\xl\worksheets\sheet1.xml" | Select-String -Pattern '<f|HYPERLINK|hyperlink|rPr|color|underline' | Select-Object -First 100
Remove-Item $tmp -Recurse -Force
