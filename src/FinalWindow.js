import Utils from "../core/framework/Utils";
import Button from "./Button";
import SETTINGS from "../final-window-settings.json";

export default class FinalWindow {
    constructor({ scene, container, onCta }) {
        this._scene = scene;
        this._container = container;
        this._onCta = onCta;
        this._lastCtaTime = 0;

        this._buttons = [];
        this._isShown = false;
        this._handDismissed = false;
        this._helperHand = null;
        this._helperHandTimer = null;
        this._helperHandSequenceTimer = null;

        this._buildOverlay();
        this._buildButton();

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
        if (this._isShown && !this._handDismissed) {
            this._startHelperHandTimer();
        }
    }

    _buildOverlay() {
        const overlayCfg = SETTINGS.overlay || { color: "#000000", fillAlpha: 0.7, depth: 100 };
        const color = overlayCfg.color ? parseInt(overlayCfg.color.replace("#", ""), 16) : 0x000000;
        const fillAlpha = overlayCfg.fillAlpha !== undefined ? overlayCfg.fillAlpha : 0.7;

        this._overlay = this._scene.add.graphics();
        this._overlay.fillStyle(color, fillAlpha);
        this._overlay.fillRect(-3000, -3000, 6000, 6000);
        this._overlay.setCustomPosition(0, 0);
        this._overlay.setDepth(overlayCfg.depth || 100);
        this._overlay.setAlpha(0);

        this._container.add(this._overlay);
    }

    _buildButton() {
        const btnCfg = SETTINGS.button || {
            texture: "ui_button",
            text: "Install",
            align: "Center",
            portraitX: 0,
            portraitY: 0,
            landscapeX: 0,
            landscapeY: 0,
            pScale: 0.6,
            lScale: 0.6,
            depth: 105
        };

        this._pScale = btnCfg.pScale ?? 0.6;
        this._lScale = btnCfg.lScale ?? 0.6;

        this._btnInstall = new Button({
            scene: this._scene,
            container: this._container,
            texture: btnCfg.texture || "ui_button",
            text: btnCfg.text || "Install",
            align: btnCfg.align || "Center",
            px: btnCfg.portraitX ?? 0,
            py: btnCfg.portraitY ?? 0,
            lx: btnCfg.landscapeX ?? 0,
            ly: btnCfg.landscapeY ?? 0,
            pScaleX: 0,
            pScaleY: 0,
            lScaleX: 0,
            lScaleY: 0,
            depth: btnCfg.depth || 105,
            callback: () => this._handleCtaClick()
        });
    }

    setVisible(visible) {
        this._overlay.setVisible(visible);
        this._btnInstall.setVisible(visible);
    }

    show(buttons = null) {
        if (buttons) {
            this._buttons = buttons;
        }
        this._isShown = true;
        this._handDismissed = false;

        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_SOLVED');
            window.trackAxonEvent('ENDCARD_SHOWN');
        }

        // Explicitly stop all character movement and looping footstep/walk SFX
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

        // Fade in overlay
        const targetAlpha = (SETTINGS.overlay && SETTINGS.overlay.fillAlpha !== undefined)
            ? 1
            : 1;

        this._scene.tweens.add({
            targets: this._overlay,
            alpha: targetAlpha,
            duration: 350,
            ease: 'Power2.easeOut'
        });

        // Animate button entrance
        this._scene.tweens.add({
            targets: this._btnInstall,
            pScaleX: this._pScale,
            pScaleY: this._pScale,
            lScaleX: this._lScale,
            lScaleY: this._lScale,
            duration: 450,
            ease: 'Back.easeOut',
            onComplete: () => {
                this._startPulseAnimation();
            }
        });

