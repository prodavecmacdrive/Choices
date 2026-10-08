const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = 0; i < 50; i++) {
    if (!lines[i]) continue;
    const obj = JSON.parse(lines[i]);
    if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
            if (tc.args?.AbsolutePath?.includes('Game.js')) {
                console.log(`Tool call at line ${i}:`, tc.args);
            }
        }
    }
}
