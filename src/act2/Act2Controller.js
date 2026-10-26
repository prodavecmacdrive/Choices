import Utils from "../../core/framework/Utils";
import PuppetCharacter from "../puppet/PuppetCharacter";
import PuppetAnimator from "../puppet/PuppetAnimator";

import SKELETON_CONFIG from "../config/skeleton.json";
import HERO_RAGS_CONFIG from "../config/character_hero.json";
import MILLIONAIRE_CONFIG from "../config/characters/millionaire.json";
import HERO_CASUAL2_CONFIG from "../config/characters/hero_casual2.json";
import HERO_GOLD_CONFIG from "../config/characters/hero_gold.json";
import HERO_RICH_CONFIG from "../config/characters/hero_rich.json";
import ACT2_CONFIG from "../config/act2.json";

export const HERO_DEFAULT_RAGS_PARTS = {
    body: "hero_body_rags",
    head: "hero_head_base",
    hair: "hero_hair_curly",
    arm_left: "hero_arm_l_rags",
    arm_right: "hero_arm_r_rags",
    leg_upper_left: "hero_leg_l_rags",
    leg_upper_right: "hero_leg_r_rags",
    foot_left: "hero_foot_bare_l",
    foot_right: "hero_foot_bare_r"
};

export default class Act2Controller {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = options;
        this.config = ACT2_CONFIG;

        this.isActive = false;
        this.currentScene = 0; // 1: Dumpster, 2: Deal, 3/4: Tower, 5: Completion

        // Main root container for all Act 2 game objects
        this.rootContainer = this.scene.add.container(0, 0);
        this.rootContainer.setDepth(150);
        this.rootContainer.setVisible(false);
        if (this.scene.mainContainer) {
            this.scene.mainContainer.add(this.rootContainer);
        }

        // Sub-containers for scene layers
        this.dumpsterContainer = this.scene.add.container(0, 0);
        this.dealContainer = this.scene.add.container(0, 0);
        this.towerContainer = this.scene.add.container(0, 0);
        this.bustContainer = this.scene.add.container(0, 0);
        this.uiContainer = this.scene.add.container(0, 0);
        this.endcardContainer = this.scene.add.container(0, 0);
        this.endcardContainer.setDepth(150);

        this.rootContainer.add([
            this.dumpsterContainer,
            this.dealContainer,
            this.towerContainer,
            this.bustContainer,
            this.uiContainer,
            this.endcardContainer
        ]);

        // Helper Hand setup
        this.helperHand = null;
        this.helperHandTimer = null;
        this._currentTarget = null;

        // Dynamic Sky Gradient state
        this.currentPaletteIndex = 0;
        this.gradientColors = {
            top: 0x0b2545,
            bottom: 0x3891c9
        };
        this.gradientGraphics = null;
        this.isIntroPanning = false;
        this.isElevationPanning = false;
        this.currentFloorOffsetY = 0;
        this.heroBustBaseY = null;

        // Tower state
        this.currentFloorIndex = 0; // 0: Comic Store, 1: Media HQ, 2: Sushi Bar
        this.floorStates = [
            { state: 'shutter', upgradeCount: 0, maxUpgrades: 4 }, // floor 1
            { state: 'locked', upgradeCount: 0, maxUpgrades: 4 },  // floor 2
            { state: 'locked', upgradeCount: 0, maxUpgrades: 4 }   // floor 3
        ];
        this.floorViews = [];

