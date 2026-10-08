const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

const obj = JSON.parse(lines[558]);
console.log('Keys of line 558:', Object.keys(obj));
console.log(JSON.stringify(obj, null, 2).slice(0, 1000));
fs.writeFileSync('line_558.json', JSON.stringify(obj, null, 2));