        // 1-second delay before helper hand prompts on buttons
        this._startHelperHandTimer();
    }

    _startHelperHandTimer() {
        if (this._handDismissed || !this._isShown) return;
        if (this._helperHandTimer) {
            this._helperHandTimer.remove();
            this._helperHandTimer = null;
        }

        this._helperHandTimer = this._scene.time.delayedCall(1000, () => {
            this._startHelperHand();
        });
    }

    _startHelperHand() {
        if (this._handDismissed || !this._isShown) return;
        if (!this._scene || !this._scene.textures.exists('helper_hand')) return;

        let targetButtons = (this._buttons && this._buttons.length > 0)
            ? this._buttons
            : (this._scene.storyController?.finaleButtons?.length > 0
                ? this._scene.storyController.finaleButtons
                : (this._btnInstall && (this._pScale > 0 || this._lScale > 0) ? [this._btnInstall] : []));

        targetButtons = targetButtons.filter(b => b && b.active && b.visible !== false);
        if (targetButtons.length === 0) return;

        if (this._helperHandSequenceTimer) {
            this._helperHandSequenceTimer.remove();
            this._helperHandSequenceTimer = null;
        }
        if (this._helperHand) {
            this._scene.tweens.killTweensOf(this._helperHand);
        }

        if (!this._helperHand || !this._helperHand.active) {
            this._helperHand = this._scene.add.image(0, 0, 'helper_hand');
            this._helperHand.setOrigin(0.12, 0.05);
            const handScale = 0.44;
            this._helperHand.handBaseScale = handScale;
            this._helperHand.setScale(handScale);
            this._helperHand.setDepth(200);
            this._container.add(this._helperHand);

            const firstBtn = targetButtons[0];
            this._helperHand.setPosition(firstBtn.x + 35, firstBtn.y + 60);
            this._helperHand.setAlpha(0);
        }

        this._runHelperHandLoop(targetButtons, 0);
    }

    _runHelperHandLoop(targetButtons, index = 0) {
        if (this._handDismissed || !this._isShown || !this._helperHand || !this._helperHand.active) return;
        if (!targetButtons || targetButtons.length === 0) return;

        const btn = targetButtons[index % targetButtons.length];
        if (!btn || !btn.active) return;

        const targetX = btn.x + 15;
        const targetY = btn.y + 15;
        const baseScale = this._helperHand.handBaseScale || 0.44;

        // 1. Move hand to button
        this._scene.tweens.add({
            targets: this._helperHand,
            x: targetX,
            y: targetY,
            alpha: 1,
            duration: 380,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (this._handDismissed || !this._isShown || !this._helperHand || !this._helperHand.active) return;

                // 2. Simulate click: press hand down and button down
                this._scene.tweens.add({
                    targets: this._helperHand,
                    scaleX: baseScale * 0.86,
                    scaleY: baseScale * 0.86,
                    y: targetY + 10,
                    duration: 130,
                    ease: 'Quad.easeInOut'
                });

                if (btn.buttonImage) {
                    this._scene.tweens.add({
                        targets: btn.buttonImage,
                        scaleX: 0.92,
                        scaleY: 0.92,
                        duration: 130,
                        ease: 'Quad.easeInOut'
                    });
                }

                this._scene.time.delayedCall(130, () => {
                    if (this._handDismissed || !this._isShown || !this._helperHand || !this._helperHand.active) return;

                    // Release simulated click
                    this._scene.tweens.add({
                        targets: this._helperHand,
                        scaleX: baseScale,
                        scaleY: baseScale,
                        y: targetY,
                        duration: 150,
                        ease: 'Quad.easeInOut'
                    });

                    if (btn.buttonImage) {
                        this._scene.tweens.add({
                            targets: btn.buttonImage,
                            scaleX: 1.0,
                            scaleY: 1.0,
                            duration: 150,
                            ease: 'Quad.easeInOut'
                        });
                    }

                    this._scene.time.delayedCall(150, () => {
                        if (this._handDismissed || !this._isShown || !this._helperHand || !this._helperHand.active) return;

                        // Pause before moving to next target button
                        this._helperHandSequenceTimer = this._scene.time.delayedCall(450, () => {
                            if (this._handDismissed || !this._isShown || !this._helperHand || !this._helperHand.active) return;

                            let currentTargets = (this._buttons && this._buttons.length > 0)
                                ? this._buttons
                                : (this._scene.storyController?.finaleButtons || targetButtons);
                            currentTargets = currentTargets.filter(b => b && b.active && b.visible !== false);
                            if (currentTargets.length === 0) currentTargets = targetButtons;

                            this._runHelperHandLoop(currentTargets, index + 1);
                        });
                    });
                });
            }
        });
    }

    _clearHelperHand() {
        this._handDismissed = true;
        if (this._helperHandTimer) {
            this._helperHandTimer.remove();
            this._helperHandTimer = null;
        }
        if (this._helperHandSequenceTimer) {
            this._helperHandSequenceTimer.remove();
            this._helperHandSequenceTimer = null;
        }
        if (this._helperHand) {
            this._scene.tweens.killTweensOf(this._helperHand);
            this._helperHand.destroy();
            this._helperHand = null;
        }
        const buttons = (this._buttons && this._buttons.length > 0)
            ? this._buttons
            : (this._scene.storyController?.finaleButtons || []);
        buttons.forEach(btn => {
            if (btn && btn.buttonImage) {
                this._scene.tweens.killTweensOf(btn.buttonImage);
                btn.buttonImage.setScale(1.0);
            }
        });
    }

    _startPulseAnimation() {
        this._scene.tweens.add({
            targets: this._btnInstall,
            pScaleX: this._pScale * 1.06,
            pScaleY: this._pScale * 1.06,
            lScaleX: this._lScale * 1.06,
            lScaleY: this._lScale * 1.06,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    _handleCtaClick() {
        this._clearHelperHand();
        const now = performance.now();
        if (now - this._lastCtaTime < 500) return;
        this._lastCtaTime = now;

        if (this._onCta) {
            this._onCta();
        } else if (window.App && window.App.network) {
            window.App.network.ctaClick();
        }
    }
}
