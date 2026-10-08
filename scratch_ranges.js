const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

const checkLines = [9, 10, 15, 17, 30, 110, 112, 124, 126, 145, 160, 162, 190, 279, 281, 283, 349, 408, 414, 436];
for (const idx of checkLines) {
    if (!lines[idx]) continue;
    const obj = JSON.parse(lines[idx]);
    const firstFew = (obj.content || '').split('\n').slice(0, 7).join('\n');
    console.log(`=== Line ${idx} ===\n${firstFew}\n`);
}
