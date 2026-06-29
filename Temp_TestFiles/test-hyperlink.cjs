const fs = require('fs');
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([['A','B'],['Google','']]);
const ref = 'B2';
ws[ref] = {
  t: 's',
  v: 'Google',
  l: { Target: 'https://www.google.com', Tooltip: 'Google' },
  s: { font: { color: { rgb: '0000FF' }, underline: true } }
};
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const data = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
fs.writeFileSync('test-hyperlink.xlsx', data);
console.log('wrote test-hyperlink.xlsx', data.length);
