const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');
const file = path.resolve(__dirname, 'replicate.xlsx');
const wb = XLSX.readFile(file, { cellFormula: true });
const ws = wb.Sheets['Expenses'];
console.log('Cell F2:', ws['F2']);
console.log('Formula present:', ws['F2'] && ws['F2'].f ? true : false);
console.log('Value present:', ws['F2'] && ws['F2'].v ? ws['F2'].v : null);
