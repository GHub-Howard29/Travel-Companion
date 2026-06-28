const fs = require('fs');
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([['Styled','Regular']]);
ws['A1'] = { t: 's', v: 'Styled', s: { font: { bold: true, color: { rgb: 'FF0000' } } } };
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const data = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
fs.writeFileSync('test-style.xlsx', data);
console.log('wrote test-style.xlsx', data.length);
