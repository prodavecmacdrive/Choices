const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (lines[i].includes('Game.js') && lines[i].includes('view_file')) {
        try {
            const obj = JSON.parse(lines[i]);
            console.log('Line', i, 'type:', obj.type);
            if (obj.tool_calls) {
                console.log(JSON.stringify(obj.tool_calls));
            }
        } catch(e) {}
    }
}
