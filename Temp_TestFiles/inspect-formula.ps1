Set-Location -Path 'D:\Project\Travel-Companion'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'test-formula.xlsx'
$temp = 'tmp_formula'
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $temp)
Get-Content "$temp\xl\worksheets\sheet1.xml" | Select-String -Pattern '<f|HYPERLINK|hyperlink|rPr|color|underline' | Select-Object -First 50
Remove-Item $temp -Recurse -Force
