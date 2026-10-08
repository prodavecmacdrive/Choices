export default class PuppetAnimator {
    constructor(scene, puppet) {
        this.scene = scene;
        this.puppet = puppet;
        this.activeTweens = [];
        this.isWalking = false;
        this.isDancing = false;
        this._spinTimers = [];
        this._danceTimers = [];
    }

    playIdle() {
        this.stopAll();
        this.isWalking = false;

        const body = this.puppet.bones?.body;
        if (body && body.initial) {
            const bodyIdle = this.scene.tweens.add({
                targets: body,
                scaleY: body.initial.scaleY * 1.03,
                scaleX: body.initial.scaleX * 0.985,
                y: body.initial.y - 2,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(bodyIdle);
        }

        const head = this.puppet.bones?.head;
        if (head) {
            const headIdle = this.scene.tweens.add({
                targets: head,
                angle: 1.5,
                duration: 1200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(headIdle);
        }
    }

    playWalk(options = {}) {
        this.stopAll();
        this.isWalking = true;
        this.puppet?.scene?.storyController?.startWalking(this.puppet);

        const baseDuration = (options.speed !== undefined && options.speed > 0)
            ? Math.round(240 / options.speed)
            : (options.duration || 240);
        const bounceDuration = Math.round(baseDuration / 2);

        if (this.puppet.bones?.head) {
            this.scene.tweens.killTweensOf(this.puppet.bones.head);
            this.puppet.bones.head.angle = 0;
        }
        if (this.puppet.bones?.body) {
            this.scene.tweens.killTweensOf(this.puppet.bones.body);
            this.puppet.bones.body.angle = 0;
        }

        const legL = this.puppet.bones?.leg_upper_left;
        const legR = this.puppet.bones?.leg_upper_right;
        if (legL && legR) {
            legL.angle = -22;
            legR.angle = 22;

            const legLTween = this.scene.tweens.add({
                targets: legL,
                angle: 22,
                duration: baseDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            const legRTween = this.scene.tweens.add({
                targets: legR,
                angle: -22,
                duration: baseDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.activeTweens.push(legLTween, legRTween);
        }

        const armL = this.puppet.bones?.arm_left;
        const armR = this.puppet.bones?.arm_right;
        if (armL && armR) {
            armL.angle = 18;
            armR.angle = -18;

            const armLTween = this.scene.tweens.add({
                targets: armL,
                angle: -18,
                duration: baseDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            const armRTween = this.scene.tweens.add({
                targets: armR,
                angle: 18,
                duration: baseDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.activeTweens.push(armLTween, armRTween);
        }

        const body = this.puppet.bones?.body;
        if (body && body.initial) {
            const bounceTween = this.scene.tweens.add({
                targets: body,
                y: body.initial.y - 6,
                duration: bounceDuration,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            this.activeTweens.push(bounceTween);
        }
    }

    playRun() {
        this.stopAll();
        this.isRunning = true;

        if (this.puppet.bones?.head) {
            this.scene.tweens.killTweensOf(this.puppet.bones.head);
            this.puppet.bones.head.angle = 0;
        }
        if (this.puppet.bones?.body) {
            this.scene.tweens.killTweensOf(this.puppet.bones.body);
            this.puppet.bones.body.angle = 0;
        }

        const legL = this.puppet.bones?.leg_upper_left;
        const legR = this.puppet.bones?.leg_upper_right;
        if (legL && legR) {
            legL.angle = -36;
            legR.angle = 36;

            const legLTween = this.scene.tweens.add({
                targets: legL,
                angle: 36,
                duration: 120,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            const legRTween = this.scene.tweens.add({
                targets: legR,
                angle: -36,
                duration: 120,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.activeTweens.push(legLTween, legRTween);
        }

        const armL = this.puppet.bones?.arm_left;
        const armR = this.puppet.bones?.arm_right;
        if (armL && armR) {
            armL.angle = 35;
            armR.angle = -35;

            const armLTween = this.scene.tweens.add({
                targets: armL,
                angle: -35,
                duration: 120,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            const armRTween = this.scene.tweens.add({
                targets: armR,
                angle: 35,
                duration: 120,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.activeTweens.push(armLTween, armRTween);
        }

        const body = this.puppet.bones?.body;
        if (body && body.initial) {
            const bounceTween = this.scene.tweens.add({
                targets: body,
                y: body.initial.y - 12,
                duration: 60,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            this.activeTweens.push(bounceTween);
        }
    }

    playTremble() {
        this.stopAll();
        this.isWalking = false;

        const boneNames = ['body', 'head', 'arm_left', 'arm_right', 'leg_upper_left', 'leg_upper_right'];
        boneNames.forEach((name, i) => {
            const bone = this.puppet.bones?.[name];
            if (bone && bone.initial) {
                const trembleTween = this.scene.tweens.add({
                    targets: bone,
                    x: bone.initial.x + (i % 2 === 0 ? 2.5 : -2.5),
                    y: bone.initial.y + (i % 3 === 0 ? 2 : -2),
                    angle: (bone.initial.angle || 0) + (i % 2 === 0 ? 3.5 : -3.5),
                    duration: 38 + (i * 11) % 19,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
                this.activeTweens.push(trembleTween);
            }
        });
    }

    playDance(options = {}) {
        this.stopAll();
        this.isDancing = true;

        const puppet = this.puppet;
        if (!puppet) return;

        // Remember initial puppet root position to avoid drift
        if (this._initialPuppetX === undefined) {
            this._initialPuppetX = puppet.x;
        }

        const style = options.style || 'default';

        // Dispatch to style-specific dance or fallback to the generic one
        switch (style) {
            case 'step_raise':
                this._danceStepRaise(puppet);
                break;
            case 'wave_arms':
                this._danceWaveArms(puppet);
                break;
            case 'throw_arms':
                this._danceThrowArms(puppet);
                break;
            case 'sharp_jumps':
                this._danceSharpJumps(puppet);
                break;
            case 'spins':
                this._danceSpins(puppet);
                break;
            case 'girl_turn_dance':
            default:
                this._danceGirlTurnSteps(puppet, options);
                break;
        }
    }

    // ── Girl Dance: Turn left (instant scale flip), 2 steps, dance 4s, turn right, 2 steps, dance 4s, repeat ──
    _danceGirlTurnSteps(puppet, options = {}) {
        const danceDuration = options.danceDuration || 4000;
        const stepDist = options.stepDist !== undefined ? options.stepDist : 22;
        const baseX = this._initialPuppetX !== undefined ? this._initialPuppetX : puppet.x;
        const targetLeftX = baseX - stepDist;
        const targetRightX = baseX;

        const body = puppet.bones?.body;
        const head = puppet.bones?.head;
        const armL = puppet.bones?.arm_left;
        const armR = puppet.bones?.arm_right;
        const legL = puppet.bones?.leg_upper_left;
        const legR = puppet.bones?.leg_upper_right;

        let activeStepDanceTweens = [];

        const stopActiveGroup = () => {
            activeStepDanceTweens.forEach((t) => {
                if (t) {
                    t.stop();
                    t.remove();
                    const idx = this.activeTweens.indexOf(t);
                    if (idx !== -1) this.activeTweens.splice(idx, 1);
                }
            });
            activeStepDanceTweens = [];
        };

        const playInPlaceDance = (onDone) => {
            if (!this.isDancing) return;
            stopActiveGroup();

            // 1. Body bounce & squash/stretch
            if (body && body.initial) {
                const bodyBounce = this.scene.tweens.add({
                    targets: body,
                    y: body.initial.y - 7,
                    scaleY: body.initial.scaleY * 1.04,
                    scaleX: body.initial.scaleX * 0.97,
                    duration: 220,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Quad.easeInOut'
                });
                activeStepDanceTweens.push(bodyBounce);
                this.activeTweens.push(bodyBounce);
            }

            // 2. Head groove bob
            if (head) {
                const headBob = this.scene.tweens.add({
                    targets: head,
                    angle: 6,
                    duration: 260,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
                activeStepDanceTweens.push(headBob);
                this.activeTweens.push(headBob);
            }

            // 3. Arms groove
            if (armL) {
                const armLTween = this.scene.tweens.add({
                    targets: armL,
                    angle: -35,
                    duration: 250,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
                activeStepDanceTweens.push(armLTween);
                this.activeTweens.push(armLTween);
            }
            if (armR) {
                const armRTween = this.scene.tweens.add({
                    targets: armR,
                    angle: 35,
                    duration: 280,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
                activeStepDanceTweens.push(armRTween);
                this.activeTweens.push(armRTween);
            }

            // 4. Legs groove
            if (legL && legR) {
                const legLTween = this.scene.tweens.add({
                    targets: legL,
                    angle: 12,
                    duration: 220,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
                const legRTween = this.scene.tweens.add({
                    targets: legR,
                    angle: -12,
                    duration: 220,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
                activeStepDanceTweens.push(legLTween, legRTween);
                this.activeTweens.push(legLTween, legRTween);
            }

            // Wait 4 seconds of dancing, then proceed
            const timer = this.scene.time.delayedCall(danceDuration, () => {
                if (!this.isDancing) return;
                stopActiveGroup();
                if (typeof onDone === 'function') onDone();
            });
            this._danceTimers.push(timer);
        };

        const playTwoSteps = (destX, onComplete) => {
            if (!this.isDancing) return;
            stopActiveGroup();

            const stepDuration = 240; // 240ms per step -> 480ms for 2 steps
            const totalStepTime = stepDuration * 2;

            // Move puppet along X to destX
            const moveTween = this.scene.tweens.add({
                targets: puppet,
                x: destX,
                duration: totalStepTime,
                ease: 'Power1.easeInOut',
                onComplete: () => {
                    if (!this.isDancing) return;
                    stopActiveGroup();
                    if (legL) legL.angle = 0;
                    if (legR) legR.angle = 0;
                    if (armL) armL.angle = 0;
                    if (armR) armR.angle = 0;
                    if (body && body.initial) body.y = body.initial.y;
                    if (typeof onComplete === 'function') onComplete();
                }
            });
            activeStepDanceTweens.push(moveTween);
            this.activeTweens.push(moveTween);

            // 2-step leg animation (alternating strides)
            if (legL && legR) {
                legL.angle = -20;
                legR.angle = 20;

                const lTween = this.scene.tweens.add({
                    targets: legL,
                    angle: 20,
                    duration: stepDuration,
                    yoyo: true,
                    repeat: 0,
                    ease: 'Sine.easeInOut'
                });
                const rTween = this.scene.tweens.add({
                    targets: legR,
                    angle: -20,
                    duration: stepDuration,
                    yoyo: true,
                    repeat: 0,
                    ease: 'Sine.easeInOut'
                });
                activeStepDanceTweens.push(lTween, rTween);
                this.activeTweens.push(lTween, rTween);
            }

            // 2 step bounces on body
            if (body && body.initial) {
                const bTween = this.scene.tweens.add({
                    targets: body,
                    y: body.initial.y - 6,
                    duration: stepDuration / 2,
                    yoyo: true,
                    repeat: 1,
                    ease: 'Quad.easeOut'
                });
                activeStepDanceTweens.push(bTween);
                this.activeTweens.push(bTween);
            }

            // Natural arm pump during 2 steps
            if (armL && armR) {
                armL.angle = 18;
                armR.angle = -18;
                const alTween = this.scene.tweens.add({
                    targets: armL,
                    angle: -18,
                    duration: stepDuration,
                    yoyo: true,
                    repeat: 0,
                    ease: 'Sine.easeInOut'
                });
                const arTween = this.scene.tweens.add({
                    targets: armR,
                    angle: 18,
                    duration: stepDuration,
                    yoyo: true,
                    repeat: 0,
                    ease: 'Sine.easeInOut'
                });
                activeStepDanceTweens.push(alTween, arTween);
                this.activeTweens.push(alTween, arTween);
            }
        };

        // Recursive cycle:
        // 1. Turn left (instant sign change) -> 2 steps -> 4s dance
        // 2. Turn right (instant sign change) -> 2 steps -> 4s dance
        // 3. Repeat until dance ends
        const stepLeftCycle = () => {
            if (!this.isDancing) return;

            // Turn left: instant change of scaling sign to negative
            puppet.scaleX = -Math.abs(puppet.scaleX);

            // Two steps to the left
            playTwoSteps(targetLeftX, () => {
                // Dance for 4 seconds
                playInPlaceDance(() => {
                    stepRightCycle();
                });
            });
        };

        const stepRightCycle = () => {
            if (!this.isDancing) return;

            // Turn right: instant change of scaling sign to positive
            puppet.scaleX = Math.abs(puppet.scaleX);

            // Two steps to the right
            playTwoSteps(targetRightX, () => {
                // Dance for 4 seconds
                playInPlaceDance(() => {
                    stepLeftCycle();
                });
            });
        };

        // Start the sequence: turn left and take 2 steps
        stepLeftCycle();
    }

    // ── Style 1: High Knees ──
    _danceStepRaise(puppet) {
        const tempo = 220 + Math.random() * 40;
        const body = puppet.bones?.body;
        const legL = puppet.bones?.leg_upper_left;
        const legR = puppet.bones?.leg_upper_right;
        const armL = puppet.bones?.arm_left;
        const armR = puppet.bones?.arm_right;
        const head = puppet.bones?.head;
        const footL = puppet.bones?.foot_left;
        const footR = puppet.bones?.foot_right;

        // Alternate high knees
        if (legL && legR) {
            legL.angle = 0;
            legR.angle = 0;
            const ll = this.scene.tweens.add({
                targets: legL,
                angle: -60,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                repeatDelay: tempo,
                ease: 'Sine.easeOut'
            });
            const lr = this.scene.tweens.add({
                targets: legR,
                angle: 60,
                delay: tempo,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                repeatDelay: tempo,
                ease: 'Sine.easeOut'
            });
            this.activeTweens.push(ll, lr);
        }

        if (footL && footR) {
            const fl = this.scene.tweens.add({
                targets: footL,
                angle: 30,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                repeatDelay: tempo,
                ease: 'Sine.easeOut'
            });
            const fr = this.scene.tweens.add({
                targets: footR,
                angle: -30,
                delay: tempo,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                repeatDelay: tempo,
                ease: 'Sine.easeOut'
            });
            this.activeTweens.push(fl, fr);
        }

        if (armL && armR) {
            const al = this.scene.tweens.add({
                targets: armL,
                angle: -80,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                repeatDelay: tempo,
                ease: 'Sine.easeInOut'
            });
            const ar = this.scene.tweens.add({
                targets: armR,
                angle: 80,
                delay: tempo,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                repeatDelay: tempo,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(al, ar);
        }

        if (body && body.initial) {
            const bb = this.scene.tweens.add({
                targets: body,
                y: body.initial.y - 12,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            this.activeTweens.push(bb);
        }
        
        if (head) {
            const ht = this.scene.tweens.add({
                targets: head,
                angle: { from: -10, to: 10 },
                duration: tempo * 2,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(ht);
        }
    }

    // ── Style 2: Headbanger ──
    _danceWaveArms(puppet) {
        const tempo = 180 + Math.random() * 30;
        const body = puppet.bones?.body;
        const head = puppet.bones?.head;
        const hair = puppet.bones?.hair;
        const armL = puppet.bones?.arm_left;
        const armR = puppet.bones?.arm_right;

        // Moderate body dipping
        if (body && body.initial) {
            const bb = this.scene.tweens.add({
                targets: body,
                y: body.initial.y + 8,
                scaleY: body.initial.scaleY * 0.96,
                scaleX: body.initial.scaleX * 1.02,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeInOut'
            });
            this.activeTweens.push(bb);
        }

        // Moderate head groove (gentler shake)
        if (head) {
            const ht = this.scene.tweens.add({
                targets: head,
                angle: 12,
                duration: tempo * 1.3,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(ht);
        }

        // Hair subtle groove
        if (hair) {
            const ha = this.scene.tweens.add({
                targets: hair,
                angle: -8,
                duration: tempo * 1.3,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(ha);
        }

        // Arms doing devil horns or thrown up
        if (armL && armR) {
            const al = this.scene.tweens.add({
                targets: armL,
                angle: -110,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeIn'
            });
            const ar = this.scene.tweens.add({
                targets: armR,
                angle: 110,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeIn'
            });
            this.activeTweens.push(al, ar);
        }
        
        this._addLegSway(puppet, tempo * 2);
    }

    // ── Style 3: Split Jumps ──
    _danceThrowArms(puppet) {
        const tempo = 300 + Math.random() * 40;
        const body = puppet.bones?.body;
        const legL = puppet.bones?.leg_upper_left;
        const legR = puppet.bones?.leg_upper_right;
        const armL = puppet.bones?.arm_left;
        const armR = puppet.bones?.arm_right;
        const head = puppet.bones?.head;

        // Big jump
        if (body && body.initial) {
            const bb = this.scene.tweens.add({
                targets: body,
                y: body.initial.y - 40,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            this.activeTweens.push(bb);
        }

        // Legs split wide in the air
        if (legL && legR) {
            const ll = this.scene.tweens.add({
                targets: legL,
                angle: -70,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            const lr = this.scene.tweens.add({
                targets: legR,
                angle: 70,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            this.activeTweens.push(ll, lr);
        }

        // Arms thrown up
        if (armL && armR) {
            const al = this.scene.tweens.add({
                targets: armL,
                angle: -150,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            const ar = this.scene.tweens.add({
                targets: armR,
                angle: 150,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            this.activeTweens.push(al, ar);
        }

        if (head) {
            const ht = this.scene.tweens.add({
                targets: head,
                angle: -15,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeOut'
            });
            this.activeTweens.push(ht);
        }
    }

    // ── Style 4: Windmill ──
    _danceSharpJumps(puppet) {
        const tempo = 250 + Math.random() * 50;
        const armL = puppet.bones?.arm_left;
        const armR = puppet.bones?.arm_right;
        const body = puppet.bones?.body;
        const legL = puppet.bones?.leg_upper_left;
        const legR = puppet.bones?.leg_upper_right;

        // Arms spinning full circles
        if (armL) {
            const al = this.scene.tweens.add({
                targets: armL,
                angle: 360,
                duration: tempo * 2,
                repeat: -1,
                ease: 'Linear'
            });
            this.activeTweens.push(al);
        }
        
        if (armR) {
            const ar = this.scene.tweens.add({
                targets: armR,
                angle: -360,
                duration: tempo * 2,
                repeat: -1,
                ease: 'Linear'
            });
            this.activeTweens.push(ar);
        }

        // Body bobbing
        if (body && body.initial) {
            const bb = this.scene.tweens.add({
                targets: body,
                y: body.initial.y + 8,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(bb);
        }

        // Wide stance
        if (legL) legL.angle = -20;
        if (legR) legR.angle = 20;
    }

    // ── Style 5: Breakdance/Twist ──
    _danceSpins(puppet) {
        const tempo = 400 + Math.random() * 50;
        const body = puppet.bones?.body;
        const armL = puppet.bones?.arm_left;
        const armR = puppet.bones?.arm_right;
        const legL = puppet.bones?.leg_upper_left;
        const legR = puppet.bones?.leg_upper_right;
        const head = puppet.bones?.head;

        // Intense body rotation
        if (body && body.initial) {
            const bRot = this.scene.tweens.add({
                targets: body,
                angle: { from: -15, to: 15 },
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            const bb = this.scene.tweens.add({
                targets: body,
                y: body.initial.y + 10,
                scaleY: body.initial.scaleY * 0.95,
                duration: tempo / 2,
                yoyo: true,
                repeat: -1,
                ease: 'Quad.easeInOut'
            });
            this.activeTweens.push(bRot, bb);
        }

        // Counter-rotating head
        if (head) {
            const hRot = this.scene.tweens.add({
                targets: head,
                angle: { from: 20, to: -20 },
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(hRot);
        }

        // Cross arms over body
        if (armL && armR) {
            const al = this.scene.tweens.add({
                targets: armL,
                angle: { from: 70, to: -20 },
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            const ar = this.scene.tweens.add({
                targets: armR,
                angle: { from: -70, to: 20 },
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(al, ar);
        }

        // Legs doing a crazy twist
        if (legL && legR) {
            const ll = this.scene.tweens.add({
                targets: legL,
                angle: { from: 30, to: -10 },
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            const lr = this.scene.tweens.add({
                targets: legR,
                angle: { from: -30, to: 10 },
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(ll, lr);
        }
    }

    // ── Shared helper: gentle leg sway used by multiple styles ──
    _addLegSway(puppet, tempo) {
        const legL = puppet.bones?.leg_upper_left;
        const legR = puppet.bones?.leg_upper_right;
        if (legL && legR) {
            const ll = this.scene.tweens.add({
                targets: legL,
                angle: 12,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            const lr = this.scene.tweens.add({
                targets: legR,
                angle: -12,
                duration: tempo,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            this.activeTweens.push(ll, lr);
        }
    }

    stopAll() {
        this.activeTweens.forEach((tween) => {
            if (tween) {
                tween.stop();
                tween.remove();
            }
        });
        this.activeTweens = [];
        if (this.isWalking) {
            this.isWalking = false;
            this.puppet?.scene?.storyController?.stopWalking(this.puppet);
        }
        this.isRunning = false;

        // Cancel any pending spin burst timers
        if (this._spinTimers) {
            this._spinTimers.forEach(t => { if (t && t.remove) t.remove(); });
            this._spinTimers = [];
        }

        // Cancel any pending dance sequence timers
        if (this._danceTimers) {
            this._danceTimers.forEach(t => { if (t && t.remove) t.remove(); });
            this._danceTimers = [];
        }

        this.isDancing = false;

        if (this._initialPuppetX !== undefined) {
            if (this.puppet) {
                this.puppet.x = this._initialPuppetX;
            }
            this._initialPuppetX = undefined;
        }

        if (this.puppet && typeof this.puppet.resetPose === 'function') {
            this.puppet.resetPose();
        }

        if (this.puppet?.bones?.head) {
            this.scene.tweens.killTweensOf(this.puppet.bones.head);
            this.puppet.bones.head.angle = 0;
        }
        if (this.puppet?.bones?.body) {
            this.scene.tweens.killTweensOf(this.puppet.bones.body);
            this.puppet.bones.body.angle = 0;
        }
    }
}