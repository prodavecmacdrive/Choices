import Utils from "../core/framework/Utils";

export default class FinalWindow {
    constructor({ scene, container, onCta }) {
        this._scene = scene;
        this._container = container;
        this._onCta = onCta;
        this._lastCtaTime = 0;

        this._isShown = false;
        this._handDismissed = false;
        this._overlay = null;
        this._finalImg = null;
        this._btnRestart = null;
        this._btnTryAgain = null;
        this._helperHand = null;
        this._helperHandTimer = null;
        this._buttons = [];

        this._buildOverlay();

        if (this._scene?.input) {
            this._scene.input.on('pointerdown', this._onPointerDown, this);
        }

        this.setVisible(false);
    }

    _onPointerDown() {
        if (this._isShown) {
            this._clearHelperHand();
        }
    }

    setButtons(buttons) {
        this._buttons = buttons || [];
    }

    _buildOverlay() {
        this._overlay = this._scene.add.graphics();
        this._renderDimmer();
        this._overlay.setDepth(100);
        this._overlay.setAlpha(0);

        this._container.add(this._overlay);
    }

    _renderDimmer() {
        if (!this._overlay) return;
        this._overlay.clear();

        const width = this._scene.scale?.width || 600;
        const height = this._scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;

        const leftX = 300 - (screenW / 2) - 100;
        const topY = 450 - (screenH / 2) - 100;
        const totalW = screenW + 200;
        const totalH = screenH + 200;

        this._overlay.fillStyle(0x000000, 0.75);
        this._overlay.fillRect(leftX, topY, totalW, totalH);
    }

    setVisible(visible) {
        if (this._overlay) this._overlay.setVisible(visible);
        if (this._finalImg) this._finalImg.setVisible(visible);
        if (this._btnRestart) this._btnRestart.setVisible(visible);
        if (this._btnTryAgain) this._btnTryAgain.setVisible(visible);
        if (this._helperHand) this._helperHand.setVisible(visible);
    }

    show(options = {}) {
        if (this._isShown) return;
        this._isShown = true;
        this._handDismissed = false;

        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_FAILED');
            window.trackAxonEvent('ENDCARD_SHOWN');
        }

        // Stop all character movement and looping footstep/walk SFX
        if (this._scene?.storyController && typeof this._scene.storyController.stopAllWalkSounds === 'function') {
            this._scene.storyController.stopAllWalkSounds();
        } else if (this._scene?.storyController && typeof this._scene.storyController._stopAllWalkSounds === 'function') {
            this._scene.storyController._stopAllWalkSounds();
        }
        if (this._scene?.sound?.sounds) {
            this._scene.sound.sounds.forEach(snd => {
                if (snd) {
                    const markerName = snd.currentMarker?.name || snd.key;
                    if (markerName === 'steps_walk' || markerName === 'walk_loop' || markerName === 'footsteps') {
                        try { snd.stop(); } catch (e) { }
                    }
                }
            });
        }

        try {
            Utils.addAudio(this._scene, 'fail_stinger', 1.0);
        } catch (e) {}

        this.setVisible(true);

        const width = this._scene.scale?.width || 600;
        const height = this._scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;
        const isPortrait = width < height;
        const screenTop = 450 - (screenH / 2);

        // 1. Dimmer Overlay Fade In
        this._renderDimmer();
        this._overlay.setAlpha(0);
        this._scene.tweens.add({
            targets: this._overlay,
            alpha: 1,
            duration: 350,
            ease: 'Quad.easeOut'
        });

        // 2. Graphic (final_img.png): Centered horizontally in the upper-middle section of screen above overlay
        const finalScale = isPortrait ? 1.05 : 0.72;
        const finalY = screenTop + (screenH * (isPortrait ? 0.33 : 0.28));

        if (!this._finalImg || !this._finalImg.active) {
            this._finalImg = this._scene.add.image(300, finalY, 'final_img');
            this._finalImg.setOrigin(0.5, 0.5);
            this._finalImg.setDepth(105);
            this._container.add(this._finalImg);
        } else {
            this._finalImg.setPosition(300, finalY);
            this._finalImg.setVisible(true);
        }
        this._finalImg.setScale(0);

        this._scene.tweens.add({
            targets: this._finalImg,
            scaleX: finalScale,
            scaleY: finalScale,
            duration: 500,
            delay: 150,
            ease: 'Back.easeOut'
        });

        // 3. Dual Action Buttons: Two interactive buttons placed side-by-side beneath final_img.png
        // Left: btn_restart_red.png, Right: btn_try_again_green.png
        const btnScale = isPortrait ? 0.46 : 0.36;
        const btnSpacing = isPortrait ? 122 : 130;
        const btnY = finalY + (isPortrait ? 180 : 152);

        const restartX = 300 - btnSpacing;
        const tryAgainX = 300 + btnSpacing;

        // Restart (red)
        if (!this._btnRestart || !this._btnRestart.active) {
            this._btnRestart = this._scene.add.image(restartX, btnY, 'btn_restart_red');
            this._btnRestart.setOrigin(0.5, 0.5);
            this._btnRestart.setDepth(110);
            this._btnRestart.setInteractive({ useHandCursor: true });
            this._container.add(this._btnRestart);
        } else {
            this._btnRestart.setPosition(restartX, btnY);
            this._btnRestart.setVisible(true);
            this._btnRestart.setInteractive({ useHandCursor: true });
        }
        this._btnRestart.setScale(0);

