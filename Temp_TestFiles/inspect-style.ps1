Set-Location -Path 'D:\Project\Travel-Companion'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'test-style.xlsx'
$temp = 'tmp_style'
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $temp)
Get-Content "$temp\xl\styles.xml" | Select-String -Pattern 'font|color|underline|xf' | Select-Object -First 50
Remove-Item $temp -Recurse -Force
