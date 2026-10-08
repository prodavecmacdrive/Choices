const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = 435; i <= 445; i++) {
    if (!lines[i]) continue;
    const obj = JSON.parse(lines[i]);
    console.log(`=== LINE ${i} (${obj.type}) ===`);
    if (obj.tool_calls) {
        console.log('Tool calls:', JSON.stringify(obj.tool_calls, null, 2));
    }
    if (obj.content) {
        console.log('Content preview:', obj.content.slice(0, 200));
    }
}
