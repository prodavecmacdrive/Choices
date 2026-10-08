const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');

const obj = JSON.parse(lines[614]);
console.log('Line 614 keys:', Object.keys(obj));
for (const k of Object.keys(obj)) {
    console.log(k, typeof obj[k]);
}
if (obj.thinking) {
    console.log('Thinking length:', obj.thinking.length);
}
