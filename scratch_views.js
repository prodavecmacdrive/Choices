const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try {
        const obj = JSON.parse(lines[i]);
        if (obj.content && obj.content.includes('File Path: `file:///d:/playable_gen_2/Cash%20Inc%20Fame/Choices/src/Game.js`')) {
            console.log(`Line ${i}: ${obj.content.split('\n')[4] || ''}`);
        }
    } catch(e) {}
}
