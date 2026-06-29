const fs = require('fs');
const XLSX = require('xlsx');
const rows = [['消費項目','支出人','幣別代碼','幣別符號','金額','附件下載連結'],['aaa','Howard','JPY','￥',111,'1.png']];
const worksheet = XLSX.utils.aoa_to_sheet(rows);
const cellRef = XLSX.utils.encode_cell({ c: 5, r: 1 });
worksheet[cellRef] = {
  t: 's',
  v: '1.png',
  l: { Target: 'https://example.com/file.png', Tooltip: '1.png' }
};
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, worksheet, 'Expenses');
const data = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
fs.writeFileSync('replicate-link.xlsx', data);
console.log('wrote replicate-link.xlsx', data.length);
