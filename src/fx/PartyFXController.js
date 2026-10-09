/**
 * PartyFXController
 * Procedural visual effects controller for Scene 1 party sequence:
 * - Creeping low-lying ground smoke drifting in from off-screen
 * - Overhead colored disco light cones with back-and-forth sweeping sway
 * - Central rhythm sequencer executing pattern-based flashing, pulsing, and strobe overlay
 *
 * All parameters, timings, colors, and rhythm patterns are driven by party_fx.json.
 */

import Utils from '../../core/framework/Utils';

export default class PartyFXController {
    constructor(scene, parentContainer, config, groundY) {
        this.scene = scene;
        this.parentContainer = parentContainer;
        this.config = config;
        this.groundY = groundY;

        this.fxContainer = null;
        this.beamsContainer = null;
        this._maskGraphics = null;
        this._onSceneUpdate = null;
        this._nightOverlay = null;
        this._activeTweens = [];
        this._activePuffs = [];
        this._beamInstances = [];
        this._strobeRect = null;
        this._rhythmTimer = null;
        this._smokeTimer = null;
        this._fadeTimer = null;
        this._tickIndex = 0;
        this._isRunning = false;
        this._isStopping = false;
        this._sparklesSpawned = false;
        this._smokeSpawnSide = 0;
    }

    setGroundY(groundY) {
        this.groundY = groundY;
        if (this._maskGraphics && this.beamsContainer) {
            const cutoffY = this.config?.groundCutoffY !== undefined ? this.config.groundCutoffY : (this.groundY + 147);
            this._maskGraphics.clear();
            this._maskGraphics.fillStyle(0xffffff, 0);
            this._maskGraphics.fillRect(-3000, -3000, 6000, 3000 + cutoffY);
        }
    }

    start() {
        if (this._isRunning) return;
        this._isRunning = true;
        this._isStopping = false;
        this._sparklesSpawned = false;
        this._tickIndex = 0;

        // Container holding all party visual effects
        this.fxContainer = this.scene.add.container(0, 0);
        const containerDepth = this.config?.fxContainerDepth || 35;
        this.fxContainer.setDepth(containerDepth);
        if (this.parentContainer) {
            this.parentContainer.add(this.fxContainer);
            if (typeof this.parentContainer.sort === 'function') {
                this.parentContainer.sort('depth');
            }
        }

        this._setupSmokeTexture();
        this._setupNightOverlay();
        this._setupLightBeams();
        this._setupStrobeOverlay();
        this._startSmokeEmitter();
        this._startRhythmSequencer();
    }

    _getBeamBrightnessCoeff() {
        if (this.config?.beamBrightnessCoefficient !== undefined) return this.config.beamBrightnessCoefficient;
        if (this.config?.beamBrightness !== undefined) return this.config.beamBrightness;
        return 1.0;
    }

