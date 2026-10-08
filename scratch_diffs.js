const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

// Check lines 438 and 440
console.log('=== LINE 438 ===');
console.log(JSON.parse(lines[438]).content);

console.log('=== LINE 440 ===');
console.log(JSON.parse(lines[440]).content);
