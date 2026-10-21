import Utils from "../../core/framework/Utils";

/**
 * VideoOverlay manages HTML5 cutscene and looping endcard video playback
 * layered over the Phaser canvas with continuous background audio and interactive CTA layer.
 */
export default class VideoOverlay {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.onCta = options.onCta || (() => {
            if (window.App && window.App.network && typeof window.App.network.ctaClick === 'function') {
                window.App.network.ctaClick();
            }
        });
        this.onRetry = options.onRetry || (() => {
            if (typeof window.trackAxonEvent === 'function') {
                window.trackAxonEvent('CHALLENGE_RETRY');
            }
            if (typeof this.onCta === 'function') {
                this.onCta();
            }
        });

        this._bgMusic = null;
        this._htmlAudio = null;
        this._isTransitioning = false;
        this._isLoopingFinal = false;
        this._handDismissed = false;
        this._helperHandTimer = null;
        this._helperHandSequenceTimer = null;

        this._createDOM();
    }

    _createDOM() {
        // Attach overlay to document.body so it does not interfere with Phaser #app container
        const parent = document.body || document.getElementById('app');

        // 1. Root overlay container (transparent so the game canvas remains visible)
        this.root = document.createElement('div');
        this.root.id = 'video-overlay-root';
        this.root.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100vw',
            'height: 100vh',
            'background: transparent',
            'opacity: 1',
            'display: none',
            'z-index: 9999',
            'overflow: hidden',
            'box-sizing: border-box',
            'pointer-events: none'
        ].join(';');

        // 1.5 Background layer for final video (final_bg.png)
        this.bg = document.createElement('div');
        this.bg.id = 'video-overlay-bg';
        this.bg.style.cssText = [
            'position: absolute',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: 100%',
            'background-repeat: no-repeat',
            'background-position: center center',
            'background-size: cover',
            'pointer-events: none',
            'z-index: 1',
            'display: none',
            'opacity: 0',
            'transition: opacity 450ms ease'
        ].join(';');

        // 2. Video element
        this.video = document.createElement('video');
        this.video.id = 'game-cutscene-video';
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('webkit-playsinline', '');
        this.video.muted = true;
        this.video.setAttribute('muted', '');
        this.video.preload = 'auto';
        this.video.style.cssText = [
            'position: absolute',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: 100%',
            'object-fit: contain',
            'pointer-events: none',
            'display: none',
            'opacity: 0',
            'z-index: 2',
            'background: transparent !important',
            'transition: opacity 450ms ease'
        ].join(';');

        // 2.5 Central Final Image (final_img.png)
        this.finalImg = document.createElement('img');
        this.finalImg.id = 'video-final-img';
        this.finalImg.alt = 'Final';
        this.finalImg.style.cssText = [
            'position: absolute',
            'top: 50%',
            'left: 50%',
            'transform: translate(-50%, -50%) scale(0.9)',
            'max-width: 70vw',
            'max-height: 45vh',
            'width: auto',
            'height: auto',
            'object-fit: contain',
            'pointer-events: none',
            'z-index: 5',
            'display: none',
            'opacity: 0',
            'transition: opacity 350ms ease, transform 350ms ease'
        ].join(';');

        // 3. Interactive CTA layer (click-through to store / retry trigger)
        this.ctaLayer = document.createElement('div');
        this.ctaLayer.id = 'video-cta-layer';
        this.ctaLayer.style.cssText = [
            'position: absolute',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: 100%',
            'display: none',
            'opacity: 0',
            'transition: opacity 350ms ease',
            'pointer-events: auto',
            'cursor: pointer',
            'z-index: 10001',
            'display: none',
            'flex-direction: column',
            'justify-content: flex-end',
            'align-items: center',
            'padding-bottom: 35px',
            'box-sizing: border-box',
            'user-select: none',
            '-webkit-user-select: none'
        ].join(';');

        // Background tap on CTA layer triggers store click-through
        this.ctaLayer.addEventListener('click', (e) => {
            this._handDismissed = true;
            this._clearHelperHand();
            if (e.target.closest('.video-cta-btn')) return; // handled by button
            this._handleCta();
        });

        // Interactive buttons container
        this.buttonsContainer = document.createElement('div');
        this.buttonsContainer.className = 'video-cta-buttons';
        this.buttonsContainer.style.cssText = [
            'display: flex',
            'flex-direction: row',
            'gap: 16px',
            'justify-content: center',
            'align-items: center',
            'pointer-events: auto',
            'z-index: 10002',
            'transition: margin-bottom 0.25s ease'
        ].join(';');

        // Pulse keyframes and responsive styles injection
        if (!document.getElementById('video-cta-keyframes')) {
            const style = document.createElement('style');
            style.id = 'video-cta-keyframes';
            style.textContent = `
                @keyframes videoCtaPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                .video-cta-buttons {
                    transition: margin-bottom 0.25s ease;
                }
                @media (orientation: portrait), (max-aspect-ratio: 1/1) {
                    .video-cta-buttons {
                        margin-bottom: calc(1.5 * var(--video-btn-h, 68px));
                    }
                }
                .video-cta-btn {
                    max-height: 68px;
                    max-width: 44vw;
                    height: auto;
                    cursor: pointer;
                    transition: transform 0.15s ease;
                    animation: videoCtaPulse 1.2s infinite ease-in-out;
                    pointer-events: auto;
                }
                .video-cta-btn:active {
                    transform: scale(0.92) !important;
                }
                .video-cta-btn.hand-pressed {
                    animation-play-state: paused !important;
                    transform: scale(0.9) !important;
                }
            `;
            document.head.appendChild(style);
        }

        // Try Again Button (green)
        this.btnTryAgain = document.createElement('img');
        this.btnTryAgain.className = 'video-cta-btn';
        this.btnTryAgain.alt = 'Try Again';
        this.btnTryAgain.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handDismissed = true;
            this._clearHelperHand();
            this._handleRetry();
        });

        // Restart Button (red)
        this.btnRestart = document.createElement('img');
        this.btnRestart.className = 'video-cta-btn';
        this.btnRestart.alt = 'Restart';
        this.btnRestart.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handDismissed = true;
            this._clearHelperHand();
            this._handleRetry();
        });

        this.buttonsContainer.appendChild(this.btnTryAgain);
        this.buttonsContainer.appendChild(this.btnRestart);
        this.ctaLayer.appendChild(this.buttonsContainer);

        // Helper Hand element (points to buttons and prompts user interaction)
        this.helperHand = document.createElement('img');
        this.helperHand.id = 'video-helper-hand';
        this.helperHand.alt = 'Helper Hand';
        this.helperHand.style.cssText = [
            'position: absolute',
            'top: 0',
            'left: 0',
            'width: 78px',
            'height: auto',
            'pointer-events: none',
            'z-index: 10005',
            'display: none',
            'opacity: 0',
            'transform-origin: 12% 5%',
            'transition: left 0.38s cubic-bezier(0.25, 1, 0.5, 1), top 0.38s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease, opacity 0.25s ease',
            'will-change: transform, left, top, opacity'
        ].join(';');
        this.ctaLayer.appendChild(this.helperHand);

        this.root.appendChild(this.bg);
        this.root.appendChild(this.video);
        this.root.appendChild(this.finalImg);
        this.root.appendChild(this.ctaLayer);
        parent.appendChild(this.root);

        this._onResizeBound = () => {
            this._updateBgLayout();
            this._updateButtonsLayout();
        };
        window.addEventListener('resize', this._onResizeBound);
        window.addEventListener('orientationchange', this._onResizeBound);
    }

    _updateBackground() {
        if (!this.bg) return;
        const textures = window.App?.resources?.textures || {};
        let bgSrc = textures.final_bg;
        if (!bgSrc && this.scene?.textures?.exists('final_bg')) {
            bgSrc = this.scene.textures.get('final_bg')?.getSourceImage()?.src;
        }
        if (bgSrc) {
            this.bg.style.backgroundImage = `url("${bgSrc}")`;
        }
        this._updateBgLayout();
    }

    _updateFinalImg() {
        if (!this.finalImg) return;
        const textures = window.App?.resources?.textures || {};
        let imgSrc = textures.final_img;
        if (!imgSrc && this.scene?.textures?.exists('final_img')) {
            imgSrc = this.scene.textures.get('final_img')?.getSourceImage()?.src;
        }
        if (imgSrc) {
            this.finalImg.src = imgSrc;
        }
    }

    _updateBgLayout() {
        if (!this.bg) return;
        // Behaves the same as location backgrounds in Game.js:
        //  - portrait: fit background height to screen height
        //  - landscape: fit background width to screen width
        //  - centered along the horizon
        this.bg.style.backgroundSize = 'cover';
        this.bg.style.backgroundPosition = 'center center';
    }

    _updateButtonsLayout(isPortrait) {
        if (!this.buttonsContainer || !this.btnTryAgain) return;

        if (isPortrait === undefined) {
            if (window.App?.size?.isPortrait !== undefined) {
                isPortrait = window.App.size.isPortrait;
            } else {
                isPortrait = window.innerHeight > window.innerWidth;
            }
        }

        // Measure rendered button height (or fallback 68px)
        const btnHeight = this.btnTryAgain.offsetHeight || 68;
        if (this.root) {
            this.root.style.setProperty('--video-btn-h', `${btnHeight}px`);
        }

        if (isPortrait) {
            // In portrait orientation, raise buttons by one and a half button heights
            const raiseHeight = Math.round(btnHeight * 1.5);
            this.buttonsContainer.style.marginBottom = `${raiseHeight}px`;
            this.buttonsContainer.classList.add('portrait');
        } else {
            this.buttonsContainer.style.marginBottom = '0px';
            this.buttonsContainer.classList.remove('portrait');
        }
    }

    _updateHelperHandTexture() {
        if (!this.helperHand) return;
        const textures = window.App?.resources?.textures || {};
        let handSrc = textures.helper_hand;
        if (!handSrc && this.scene?.textures?.exists('helper_hand')) {
            handSrc = this.scene.textures.get('helper_hand')?.getSourceImage()?.src;
        }
        if (handSrc) {
            this.helperHand.src = handSrc;
        }
    }

    onResize(isPortrait) {
        this._updateBgLayout();
        this._updateButtonsLayout(isPortrait);
    }

    _updateButtonTextures() {
        const textures = window.App?.resources?.textures || {};
        if (textures.btn_try_again_green) {
            this.btnTryAgain.src = textures.btn_try_again_green;
            this.btnTryAgain.style.display = 'block';
        } else {
            this.btnTryAgain.style.display = 'none';
        }

        if (textures.btn_restart_red) {
            this.btnRestart.src = textures.btn_restart_red;
            this.btnRestart.style.display = 'block';
        } else {
            this.btnRestart.style.display = 'none';
        }
    }

    /**
     * Pre-final Transition & Delay Flow
     * 1. Wait fixed delay of 1000ms.
     * 2. Fade in full-screen black overlay over 400-500ms.
     * 3. Start pre_final.mp4 video playback with final_music.mp3.
     */
    startTransition() {
        if (this._isTransitioning) return;
        this._isTransitioning = true;

        this._updateButtonTextures();
        this._updateBackground();
        this._updateFinalImg();

        // 1. Wait fixed delay of 1000ms while the game scene remains fully visible
        setTimeout(() => {
            this._stopSceneAudio();

            // 2. Make transparent root overlay active without obscuring the game scene
            this.root.style.display = 'block';
            this.root.style.pointerEvents = 'auto';

            // 3. Immediately start simultaneous smooth fade-in of pre_final.mp4 and final_bg.png directly over the game
            this._playPreFinalVideo();
        }, 1000);
    }

    _stopSceneAudio() {
        // Stop walking sounds
        if (this.scene?.storyController && typeof this.scene.storyController._stopAllWalkSounds === 'function') {
            this.scene.storyController._stopAllWalkSounds();
        }

        // Stop background loop
        if (this.scene?.storyController?._mainBgm) {
            try { this.scene.storyController._mainBgm.stop(); } catch (e) { }
        }

        // Stop party loop
        if (this.scene?.storyController?._partyMusic) {
            try { this.scene.storyController._partyMusic.stop(); } catch (e) { }
        }

        // Clean up any remaining sound loops in Phaser sound manager
        if (this.scene?.sound?.sounds) {
            this.scene.sound.sounds.forEach(snd => {
                if (snd && snd.isPlaying && snd.key !== 'final_music') {
                    try { snd.stop(); } catch (e) { }
                }
            });
        }
    }

    /**
     * Pre-final Video Playback with Music
     * Overlays pre_final.mp4 and final_bg.png with simultaneous smooth fade-in directly over the game
     */
    _playPreFinalVideo() {
        const videoResources = window.App?.resources?.video || window.App?.resources?.videos || {};
        const preFinalSrc = videoResources.pre_final;

        if (!preFinalSrc) {
            console.warn('[VideoOverlay] pre_final video not found in resources, transitioning directly to final');
            this._transitionToLoopingFinal();
            return;
        }

        // 1. Set video source to pre_final.mp4 (Base64 data-URI)
        this.video.src = preFinalSrc;
        this.video.currentTime = 0;
        this.video.loop = false;

        // 2. Prepare both background and video at opacity 0
        if (this.bg) {
            this.bg.style.display = 'block';
            this.bg.style.opacity = '0';
        }
        this.video.style.display = 'block';
        this.video.style.opacity = '0';

        // 3. Force browser reflow to guarantee simultaneous CSS opacity transition
        if (this.bg) void this.bg.offsetHeight;
        void this.video.offsetHeight;

        // 4. Smoothly fade in pre_final.mp4 and final_bg.png simultaneously over the visible game
        if (this.bg) {
            this.bg.style.opacity = '1';
        }
        this.video.style.opacity = '1';

        // 5. Start audio and video playback simultaneously with the fade-in
        this._playFinalMusic();

        const playPromise = this.video.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.warn('[VideoOverlay] Video play caught error, enforcing muted:', err);
                this.video.muted = true;
                this.video.play().catch(() => {});
            });
        }

        // 5. Listen for the completion of pre_final.mp4 via the ended event
        this.video.onended = () => {
            this._transitionToLoopingFinal();
        };

        // Safety fallback: if ended event does not fire within expected duration + buffer
        const fallbackDuration = (this.video.duration && !isNaN(this.video.duration) && this.video.duration > 0)
            ? (this.video.duration * 1000) + 1500
            : 58000;

        setTimeout(() => {
            if (!this._isLoopingFinal) {
                console.log('[VideoOverlay] Fallback timer triggered transition to looping final');
                this._transitionToLoopingFinal();
            }
        }, fallbackDuration);
    }

    /**
     * Seamless Transition to Final Window with central final_img and interactive CTA layer
     */
    _transitionToLoopingFinal() {
        if (this._isLoopingFinal) return;
        this._isLoopingFinal = true;

        // 1. Hide and pause video playback (final_window.mp4 removed)
        try {
            this.video.pause();
        } catch (e) { }
        this.video.style.display = 'none';
        this.video.style.opacity = '0';

        // 2. Display final_img in the center
        this._updateFinalImg();
        if (this.finalImg) {
            this.finalImg.style.display = 'block';
            void this.finalImg.offsetHeight;
            this.finalImg.style.opacity = '1';
            this.finalImg.style.transform = 'translate(-50%, -50%) scale(1)';
        }

        // 3. final_music.mp3 is kept playing continuously in the background (untouched)

        // 4. Activate the final interactive layer / CTA overlay positioned above
        this.ctaLayer.style.display = 'flex';
        void this.ctaLayer.offsetHeight;
        this.ctaLayer.style.opacity = '1';

        this._updateButtonsLayout();
        this._updateHelperHandTexture();
        this._startHelperHandTimer();

        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_FAILED');
            window.trackAxonEvent('ENDCARD_SHOWN');
        }
    }

    _startHelperHandTimer() {
        if (this._handDismissed) return;
        this._clearHelperHand();
        this._helperHandTimer = setTimeout(() => {
            this._startHelperHand();
        }, 1000);
    }

    _startHelperHand() {
        if (this._handDismissed || !this._isLoopingFinal) return;
        if (!this.helperHand || !this.helperHand.src) {
            this._updateHelperHandTexture();
        }
        if (!this.helperHand || !this.helperHand.src) return;

        const buttons = [this.btnTryAgain, this.btnRestart].filter(b => b && b.style.display !== 'none');
        if (buttons.length === 0) return;

        this.helperHand.style.display = 'block';
        this._runHelperHandLoop(buttons, 0);
    }

    _runHelperHandLoop(buttons, index = 0) {
        if (this._handDismissed || !this._isLoopingFinal || !this.helperHand) return;
        if (!buttons || buttons.length === 0) return;

        const btn = buttons[index % buttons.length];
        if (!btn || btn.style.display === 'none') return;

        const ctaRect = this.ctaLayer.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();

        if (btnRect.width === 0 || btnRect.height === 0) {
            this._helperHandSequenceTimer = setTimeout(() => {
                this._runHelperHandLoop(buttons, index);
            }, 150);
            return;
        }

        const btnCenterX = (btnRect.left - ctaRect.left) + btnRect.width / 2;
        const btnCenterY = (btnRect.top - ctaRect.top) + btnRect.height / 2;

        const handW = 78;
        const handH = (handW / 186) * 234;
        const targetX = Math.round(btnCenterX - (handW * 0.12));
        const targetY = Math.round(btnCenterY - (handH * 0.05));

        // 1. Travel smoothly to button
        this.helperHand.style.left = `${targetX}px`;
        this.helperHand.style.top = `${targetY}px`;
        this.helperHand.style.opacity = '1';
        this.helperHand.style.transform = 'scale(1)';

        this._helperHandSequenceTimer = setTimeout(() => {
            if (this._handDismissed || !this._isLoopingFinal) return;

            // 2. Press down
            this.helperHand.style.transform = 'scale(0.86) translateY(6px)';
            btn.classList.add('hand-pressed');

            this._helperHandSequenceTimer = setTimeout(() => {
                if (this._handDismissed || !this._isLoopingFinal) return;

                // 3. Release tap
                this.helperHand.style.transform = 'scale(1) translateY(0px)';
                btn.classList.remove('hand-pressed');

                // 4. Pause, then alternate to other button
                this._helperHandSequenceTimer = setTimeout(() => {
                    if (this._handDismissed || !this._isLoopingFinal) return;
                    this._runHelperHandLoop(buttons, index + 1);
                }, 500);
            }, 140);
        }, 400);
    }

    _clearHelperHand() {
        if (this._helperHandTimer) {
            clearTimeout(this._helperHandTimer);
            this._helperHandTimer = null;
        }
        if (this._helperHandSequenceTimer) {
            clearTimeout(this._helperHandSequenceTimer);
            this._helperHandSequenceTimer = null;
        }
        if (this.btnTryAgain) this.btnTryAgain.classList.remove('hand-pressed');
        if (this.btnRestart) this.btnRestart.classList.remove('hand-pressed');
        if (this.helperHand) {
            this.helperHand.style.opacity = '0';
            setTimeout(() => {
                if (this.helperHand && (this._handDismissed || !this._isLoopingFinal)) {
                    this.helperHand.style.display = 'none';
                }
            }, 250);
        }
    }

    _playFinalMusic() {
        if (this._bgMusic) return;

        // Try playback through Phaser audio sprite engine
        try {
            this._bgMusic = Utils.addAudio(this.scene, 'final_music', 1.0, true);
        } catch (e) {
            console.warn('[VideoOverlay] Utils.addAudio final_music failed:', e.message);
        }

        // Secondary fallback to HTML5 Audio if audio sprite is unavailable
        if (!this._bgMusic && window.App?.resources?.audio?.final_music) {
            try {
                this._htmlAudio = new Audio(window.App.resources.audio.final_music);
                this._htmlAudio.loop = true;
                this._htmlAudio.volume = 1.0;
                this._htmlAudio.play().catch(() => {});
            } catch (e) { }
        }
    }

    _handleCta() {
        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CTA_CLICKED');
        }
        if (typeof this.onCta === 'function') {
            this.onCta();
        }
    }

    _handleRetry() {
        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_RETRY');
        }
        if (typeof this.onRetry === 'function') {
            this.onRetry();
        }
    }

    destroy() {
        this._clearHelperHand();
        if (this._bgMusic) {
            try { this._bgMusic.stop(); } catch (e) { }
            this._bgMusic = null;
        }
        if (this._htmlAudio) {
            try { this._htmlAudio.pause(); } catch (e) { }
            this._htmlAudio = null;
        }
        if (this._onResizeBound) {
            window.removeEventListener('resize', this._onResizeBound);
            window.removeEventListener('orientationchange', this._onResizeBound);
            this._onResizeBound = null;
        }
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
    }
}
