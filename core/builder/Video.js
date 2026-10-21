const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const config = require('../../config');

module.exports.load = function () {
    if (!fs.existsSync('assets/video')) {
        this.videoLoaded = true;
        this.loadChunck();
        return;
    }

    // Ensure assets/audio/final_music.mp3 exists (extract from pre_final.mp4 if missing)
    try {
        if (!fs.existsSync('assets/audio/final_music.mp3') && fs.existsSync('assets/video/pre_final.mp4')) {
            if (!fs.existsSync('assets/audio')) fs.mkdirSync('assets/audio');
            console.log('[Video] Extracting final_music.mp3 from pre_final.mp4...');
            cp.execFileSync(ffmpeg, [
                '-y',
                '-i', 'assets/video/pre_final.mp4',
                '-vn',
                '-c:a', 'libmp3lame',
                '-b:a', '64k',
                'assets/audio/final_music.mp3'
            ]);
            console.log('[Video] Successfully extracted assets/audio/final_music.mp3');
        }
    } catch (e) {
        console.warn('[Video] Could not extract final_music.mp3:', e.message);
    }

    fs.readdir('assets/video', (err, names) => {
        if (err || !names || names.length === 0) {
            this.videoLoaded = true;
            this.loadChunck();
            return;
        }

        const mp4Files = names.filter(n => n.toLowerCase().endsWith('.mp4'));
        const filesToProcess = [];

        for (const title of mp4Files) {
            const name = title.slice(0, -4);
            if (this.isCurrentVersionAsset(name, 'video')) {
                filesToProcess.push(title);
            }
        }

        if (filesToProcess.length === 0) {
            this.videoLoaded = true;
            this.loadChunck();
            return;
        }

        if (!fs.existsSync('temp')) fs.mkdirSync('temp');

        const compression = Object.assign({
            tune: 'animation',
            preset: 'veryslow',
            crf: 36,
            fps: 24,
            pix_fmt: 'yuv420p',
            profile: 'high',
            stripAudio: false,
            audioBitrate: '48k'  // 128k -> 48k mono
        }, config.videoCompression || {});

        for (const filename of filesToProcess) {
            const name = filename.slice(0, -4).replace(/ /g, "_").replace(/-/g, "_");
            const srcPath = path.join('assets/video', filename);
            let targetPath = srcPath;

            if (config.compressVideo !== false) {
                const tempPath = path.join('temp', 'opt_' + filename);
                const metaPath = path.join('temp', 'opt_' + filename + '.meta.json');
                const srcStat = fs.statSync(srcPath);
                let needCompress = true;

                if (fs.existsSync(tempPath)) {
                    const tempStat = fs.statSync(tempPath);
                    let settingsMatch = false;
                    if (fs.existsSync(metaPath)) {
                        try {
                            const cachedSettings = fs.readFileSync(metaPath, 'utf8');
                            settingsMatch = (cachedSettings === JSON.stringify(compression));
                        } catch (e) {
                            settingsMatch = false;
                        }
                    }
                    // Reuse cached compressed file if valid, not older than source, and settings match
                    if (tempStat.size > 0 && tempStat.mtimeMs >= srcStat.mtimeMs && settingsMatch) {
                        needCompress = false;
                    }
                }

                if (needCompress) {
                    console.log(`[Video] Compressing ${filename} with FFmpeg (${compression.preset}, crf ${compression.crf}, fps ${compression.fps || 'auto'})...`);
                    const args = ['-y', '-i', srcPath];
                    if (compression.stripAudio !== false) args.push('-an');
                    if (compression.fps) args.push('-r', String(compression.fps));
                    if (compression.pix_fmt) args.push('-pix_fmt', compression.pix_fmt);
                    if (compression.profile) args.push('-profile:v', compression.profile);
                    if (compression.tune) args.push('-tune', compression.tune);
                    if (compression.preset) args.push('-preset', compression.preset);
                    if (compression.crf !== undefined) args.push('-crf', String(compression.crf));
                    args.push(tempPath);

                    try {
                        cp.execFileSync(ffmpeg, args);
                        fs.writeFileSync(metaPath, JSON.stringify(compression));
                        console.log(`[Video] Compressed ${filename}: ${(srcStat.size / 1024 / 1024).toFixed(2)} MB -> ${(fs.statSync(tempPath).size / 1024 / 1024).toFixed(2)} MB`);
                    } catch (compErr) {
                        console.error(`[Video] Error compressing ${filename}:`, compErr.message);
                    }
                }

                if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
                    targetPath = tempPath;
                }
            }

            try {
                const base64 = fs.readFileSync(targetPath).toString('base64');
                const dataUri = `data:video/mp4;base64,${base64}`;
                this.resources += `window.App.resources.video['${name}'] = '${dataUri}';`;
            } catch (readErr) {
                console.error(`[Video] Failed to read ${targetPath}:`, readErr.message);
            }
        }

        // Register final_music Base64 directly as well for standalone audio fallback
        if (fs.existsSync('assets/audio/final_music.mp3')) {
            try {
                const audioBase64 = fs.readFileSync('assets/audio/final_music.mp3').toString('base64');
                this.resources += `window.App.resources.audio['final_music'] = 'data:audio/mp3;base64,${audioBase64}';`;
            } catch (e) { }
        }

        this.resources += 'window.App.resources.videos = window.App.resources.video;';
        this.videoLoaded = true;
        this.loadChunck();
    });
};
