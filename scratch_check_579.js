const fs = require('fs');

[579, 586].forEach(idx => {
    try {
        const file = `diff_block_line_${idx}.json`;
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            console.log(`Line ${idx} content length:`, data.content?.length);
            const m = data.content?.match(/\[diff_block_start\]([\s\S]*?)\[diff_block_end\]/);
            if (m) {
                console.log(`Line ${idx} diff lines:`, m[1].split('\n').length);
                fs.writeFileSync(`diff_${idx}.txt`, m[1]);
            }
        }
    } catch(e) {
        console.error(e);
    }
});
