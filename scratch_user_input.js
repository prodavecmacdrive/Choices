const fs = require('fs');

const logPath = 'C:/Users/proda/.gemini/antigravity-ide/brain/d869365f-734b-496e-81af-53bc0385482c/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'USER_INPUT') {
            console.log('USER_INPUT at line', i, 'keys:', Object.keys(obj));
            fs.writeFileSync('last_user_input.json', JSON.stringify(obj, null, 2));
            break;
        }
    } catch(e) {}
}
