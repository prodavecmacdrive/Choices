const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    if (lines[i].includes('I broke the Game.js file')) {
        console.log('User message at line', i);
        const obj = JSON.parse(lines[i]);
        fs.writeFileSync('user_msg_content.txt', obj.content);
        break;
    }
}
