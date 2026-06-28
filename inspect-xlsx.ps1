Set-Location -Path 'D:\Project\Travel-Companion'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'test-hyperlink.xlsx'
$temp = 'tmp_xlsx'
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $temp)
Get-Content "$temp\xl\worksheets\sheet1.xml" | Select-String -Pattern 'hyperlink|rPr|color|underline' | Select-Object -First 50
Write-Host '--- styles ---'
Get-Content "$temp\xl\styles.xml" | Select-String -Pattern 'font|color|underline|xf' | Select-Object -First 50
Remove-Item $temp -Recurse -Force