        // Try Again (green)
        if (!this._btnTryAgain || !this._btnTryAgain.active) {
            this._btnTryAgain = this._scene.add.image(tryAgainX, btnY, 'btn_try_again_green');
            this._btnTryAgain.setOrigin(0.5, 0.5);
            this._btnTryAgain.setDepth(110);
            this._btnTryAgain.setInteractive({ useHandCursor: true });
            this._container.add(this._btnTryAgain);
        } else {
            this._btnTryAgain.setPosition(tryAgainX, btnY);
            this._btnTryAgain.setVisible(true);
            this._btnTryAgain.setInteractive({ useHandCursor: true });
        }
        this._btnTryAgain.setScale(0);

        this._scene.tweens.add({
            targets: [this._btnRestart, this._btnTryAgain],
            scaleX: btnScale,
            scaleY: btnScale,
            duration: 500,
            delay: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                this._startPulseAnimation(btnScale);
                this._spawnHelperHand();
            }
        });

        // Click handlers
        const onButtonClick = (btnObj) => {
            try {
                Utils.addAudio(this._scene, 'click', 1.0);
            } catch (e) { }

            this._clearHelperHand();

            this._scene.tweens.add({
                targets: btnObj,
                scaleX: btnScale * 0.9,
                scaleY: btnScale * 0.9,
                duration: 90,
                yoyo: true,
                onComplete: () => {
                    this._handleCtaClick();
                }
            });
        };

        this._btnRestart.off('pointerdown');
        this._btnRestart.on('pointerdown', () => onButtonClick(this._btnRestart));

        this._btnTryAgain.off('pointerdown');
        this._btnTryAgain.on('pointerdown', () => onButtonClick(this._btnTryAgain));
    }

    _spawnHelperHand() {
        if (!this._scene?.textures?.exists('helper_hand')) return;
        if (!this._btnTryAgain || !this._btnTryAgain.active) return;
        if (!this._isShown || this._handDismissed) return;

        if (!this._helperHand || !this._helperHand.active) {
            this._helperHand = this._scene.add.image(0, 0, 'helper_hand');
            this._helperHand.setOrigin(0.12, 0.05);
            this._helperHand.setScale(0.42);
            this._helperHand.setDepth(200);
            this._container.add(this._helperHand);
        }

        const targetBtn = this._btnTryAgain;
        const handX = targetBtn.x + 25;
        const handY = targetBtn.y + 25;

        this._helperHand.setPosition(handX + 25, handY + 25);
        this._helperHand.setAlpha(0);
        this._helperHand.setVisible(true);

        this._scene.tweens.add({
            targets: this._helperHand,
            x: handX,
            y: handY,
            alpha: 1,
            duration: 300,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (!this._helperHand || !this._helperHand.active || !this._isShown || this._handDismissed) return;
                this._scene.tweens.add({
                    targets: this._helperHand,
                    scaleX: 0.36,
                    scaleY: 0.36,
                    y: handY + 10,
                    duration: 180,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        });
    }

    _startPulseAnimation(baseScale = 0.46) {
        if (!this._btnRestart || !this._btnTryAgain) return;
        this._scene.tweens.killTweensOf([this._btnRestart, this._btnTryAgain]);
        this._scene.tweens.add({
            targets: [this._btnRestart, this._btnTryAgain],
            scaleX: baseScale * 1.05,
            scaleY: baseScale * 1.05,
            duration: 750,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    _clearHelperHand() {
        this._handDismissed = true;
        if (this._helperHandTimer) {
            this._helperHandTimer.remove();
            this._helperHandTimer = null;
        }
        if (this._helperHand) {
            this._scene.tweens.killTweensOf(this._helperHand);
            this._helperHand.destroy();
            this._helperHand = null;
        }
    }

    onResize(isPortrait) {
        if (!this._isShown) return;

        this._renderDimmer();

        const width = this._scene.scale?.width || 600;
        const height = this._scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;
        const screenTop = 450 - (screenH / 2);

        const finalScale = isPortrait ? 1.05 : 0.72;
        const finalY = screenTop + (screenH * (isPortrait ? 0.33 : 0.28));

        if (this._finalImg && this._finalImg.active) {
            this._finalImg.setPosition(300, finalY);
            this._finalImg.setScale(finalScale);
        }

        const btnScale = isPortrait ? 0.46 : 0.36;
        const btnSpacing = isPortrait ? 122 : 130;
        const btnY = finalY + (isPortrait ? 180 : 152);

        if (this._btnRestart && this._btnRestart.active) {
            this._btnRestart.setPosition(300 - btnSpacing, btnY);
            this._btnRestart.setScale(btnScale);
        }
        if (this._btnTryAgain && this._btnTryAgain.active) {
            this._btnTryAgain.setPosition(300 + btnSpacing, btnY);
            this._btnTryAgain.setScale(btnScale);
        }
        if (this._helperHand && this._helperHand.active) {
            this._helperHand.setPosition(300 + btnSpacing + 25, btnY + 25);
        }
    }

    _handleCtaClick() {
        this._clearHelperHand();
        const now = performance.now();
        if (now - this._lastCtaTime < 500) return;
        this._lastCtaTime = now;

        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_RETRY');
            window.trackAxonEvent('ENDCARD_CLICK');
        }

        if (this._onCta) {
            this._onCta();
        } else if (window.App && window.App.network) {
            window.App.network.ctaClick();
        }
    }
}