        // Endcard state
        this.isEndcardActive = false;
        this.isEndcardPanning = false;
        this.endcardDimmer = null;
        this.endcardFinalImg = null;
        this.endcardBtnRestart = null;
        this.endcardBtnTryAgain = null;
        this.endcardHelperHand = null;
    }

    _resetHeroSkinToRags() {
        // 1. Force-restore shared HERO_RAGS_CONFIG parts dictionary in case Act 1 mutated it
        if (HERO_RAGS_CONFIG && HERO_RAGS_CONFIG.parts) {
            Object.assign(HERO_RAGS_CONFIG.parts, HERO_DEFAULT_RAGS_PARTS);
            HERO_RAGS_CONFIG.defaultFace = 'idle';
        }

        // 2. If Act 1 hero puppet exists in the scene or storyController, reset its skin and parts
        const act1Hero = this.scene.storyController?.characters?.hero || this.scene.hero;
        if (act1Hero) {
            if (typeof act1Hero.resetToRags === 'function') {
                act1Hero.resetToRags();
            } else {
                for (const [bone, tex] of Object.entries(HERO_DEFAULT_RAGS_PARTS)) {
                    act1Hero.setAttachment?.(bone, tex);
                }
                act1Hero.setFace?.('idle');
            }
        }

        // 3. Clear Act 1 outfit/suit flags from storyController or scene
        if (this.scene.storyController) {
            this.scene.storyController.suitApplied = false;
            this.scene.storyController.currentOutfit = 'rags';
            this.scene.storyController.isPrestigeSuit = false;
            if (this.scene.storyController._activeTransition) {
                this.scene.storyController._activeTransition = null;
            }
        }
        if (this.scene.registry) {
            this.scene.registry.set('heroOutfit', 'rags');
            this.scene.registry.set('isPrestigeSuit', false);
        }
    }

    start(options = {}) {
        this.isActive = true;
        this.rootContainer.setVisible(true);

        // Force reset Hero skin to default rags and clear Act 1 outfit flags
        this._resetHeroSkinToRags();

        // Hide Act 1 choice group and other transient UI
        if (this.scene.choiceGroup) {
            this.scene.choiceGroup.setVisible(false);
            this.scene.choiceGroup.disableAllInteractivity?.();
        }

        // Reset main camera to clean coordinate framing (1.0 zoom, 0 scroll)
        if (this.scene.cameras?.main) {
            this.scene.cameras.main.setZoom(1.0);
            this.scene.cameras.main.scrollY = 0;
            this.scene.cameras.main.scrollX = 0;
        }

        // Ensure background music continues smoothly
        if (this.scene.storyController?._mainBgm) {
            if (typeof this.scene.storyController.duckMainBgm === 'function') {
                this.scene.storyController.unduckMainBgm?.();
            }
        } else if (this.scene.storyController) {
            this.scene.storyController._startMainBgm();
        }

        // Standalone or immediate boot (startAct === 2)
        if (options.immediate || options.standalone) {
            if (this.scene.worldContainer) {
                this.scene.worldContainer.setVisible(false);
            }
            this._setupScene1Dumpster();
            return;
        }

        // Transition into Scene 1 via smooth fade-to-black
        this._runFadeTransition(() => {
            // Hide Act 1 world container
            if (this.scene.worldContainer) {
                this.scene.worldContainer.setVisible(false);
            }
            this._setupScene1Dumpster();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Screen Fades & Transitions
    // ─────────────────────────────────────────────────────────────────────────

    _runFadeTransition(onMidpoint, onComplete) {
        const fadeRect = this.scene.add.graphics();
        fadeRect.fillStyle(0x000000, 1);
        fadeRect.fillRect(-1000, -1000, 2600, 2900);
        fadeRect.setDepth(999);
        fadeRect.setAlpha(0);
        if (this.scene.mainContainer) {
            this.scene.mainContainer.add(fadeRect);
        }

        this.scene.tweens.add({
            targets: fadeRect,
            alpha: 1,
            duration: 400,
            ease: 'Quad.easeInOut',
            onComplete: () => {
                if (onMidpoint) onMidpoint();
                this.scene.tweens.add({
                    targets: fadeRect,
                    alpha: 0,
                    duration: 400,
                    ease: 'Quad.easeInOut',
                    delay: 80,
                    onComplete: () => {
                        fadeRect.destroy();
                        if (onComplete) onComplete();
                    }
                });
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scene 1: Dumpster Alley, Rat Behavior, Money Bag Selection
    // ─────────────────────────────────────────────────────────────────────────

    _setupScene1Dumpster() {
        this.currentScene = 1;
        this.dumpsterContainer.removeAll(true);
        this.dumpsterContainer.setVisible(true);

        // Guarantee skin and config are completely clean before building dumpster scene
        this._resetHeroSkinToRags();

        const isPortrait = this.scene.scale.width < this.scene.scale.height;

        // 1. Background: dumpster_bg.png set to responsive cover scaling
        this.dumpsterBg = this.scene.add.image(300, 450, this.config.dumpster.bgTexture || 'dumpster_bg');
        this.dumpsterBg.setOrigin(0.5, 0.5);
        this.dumpsterContainer.add(this.dumpsterBg);

        // Dumpster cluster container
        this.dumpsterCluster = this.scene.add.container(300, 560);
        this.dumpsterContainer.add(this.dumpsterCluster);

        // 2. Back Dumpster Layer: dumpster_back.png
        this.dumpsterBack = this.scene.add.image(0, 0, this.config.dumpster.backTexture || 'dumpster_back');
        this.dumpsterBack.setOrigin(0.5, 1.0);
        this.dumpsterBack.setDepth(10);
        this.dumpsterCluster.add(this.dumpsterBack);

        // 3. Middle Interactive Layer:
        // - Hero in initial rags skin, sitting inside dumpster looking sad
        // Dumpster front rim is at local y = -340. Position hero at y = -320.
        // Hero legs and feet are fully instantiated, visible, and bound to the skeleton from frame 0.
        this.alleyHero = new PuppetCharacter(this.scene, -65, -320, SKELETON_CONFIG, HERO_RAGS_CONFIG);
        // Explicitly re-bind all parts to base rags sprite set
        for (const [bone, tex] of Object.entries(HERO_DEFAULT_RAGS_PARTS)) {
            this.alleyHero.setAttachment(bone, tex);
        }
        this.alleyHero.animator = new PuppetAnimator(this.scene, this.alleyHero);
        this.alleyHero.setDepth(15);
        this.alleyHero.setFace('crying');
        this.alleyHero.animator.playCry();
        this.dumpsterCluster.add(this.alleyHero);

        // - Closed Money Bag: money_bag_closed.png resting on trash heap inside dumpster
        this.moneyBag = this.scene.add.image(130, -365, this.config.dumpster.bagClosedTexture || 'money_bag_closed');
        this.moneyBag.setScale(0.58);
        this.moneyBag.setDepth(16);
        this.moneyBag.setOrigin(0.5, 0.5);
        this.moneyBag.setInteractive({ useHandCursor: true });
        this.dumpsterCluster.add(this.moneyBag);

        // - Rat: rat.png patrolling on rim
        this.rat = this.scene.add.image(-15, -355, this.config.dumpster.ratTexture || 'rat');
        this.rat.setScale(0.52);
        this.rat.setDepth(18);
        this.rat.setOrigin(0.5, 0.5);
        this.rat.setInteractive({ useHandCursor: true });
        this.dumpsterCluster.add(this.rat);

        // 4. Front Dumpster Layer: dumpster_front.png (occludes lower half of Hero and items)
        this.dumpsterFront = this.scene.add.image(0, 0, this.config.dumpster.frontTexture || 'dumpster_front');
        this.dumpsterFront.setOrigin(0.5, 1.0);
        this.dumpsterFront.setDepth(20);
        this.dumpsterCluster.add(this.dumpsterFront);

        // Ensure dumpsterFront is at the front initially inside dumpsterCluster
        if (typeof this.dumpsterCluster.sort === 'function') this.dumpsterCluster.sort('depth');
        if (typeof this.dumpsterCluster.bringToTop === 'function') this.dumpsterCluster.bringToTop(this.dumpsterFront);

        // Apply scale to dumpster cluster (prominent in landscape)
        const clusterScale = isPortrait ? 0.72 : 0.85;
        this.dumpsterCluster.setScale(clusterScale);

        this._setupRatBehavior();
        this._setupBagInteraction();

        this.onResize(isPortrait);
    }

    _setupRatBehavior() {
        this.ratState = 'idle_patrol';
        this.ratPatrolTween = null;
        this.ratDiveTimer = null;

        const rimY = -355;
        const leftX = -130;
        const rightX = 130;

        // Patrol tween
        const startPatrol = () => {
            if (!this.rat || !this.rat.active || this.ratState === 'fleeing') return;
            const targetX = this.rat.x > 0 ? leftX : rightX;
            this.rat.scaleX = (targetX > this.rat.x) ? -Math.abs(this.rat.scaleX) : Math.abs(this.rat.scaleX);

            const dist = Math.abs(targetX - this.rat.x);
            const duration = Math.max(dist * 12, 600);

            this.ratPatrolTween = this.scene.tweens.add({
                targets: this.rat,
                x: targetX,
                duration: duration,
                ease: 'Linear',
                onComplete: () => {
                    if (this.ratState === 'idle_patrol') {
                        startPatrol();
                    } else if (this.ratState === 'choice') {
                        // Short left-right pacing on rim
                        this._startShortPacing();
                    }
                }
            });
        };

        // Periodic parabolic jump/dive into dumpster (idle phase only)
        const scheduleDive = () => {
            if (!this.rat || !this.rat.active || this.ratState !== 'idle_patrol') return;
            const delay = this.config.dumpster.ratIdleDiveInterval || 2800;
            this.ratDiveTimer = this.scene.time.delayedCall(delay, () => {
                if (this.ratState !== 'idle_patrol' || !this.rat || !this.rat.active) return;

                // Stop current patrol tween for dive
                if (this.ratPatrolTween) this.ratPatrolTween.stop();

                const diveX = this.rat.x;
                const bottomY = -220; // Inside dumpster behind front layer

                // 1. Jump up and dive down
                this.scene.tweens.add({
                    targets: this.rat,
                    y: bottomY,
                    angle: 45,
                    duration: 420,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        if (!this.rat || !this.rat.active || this.ratState === 'fleeing') return;
                        // 2. Pause briefly inside dumpster, re-emerge halfway
                        this.scene.time.delayedCall(250, () => {
                            if (!this.rat || !this.rat.active || this.ratState === 'fleeing') return;
                            // 3. Hop back up onto the rim
                            this.scene.tweens.add({
                                targets: this.rat,
                                y: rimY,
                                angle: 0,
                                duration: 380,
                                ease: 'Quad.easeOut',
                                onComplete: () => {
                                    if (this.ratState === 'idle_patrol') {
                                        startPatrol();
                                        scheduleDive();
                                    }
                                }
                            });
                        });
                    }
                });
            });
        };

        startPatrol();
        scheduleDive();

        // After 1.5s, activate Choice Phase: cease diving and prompt user
        this.scene.time.delayedCall(1600, () => {
            if (this.ratState !== 'fleeing') {
                this.ratState = 'choice';
                if (this.ratDiveTimer) this.ratDiveTimer.remove();
                this._showHelperHand(this.moneyBag, 12, 18);
            }
        });

        // Clicking the Rat: high-arc leap out and scurry off-screen
        this.rat.on('pointerdown', () => {
            if (this.scene?.isGameOver) return;
            if (this.ratState === 'fleeing') return;

            if (typeof this.scene?.registerInteraction === 'function') {
                this.scene.registerInteraction('rat');
            }
            if (this.scene?.isGameOver) return;

            this.ratState = 'fleeing';

            try { Utils.addAudio(this.scene, 'ui_click', 0.6); } catch (e) { }

            if (this.ratPatrolTween) this.ratPatrolTween.stop();
            if (this.ratDiveTimer) this.ratDiveTimer.remove();

            this._clearHelperHand();

            // High-arc leap out of dumpster
            this.scene.tweens.add({
                targets: this.rat,
                x: this.rat.x + (this.rat.x < 0 ? -350 : 350),
                y: -450,
                angle: (this.rat.x < 0 ? -120 : 120),
                duration: 400,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    this.scene.tweens.add({
                        targets: this.rat,
                        y: 120,
                        duration: 350,
                        ease: 'Quad.easeIn',
                        onComplete: () => {
                            if (this.rat) {
                                this.rat.setVisible(false);
                                this.rat.destroy();
                                this.rat = null;
                            }
                        }
                    });
                }
            });

            // Choice state remains active, helper hand immediately targets money_bag_closed.png
            this.scene.time.delayedCall(300, () => {
                if (this.moneyBag && this.moneyBag.active) {
                    this._showHelperHand(this.moneyBag, 12, 18);
                }
            });
        });
    }

    _startShortPacing() {
        if (!this.rat || !this.rat.active || this.ratState === 'fleeing') return;
        const targetX = this.rat.x > 0 ? -40 : 40;
        this.rat.scaleX = (targetX > this.rat.x) ? -Math.abs(this.rat.scaleX) : Math.abs(this.rat.scaleX);

        this.ratPatrolTween = this.scene.tweens.add({
            targets: this.rat,
            x: targetX,
            duration: 900,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                if (this.ratState === 'choice') {
                    this._startShortPacing();
                }
            }
        });
    }

    _setupBagInteraction() {
        this.moneyBag.on('pointerdown', () => {
            if (this.scene?.isGameOver) return;
            if (this._bagClaimed) return;

            if (typeof this.scene?.registerInteraction === 'function') {
                this.scene.registerInteraction('bag');
            }
            if (this.scene?.isGameOver) return;

            this._bagClaimed = true;
            this.moneyBag.disableInteractive();

            this._clearHelperHand();

            try { Utils.addAudio(this.scene, 'ui_click', 0.8); } catch (e) { }

            // Rat flees off-screen immediately if still present
            if (this.rat && this.rat.active && this.ratState !== 'fleeing') {
                this.ratState = 'fleeing';
                this.scene.tweens.killTweensOf(this.rat);
                this.scene.tweens.add({
                    targets: this.rat,
                    x: this.rat.x + (this.rat.x < 0 ? -450 : 450),
                    y: -100,
                    duration: 500,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        this.rat?.destroy();
                        this.rat = null;
                    }
                });
            }

            // Stop crying animation and face idle
            this.alleyHero.animator.stopAll();
            this.alleyHero.setFace('idle');

            const HERO_BASE_SCALE = 0.416;
            this.alleyHero.setScale(HERO_BASE_SCALE, HERO_BASE_SCALE);

            const body = this.alleyHero.bones?.body;
            const head = this.alleyHero.bones?.head;
            const armL = this.alleyHero.bones?.arm_left;
            const armR = this.alleyHero.bones?.arm_right;

            // Ensure hero and bag start behind dumpster_front
            this.alleyHero.setDepth(15);
            this.moneyBag.setDepth(16);
            if (typeof this.dumpsterCluster.sort === 'function') this.dumpsterCluster.sort('depth');
            if (typeof this.dumpsterCluster.bringToTop === 'function') this.dumpsterCluster.bringToTop(this.dumpsterFront);

            // ─────────────────────────────────────────────────────────────────
            // 1. BEND & GRAB: Hero bends toward closed bag and extends hands
            // ─────────────────────────────────────────────────────────────────
            this.scene.tweens.add({
                targets: this.alleyHero,
                x: -20,
                duration: 280,
                ease: 'Quad.easeInOut'
            });
            this.scene.tweens.add({
                targets: body,
                angle: 18,
                y: (body?.initial?.y || 0) + 12,
                duration: 280,
                ease: 'Quad.easeInOut'
            });
            if (head) {
                this.scene.tweens.add({
                    targets: head,
                    angle: 16,
                    duration: 280,
                    ease: 'Quad.easeInOut'
                });
            }
            if (armL) {
                this.scene.tweens.add({
                    targets: armL,
                    angle: -38,
                    duration: 280,
                    ease: 'Quad.easeInOut'
                });
            }
            if (armR) {
                this.scene.tweens.add({
                    targets: armR,
                    angle: 28,
                    duration: 280,
                    ease: 'Quad.easeInOut'
                });
            }

            // Pause after bending & reaching before lifting
            this.scene.time.delayedCall(300, () => {
                try { Utils.addAudio(this.scene, 'ui_click', 0.6); } catch (e) { }

                // ─────────────────────────────────────────────────────────────
                // 2. LIFT: Hero straightens up, lifting bag inside dumpster
                // ─────────────────────────────────────────────────────────────
                this.scene.tweens.add({
                    targets: body,
                    angle: 0,
                    y: body?.initial?.y || 0,
                    duration: 260,
                    ease: 'Quad.easeOut'
                });
                if (head) {
                    this.scene.tweens.add({
                        targets: head,
                        angle: 0,
                        duration: 260,
                        ease: 'Quad.easeOut'
                    });
                }
                if (armL) {
                    this.scene.tweens.add({
                        targets: armL,
                        angle: -15,
                        duration: 260,
                        ease: 'Quad.easeOut'
                    });
                }
                if (armR) {
                    this.scene.tweens.add({
                        targets: armR,
                        angle: 15,
                        duration: 260,
                        ease: 'Quad.easeOut'
                    });
                }

                // Bag translates upward along with Hero into carrying position
                this.scene.tweens.add({
                    targets: this.moneyBag,
                    x: 25,
                    y: -385,
                    duration: 260,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        // Pause upright holding the bag before initiating the jump
                        this.scene.time.delayedCall(300, () => {
                            // 3. JUMP OUT: Arc jump over dumpster_front onto sidewalk
                            this._executeDumpsterJump(HERO_BASE_SCALE);
                        });
                    }
                });
            });
        });
    }

    _executeDumpsterJump(baseScale = 0.416) {
        const body = this.alleyHero.bones?.body;
        const legL = this.alleyHero.bones?.leg_upper_left || this.alleyHero.bones?.hero_leg_l;
        const legR = this.alleyHero.bones?.leg_upper_right || this.alleyHero.bones?.hero_leg_r;
        const footL = this.alleyHero.bones?.foot_left || this.alleyHero.bones?.hero_foot_l;
        const footR = this.alleyHero.bones?.foot_right || this.alleyHero.bones?.hero_foot_r;

        // Ensure legs and feet are fully instantiated, visible, and bound from frame 0 of the jump
        if (legL) legL.setVisible(true);
        if (legR) legR.setVisible(true);
        if (footL) footL.setVisible(true);
        if (footR) footR.setVisible(true);

        // Lock root scale strictly
        this.alleyHero.setScale(baseScale, baseScale);

        const heroApexX = -20;
        const heroApexY = -425;
        const heroLandingX = -20;
        const heroLandingY = 20;

        const bagApexX = 35;
        const bagApexY = -410;
        const bagLandingX = 55;
        const bagLandingY = 18;

        // Keep depth behind dumpster_front during upward ascent
        this.alleyHero.setDepth(15);
        this.moneyBag.setDepth(16);
        if (typeof this.dumpsterCluster.sort === 'function') this.dumpsterCluster.sort('depth');
        if (typeof this.dumpsterCluster.bringToTop === 'function') this.dumpsterCluster.bringToTop(this.dumpsterFront);

        // Animate legs actively: tucking slightly during ascent
        if (legL) this.scene.tweens.add({ targets: legL, angle: -28, duration: 330, ease: 'Quad.easeOut' });
        if (footL) this.scene.tweens.add({ targets: footL, angle: 22, duration: 330, ease: 'Quad.easeOut' });
        if (legR) this.scene.tweens.add({ targets: legR, angle: 28, duration: 330, ease: 'Quad.easeOut' });
        if (footR) this.scene.tweens.add({ targets: footR, angle: -22, duration: 330, ease: 'Quad.easeOut' });

        // Money bag upward arc to apex
        this.scene.tweens.add({
            targets: this.moneyBag,
            x: bagApexX,
            y: bagApexY,
            duration: 330,
            ease: 'Quad.easeOut'
        });

        // Hero upward arc to apex
        this.scene.tweens.add({
            targets: this.alleyHero,
            x: heroApexX,
            y: heroApexY,
            duration: 330,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // EXACT APEX: Dynamically raise Hero's depth above dumpster_front
                this.alleyHero.setDepth(this.dumpsterFront.depth + 1);
                this.moneyBag.setDepth(this.dumpsterFront.depth + 2);
                if (typeof this.dumpsterCluster.sort === 'function') this.dumpsterCluster.sort('depth');
                if (typeof this.dumpsterCluster.bringToTop === 'function') {
                    this.dumpsterCluster.bringToTop(this.alleyHero);
                    this.dumpsterCluster.bringToTop(this.moneyBag);
                }

                // Legs extending for landing
                if (legL) this.scene.tweens.add({ targets: legL, angle: 0, duration: 300, ease: 'Quad.easeIn' });
                if (footL) this.scene.tweens.add({ targets: footL, angle: 0, duration: 300, ease: 'Quad.easeIn' });
                if (legR) this.scene.tweens.add({ targets: legR, angle: 0, duration: 300, ease: 'Quad.easeIn' });
                if (footR) this.scene.tweens.add({ targets: footR, angle: 0, duration: 300, ease: 'Quad.easeIn' });

                // Downward descent: Money bag to sidewalk
                this.scene.tweens.add({
                    targets: this.moneyBag,
                    x: bagLandingX,
                    y: bagLandingY + 15,
                    duration: 300,
                    ease: 'Quad.easeIn'
                });

                // Downward descent: Hero to sidewalk
                this.scene.tweens.add({
                    targets: this.alleyHero,
                    x: heroLandingX,
                    y: heroLandingY,
                    duration: 300,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        // Ensure in front on landing
                        if (typeof this.dumpsterCluster.bringToTop === 'function') {
                            this.dumpsterCluster.bringToTop(this.alleyHero);
                            this.dumpsterCluster.bringToTop(this.moneyBag);
                        }

                        // Maintain locked root scale strictly
                        this.alleyHero.setScale(baseScale, baseScale);

                        // Subtle landing squash applied strictly to body bone
                        if (body) {
                            this.scene.tweens.add({
                                targets: body,
                                scaleY: (body.initial?.scaleY || 1) * 0.93,
                                scaleX: (body.initial?.scaleX || 1) * 1.05,
                                duration: 90,
                                yoyo: true,
                                ease: 'Quad.easeOut'
                            });
                        }

                        try { Utils.addAudio(this.scene, 'steps_walk', 0.6); } catch (e) { }

                        // Pause after landing before inspecting & opening bag
                        this.scene.time.delayedCall(350, () => {
                            // 4. INSPECT & OPEN: Hero bends down to closed bag on pavement
                            this._executeBagInspectAndOpen(bagLandingX, bagLandingY, heroLandingX, heroLandingY, baseScale);
                        });
                    }
                });
            }
        });
    }

    _executeBagInspectAndOpen(bagX, bagY, heroX, heroY, baseScale = 0.416) {
        const body = this.alleyHero.bones?.body;
        const head = this.alleyHero.bones?.head;
        const armL = this.alleyHero.bones?.arm_left;
        const armR = this.alleyHero.bones?.arm_right;

        // 4. INSPECT & OPEN: Hero bends down toward closed bag on sidewalk
        this.scene.tweens.add({
            targets: body,
            angle: 18,
            y: (body?.initial?.y || 0) + 12,
            duration: 250,
            ease: 'Quad.easeInOut'
        });
        if (head) {
            this.scene.tweens.add({ targets: head, angle: 16, duration: 250, ease: 'Quad.easeInOut' });
        }
        if (armL) {
            this.scene.tweens.add({ targets: armL, angle: -42, duration: 250, ease: 'Quad.easeInOut' });
        }
        if (armR) {
            this.scene.tweens.add({ targets: armR, angle: 28, duration: 250, ease: 'Quad.easeInOut' });
        }

        // Opening motion and immediate texture swap
        this.scene.time.delayedCall(260, () => {
            // Opening arms motion
            if (armL) this.scene.tweens.add({ targets: armL, angle: -20, duration: 180 });
            if (armR) this.scene.tweens.add({ targets: armR, angle: -20, duration: 180 });

            // Swap texture immediately to open bag
            this.moneyBag.setTexture(this.config.dumpster.bagOpenTexture || 'money_bag_open');
            this.moneyBag.setScale(0.68);

            try {
                Utils.addAudio(this.scene, 'magic_sparkle', 0.9);
                Utils.addAudio(this.scene, 'coins_reward', 0.8);
            } catch (e) { }

            // Glowing cash particles
            this._spawnMoneyBagSparkles(bagX, bagY);

            // Pause while bent down inspecting the open bag
            this.scene.time.delayedCall(300, () => {
                // 5. STEP BACK: Hero straightens up and steps back slightly
                this._executeStepBackFromBag(heroX, heroY, bagX, bagY, baseScale);
            });
        });
    }

    _executeStepBackFromBag(heroX, heroY, bagX, bagY, baseScale = 0.416) {
        const body = this.alleyHero.bones?.body;
        const head = this.alleyHero.bones?.head;
        const armL = this.alleyHero.bones?.arm_left;
        const armR = this.alleyHero.bones?.arm_right;

        // Straighten torso back up
        this.scene.tweens.add({
            targets: body,
            angle: 0,
            y: body?.initial?.y || 0,
            duration: 240,
            ease: 'Quad.easeOut'
        });
        if (head) this.scene.tweens.add({ targets: head, angle: 0, duration: 240, ease: 'Quad.easeOut' });
        if (armL) this.scene.tweens.add({ targets: armL, angle: 10, duration: 240, ease: 'Quad.easeOut' });
        if (armR) this.scene.tweens.add({ targets: armR, angle: -10, duration: 240, ease: 'Quad.easeOut' });

        // Step back slightly from the open bag (moving left from -20 to -45)
        const stepBackX = heroX - 25;
        this.scene.tweens.add({
            targets: this.alleyHero,
            x: stepBackX,
            duration: 240,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Pause standing in awe before celebrating
                this.scene.time.delayedCall(300, () => {
                    // 6. CELEBRATE: Only now start the joyful jumping celebration
                    this._executeCelebration(stepBackX, heroY, bagX, bagY, baseScale);
                });
            }
        });
    }

    _executeCelebration(heroX, heroY, bagX, bagY, baseScale = 0.416) {
        const body = this.alleyHero.bones?.body;
        const head = this.alleyHero.bones?.head;
        const armL = this.alleyHero.bones?.arm_left;
        const armR = this.alleyHero.bones?.arm_right;

        // Swap Hero facial texture to happy expression
        this.alleyHero.setFace('happy');

        // Cheering arms raised high
        if (armL) this.scene.tweens.add({ targets: armL, angle: 70, duration: 220, ease: 'Back.easeOut' });
        if (armR) this.scene.tweens.add({ targets: armR, angle: -70, duration: 220, ease: 'Back.easeOut' });

        // Lock root scale strictly
        this.alleyHero.setScale(baseScale, baseScale);

        // Celebration jumping: 3 hops with squash-and-stretch strictly on body bone
        if (body) {
            this.scene.tweens.add({
                targets: body,
                scaleY: (body.initial?.scaleY || 1) * 1.08,
                scaleX: (body.initial?.scaleX || 1) * 0.94,
                duration: 240,
                yoyo: true,
                repeat: 3,
                ease: 'Quad.easeOut'
            });
        }

        this.scene.tweens.add({
            targets: this.alleyHero,
            y: heroY - 32,
            duration: 240,
            yoyo: true,
            repeat: 3,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Reset body bone scale
                if (body) {
                    body.setScale(body.initial?.scaleX || 1, body.initial?.scaleY || 1);
                }
                // Root scale remains strictly constant
                this.alleyHero.setScale(baseScale, baseScale);
                this.alleyHero.y = heroY;

                // Pause briefly after celebration before walking
                this.scene.time.delayedCall(250, () => {
                    // Reposition to right half and flip horizontally
                    this._repositionHeroForMillionaire(baseScale);
                });
            }
        });

        // Credit initial funds via global coin fly-in into BalanceView
        if (this.scene.balanceView) {
            this.scene.balanceView.setVisible(true);
            this.scene.balanceView.setAlpha(1);

            const worldX = this.dumpsterCluster.x + bagX * this.dumpsterCluster.scaleX;
            const worldY = this.dumpsterCluster.y + bagY * this.dumpsterCluster.scaleY;

            const award = this.config.dumpster.initialCashAward || 250;
            this.scene.balanceView.spawnCoinFlyIn(worldX, worldY, award, 8);
        }
    }

    _repositionHeroForMillionaire(baseScale = 0.416) {
        const targetHeroX = 135;

        // Hero plays walk cycle to the right side of the screen
        this.alleyHero.animator.playWalk({ speed: 1.1 });

        try { Utils.addAudio(this.scene, 'steps_walk', 0.5); } catch (e) { }

        // Walk to the right side of the screen
        this.scene.tweens.add({
            targets: this.alleyHero,
            x: targetHeroX,
            duration: 900,
            ease: 'Linear',
            onComplete: () => {
                // Stop walking animations
                this.alleyHero.animator.stopAll();

                // INSTANT SNAP FLIP (ScaleX Inversion):
                // 1-frame immediate flip on X-axis (NO tween, NO rotation, NO duration)
                this.alleyHero.scaleX = -Math.abs(baseScale);
                this.alleyHero.scaleY = Math.abs(baseScale);

                // Settle Hero into an idle stance facing left
                this.alleyHero.animator.playIdle();
                this.alleyHero.setFace('idle');

                // Only trigger the Millionaire's entrance walk-in from the left after the flip is complete
                this.scene.time.delayedCall(300, () => {
                    this._transitionToScene2();
                });
            }
        });
    }

    _spawnMoneyBagSparkles(x, y) {
        for (let i = 0; i < 10; i++) {
            const sparkle = this.scene.add.image(x + (Math.random() - 0.5) * 60, y - 20 + (Math.random() - 0.5) * 40, 'icon_coin_gold');
            sparkle.setScale(0.12 + Math.random() * 0.1);
            sparkle.setAlpha(0);
            sparkle.setDepth(28);
            this.dumpsterCluster.add(sparkle);

            this.scene.tweens.add({
                targets: sparkle,
                alpha: 1,
                y: sparkle.y - 45 - Math.random() * 30,
                scaleX: 0.22,
                scaleY: 0.22,
                duration: 450 + Math.random() * 200,
                yoyo: true,
                delay: i * 70,
                ease: 'Sine.easeInOut',
                onComplete: () => sparkle.destroy()
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scene 2: Millionaire Arrival & Deal Interaction
    // ─────────────────────────────────────────────────────────────────────────

    _transitionToScene2() {
        this.currentScene = 2;

        // Scene 1 elements persist: dumpster_back and dumpster_front remain visible and active
        // Hero is already standing on the right sidewalk in idle stance at x = 130, y = 20
        // Open money bag is resting on the sidewalk pavement at x = 55, y = 18
        const heroX = this.alleyHero ? this.alleyHero.x : 130;
        const heroY = this.alleyHero ? this.alleyHero.y : 20;

        // Assemble Millionaire Character Rig from full body assets inside dumpsterCluster
        const startX = -420;
        const targetX = -130;
        const millionaireY = heroY;

        this.millionaire = new PuppetCharacter(this.scene, startX, millionaireY, SKELETON_CONFIG, MILLIONAIRE_CONFIG);
        this.millionaire.animator = new PuppetAnimator(this.scene, this.millionaire);
        this.millionaire.setDepth(22);
        this.dumpsterCluster.add(this.millionaire);

        if (typeof this.dumpsterCluster.sort === 'function') {
            this.dumpsterCluster.sort('depth');
        }

        // Walk cycle with bobbing torso and swinging limbs
        this.millionaire.animator.playWalk({ speed: 1.0 });

        try {
            Utils.addAudio(this.scene, 'steps_walk', 0.5);
        } catch (e) { }

        // Walk in tween from the left along the clear sidewalk
        this.scene.tweens.add({
            targets: this.millionaire,
            x: targetX,
            duration: this.config.deal.millionaireWalkInDuration || 1500,
            ease: 'Power1.easeOut',
            onComplete: () => {
                this.millionaire.animator.playIdle();

                try {
                    Utils.addAudio(this.scene, 'voice_man_mumble', 0.7);
                } catch (e) { }

                this._showDealProposition(targetX, millionaireY, heroX, heroY);
            }
        });
    }

    _showDealProposition(milX, milY, heroX, heroY) {
        // 1. Procedural white speech bubble above Millionaire
        const bubbleX = milX + 110;
        const bubbleY = milY - 260;

        this.speechBubble = this.scene.add.container(bubbleX, bubbleY);
        this.speechBubble.setDepth(40);
        this.dumpsterCluster.add(this.speechBubble);

        const bubbleW = 280;
        const bubbleH = 88;

        const bg = this.scene.add.graphics();
        bg.fillStyle(0xffffff, 1.0);
        bg.fillRoundedRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, 18);
        bg.lineStyle(4, 0x111122, 1.0);
        bg.strokeRoundedRect(-bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, 18);

        // Tail pointing down and left toward Millionaire
        bg.beginPath();
        bg.moveTo(-30, bubbleH / 2 - 2);
        bg.lineTo(-65, bubbleH / 2 + 25);
        bg.lineTo(-10, bubbleH / 2 - 2);
        bg.closePath();
        bg.fillStyle(0xffffff, 1.0);
        bg.fillPath();
        bg.lineStyle(4, 0x111122, 1.0);
        bg.strokePath();

        this.speechBubble.add(bg);

        // Bubble Content: mini avatar heads of Hero and Millionaire + formula: $ + ... = $$$!!
        // Mini hero avatar head
        const heroMini = this.scene.add.image(-100, 0, 'hero_casual2_head');
        heroMini.setScale(0.16);
        const heroHair = this.scene.add.image(-100, -12, 'hero_casual2_hair');
        heroHair.setScale(0.16);

        // Plus text
        const plusTxt = this.scene.add.text(-60, -3, '$ +', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#1b8a2e',
            stroke: '#ffffff',
            strokeThickness: 3
        }).setOrigin(0.5, 0.5);

        // Mini millionaire avatar head
        const milMini = this.scene.add.image(-15, 0, 'millionaire_head');
        milMini.setScale(0.16);
        const milHair = this.scene.add.image(-15, -14, 'millionaire_hair');
        milHair.setScale(0.16);

        // Equals and $$$!! text
        const resultTxt = this.scene.add.text(62, -2, '= $$$!!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#d4af37',
            stroke: '#111122',
            strokeThickness: 4
        }).setOrigin(0.5, 0.5);

        this.speechBubble.add([heroMini, heroHair, plusTxt, milMini, milHair, resultTxt]);

        // Pop in animation
        this.speechBubble.setScale(0);
        this.scene.tweens.add({
            targets: this.speechBubble,
            scaleX: 1.0,
            scaleY: 1.0,
            duration: 380,
            ease: 'Back.easeOut'
        });

        // 2. Red question mark ? above Hero's head with pensive expression
        this.alleyHero.setFace('surprised');
        this.questionMark = this.scene.add.text(heroX, heroY - 240, '?', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '56px',
            fontStyle: 'bold',
            color: '#ff2222',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5, 0.5);
        this.questionMark.setDepth(40);
        this.dumpsterCluster.add(this.questionMark);

        // Bobbing question mark
        this.scene.tweens.add({
            targets: this.questionMark,
            y: heroY - 255,
            duration: 450,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 3. Make speech bubble clickable
        this.speechBubble.setSize(bubbleW, bubbleH);
        this.speechBubble.setInteractive({ useHandCursor: true });

        // 4. Helper hand points directly to the deal bubble
        this._showHelperHand(this.speechBubble, 20, 20);

        this.speechBubble.on('pointerdown', () => {
            if (this.scene?.isGameOver) return;
            if (this._dealAccepted) return;

            if (typeof this.scene?.registerInteraction === 'function') {
                this.scene.registerInteraction('deal');
            }
            if (this.scene?.isGameOver) return;

            this._dealAccepted = true;
            this.speechBubble.disableInteractive();

            this._clearHelperHand();

            try {
                Utils.addAudio(this.scene, 'magic_sparkle', 0.9);
                Utils.addAudio(this.scene, 'ui_click', 0.8);
            } catch (e) { }

            // Remove question mark
            if (this.questionMark) {
                this.questionMark.destroy();
                this.questionMark = null;
            }

            // Animate Hero smiling and cheering with raised arms
            this.alleyHero.setFace('happy');
            if (this.alleyHero.bones?.arm_left) {
                this.scene.tweens.add({ targets: this.alleyHero.bones.arm_left, angle: 140, duration: 250, ease: 'Back.easeOut' });
            }
            if (this.alleyHero.bones?.arm_right) {
                this.scene.tweens.add({ targets: this.alleyHero.bones.arm_right, angle: -140, duration: 250, ease: 'Back.easeOut' });
            }

            // Bounce with joy
            this.scene.tweens.add({
                targets: this.alleyHero,
                y: heroY - 30,
                duration: 220,
                yoyo: true,
                repeat: 2,
                ease: 'Quad.easeOut'
            });

            // Millionaire nods
            if (this.millionaire?.bones?.head) {
                this.scene.tweens.add({
                    targets: this.millionaire.bones.head,
                    angle: 15,
                    duration: 180,
                    yoyo: true,
                    repeat: 2,
                    ease: 'Sine.easeInOut'
                });
            }

            // Pop away speech bubble
            this.scene.tweens.add({
                targets: this.speechBubble,
                scaleX: 1.15,
                scaleY: 1.15,
                duration: 150,
                onComplete: () => {
                    this.scene.tweens.add({
                        targets: this.speechBubble,
                        scaleX: 0,
                        scaleY: 0,
                        alpha: 0,
                        duration: 250,
                        ease: 'Back.easeIn'
                    });
                }
            });

            // Smoothly transition to the Business Tower scene
            this.scene.time.delayedCall(950, () => {
                this._runFadeTransition(() => {
                    this.dumpsterContainer.setVisible(false);
                    this.dealContainer.setVisible(false);
                    this._setupScene3BusinessTower();
                });
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Scene 3 & 4: Business Tower Assembly & Dynamic Sky Gradient
    // ─────────────────────────────────────────────────────────────────────────

    _setupScene3BusinessTower() {
        this.currentScene = 3;
        this.towerContainer.removeAll(true);
        this.towerContainer.setVisible(true);
        this.bustContainer.setVisible(true);

        const isPortrait = this.scene.scale.width < this.scene.scale.height;

        // Reset camera main coordinates for clean framing
        if (this.scene.cameras?.main) {
            this.scene.cameras.main.setZoom(1.0);
            this.scene.cameras.main.scrollY = 0;
            this.scene.cameras.main.scrollX = 0;
        }

        // 1. Procedural Background Gradient: full-screen vertical sky gradient via Graphics
        this.gradientGraphics = this.scene.add.graphics();
        this.gradientGraphics.setDepth(1);
        this.towerContainer.add(this.gradientGraphics);
        this._renderSkyGradient();

        // Tower stack root container
        this.towerStack = this.scene.add.container(300, 480);
        this.towerStack.setDepth(10);
        this.towerContainer.add(this.towerStack);

        // Assemble 3-floor tower (basement bottom at local y = 0)
        this._buildTowerSegments();

        // Viewport bounds calculation in mainContainer coordinate space
        const width = this.scene.scale?.width || 600;
        const height = this.scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;
        const screenBottom = 450 + (screenH / 2);
        const screenTop = 450 - (screenH / 2);

        // Responsive width scaling with maxWidth cap
        const maxTowerWidth = 640;
        const targetW = isPortrait ? Math.min(screenW, maxTowerWidth) : Math.min(screenW * 0.72, 540);
        const towerScale = targetW / 900;

        this.towerStack.setScale(towerScale);
        this.towerStack.x = 300;

        // Reset floor index and elevation state for Scene 3
        this.currentFloorIndex = 0;
        this.currentFloorOffsetY = 0;

        // 1. Initial Intro Camera Framing (Roof Entrance)
        // Adjust initial framing so the top of the roof (tower_ruuf) starts positioned lower
        // in the viewport (near bottom half / center-bottom area: screenTop + screenH * 0.58)
        // rather than touching the very top edge of the screen.
        const totalTowerH = 1919 * towerScale;
        const panStartY = (screenTop + screenH * 0.58) + totalTowerH;
        const restY = screenBottom;

        this.towerStack.y = panStartY;
        this.isIntroPanning = true;

        // Hero Bust Overlay anchored relative to building bounds
        this._setupHeroBust();

        // Animate smooth camera pan downward along building until basement settles flush against bottom edge
        this.scene.tweens.add({
            targets: this.towerStack,
            y: restY,
            duration: 2000,
            ease: 'Cubic.easeInOut',
            onComplete: () => {
                this.isIntroPanning = false;
                this.towerStack.y = restY;

                // Settle into final position and prompt user for Floor 1 interaction
                this._scheduleFastHelper();
            }
        });

        this.onResize(isPortrait);
    }

    _renderSkyGradient() {
        if (!this.gradientGraphics) return;
        this.gradientGraphics.clear();

        const width = this.scene.scale?.width || 600;
        const height = this.scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;

        const leftX = 300 - (screenW / 2) - 40;
        const topY = 450 - (screenH / 2) - 40;
        const totalW = screenW + 80;
        const totalH = screenH + 80;

        const topCol = this.gradientColors.top;
        const botCol = this.gradientColors.bottom;

        // Full-screen procedural vertical linear gradient spanning behind the tower
        this.gradientGraphics.fillGradientStyle(topCol, topCol, botCol, botCol, 1, 1, 1, 1);
        this.gradientGraphics.fillRect(leftX, topY, totalW, totalH);
    }

    _shiftSkyGradient() {
        const palette = this.config.tower.gradientPalette || [];
        if (palette.length === 0) return;

        this.currentPaletteIndex = (this.currentPaletteIndex + 1) % palette.length;
        const nextTop = parseInt(palette[this.currentPaletteIndex].top, 16);
        const nextBot = parseInt(palette[this.currentPaletteIndex].bottom, 16);

        // Smooth tween between color hexes using Color.Interpolate
        const startTop = this.gradientColors.top;
        const startBot = this.gradientColors.bottom;

        const proxy = { t: 0 };
        this.scene.tweens.add({
            targets: proxy,
            t: 1,
            duration: 350,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                this.gradientColors.top = this._lerpColor(startTop, nextTop, proxy.t);
                this.gradientColors.bottom = this._lerpColor(startBot, nextBot, proxy.t);
                this._renderSkyGradient();
            }
        });
    }

    _lerpColor(c1, c2, t) {
        const r1 = (c1 >> 16) & 0xff;
        const g1 = (c1 >> 8) & 0xff;
        const b1 = c1 & 0xff;

        const r2 = (c2 >> 16) & 0xff;
        const g2 = (c2 >> 8) & 0xff;
        const b2 = c2 & 0xff;

        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);

        return (r << 16) | (g << 8) | b;
    }

    _buildTowerSegments() {
        this.floorViews = [];

        // Vertical spacing math inside towerStack:
        // tower_foother: h = 516 (ground base, local bottom at y = 0, origin 0.5, 1.0)
        // tower_floor: h = 402 (each floor segment)
        // tower_ruuf: h = 327 (roof)
        //
        // Local bottom of basement is at y = 0.
        // Center of floor 1 sits 399px above base center (-258 - 399 = -657).
        // Each successive floor is spaced 402px above.
        const floor1Y = -657;
        const floor2Y = -1059;
        const floor3Y = -1461;
        const roofY = -1755.5;

        // 1. Base: tower_foother.png (bottom edge flush at local y = 0)
        this.towerBase = this.scene.add.image(0, 0, this.config.tower.baseTexture || 'tower_foother');
        this.towerBase.setOrigin(0.5, 1.0);
        this.towerStack.add(this.towerBase);

        // 2. Three Modular Floors: stacked bottom-to-top
        const floorConfigs = this.config.tower.floors || [];
        const floorPositionsY = [floor1Y, floor2Y, floor3Y];

        for (let i = 0; i < 3; i++) {
            const cfg = floorConfigs[i] || {};
            const floorY = floorPositionsY[i];

            const floorView = this._createFloorView(i, cfg, floorY);
            this.floorViews.push(floorView);
            this.towerStack.add(floorView.container);
        }

        // 3. Roof: tower_ruuf.png placed on top
        this.towerRoof = this.scene.add.image(0, roofY, this.config.tower.roofTexture || 'tower_ruuf');
        this.towerRoof.setOrigin(0.5, 0.5);
        this.towerStack.add(this.towerRoof);
    }

    _createFloorView(index, cfg, posY) {
        const container = this.scene.add.container(0, posY);

        // Floor frame segment: tower_floor.png
        const floorBg = this.scene.add.image(0, 0, this.config.tower.floorTexture || 'tower_floor');
        floorBg.setOrigin(0.5, 0.5);
        container.add(floorBg);

        // Room cavity container: sits inside the frame (center x = 0, y = 51)
        const roomY = 51;
        const roomContainer = this.scene.add.container(0, roomY);
        container.add(roomContainer);

        // Room Interior: tower_room_X.png
        const roomInterior = this.scene.add.image(0, 0, cfg.roomTexture);
        roomInterior.setOrigin(0.5, 0.5);
        roomContainer.add(roomInterior);

        // Dark overlay for State 2
        const darkOverlay = this.scene.add.graphics();
        darkOverlay.fillStyle(0x000000, 0.65);
        darkOverlay.fillRect(-412, -150, 825, 300);
        darkOverlay.setVisible(false);
        roomContainer.add(darkOverlay);

        // "TAP TO OPEN" badge & $ circle
        const tapToOpenContainer = this.scene.add.container(0, 0);
        tapToOpenContainer.setVisible(false);

        const circleBadge = this.scene.add.graphics();
        circleBadge.fillStyle(0xffffff, 1.0);
        circleBadge.fillCircle(0, -20, 48);
        circleBadge.lineStyle(4, 0x111122, 1.0);
        circleBadge.strokeCircle(0, -20, 48);

        const dollarTxt = this.scene.add.text(0, -20, '$', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '44px',
            fontStyle: 'bold',
            color: '#1b8a2e'
        }).setOrigin(0.5, 0.5);

        const tapTxt = this.scene.add.text(0, 52, 'TAP TO OPEN', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#111122',
            strokeThickness: 5
        }).setOrigin(0.5, 0.5);

        tapToOpenContainer.add([circleBadge, dollarTxt, tapTxt]);
        roomContainer.add(tapToOpenContainer);

        // Closed Shutter: tower_shutter.png (State 1)
        const shutter = this.scene.add.image(0, 0, this.config.tower.shutterTexture || 'tower_shutter');
        shutter.setOrigin(0.5, 0.5);
        roomContainer.add(shutter);

        // Shutter Center Label: card_choice_frame.png
        const labelContainer = this.scene.add.container(0, 0);
        roomContainer.add(labelContainer);

        const frameImg = this.scene.add.image(0, 0, this.config.tower.frameTexture || 'card_choice_frame');
        frameImg.setScale(0.85);

        // Floor 1 is green/active initially; upper floors are greyed out initially
        if (index > 0) {
            frameImg.setTint(0x666666);
        }

        // Left icon slot: room_X_ico.png vertically centered, padded from left edge without clipping
        const iconImg = this.scene.add.image(-138, 0, cfg.iconTexture);
        iconImg.setScale(0.65);
        iconImg.setOrigin(0.5, 0.5);
        if (index > 0) iconImg.setTint(0x777777);

        // Text content (room title and cost) horizontally and vertically centered in remaining text area
        const titleTxt = this.scene.add.text(54, -22, cfg.name, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#111122',
            strokeThickness: 4
        }).setOrigin(0.5, 0.5);

        const costTxt = this.scene.add.text(54, 22, cfg.initialCostLabel || 'FREE', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: index === 0 ? '#44ff44' : '#aaaaaa',
            stroke: '#111122',
            strokeThickness: 4
        }).setOrigin(0.5, 0.5);

        labelContainer.add([frameImg, iconImg, titleTxt, costTxt]);

        // Floor Control Panel (beneath each room)
        const panelContainer = this.scene.add.container(0, 168);
        panelContainer.setVisible(false);
        container.add(panelContainer);

        // Top-left: Floor name text
        const panelTitle = this.scene.add.text(-380, -32, cfg.name, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#111122',
            strokeThickness: 4
        });

        // Bottom-left: Progress bar container with green fill indicator & income text
        const barBg = this.scene.add.graphics();
        barBg.fillStyle(0x222226, 0.95);
        barBg.fillRoundedRect(-380, 0, 480, 46, 10);
        barBg.lineStyle(2, 0x444450, 1.0);
        barBg.strokeRoundedRect(-380, 0, 480, 46, 10);

        const barFill = this.scene.add.graphics();

        const incomeTxt = this.scene.add.text(-360, 23, cfg.upgrades?.[0]?.income || '$2', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#111122',
            strokeThickness: 4
        }).setOrigin(0, 0.5);

        // Right: Green upgrade button btn_upgrade_green.png displaying dynamic cost
        const upgradeBtn = this.scene.add.image(240, 23, this.config.tower.upgradeBtnTexture || 'btn_upgrade_green');
        upgradeBtn.setScale(0.48);

        const upgradeCostTxt = this.scene.add.text(240, 23, cfg.upgrades?.[0]?.cost || '$4.28', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#111122',
            strokeThickness: 4
        }).setOrigin(0.5, 0.5);

        panelContainer.add([panelTitle, barBg, barFill, incomeTxt, upgradeBtn, upgradeCostTxt]);

        const floorView = {
            index,
            cfg,
            container,
            roomContainer,
            roomInterior,
            darkOverlay,
            tapToOpenContainer,
            shutter,
            labelContainer,
            frameImg,
            iconImg,
            costTxt,
            panelContainer,
            barFill,
            incomeTxt,
            upgradeBtn,
            upgradeCostTxt,
            currentUpgrade: 0
        };

        this._updateFloorProgressBar(floorView, 0);

        // Setup interaction handlers
        this._bindFloorEvents(floorView);

        return floorView;
    }

    _updateFloorProgressBar(floorView, percent) {
        floorView.barFill.clear();
        if (percent <= 0) return;
        const maxW = 476;
        const fillW = Math.min(maxW, maxW * percent);
        floorView.barFill.fillStyle(0x27ae60, 1.0);
        floorView.barFill.fillRoundedRect(-378, 2, fillW, 42, 8);
    }

    _bindFloorEvents(floorView) {
        // State 1 -> State 2: Tapping shutter label
        floorView.labelContainer.setSize(400, 170);
        floorView.labelContainer.setInteractive({ useHandCursor: true });

        floorView.labelContainer.on('pointerdown', () => {
            if (this.scene?.isGameOver) return;
            if (floorView.index !== this.currentFloorIndex) return;
            if (this.floorStates[floorView.index].state !== 'shutter') return;

            if (typeof this.scene?.registerInteraction === 'function') {
                this.scene.registerInteraction('shutter');
            }
            if (this.scene?.isGameOver) return;

            this._clearHelperHand();

            try {
                Utils.addAudio(this.scene, 'door_sliding_open', 0.85);
                Utils.addAudio(this.scene, 'ui_click', 0.8);
            } catch (e) { }

            this.floorStates[floorView.index].state = 'tap_to_open';
            this._shiftSkyGradient();

            // Trigger celebratory bounce on Hero bust upon unlocking shutter
            this._celebrateHeroBust();

            // Label fades and shutter rolls upward
            this.scene.tweens.add({
                targets: floorView.labelContainer,
                alpha: 0,
                duration: 200,
                onComplete: () => {
                    floorView.labelContainer.destroy();
                }
            });

            this.scene.tweens.add({
                targets: floorView.shutter,
                y: -300,
                scaleY: 0.1,
                alpha: 0,
                duration: 550,
                ease: 'Quad.easeInOut',
                onComplete: () => {
                    floorView.shutter.destroy();
                    // Reveal State 2: Darkened Interior & TAP TO OPEN
                    floorView.darkOverlay.setVisible(true);
                    floorView.tapToOpenContainer.setVisible(true);

                    // Pulse TAP TO OPEN badge
                    this.scene.tweens.add({
                        targets: floorView.tapToOpenContainer,
                        scaleX: 1.06,
                        scaleY: 1.06,
                        duration: 400,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });

                    // Fast helper hand points to TAP TO OPEN
                    this._scheduleFastHelper();
                }
            });
        });

        // State 2 -> State 3: Tapping "TAP TO OPEN" / room
        floorView.roomContainer.setSize(825, 300);
        floorView.roomContainer.setInteractive({ useHandCursor: true });

        floorView.roomContainer.on('pointerdown', () => {
            if (this.scene?.isGameOver) return;
            if (floorView.index !== this.currentFloorIndex) return;
            if (this.floorStates[floorView.index].state !== 'tap_to_open') return;

            if (typeof this.scene?.registerInteraction === 'function') {
                this.scene.registerInteraction('room');
            }
            if (this.scene?.isGameOver) return;

            this._clearHelperHand();

            try {
                Utils.addAudio(this.scene, 'building_grow', 0.9);
                Utils.addAudio(this.scene, 'magic_sparkle', 0.8);
            } catch (e) { }

            this.floorStates[floorView.index].state = 'upgrading';
            this._shiftSkyGradient();

            // Fade out dark overlay and TAP TO OPEN icon
            this.scene.tweens.add({
                targets: [floorView.darkOverlay, floorView.tapToOpenContainer],
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    floorView.darkOverlay.destroy();
                    floorView.tapToOpenContainer.destroy();
                }
            });

            // Reveal and enable Floor Control Panel beneath room
            floorView.panelContainer.setVisible(true);
            floorView.panelContainer.setAlpha(0);
            this.scene.tweens.add({
                targets: floorView.panelContainer,
                alpha: 1,
                duration: 350
            });

            // Trigger celebratory bounce on Hero bust
            this._celebrateHeroBust();

            // Next fast helper prompt
            this._scheduleFastHelper();
        });

        // State 3: Upgrade Progression (4 Clicks per Floor)
        floorView.upgradeBtn.setInteractive({ useHandCursor: true });

        floorView.upgradeBtn.on('pointerdown', () => {
            if (this.scene?.isGameOver) return;
            if (floorView.index !== this.currentFloorIndex) return;
            if (this.floorStates[floorView.index].state !== 'upgrading') return;

            const curStep = floorView.currentUpgrade;
            if (curStep >= 4) return; // Already maxed

            if (typeof this.scene?.registerInteraction === 'function') {
                this.scene.registerInteraction('upgrade');
            }
            if (this.scene?.isGameOver) return;

            this._clearHelperHand();

            const nextStep = curStep + 1;
            floorView.currentUpgrade = nextStep;

            try {
                Utils.addAudio(this.scene, 'money_spend', 0.7);
                Utils.addAudio(this.scene, 'coins_reward', 0.85);
            } catch (e) { }

            // 1. Increases green progress bar fill by +25%
            const percent = nextStep / 4;
            this._updateFloorProgressBar(floorView, percent);

            // Update income and cost values
            const upgradeData = floorView.cfg.upgrades?.[nextStep] || {};
            if (upgradeData.income) floorView.incomeTxt.setText(upgradeData.income);
            if (upgradeData.cost) floorView.upgradeCostTxt.setText(upgradeData.cost);

            // 2. Spawns standard coin fly-in effects into global BalanceView
            if (this.scene.balanceView) {
                const btnWorldX = this.towerStack.x + (floorView.container.x + floorView.panelContainer.x + floorView.upgradeBtn.x) * this.towerStack.scaleX;
                const btnWorldY = this.towerStack.y + (floorView.container.y + floorView.panelContainer.y + floorView.upgradeBtn.y) * this.towerStack.scaleY;
                const rewardAmount = upgradeData.reward || 150;
                this.scene.balanceView.spawnCoinFlyIn(btnWorldX, btnWorldY, rewardAmount, 6);
            }

            // 3. Shifts dynamic background sky gradient
            this._shiftSkyGradient();

            // 4. Triggers Hero celebratory animation
            this._celebrateHeroBust();

            // Button press punch
            this.scene.tweens.add({
                targets: [floorView.upgradeBtn, floorView.upgradeCostTxt],
                scaleX: 0.42,
                scaleY: 0.42,
                duration: 90,
                yoyo: true,
                ease: 'Quad.easeInOut'
            });

            // Check if floor reached 100% completion (4th click)
            if (nextStep >= 4) {
                floorView.upgradeCostTxt.setText('MAX');
                floorView.upgradeBtn.setTint(0x888888);
                this._onFloorCompleted(floorView.index);
            } else {
                this._scheduleFastHelper();
            }
        });
    }

    _onFloorCompleted(floorIndex) {
        // Hero Skin Evolution with Golden Glow
        this._evolveHeroSkin(floorIndex, () => {
            const nextFloor = floorIndex + 1;
            if (nextFloor < 3) {
                this.currentFloorIndex = nextFloor;

                const width = this.scene.scale?.width || 600;
                const height = this.scene.scale?.height || 900;
                const appScale = Math.min(width / 600, height / 900) || 1;
                const screenW = width / appScale;
                const screenH = height / appScale;
                const isPortrait = width < height;
                const screenBottom = 450 + (screenH / 2);

                const maxTowerWidth = 640;
                const targetW = isPortrait ? Math.min(screenW, maxTowerWidth) : Math.min(screenW * 0.72, 540);
                const towerScale = targetW / 900;

                // Dynamic Camera Elevation: smoothly pan upward to bring new active room and controls into focus
                const targetOffsetY = nextFloor * 402 * towerScale;
                this.currentFloorOffsetY = targetOffsetY;
                const targetTowerY = screenBottom + targetOffsetY;

                this.isElevationPanning = true;
                this.scene.tweens.add({
                    targets: this.towerStack,
                    y: targetTowerY,
                    duration: 850,
                    ease: 'Cubic.easeInOut',
                    onComplete: () => {
                        this.isElevationPanning = false;
                        this.towerStack.y = targetTowerY;

                        // Unlock next floor shutter label
                        const nextView = this.floorViews[nextFloor];
                        if (nextView) {
                            this.floorStates[nextFloor].state = 'shutter';
                            nextView.frameImg.clearTint();
                            nextView.iconImg.clearTint();
                            nextView.costTxt.setColor('#44ff44');
                            nextView.costTxt.setText('FREE');

                            // Pulse the newly unlocked shutter label
                            this.scene.tweens.add({
                                targets: nextView.labelContainer,
                                scaleX: 1.05,
                                scaleY: 1.05,
                                duration: 350,
                                yoyo: true,
                                repeat: 2
                            });

                            this._scheduleFastHelper();
                        }
                    }
                });
            } else {
                // Scene 5: Completion & Endcard Trigger
                this._triggerCompletionScene();
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hero Bust Overlay & Progressive Skin Evolution
    // ─────────────────────────────────────────────────────────────────────────

    _setupHeroBust() {
        this.bustContainer.removeAll(true);
        this.bustContainer.setDepth(60);

        const width = this.scene.scale?.width || 600;
        const height = this.scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;

        const isPortrait = width < height;
        const screenBottom = 450 + (screenH / 2);

        // Building horizontal bounds: centered at x = 300 with width 910 * towerScale
        const maxTowerWidth = 640;
        const targetW = isPortrait ? Math.min(screenW, maxTowerWidth) : Math.min(screenW * 0.72, 540);
        const towerScale = targetW / 900;
        const buildingW = 910 * towerScale;
        const buildingLeft = 300 - (buildingW / 2);

        const bustScale = isPortrait ? 0.54 : 0.46;
        // In portrait mode where building spans 100% width, Hero naturally aligns near screen's bottom-left.
        // In widescreen/landscape where building reaches maxWidth cap, Hero remains locked to building's bottom-left corner.
        const bustX = buildingLeft + (isPortrait ? 85 : 75);
        const bustY = screenBottom - (isPortrait ? 15 : 10);
        this.heroBustBaseY = bustY;

        // Anchor strictly relative to bottom-left boundary of building container
        this.heroBust = new PuppetCharacter(this.scene, bustX, bustY, SKELETON_CONFIG, HERO_RAGS_CONFIG);
        for (const [bone, tex] of Object.entries(HERO_DEFAULT_RAGS_PARTS)) {
            this.heroBust.setAttachment(bone, tex);
        }
        this.heroBust.animator = new PuppetAnimator(this.scene, this.heroBust);
        this.heroBust.setScale(bustScale);
        this.bustContainer.add(this.heroBust);

        // Hide legs and feet for half-body bust
        if (this.heroBust.bones?.leg_upper_left) this.heroBust.bones.leg_upper_left.setVisible(false);
        if (this.heroBust.bones?.leg_upper_right) this.heroBust.bones.leg_upper_right.setVisible(false);
        if (this.heroBust.bones?.foot_left) this.heroBust.bones.foot_left.setVisible(false);
        if (this.heroBust.bones?.foot_right) this.heroBust.bones.foot_right.setVisible(false);

        // Idle: Gentle breathing scale and subtle sway
        this._startBustIdle();
    }

    _startBustIdle() {
        if (!this.heroBust || !this.heroBust.active) return;

        // Reset arms and face to clean resting state
        const armL = this.heroBust.bones?.arm_left;
        const armR = this.heroBust.bones?.arm_right;
        if (armL) {
            this.scene.tweens.killTweensOf(armL);
            armL.angle = 0;
        }
        if (armR) {
            this.scene.tweens.killTweensOf(armR);
            armR.angle = 0;
        }

        const baseY = this.heroBustBaseY || this.heroBust.y;
        this.scene.tweens.killTweensOf(this.heroBust);
        this.heroBust.y = baseY;

        this.heroBust.setFace(this.heroBust.skin?.defaultFace || 'idle');

        // Body gentle breathing scale
        const body = this.heroBust.bones?.body;
        if (body) {
            this.scene.tweens.killTweensOf(body);
            body.scaleX = 1;
            body.scaleY = 1;
            this.scene.tweens.add({
                targets: body,
                scaleY: 1.035,
                scaleX: 0.985,
                duration: 900,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Head subtle idle sway
        const head = this.heroBust.bones?.head;
        if (head) {
            this.scene.tweens.killTweensOf(head);
            head.angle = 0;
            this.scene.tweens.add({
                targets: head,
                angle: 2.5,
                duration: 1200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    _celebrateHeroBust() {
        if (!this.heroBust || !this.heroBust.active) return;
        const baseY = this.heroBustBaseY || this.heroBust.y;

        if (typeof this.heroBust.celebrate === 'function') {
            this.heroBust.celebrate(baseY);
            return;
        }

        this.heroBust.setFace('happy');

        // Raised arms bounce
        const armL = this.heroBust.bones?.arm_left;
        const armR = this.heroBust.bones?.arm_right;

        if (armL) {
            this.scene.tweens.killTweensOf(armL);
            armL.angle = 0;
            this.scene.tweens.add({
                targets: armL,
                angle: 125,
                duration: 180,
                yoyo: true,
                ease: 'Back.easeOut',
                onComplete: () => {
                    if (armL && armL.active) armL.angle = 0;
                }
            });
        }
        if (armR) {
            this.scene.tweens.killTweensOf(armR);
            armR.angle = 0;
            this.scene.tweens.add({
                targets: armR,
                angle: -125,
                duration: 180,
                yoyo: true,
                ease: 'Back.easeOut',
                onComplete: () => {
                    if (armR && armR.active) armR.angle = 0;
                }
            });
        }

        // Celebratory bounce returning cleanly to responsive baseY
        this.scene.tweens.killTweensOf(this.heroBust);
        this.scene.tweens.add({
            targets: this.heroBust,
            y: baseY - 25,
            duration: 160,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => {
                if (this.heroBust && this.heroBust.active) {
                    this.heroBust.y = baseY;
                    this.heroBust.setFace(this.heroBust.skin?.defaultFace || 'idle');
                }
            }
        });
    }

    _evolveHeroSkin(floorIndex, onComplete) {
        if (!this.heroBust || !this.heroBust.active) {
            if (onComplete) onComplete();
            return;
        }

        this._isCelebrating = false;

        try {
            Utils.addAudio(this.scene, 'magic_sparkle', 1.0);
            Utils.addAudio(this.scene, 'coins_reward', 0.9);
        } catch (e) { }

        // Golden Flash / Light Overlay Animation over Hero Avatar
        const flashGraphic = this.scene.add.graphics();
        flashGraphic.fillStyle(0xffe066, 0.85);
        flashGraphic.fillCircle(this.heroBust.x, this.heroBust.y - 100, 160);
        flashGraphic.setDepth(70);
        flashGraphic.setAlpha(0);
        this.bustContainer.add(flashGraphic);

        // Light beam rays
        const beam = this.scene.add.graphics();
        beam.fillStyle(0xffd700, 0.6);
        beam.fillRect(this.heroBust.x - 90, 0, 180, 900);
        beam.setDepth(69);
        beam.setAlpha(0);
        this.bustContainer.add(beam);

        // Flash in to peak opacity
        this.scene.tweens.add({
            targets: [flashGraphic, beam],
            alpha: 1,
            duration: 220,
            ease: 'Quad.easeIn',
            onComplete: () => {
                // At peak flash opacity: swap entire puppet sprite set
                let nextSkin = HERO_CASUAL2_CONFIG;
                if (floorIndex === 1) nextSkin = HERO_GOLD_CONFIG;
                if (floorIndex === 2) nextSkin = HERO_RICH_CONFIG;

                this._applySkinToPuppet(this.heroBust, nextSkin);

                // Celebratory cheering pose
                this._celebrateHeroBust();

                // Flash out
                this.scene.tweens.add({
                    targets: [flashGraphic, beam],
                    alpha: 0,
                    duration: 380,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        flashGraphic.destroy();
                        beam.destroy();

                        // 1. Reset all celebration and animation lock flags
                        this._isCelebrating = false;

                        // 2. Re-bind and immediately resume the baseline Idle breathing/sway loop
                        this._startBustIdle();

                        if (onComplete) onComplete();
                    }
                });
            }
        });
    }

    _applySkinToPuppet(puppet, skinConfig) {
        if (!puppet || !skinConfig) return;
        puppet.skin = skinConfig;

        const parts = skinConfig.parts || {};
        for (const [boneName, textureKey] of Object.entries(parts)) {
            puppet.setAttachment(boneName, textureKey);
        }

        puppet.setFace(skinConfig.defaultFace || 'idle');

        // Re-bind animation controller so it references current puppet state cleanly
        if (puppet.animator) {
            puppet.animator.puppet = puppet;
        }

        // Keep legs and feet hidden for waist-up bust
        if (puppet.bones?.leg_upper_left) puppet.bones.leg_upper_left.setVisible(false);
        if (puppet.bones?.leg_upper_right) puppet.bones.leg_upper_right.setVisible(false);
        if (puppet.bones?.foot_left) puppet.bones.foot_left.setVisible(false);
        if (puppet.bones?.foot_right) puppet.bones.foot_right.setVisible(false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fast Helper Hand Management
    // ─────────────────────────────────────────────────────────────────────────

    _scheduleFastHelper() {
        this._clearHelperHand();

        const delay = this.config.tower.fastHelperDelayMs || 900;
        this.helperHandTimer = this.scene.time.delayedCall(delay, () => {
            this._promptCurrentFloorTarget();
        });
    }

    _promptCurrentFloorTarget() {
        if (!this.isActive || this.currentScene !== 3) return;

        const curFloor = this.currentFloorIndex;
        const floorView = this.floorViews[curFloor];
        if (!floorView) return;

        const state = this.floorStates[curFloor]?.state;

        if (state === 'shutter') {
            // Point to active shutter label
            this._showHelperHand(floorView.labelContainer, 30, 30, floorView.container);
        } else if (state === 'tap_to_open') {
            // Point to TAP TO OPEN in room center
            this._showHelperHand(floorView.tapToOpenContainer, 0, 15, floorView.container);
        } else if (state === 'upgrading' && floorView.currentUpgrade < 4) {
            // Point to green upgrade button
            this._showHelperHand(floorView.upgradeBtn, 20, 20, floorView.panelContainer);
        }
    }

    _showHelperHand(targetObj, offsetX = 0, offsetY = 0, parentRef = null) {
        if (!targetObj || !this.scene?.textures?.exists('helper_hand')) return;
        this._clearHelperHand();

        this._helperHandTarget = targetObj;
        this._helperHandOffset = { x: offsetX, y: offsetY };

        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        // Scale helper hand proportionally to match dumpster and character size, preventing oversized graphics
        let handBaseScale = 0.42;
        if (this.currentScene === 1 || this.currentScene === 2) {
            const clusterScale = this.dumpsterCluster?.scaleX || (isPortrait ? 0.72 : 0.85);
            handBaseScale = isPortrait ? 0.42 : Math.min(0.38, clusterScale * 0.44);
        } else if (!isPortrait) {
            handBaseScale = 0.38;
        }

        if (!this.helperHand || !this.helperHand.active) {
            this.helperHand = this.scene.add.image(0, 0, 'helper_hand');
            this.helperHand.setOrigin(0.12, 0.05);
            this.helperHand.setDepth(200);
            this.uiContainer.add(this.helperHand);
        }
        this.helperHand.setScale(handBaseScale);

        // Calculate mainContainer absolute position
        let targetX = targetObj.x;
        let targetY = targetObj.y;

        let cur = targetObj.parentContainer;
        while (cur && cur !== this.scene.mainContainer) {
            targetX = cur.x + targetX * (cur.scaleX || 1);
            targetY = cur.y + targetY * (cur.scaleY || 1);
            cur = cur.parentContainer;
        }

        targetX += offsetX;
        targetY += offsetY;

        this.helperHand.setPosition(targetX + 30, targetY + 30);
        this.helperHand.setAlpha(0);
        this.helperHand.setVisible(true);

        // Float in and tap pulse
        this.scene.tweens.add({
            targets: this.helperHand,
            x: targetX,
            y: targetY,
            alpha: 1,
            duration: 260,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (!this.helperHand || !this.helperHand.active) return;
                this.scene.tweens.add({
                    targets: this.helperHand,
                    scaleX: handBaseScale * 0.86,
                    scaleY: handBaseScale * 0.86,
                    y: targetY + 8,
                    duration: 150,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        });
    }

    _clearHelperHand() {
        this._helperHandTarget = null;
        this._helperHandOffset = null;
        if (this.helperHandTimer) {
            this.helperHandTimer.remove();
            this.helperHandTimer = null;
        }
        if (this.helperHand && this.helperHand.active) {
            this.scene.tweens.killTweensOf(this.helperHand);
            this.helperHand.setVisible(false);
        }
    }

    disableAllInteractivity() {
        this._clearHelperHand();

        if (this.rat && this.rat.active) {
            this.rat.disableInteractive();
        }
        if (this.moneyBag && this.moneyBag.active) {
            this.moneyBag.disableInteractive();
        }
        if (this.speechBubble && this.speechBubble.active) {
            this.speechBubble.disableInteractive();
        }

        if (Array.isArray(this.floorViews)) {
            this.floorViews.forEach(floorView => {
                if (!floorView) return;
                if (floorView.labelContainer && floorView.labelContainer.active) {
                    floorView.labelContainer.disableInteractive();
                }
                if (floorView.roomContainer && floorView.roomContainer.active) {
                    floorView.roomContainer.disableInteractive();
                }
                if (floorView.upgradeBtn && floorView.upgradeBtn.active) {
                    floorView.upgradeBtn.disableInteractive();
                }
            });
        }
    }

    triggerEarlyEndcard() {
        this.disableAllInteractivity();
        this.isEndcardActive = true;
        this.currentScene = 5;
        this._clearHelperHand();

        if (typeof this.scene?.showEndcard === 'function') {
            this.scene.showEndcard('act2_early');
        } else {
            this._showEndcardOverlay();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────
    // Scene 5: Act 2 Endcard Sequence (UI Cleanup, Camera Framing, Dual-Button Overlay)
    // ─────────────────────────────────────────────────────────────────────────

    _triggerCompletionScene() {
        this.currentScene = 5;
        this.isEndcardActive = true;
        this._clearHelperHand();

        // 1. Act 2 Conclusion & UI Cleanup:
        // Clear and destroy all floor-specific interface elements across all floors:
        // shutter frames, choice plates, "TAP TO OPEN" badges, progress bars, income labels, upgrade buttons
        this.floorViews.forEach(floorView => {
            if (floorView.labelContainer && floorView.labelContainer.active) {
                this.scene.tweens.killTweensOf(floorView.labelContainer);
                floorView.labelContainer.destroy();
            }
            if (floorView.darkOverlay && floorView.darkOverlay.active) {
                this.scene.tweens.killTweensOf(floorView.darkOverlay);
                floorView.darkOverlay.destroy();
            }
            if (floorView.tapToOpenContainer && floorView.tapToOpenContainer.active) {
                this.scene.tweens.killTweensOf(floorView.tapToOpenContainer);
                floorView.tapToOpenContainer.destroy();
            }
            if (floorView.shutter && floorView.shutter.active) {
                this.scene.tweens.killTweensOf(floorView.shutter);
                floorView.shutter.destroy();
            }
            if (floorView.panelContainer && floorView.panelContainer.active) {
                this.scene.tweens.killTweensOf(floorView.panelContainer);
                floorView.panelContainer.destroy();
            }
        });

        // 2. Endcard Camera Framing:
        // Animate a smooth camera pan downward so that the top edge of the building's roof (tower_ruuf)
        // aligns flush against the top edge of the window.
        // In towerStack, roof top is at local y = -1919.
        // For roof top to align flush against screenTop: towerStack.y - (1919 * towerScale) = screenTop
        // => targetTowerY = screenTop + (1919 * towerScale)
        const width = this.scene.scale?.width || 600;
        const height = this.scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenH = height / appScale;
        const screenTop = 450 - (screenH / 2);
        const isPortrait = width < height;

        const maxTowerWidth = 640;
        const targetW = isPortrait ? Math.min(width / appScale, maxTowerWidth) : Math.min((width / appScale) * 0.72, 540);
        const towerScale = targetW / 900;

        const targetTowerY = screenTop + (1919 * towerScale);

        this.isEndcardPanning = true;
        this.scene.tweens.add({
            targets: this.towerStack,
            y: targetTowerY,
            duration: 1000,
            ease: 'Cubic.easeInOut',
            onComplete: () => {
                this.isEndcardPanning = false;
                this.towerStack.y = targetTowerY;
            }
        });

        // Celebration: Coin cascade
        this._spawnCompletionCoinCascade();

        // 3. Overlay & Endcard Assets Display:
        // Fade in dimmer overlay, show final_img.png and dual action buttons
        this.scene.time.delayedCall(250, () => {
            this._showEndcardOverlay();
        });
    }

    _showEndcardOverlay() {
        if (typeof this.scene?.showEndcard === 'function') {
            this.scene.showEndcard('act2_overlay');
            return;
        }

        this.endcardContainer.removeAll(true);
        this.endcardContainer.setVisible(true);

        const width = this.scene.scale?.width || 600;
        const height = this.scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;
        const isPortrait = width < height;
        const screenTop = 450 - (screenH / 2);

        // 3.1 Dimmer Overlay: Fade in full-screen semi-transparent dark overlay above building and character layers
        this.endcardDimmer = this.scene.add.graphics();
        this._renderEndcardDimmer();
        this.endcardDimmer.setAlpha(0);
        this.endcardContainer.add(this.endcardDimmer);

        this.scene.tweens.add({
            targets: this.endcardDimmer,
            alpha: 1,
            duration: 400,
            ease: 'Quad.easeOut'
        });

        // 3.2 Graphic (final_img.png): Centered horizontally in the upper-middle section of screen above overlay
        const finalScale = isPortrait ? 1.05 : 0.72;
        const finalY = screenTop + (screenH * (isPortrait ? 0.33 : 0.28));

        this.endcardFinalImg = this.scene.add.image(300, finalY, 'final_img');
        this.endcardFinalImg.setOrigin(0.5, 0.5);
        this.endcardFinalImg.setScale(0);
        this.endcardContainer.add(this.endcardFinalImg);

        this.scene.tweens.add({
            targets: this.endcardFinalImg,
            scaleX: finalScale,
            scaleY: finalScale,
            duration: 500,
            delay: 150,
            ease: 'Back.easeOut'
        });

        // 3.3 Action Buttons: Two interactive buttons placed side-by-side with clear separation beneath final_img.png
        // Left: btn_restart_red.png, Right: btn_try_again_green.png
        const btnScale = isPortrait ? 0.46 : 0.36;
        const btnSpacing = isPortrait ? 122 : 130;
        const btnY = finalY + (isPortrait ? 180 : 152);

        this.endcardBtnRestart = this.scene.add.image(300 - btnSpacing, btnY, 'btn_restart_red');
        this.endcardBtnRestart.setOrigin(0.5, 0.5);
        this.endcardBtnRestart.setScale(0);
        this.endcardBtnRestart.setInteractive({ useHandCursor: true });
        this.endcardContainer.add(this.endcardBtnRestart);

        this.endcardBtnTryAgain = this.scene.add.image(300 + btnSpacing, btnY, 'btn_try_again_green');
        this.endcardBtnTryAgain.setOrigin(0.5, 0.5);
        this.endcardBtnTryAgain.setScale(0);
        this.endcardBtnTryAgain.setInteractive({ useHandCursor: true });
        this.endcardContainer.add(this.endcardBtnTryAgain);

        this.scene.tweens.add({
            targets: [this.endcardBtnRestart, this.endcardBtnTryAgain],
            scaleX: btnScale,
            scaleY: btnScale,
            duration: 500,
            delay: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                this._pulseEndcardButtons(btnScale);
                // 4. Spawn helper hand indicating and prompting user to tap on either button
                this._spawnEndcardHelperHand();
            }
        });

        // 4. Bind click events to trigger project's established restart/store redirect action
        const onButtonClick = (btnObj) => {
            try {
                Utils.addAudio(this.scene, 'click', 1.0);
            } catch (e) { }

            if (this.endcardHelperHand && this.endcardHelperHand.active) {
                this.scene.tweens.killTweensOf(this.endcardHelperHand);
                this.endcardHelperHand.setVisible(false);
            }

            this.scene.tweens.add({
                targets: btnObj,
                scaleX: btnScale * 0.9,
                scaleY: btnScale * 0.9,
                duration: 90,
                yoyo: true,
                onComplete: () => {
                    this._handleEndcardCta();
                }
            });
        };

        this.endcardBtnRestart.on('pointerdown', () => onButtonClick(this.endcardBtnRestart));
        this.endcardBtnTryAgain.on('pointerdown', () => onButtonClick(this.endcardBtnTryAgain));
    }

    _renderEndcardDimmer() {
        if (!this.endcardDimmer) return;
        this.endcardDimmer.clear();

        const width = this.scene.scale?.width || 600;
        const height = this.scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;

        const leftX = 300 - (screenW / 2) - 100;
        const topY = 450 - (screenH / 2) - 100;
        const totalW = screenW + 200;
        const totalH = screenH + 200;

        this.endcardDimmer.fillStyle(0x000000, 0.65);
        this.endcardDimmer.fillRect(leftX, topY, totalW, totalH);
    }

    _pulseEndcardButtons(baseScale) {
        if (!this.endcardBtnRestart || !this.endcardBtnTryAgain) return;
        this.scene.tweens.add({
            targets: [this.endcardBtnRestart, this.endcardBtnTryAgain],
            scaleX: baseScale * 1.05,
            scaleY: baseScale * 1.05,
            duration: 750,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    _spawnEndcardHelperHand() {
        if (!this.scene?.textures?.exists('helper_hand')) return;
        if (!this.endcardBtnTryAgain || !this.endcardBtnTryAgain.active) return;

        if (!this.endcardHelperHand || !this.endcardHelperHand.active) {
            this.endcardHelperHand = this.scene.add.image(0, 0, 'helper_hand');
            this.endcardHelperHand.setOrigin(0.12, 0.05);
            this.endcardHelperHand.setScale(0.42);
            this.endcardHelperHand.setDepth(200);
            this.endcardContainer.add(this.endcardHelperHand);
        }

        const targetBtn = this.endcardBtnTryAgain;
        const handX = targetBtn.x + 25;
        const handY = targetBtn.y + 25;

        this.endcardHelperHand.setPosition(handX + 25, handY + 25);
        this.endcardHelperHand.setAlpha(0);
        this.endcardHelperHand.setVisible(true);

        this.scene.tweens.add({
            targets: this.endcardHelperHand,
            x: handX,
            y: handY,
            alpha: 1,
            duration: 300,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (!this.endcardHelperHand || !this.endcardHelperHand.active) return;
                this.scene.tweens.add({
                    targets: this.endcardHelperHand,
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

    _handleEndcardCta() {
        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_RETRY');
            window.trackAxonEvent('ENDCARD_CLICK');
        }
        if (window.App && window.App.network) {
            window.App.network.ctaClick();
        }
    }

    _spawnCompletionCoinCascade() {
        try {
            Utils.addAudio(this.scene, 'coins_reward', 1.0);
        } catch (e) { }

        for (let i = 0; i < 24; i++) {
            const coin = this.scene.add.image(100 + Math.random() * 400, -50 - Math.random() * 200, 'icon_coin_gold');
            coin.setScale(0.24 + Math.random() * 0.2);
            coin.setDepth(180);
            this.uiContainer.add(coin);

            this.scene.tweens.add({
                targets: coin,
                y: 950 + Math.random() * 100,
                x: coin.x + (Math.random() - 0.5) * 80,
                angle: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
                duration: 1000 + Math.random() * 400,
                delay: i * 40,
                ease: 'Quad.easeIn',
                onComplete: () => coin.destroy()
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Responsive Layout & Orientation Handling
    // ─────────────────────────────────────────────────────────────────────────

    onResize(isPortrait) {
        if (!this.isActive) return;

        // Effective viewport dimensions in mainContainer coordinates:
        // App scales mainContainer uniformly by appScale = Math.min(width / 600, height / 900).
        // Therefore, the visible viewport in mainContainer space is (scale.width / appScale, scale.height / appScale).
        const width = this.scene.scale?.width || 600;
        const height = this.scene.scale?.height || 900;
        const appScale = Math.min(width / 600, height / 900) || 1;
        const screenW = width / appScale;
        const screenH = height / appScale;

        const screenTop = 450 - (screenH / 2);
        const screenBottom = 450 + (screenH / 2);
        const screenLeft = 300 - (screenW / 2);

        // Texture native dimensions for dumpster_bg.png
        const bgW = 988;
        const bgH = 981;

        // Full-bleed coverage:
        // In portrait: scale to cover full height from top to bottom (screenH / bgH).
        // In landscape: scale to cover full width from left to right (screenW / bgW).
        // Math.max(screenW / bgW, screenH / bgH) covers both conditions seamlessly without letterboxing bars.
        // We add a tiny 2% overscan margin (1.02) to guarantee zero sub-pixel seam edge artifacts.
        const coverScale = Math.max(screenW / bgW, screenH / bgH) * 1.02;

        let groundY = 450 + (224.5 * coverScale);

        if (isPortrait) {
            if (this.dumpsterBg && this.dumpsterBg.active) {
                this.dumpsterBg.setScale(coverScale);
                this.dumpsterBg.setPosition(300, 450);
            }

            // Sidewalk Ground Alignment in portrait:
            groundY = 450 + (224.5 * coverScale);
            const clusterBaseScale = 0.72;
            const responsiveMultiplier = Math.min(1.15, Math.max(0.85, coverScale / 1.0));
            const clusterScale = clusterBaseScale * responsiveMultiplier;

            if (this.dumpsterCluster && this.dumpsterCluster.active) {
                this.dumpsterCluster.setPosition(300, groundY);
                this.dumpsterCluster.setScale(clusterScale);
            }
        } else {
            // Landscape Mode:
            // 1. Scale of dumpster assembly, Hero, rat, and money bag increased to 0.85 so interactive zone is prominent
            const clusterScale = 0.85;

            // 2. Bottom-Anchored Camera Framing & Downward Vertical Offset:
            // Center the dumpster in view with ample lower sidewalk and cut away excessive empty wall space at the top.
            // With screenBottom = 900 and dumpster height ~ 440px (518 * 0.85), placing groundY at screenBottom - 270 (630px)
            // places the dumpster center comfortably at y = 410 (near screen center 450), exposing 270px of lower sidewalk
            // and guaranteeing the Hero never falls or clips beyond the bottom screen edge upon jumping down.
            groundY = screenBottom - 270;

            if (this.dumpsterBg && this.dumpsterBg.active) {
                this.dumpsterBg.setScale(coverScale);
                // Anchor pavement baseline to groundY, shifting excessive empty wall space up off-screen
                const bgY = groundY - (224.5 * coverScale);
                this.dumpsterBg.setPosition(300, bgY);
            }

            if (this.dumpsterCluster && this.dumpsterCluster.active) {
                this.dumpsterCluster.setPosition(300, groundY);
                this.dumpsterCluster.setScale(clusterScale);
            }
        }

        // Scene 2 alignment: Millionaire, Hero, and open money bag are within dumpsterCluster and automatically adhere to groundY
        if (this.currentScene === 2 && this.dealContainer && this.dealContainer.active) {
            const sidewalkStandY = groundY - 20;
            if (this.alleyHero && this.alleyHero.parentContainer === this.dealContainer) {
                this.alleyHero.y = sidewalkStandY;
            }
            if (this.moneyBag && this.moneyBag.parentContainer === this.dealContainer) {
                this.moneyBag.y = sidewalkStandY + 5;
            }
            if (this.millionaire && this.millionaire.parentContainer === this.dealContainer) {
                this.millionaire.y = sidewalkStandY;
            }
        }

        // Re-anchor active helper hand on orientation/screen resize
        if (this.helperHand && this.helperHand.active && this.helperHand.visible && this._helperHandTarget) {
            let handBaseScale = 0.42;
            if (this.currentScene === 1 || this.currentScene === 2) {
                const clusterScale = this.dumpsterCluster?.scaleX || (isPortrait ? 0.72 : 0.85);
                handBaseScale = isPortrait ? 0.42 : Math.min(0.38, clusterScale * 0.44);
            } else if (!isPortrait) {
                handBaseScale = 0.38;
            }
            this.helperHand.setScale(handBaseScale);

            let tx = this._helperHandTarget.x;
            let ty = this._helperHandTarget.y;
            let cur = this._helperHandTarget.parentContainer;
            while (cur && cur !== this.scene.mainContainer) {
                tx = cur.x + tx * (cur.scaleX || 1);
                ty = cur.y + ty * (cur.scaleY || 1);
                cur = cur.parentContainer;
            }
            tx += (this._helperHandOffset?.x || 0);
            ty += (this._helperHandOffset?.y || 0);
            this.helperHand.setPosition(tx, ty);
        }

        // Adjust Tower Stack position and scale
        if (this.towerStack && this.towerStack.active) {
            const maxTowerWidth = 640;
            const targetW = isPortrait ? Math.min(screenW, maxTowerWidth) : Math.min(screenW * 0.72, 540);
            const towerScale = targetW / 900;

            this.towerStack.setScale(towerScale);
            this.towerStack.x = 300;

            // When in endcard, keep roof flush against top edge of window
            if (this.isEndcardActive) {
                if (!this.isEndcardPanning) {
                    this.towerStack.y = screenTop + (1919 * towerScale);
                }
            } else if (!this.isIntroPanning && !this.isElevationPanning) {
                const floorOffset = (this.currentFloorIndex || 0) * 402 * towerScale;
                this.currentFloorOffsetY = floorOffset;
                this.towerStack.y = screenBottom + floorOffset;
            }
        }

        // Adjust Hero Bust position: locked to bottom-left boundary of building container
        if (this.heroBust && this.heroBust.active) {
            const maxTowerWidth = 640;
            const targetW = isPortrait ? Math.min(screenW, maxTowerWidth) : Math.min(screenW * 0.72, 540);
            const towerScale = targetW / 900;
            const buildingW = 910 * towerScale;
            const buildingLeft = 300 - (buildingW / 2);

            const bustScale = isPortrait ? 0.54 : 0.46;
            const bustX = buildingLeft + (isPortrait ? 85 : 75);
            const bustY = screenBottom - (isPortrait ? 15 : 10);
            this.heroBustBaseY = bustY;

            this.heroBust.setScale(bustScale);
            this.heroBust.setPosition(bustX, bustY);
        }

        // Adjust Endcard overlay and assets
        if (this.isEndcardActive) {
            this._renderEndcardDimmer();

            const finalScale = isPortrait ? 1.05 : 0.72;
            const finalY = screenTop + (screenH * (isPortrait ? 0.33 : 0.28));
            if (this.endcardFinalImg && this.endcardFinalImg.active) {
                this.endcardFinalImg.setPosition(300, finalY);
                this.endcardFinalImg.setScale(finalScale);
            }

            const btnScale = isPortrait ? 0.46 : 0.36;
            const btnSpacing = isPortrait ? 122 : 130;
            const btnY = finalY + (isPortrait ? 180 : 152);

            if (this.endcardBtnRestart && this.endcardBtnRestart.active) {
                this.endcardBtnRestart.setPosition(300 - btnSpacing, btnY);
                this.endcardBtnRestart.setScale(btnScale);
            }
            if (this.endcardBtnTryAgain && this.endcardBtnTryAgain.active) {
                this.endcardBtnTryAgain.setPosition(300 + btnSpacing, btnY);
                this.endcardBtnTryAgain.setScale(btnScale);
            }
            if (this.endcardHelperHand && this.endcardHelperHand.active) {
                this.endcardHelperHand.setPosition(300 + btnSpacing + 25, btnY + 25);
            }
        }

        this._renderSkyGradient();
    }
}
