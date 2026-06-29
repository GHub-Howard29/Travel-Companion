Set-Location -Path 'D:\Project\Travel-Companion'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = 'replicate-link.xlsx'
$tmp = 'tmp_replicate_link_rels'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
Get-Content "$tmp\xl\worksheets\_rels\sheet1.xml.rels" -ErrorAction Ignore | Select-String -Pattern 'Target|Id' | Select-Object -First 50
Remove-Item $tmp -Recurse -Force