    _parseColor(val) {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            if (val.startsWith('0x')) return parseInt(val, 16);
            if (val.startsWith('#')) return parseInt(val.slice(1), 16);
            return parseInt(val, 16);
        }
        return 0xffffff;
    }

    _parseBlendMode(mode) {
        if (typeof window !== 'undefined' && window.Phaser && window.Phaser.BlendModes) {
            if (mode === 'ADD') return window.Phaser.BlendModes.ADD;
            if (mode === 'SCREEN') return window.Phaser.BlendModes.SCREEN;
            if (mode === 'MULTIPLY') return window.Phaser.BlendModes.MULTIPLY;
            return window.Phaser.BlendModes.NORMAL;
        }
        if (mode === 'ADD') return 1;
        if (mode === 'MULTIPLY') return 2;
        if (mode === 'SCREEN') return 3;
        return 0;
    }

    _setupSmokeTexture() {
        const smokeCfg = this.config?.groundSmoke;
        if (!smokeCfg) return;

        const texKey = smokeCfg.puffTextureKey;
        if (this.scene.textures.exists(texKey)) return;

        const size = smokeCfg.puffTextureSize;
        const canvas = this.scene.textures.createCanvas(texKey, size, size);
        if (canvas) {
            const ctx = canvas.context;
            const center = size / 2;
            const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
            if (smokeCfg.puffGradientStops && Array.isArray(smokeCfg.puffGradientStops)) {
                smokeCfg.puffGradientStops.forEach(stop => {
                    grad.addColorStop(stop.offset, stop.color);
                });
            } else {
                grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
                grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.55)');
                grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(center, center, center, 0, Math.PI * 2);
            ctx.fill();
            canvas.refresh();
        }
    }

    _setupNightOverlay() {
        const cfg = this.config?.nightOverlay;
        if (!cfg || !cfg.enabled) return;

        this._nightOverlay = this.scene.add.graphics();
        this._nightOverlay.fillStyle(this._parseColor(cfg.color), 1.0);
        this._nightOverlay.fillRect(cfg.x, cfg.y, cfg.width, cfg.height);
        this._nightOverlay.setDepth(cfg.depth !== undefined ? cfg.depth : 2);
        this._nightOverlay.setAlpha(0); // Start at 0 for smooth fade-in
        this._nightOverlay.setBlendMode(this._parseBlendMode(cfg.blendMode || 'NORMAL'));

        const targetAlpha = cfg.alpha !== undefined ? cfg.alpha : 0.8;
        const nightTween = this.scene.tweens.add({
            targets: this._nightOverlay,
            alpha: targetAlpha,
            duration: 800,
            ease: 'Linear'
        });
        this._activeTweens.push(nightTween);

        // Add to parentContainer (worldContainer) so it renders directly above roadBg (0) and building (1),
        // but below all characters (17-30) and light beams (35)
        if (this.parentContainer) {
            this.parentContainer.add(this._nightOverlay);
            if (typeof this.parentContainer.sort === 'function') {
                this.parentContainer.sort('depth');
            }
        } else if (this.fxContainer) {
            this.fxContainer.add(this._nightOverlay);
        }
    }

    _setupLightBeams() {
        const beams = this.config?.lightBeams;
        if (!beams || !Array.isArray(beams)) return;

        this._beamInstances = [];

        // Container holding light beams, masked by the ground line so edges are cut off at ground level
        this.beamsContainer = this.scene.add.container(0, 0);
        this.beamsContainer.setDepth(this.config?.fxContainerDepth || 35);
        this.beamsContainer.alpha = 0; // Start at 0 for smooth fade-in
        const beamsFadeIn = this.scene.tweens.add({
            targets: this.beamsContainer,
            alpha: 1,
            duration: 800,
            ease: 'Linear'
        });
        this._activeTweens.push(beamsFadeIn);
        if (this.fxContainer) {
            this.fxContainer.add(this.beamsContainer);
        }

        const cutoffY = this.config?.groundCutoffY !== undefined ? this.config.groundCutoffY : (this.groundY + 147);
        this._maskGraphics = this.scene.add.graphics();
        this._maskGraphics.fillStyle(0xffffff, 0);
        this._maskGraphics.fillRect(-3000, -3000, 6000, 3000 + cutoffY);
        const mask = this._maskGraphics.createGeometryMask();
        this.beamsContainer.setMask(mask);

        this._updateMaskTransform = () => {
            if (!this.beamsContainer || !this._maskGraphics) return;
            const tempMatrix = new Phaser.GameObjects.Components.TransformMatrix();
            const tempParentMatrix = new Phaser.GameObjects.Components.TransformMatrix();
            this.beamsContainer.getWorldTransformMatrix(tempMatrix, tempParentMatrix);
            const d = tempMatrix.decomposeMatrix();

            this._maskGraphics.setScale(d.scaleX, d.scaleY);
            this._maskGraphics.x = d.translateX;
            this._maskGraphics.y = d.translateY;
        };

        this._updateMaskTransform();
        this._onSceneUpdate = () => this._updateMaskTransform();
        this.scene.events.on('update', this._onSceneUpdate);

        beams.forEach(cfg => {
            const beamContainer = this.scene.add.container(cfg.sourceX, cfg.sourceY);
            beamContainer.setDepth(cfg.depth);

            const g = this.scene.add.graphics();
            const color = this._parseColor(cfg.color);
            const blend = this._parseBlendMode(cfg.blendMode);

            // Outer colored light cone
            g.fillStyle(color, 1.0);
            const p1 = { x: -cfg.topWidth / 2, y: 0 };
            const p2 = { x: cfg.topWidth / 2, y: 0 };
            const p3 = { x: cfg.bottomWidth / 2, y: cfg.length };
            const p4 = { x: -cfg.bottomWidth / 2, y: cfg.length };
            g.fillPoints([p1, p2, p3, p4], true);

            // Inner core glow for extra realism
            if (cfg.innerCoreWidthRatio && cfg.innerCoreAlphaRatio) {
                const innerTop = cfg.topWidth * cfg.innerCoreWidthRatio;
                const innerBottom = cfg.bottomWidth * cfg.innerCoreWidthRatio;
                g.fillStyle(0xffffff, cfg.innerCoreAlphaRatio);
                const ip1 = { x: -innerTop / 2, y: 0 };
                const ip2 = { x: innerTop / 2, y: 0 };
                const ip3 = { x: innerBottom / 2, y: cfg.length };
                const ip4 = { x: -innerBottom / 2, y: cfg.length };
                g.fillPoints([ip1, ip2, ip3, ip4], true);
            }

            g.setBlendMode(blend);
            beamContainer.add(g);

            // Initial alpha: resting at minAlpha so beams never completely disappear (scaled by brightness coefficient)
            const initialBaseAlpha = cfg.minAlpha !== undefined ? cfg.minAlpha : cfg.baseAlpha;
            beamContainer.alpha = initialBaseAlpha * this._getBeamBrightnessCoeff();

            // Sway back and forth across dance floor
            const startAngle = cfg.baseAngle - cfg.swayAngle / 2;
            const endAngle = cfg.baseAngle + cfg.swayAngle / 2;
            beamContainer.angle = startAngle;

            const swayTween = this.scene.tweens.add({
                targets: beamContainer,
                angle: endAngle,
                duration: cfg.swayDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this._activeTweens.push(swayTween);

            if (this.beamsContainer) {
                this.beamsContainer.add(beamContainer);
            }

            this._beamInstances.push({
                config: cfg,
                container: beamContainer,
                swayTween: swayTween,
                activeDecayTween: null
            });
        });
    }

    _setupStrobeOverlay() {
        const strobeCfg = this.config?.strobeOverlay;
        if (!strobeCfg) return;

        this._strobeRect = this.scene.add.graphics();
        this._strobeRect.fillStyle(this._parseColor(strobeCfg.color), 1.0);
        this._strobeRect.fillRect(
            strobeCfg.x - strobeCfg.width / 2,
            strobeCfg.y - strobeCfg.height / 2,
            strobeCfg.width,
            strobeCfg.height
        );
        this._strobeRect.setDepth(strobeCfg.depth);
        this._strobeRect.setBlendMode(this._parseBlendMode(strobeCfg.blendMode));
        this._strobeRect.setAlpha(0);

        if (this.fxContainer) {
            this.fxContainer.add(this._strobeRect);
        }
    }

    _startSmokeEmitter() {
        const smokeCfg = this.config?.groundSmoke;
        if (!smokeCfg || !smokeCfg.enabled) return;

        this._smokeTimer = this.scene.time.addEvent({
            delay: smokeCfg.spawnIntervalMs,
            loop: true,
            callback: () => {
                if (!this._isRunning || this._isStopping) return;
                // Alternate spawning between left and right
                const side = this._smokeSpawnSide % 2 === 0 ? 'left' : 'right';
                this._smokeSpawnSide++;
                this._spawnSmokePuff(side);
            }
        });
    }

    _spawnSmokePuff(side) {
        const cfg = this.config?.groundSmoke;
        if (!cfg) return;

        const isLeft = side === 'left';
        const startX = isLeft ? cfg.spawnLeftX : cfg.spawnRightX;
        const groundBaseline = this.groundY + cfg.groundOffsetY;
        const startY = groundBaseline + (Math.random() - 0.5) * cfg.spawnYJitter;

        const puff = this.scene.add.image(startX, startY, cfg.puffTextureKey);
        puff.setDepth(cfg.depth);
        puff.setTint(this._parseColor(cfg.tint));
        puff.setBlendMode(this._parseBlendMode(cfg.blendMode));
        puff.setScale(cfg.scaleStart);
        puff.setAlpha(0);

        if (this.fxContainer) {
            this.fxContainer.add(puff);
        }
        this._activePuffs.push(puff);

        const speedX = cfg.speedXMin + Math.random() * (cfg.speedXMax - cfg.speedXMin);
        const travelDistX = speedX * (cfg.lifespanMs / 1000);
        const targetX = isLeft ? (startX + travelDistX) : (startX - travelDistX);
        const targetY = startY + cfg.driftY;

        // 1. Horizontal movement
        const moveXTween = this.scene.tweens.add({
            targets: puff,
            x: targetX,
            duration: cfg.lifespanMs,
            ease: 'Linear'
        });
        this._activeTweens.push(moveXTween);

        // 2. Vertical subtle drift
        const moveYTween = this.scene.tweens.add({
            targets: puff,
            y: targetY,
            duration: cfg.lifespanMs,
            ease: 'Sine.easeInOut'
        });
        this._activeTweens.push(moveYTween);

        // 3. Scaling expansion
        const scaleTween = this.scene.tweens.add({
            targets: puff,
            scaleX: cfg.scaleEnd,
            scaleY: cfg.scaleEnd,
            duration: cfg.lifespanMs,
            ease: 'Sine.easeOut'
        });
        this._activeTweens.push(scaleTween);

        // 4. Alpha lifecycle: fade in -> hold -> fade out
        const fadeInTime = cfg.lifespanMs * cfg.fadeInRatio;
        const fadeOutTime = cfg.lifespanMs * cfg.fadeOutRatio;
        const holdTime = Math.max(0, cfg.lifespanMs - fadeInTime - fadeOutTime);

        const alphaFadeIn = this.scene.tweens.add({
            targets: puff,
            alpha: cfg.baseAlpha,
            duration: fadeInTime,
            ease: 'Sine.easeOut',
            onComplete: () => {
                if (!this._isRunning || this._isStopping) return;
                const alphaFadeOut = this.scene.tweens.add({
                    targets: puff,
                    alpha: 0,
                    delay: holdTime,
                    duration: fadeOutTime,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        this._removePuff(puff);
                    }
                });
                this._activeTweens.push(alphaFadeOut);
            }
        });
        this._activeTweens.push(alphaFadeIn);
    }

    _removePuff(puff) {
        const idx = this._activePuffs.indexOf(puff);
        if (idx !== -1) {
            this._activePuffs.splice(idx, 1);
        }
        if (puff && puff.destroy) {
            puff.destroy();
        }
    }

    _startRhythmSequencer() {
        const tickDur = this.config?.tickDuration || 130;
        this._rhythmTimer = this.scene.time.addEvent({
            delay: tickDur,
            loop: true,
            callback: () => {
                if (!this._isRunning || this._isStopping) return;
                this._onRhythmTick();
            }
        });
    }

    _onRhythmTick() {
        const currIndex = this._tickIndex;

        // 1. Process Strobe Overlay
        const strobeCfg = this.config?.strobeOverlay;
        if (strobeCfg && strobeCfg.enabled && this._strobeRect && strobeCfg.pattern) {
            const strobeChar = strobeCfg.pattern[currIndex % strobeCfg.pattern.length];
            if (strobeChar === '1') {
                this._triggerStrobeFlash(strobeCfg);
            }
        }

        // 2. Process Light Beams
        const coeff = this._getBeamBrightnessCoeff();
        this._beamInstances.forEach(instance => {
            const cfg = instance.config;
            const container = instance.container;
            if (!container || !cfg.pattern) return;

            const char = cfg.pattern[currIndex % cfg.pattern.length];
            const digit = parseInt(char, 10) || 0;

            const minAlpha = (cfg.minAlpha !== undefined ? cfg.minAlpha : 0.12) * coeff;
            const baseAlpha = cfg.baseAlpha * coeff;
            const peakAlpha = cfg.peakAlpha * coeff;

            if (cfg.alwaysOn) {
                // Continuous beam with rhythmic soft pulse on beat
                if (digit > 0) {
                    if (instance.activeDecayTween) {
                        instance.activeDecayTween.stop();
                        instance.activeDecayTween.remove();
                    }
                    container.alpha = (cfg.baseAlpha + cfg.pulseAlphaBoost) * coeff;
                    container.scaleX = cfg.pulseScaleBoost;

                    instance.activeDecayTween = this.scene.tweens.add({
                        targets: container,
                        alpha: baseAlpha,
                        scaleX: 1.0,
                        duration: cfg.pulseDecayDuration || cfg.decayDuration,
                        ease: 'Sine.easeInOut'
                    });
                    this._activeTweens.push(instance.activeDecayTween);
                }
            } else {
                // Beams 1-3: softly pulse on active beat, resting at minAlpha on off-beat (never disappear completely)
                if (instance.activeDecayTween) {
                    instance.activeDecayTween.stop();
                    instance.activeDecayTween.remove();
                    instance.activeDecayTween = null;
                }

                if (digit > 0) {
                    // Soft pulse peaking based on digit, then softly decaying back to minAlpha
                    const pulsePeak = minAlpha + (peakAlpha - minAlpha) * (digit / 3.0);
                    container.alpha = pulsePeak;

                    instance.activeDecayTween = this.scene.tweens.add({
                        targets: container,
                        alpha: minAlpha,
                        duration: cfg.decayDuration,
                        ease: 'Sine.easeInOut'
                    });
                    this._activeTweens.push(instance.activeDecayTween);
                } else {
                    // Softly hold minAlpha (never disappear completely)
                    container.alpha = minAlpha;
                }
            }
        });

        this._tickIndex++;
    }

    _triggerStrobeFlash(strobeCfg) {
        if (!this._strobeRect) return;

        this.scene.tweens.killTweensOf(this._strobeRect);
        this._strobeRect.alpha = strobeCfg.peakAlpha;

        const strobeTween = this.scene.tweens.add({
            targets: this._strobeRect,
            alpha: 0,
            duration: strobeCfg.decayDuration,
            ease: 'Quad.easeOut'
        });
        this._activeTweens.push(strobeTween);
    }

    stop() {
        if (!this._isRunning || this._isStopping) return;
        this._isStopping = true;

        const fadeDuration = this.config?.fadeOutBeforeExitMs || 1000;

        // Cancel rhythm and smoke timers immediately
        if (this._rhythmTimer) {
            this._rhythmTimer.remove();
            this._rhythmTimer = null;
        }
        if (this._smokeTimer) {
            this._smokeTimer.remove();
            this._smokeTimer = null;
        }

        // Smoothly fade out darkening overlay
        if (this._nightOverlay) {
            this.scene.tweens.killTweensOf(this._nightOverlay);
            const nightFade = this.scene.tweens.add({
                targets: this._nightOverlay,
                alpha: 0,
                duration: fadeDuration,
                ease: 'Power2.easeOut',
                onComplete: () => {
                    if (this._nightOverlay) this._nightOverlay.setVisible(false);
                }
            });
            this._activeTweens.push(nightFade);
        }

        // Smoothly fade out beams container
        if (this.beamsContainer) {
            this.scene.tweens.killTweensOf(this.beamsContainer);
            const beamsFade = this.scene.tweens.add({
                targets: this.beamsContainer,
                alpha: 0,
                duration: fadeDuration,
                ease: 'Power2.easeOut'
            });
            this._activeTweens.push(beamsFade);
        }

        // Smoothly fade out light beams
        this._beamInstances.forEach(instance => {
            if (instance.activeDecayTween) {
                instance.activeDecayTween.stop();
                instance.activeDecayTween.remove();
                instance.activeDecayTween = null;
            }
            if (instance.container) {
                const fadeTween = this.scene.tweens.add({
                    targets: instance.container,
                    alpha: 0,
                    duration: fadeDuration,
                    ease: 'Power2.easeOut'
                });
                this._activeTweens.push(fadeTween);
            }
        });

        // Smoothly fade out strobe overlay
        if (this._strobeRect) {
            this.scene.tweens.killTweensOf(this._strobeRect);
            const strobeFade = this.scene.tweens.add({
                targets: this._strobeRect,
                alpha: 0,
                duration: fadeDuration,
                ease: 'Power2.easeOut'
            });
            this._activeTweens.push(strobeFade);
        }

        // Smoothly fade out active smoke puffs
        this._activePuffs.forEach(puff => {
            if (puff) {
                this.scene.tweens.killTweensOf(puff);
                const puffFade = this.scene.tweens.add({
                    targets: puff,
                    alpha: 0,
                    duration: fadeDuration,
                    ease: 'Power2.easeOut',
                    onComplete: () => {
                        this._removePuff(puff);
                    }
                });
                this._activeTweens.push(puffFade);
            }
        });

        // After fade duration, cleanly destroy everything
        this._fadeTimer = this.scene.time.delayedCall(fadeDuration, () => {
            this.destroy();
        });
    }

    startDawn(duration) {
        if (!this._nightOverlay) return;
        const cfg = this.config?.nightOverlay;
        const fadeDuration = duration !== undefined ? duration : (cfg?.dawnFadeDuration || 3000);
        const ease = cfg?.dawnFadeEase || 'Sine.easeInOut';

        this.scene.tweens.killTweensOf(this._nightOverlay);
        if (this.beamsContainer) {
            this.scene.tweens.killTweensOf(this.beamsContainer);
        }

        const initialNightAlpha = this._nightOverlay.alpha > 0 ? this._nightOverlay.alpha : (cfg?.alpha !== undefined ? cfg.alpha : 0.8);

        const dawnTween = this.scene.tweens.add({
            targets: this._nightOverlay,
            alpha: 0,
            duration: fadeDuration,
            ease: ease,
            onUpdate: (tween, target) => {
                // The more transparent the nightOverlay becomes, the more transparent the rays become
                if (this.beamsContainer && initialNightAlpha > 0) {
                    const ratio = Math.max(0, Math.min(1, target.alpha / initialNightAlpha));
                    this.beamsContainer.alpha = ratio;
                }
            },
            onComplete: () => {
                if (this._nightOverlay) {
                    this._nightOverlay.setVisible(false);
                }
                if (this.beamsContainer) {
                    this.beamsContainer.alpha = 0;
                }
            }
        });
        this._activeTweens.push(dawnTween);
    }

    focusOnGirl(girlPuppet) {
        if (!this._isRunning || this._isStopping) return;

        const focusCfg = this.config?.focus || {};

        // 1. Stop rhythm sequencer timer so beams and strobe stop blinking/pulsing
        if (this._rhythmTimer) {
            this._rhythmTimer.remove();
            this._rhythmTimer = null;
        }

        // 2. Start dawn transition: night overlay gradually disappears as dawn arrives
        this.startDawn();

        // 3. Turn off strobe / bright light overlay when converging on the girl
        if (this._strobeRect) {
            this.scene.tweens.killTweensOf(this._strobeRect);
            const targetStrobeAlpha = focusCfg.strobeAlpha !== undefined ? focusCfg.strobeAlpha : 0;
            if (targetStrobeAlpha > 0) {
                const strobeDuration = focusCfg.strobeDuration || 1200;
                const strobeEase = focusCfg.strobeEase || 'Sine.easeInOut';

                const strobeFocusTween = this.scene.tweens.add({
                    targets: this._strobeRect,
                    alpha: targetStrobeAlpha,
                    duration: strobeDuration,
                    ease: strobeEase
                });
                this._activeTweens.push(strobeFocusTween);
            } else {
                this._strobeRect.alpha = 0;
            }
        }

        // 4. Beams continue to move smoothly, one after the other, converging on the girl's legs
        const girlX = girlPuppet ? girlPuppet.x : -115;
        const girlTargetOffsetY = focusCfg.girlTargetOffsetY !== undefined ? focusCfg.girlTargetOffsetY : 75;
        const girlY = (girlPuppet ? girlPuppet.y : this.groundY) + girlTargetOffsetY;

        const rawFocusAlpha = focusCfg.beamFocusAlpha !== undefined ? focusCfg.beamFocusAlpha : 0.23;
        const beamFocusAlpha = rawFocusAlpha * this._getBeamBrightnessCoeff();
        const beamFocusScale = focusCfg.beamFocusScale || 1.15;
        const convergeDur = focusCfg.beamConvergeDuration || 1100;
        const staggerMs = focusCfg.beamStaggerMs !== undefined ? focusCfg.beamStaggerMs : 240;
        const focusEase = focusCfg.beamEase || 'Quad.easeInOut';
        const microSway = focusCfg.beamLockMicroSway !== undefined ? focusCfg.beamLockMicroSway : 1.0;

        this._beamInstances.forEach((instance, idx) => {
            const cfg = instance.config;
            const container = instance.container;
            if (!container) return;

            // Compute exact aiming angle from beam source to girl
            // Beam is drawn down along positive Y; angle = atan2(dy, dx) - 90 deg
            const dx = girlX - cfg.sourceX;
            const dy = girlY - cfg.sourceY;
            let targetAngle = (Math.atan2(dy, dx) * 180 / Math.PI) - 90;
            while (targetAngle > 180) targetAngle -= 360;
            while (targetAngle < -180) targetAngle += 360;

            const delay = idx * staggerMs;

            const timer = this.scene.time.delayedCall(delay, () => {
                if (!this._isRunning || this._isStopping) return;

                // Stop previous swaying/decay tweens smoothly at moment of convergence
                if (instance.swayTween) {
                    instance.swayTween.stop();
                    instance.swayTween.remove();
                    instance.swayTween = null;
                }
                if (instance.activeDecayTween) {
                    instance.activeDecayTween.stop();
                    instance.activeDecayTween.remove();
                    instance.activeDecayTween = null;
                }
                this.scene.tweens.killTweensOf(container);

                // Smoothly sweep angle towards girl and boost alpha & scale to spotlight intensity
                const convergeTween = this.scene.tweens.add({
                    targets: container,
                    angle: targetAngle,
                    alpha: beamFocusAlpha,
                    scaleX: beamFocusScale,
                    duration: convergeDur,
                    ease: focusEase,
                    onComplete: () => {
                        if (!this._isRunning || this._isStopping) return;
                        // Lock firmly onto the girl with subtle living micro-sway
                        const lockTween = this.scene.tweens.add({
                            targets: container,
                            angle: { from: targetAngle - microSway, to: targetAngle + microSway },
                            duration: 1800,
                            yoyo: true,
                            repeat: -1,
                            ease: 'Sine.easeInOut'
                        });
                        this._activeTweens.push(lockTween);
                    }
                });
                this._activeTweens.push(convergeTween);
            });
            this._activeTweens.push(timer);
        });
    }

    sparkleOnGirl(girlPuppet) {
        if (!this._isRunning || this._isStopping) return;
        const celebCfg = this.config?.celebration || {};
        this._spawnGirlCelebrationParticles(girlPuppet, celebCfg);
        this._sparklesSpawned = true;
        try {
            Utils.addAudio(this.scene, 'magic_sparkle', 1.0);
        } catch (e) { }
    }

    finishParty(girlPuppet) {
        if (!this._isRunning) return;
        this._isStopping = true;

        const celebCfg = this.config?.celebration || {};
        const fadeDuration = 800; // Smooth disappearance
        const fadeEase = celebCfg.fadeOutEase || 'Power2.easeOut';

        // 1. Smoothly fade out darkening overlay
        if (this._nightOverlay) {
            this.scene.tweens.killTweensOf(this._nightOverlay);
            const nightFade = this.scene.tweens.add({
                targets: this._nightOverlay,
                alpha: 0,
                duration: fadeDuration,
                ease: fadeEase,
                onComplete: () => {
                    if (this._nightOverlay) this._nightOverlay.setVisible(false);
                }
            });
            this._activeTweens.push(nightFade);
        }

        // 2. Smoothly fade out beams container
        if (this.beamsContainer) {
            this.scene.tweens.killTweensOf(this.beamsContainer);
            const beamsFade = this.scene.tweens.add({
                targets: this.beamsContainer,
                alpha: 0,
                duration: fadeDuration,
                ease: fadeEase
            });
            this._activeTweens.push(beamsFade);
        }

        // 3. Fade strobe into alpha 0
        if (this._strobeRect) {
            this.scene.tweens.killTweensOf(this._strobeRect);
            const strobeFade = this.scene.tweens.add({
                targets: this._strobeRect,
                alpha: 0,
                duration: fadeDuration,
                ease: fadeEase
            });
            this._activeTweens.push(strobeFade);
        }

        // 4. Fade all beams into alpha 0
        this._beamInstances.forEach(instance => {
            if (instance.container) {
                this.scene.tweens.killTweensOf(instance.container);
                const beamFade = this.scene.tweens.add({
                    targets: instance.container,
                    alpha: 0,
                    duration: fadeDuration,
                    ease: fadeEase
                });
                this._activeTweens.push(beamFade);
            }
        });

        // 3. Stop smoke timer and fade out active smoke puffs
        if (this._smokeTimer) {
            this._smokeTimer.remove();
            this._smokeTimer = null;
        }
        this._activePuffs.forEach(puff => {
            if (puff) {
                this.scene.tweens.killTweensOf(puff);
                const puffFade = this.scene.tweens.add({
                    targets: puff,
                    alpha: 0,
                    duration: fadeDuration,
                    ease: fadeEase,
                    onComplete: () => {
                        this._removePuff(puff);
                    }
                });
                this._activeTweens.push(puffFade);
            }
        });

        // 4. If sparkles were not already spawned 2s earlier, spawn them now as fallback
        if (!this._sparklesSpawned && girlPuppet) {
            this.sparkleOnGirl(girlPuppet);
        }

        // 5. Clean up after fade completes
        const totalSparkleTime = (celebCfg.maxDelayMs || 400) + (celebCfg.fadeInDuration || 240) + (celebCfg.holdDuration || 120) + (celebCfg.fadeOutDuration || 260) + 150;
        const cleanupDelay = this._sparklesSpawned ? fadeDuration : Math.max(fadeDuration, totalSparkleTime);
        this._fadeTimer = this.scene.time.delayedCall(cleanupDelay, () => {
            this.destroy();
        });
    }

    finishPartyAndFlashGirl(girlPuppet) {
        this.finishParty(girlPuppet);
    }

    _setupParticleTexture(key, size) {
        if (this.scene.textures.exists(key)) return;
        const canvas = this.scene.textures.createCanvas(key, size, size);
        if (canvas) {
            const ctx = canvas.context;
            const center = size / 2;
            const radius = size * 0.46;

            const grad = ctx.createRadialGradient(center, center, 0, center, center, radius);
            grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
            grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.95)');
            grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.4)');
            grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.fill();
            canvas.refresh();
        }
    }

    _spawnGirlCelebrationParticles(girlPuppet, celebCfg) {
        const texKey = celebCfg.particleTextureKey || 'party_sparkle_particle';
        const texSize = celebCfg.particleTextureSize || 16;
        this._setupParticleTexture(texKey, texSize);

        const girlX = girlPuppet ? girlPuppet.x : -115;
        const girlY = (girlPuppet ? girlPuppet.y : this.groundY);

        const particleCount = celebCfg.particleCount || 42;
        const colors = celebCfg.particleColors || ['0xffd700', '0xff007f', '0x00f0ff', '0x00ff88', '0x9d00ff', '0xffffff'];
        const minScale = celebCfg.particleMinScale || 0.35;
        const maxScale = celebCfg.particleMaxScale || 0.7;
        const depth = celebCfg.particleDepth || 45;
        const blendMode = celebCfg.blendMode || 'ADD';

        const modelWidth = celebCfg.modelWidth || 80;
        const modelHeight = celebCfg.modelHeight || 190;
        const centerOffsetY = celebCfg.modelCenterOffsetY !== undefined ? celebCfg.modelCenterOffsetY : -25;

        const minDelay = celebCfg.minDelayMs || 0;
        const maxDelay = celebCfg.maxDelayMs || 400;
        const fadeInDur = celebCfg.fadeInDuration || 240;
        const fadeInEase = celebCfg.fadeInEase || 'Sine.easeInOut';
        const holdDur = celebCfg.holdDuration || 120;
        const fadeOutDur = celebCfg.fadeOutDuration || 260;
        const fadeOutEase = celebCfg.fadeOutEase || 'Sine.easeInOut';

        // Static particles distributed smoothly across the entire model of the girl
        for (let i = 0; i < particleCount; i++) {
            const offsetX = (Math.random() - 0.5) * modelWidth;
            const offsetY = centerOffsetY + (Math.random() - 0.5) * modelHeight;
            const px = girlX + offsetX;
            const py = girlY + offsetY;

            const p = this.scene.add.image(px, py, texKey);
            p.setDepth(depth);
            const colorHex = colors[Math.floor(Math.random() * colors.length)];
            p.setTint(this._parseColor(colorHex));
            p.setBlendMode(this._parseBlendMode(blendMode));

            const targetScale = minScale + Math.random() * (maxScale - minScale);
            p.setScale(targetScale * 0.4);
            p.setAlpha(0);

            if (this.parentContainer) {
                this.parentContainer.add(p);
            }

            const delay = minDelay + Math.random() * (maxDelay - minDelay);

            // Smooth appearance and disappearance with random delays, completely static position
            const inTween = this.scene.tweens.add({
                targets: p,
                alpha: 1.0,
                scaleX: targetScale,
                scaleY: targetScale,
                delay: delay,
                duration: fadeInDur,
                ease: fadeInEase,
                onComplete: () => {
                    const outTween = this.scene.tweens.add({
                        targets: p,
                        alpha: 0,
                        scaleX: targetScale * 0.4,
                        scaleY: targetScale * 0.4,
                        delay: holdDur,
                        duration: fadeOutDur,
                        ease: fadeOutEase,
                        onComplete: () => {
                            p.destroy();
                        }
                    });
                    this._activeTweens.push(outTween);
                }
            });
            this._activeTweens.push(inTween);
        }
    }

    destroy() {
        this._isRunning = false;
        this._isStopping = false;

        if (this._rhythmTimer) {
            this._rhythmTimer.remove();
            this._rhythmTimer = null;
        }
        if (this._smokeTimer) {
            this._smokeTimer.remove();
            this._smokeTimer = null;
        }
        if (this._fadeTimer) {
            this._fadeTimer.remove();
            this._fadeTimer = null;
        }

        // Stop all active tweens
        this._activeTweens.forEach(t => {
            if (t && t.stop) {
                t.stop();
                t.remove();
            }
        });
        this._activeTweens = [];

        // Destroy beam instances
        this._beamInstances.forEach(instance => {
            if (instance.swayTween) {
                instance.swayTween.stop();
                instance.swayTween.remove();
            }
            if (instance.activeDecayTween) {
                instance.activeDecayTween.stop();
                instance.activeDecayTween.remove();
            }
            if (instance.container) {
                instance.container.destroy();
            }
        });
        this._beamInstances = [];

        // Destroy strobe rect
        if (this._strobeRect) {
            this.scene.tweens.killTweensOf(this._strobeRect);
            this._strobeRect.destroy();
            this._strobeRect = null;
        }

        // Destroy active puffs
        this._activePuffs.forEach(puff => {
            if (puff && puff.destroy) {
                this.scene.tweens.killTweensOf(puff);
                puff.destroy();
            }
        });
        this._activePuffs = [];

        // Remove update listener & destroy mask graphics
        if (this._onSceneUpdate) {
            this.scene.events.off('update', this._onSceneUpdate);
            this._onSceneUpdate = null;
        }
        if (this._maskGraphics) {
            if (this.beamsContainer && this.beamsContainer.clearMask) {
                this.beamsContainer.clearMask();
            }
            this._maskGraphics.destroy();
            this._maskGraphics = null;
        }
        if (this.beamsContainer) {
            this.beamsContainer.destroy();
            this.beamsContainer = null;
        }

        // Destroy night overlay
        if (this._nightOverlay) {
            this.scene.tweens.killTweensOf(this._nightOverlay);
            if (this.parentContainer && typeof this.parentContainer.remove === 'function') {
                this.parentContainer.remove(this._nightOverlay);
            }
            this._nightOverlay.destroy();
            this._nightOverlay = null;
        }

        // Destroy root fxContainer
        if (this.fxContainer) {
            this.fxContainer.destroy();
            this.fxContainer = null;
        }
    }
}
