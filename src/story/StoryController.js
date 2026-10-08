import Button from '../Button';
import Utils from '../../core/framework/Utils';
import UI_CONFIG from '../config/ui.json';
import PARTY_FX_CONFIG from '../config/party_fx.json';
import PartyFXController from '../fx/PartyFXController';

export default class StoryController {
    constructor(scene, storyConfig, puppetsMap, uiComponents) {
        this.scene = scene;
        this.story = storyConfig;
        this.puppets = puppetsMap;
        this.ui = uiComponents;
        if (this.ui?.choices && this.ui?.balance && typeof this.ui.choices.setBalanceView === 'function') {
            this.ui.choices.setBalanceView(this.ui.balance);
        }
        this.currentStepId = null;
        this.chosenHouse = null;
        this.groundY = this.story?.ground_y || 285;
        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        const portCfg = this.story?.portrait_multipliers || {};
        const landCfg = this.story?.landscape_multipliers || {};
        const currentMult = isPortrait ? portCfg : landCfg;
        this.heroYOffset = currentMult?.hero_y_offset !== undefined
            ? currentMult.hero_y_offset
            : (this.story?.hero_y_offset !== undefined ? this.story.hero_y_offset : 26);
        this.heroGroundY = this.groundY + this.heroYOffset;
        this.currentLocationKey = 'road_bg';
        this.finaleButtons = [];
        this._toiletHeadTrackingListener = null;
        this._bcHeadTrackingListener = null;
        this._doorTrackingListener = null;
        this.buildingBaseScale = 0.22;
        this.isTransitioning = false;
        this._activeTransition = null;
        this._toiletLanded = false;
        this._heroSeatedOnToilet = false;
        this._toiletShakeListener = null;

        this._partyMusic = null;
        this._mainBgm = null;
        this._mainBgmNormalVolume = 0.5;
        this._bgmDuckingTween = null;
        this._celloSound = null;
        this._celloFallbackTimer = null;
        this._factoryWorkSound = null;
        this._toiletRumbleSound = null;
        this._trembleSound = null;
        this._activeWalkers = new Set();
        this._walkerSounds = [];
        this._staggerTimeouts = [];

        this.scene?.events?.once('shutdown', () => {
            this.restoreMainBgm(0);
            if (this._celloFallbackTimer) {
                this._celloFallbackTimer.remove();
                this._celloFallbackTimer = null;
            }
            if (this._celloSound) {
                try { this._celloSound.stop(); } catch (e) { }
                this._celloSound = null;
            }
        });
    }

    startWalking(puppet) {
        if (!puppet || !this.scene) return;
        if (!this._activeWalkers) this._activeWalkers = new Set();
        if (this._activeWalkers.has(puppet)) return;
        this._activeWalkers.add(puppet);
        this._updateWalkAudio();
    }

    stopWalking(puppet) {
        if (!this._activeWalkers) return;
        this._activeWalkers.delete(puppet);
        this._updateWalkAudio();
    }

    _updateWalkAudio() {
        if (!this._activeWalkers) this._activeWalkers = new Set();
        if (!this._walkerSounds) this._walkerSounds = [];
        if (!this._staggerTimeouts) this._staggerTimeouts = [];

        const walkerCount = this._activeWalkers.size;
        if (walkerCount === 0) {
            this._staggerTimeouts.forEach(t => t?.remove?.());
            this._staggerTimeouts = [];
            this._walkerSounds.forEach(s => s?.stop?.());
            this._walkerSounds = [];
            return;
        }

        const targetChannels = Math.min(walkerCount, 2);

        if (!this._walkerSounds[0]) {
            try {
                const s0 = Utils.addAudio(this.scene, 'steps_walk', 0.45, true);
                if (s0) this._walkerSounds[0] = s0;
            } catch (e) { }
        }

        if (targetChannels >= 2 && !this._walkerSounds[1] && this._staggerTimeouts.length === 0) {
            const timer = this.scene.time.delayedCall(160, () => {
                this._staggerTimeouts = [];
                if (this._activeWalkers && this._activeWalkers.size >= 2 && !this._walkerSounds[1]) {
                    try {
                        const s1 = Utils.addAudio(this.scene, 'steps_walk', 0.35, true);
                        if (s1) this._walkerSounds[1] = s1;
                    } catch (e) { }
                }
            });
            this._staggerTimeouts.push(timer);
        } else if (targetChannels < 2 && this._walkerSounds[1]) {
            this._walkerSounds[1]?.stop?.();
            this._walkerSounds[1] = null;
        }
    }

    _stopAllWalkSounds() {
        if (this._activeWalkers) this._activeWalkers.clear();
        if (this._staggerTimeouts) {
            this._staggerTimeouts.forEach(t => t?.remove?.());
            this._staggerTimeouts = [];
        }
        if (this._walkerSounds) {
            this._walkerSounds.forEach(s => s?.stop?.());
            this._walkerSounds = [];
        }
    }

    _startMainBgm() {
        if (this._mainBgm || this._isDestroyed) return;
        try {
            this._mainBgmNormalVolume = 0.5;
            this._mainBgm = Utils.addAudio(this.scene, 'bgm_main_adventure_loop', this._mainBgmNormalVolume, true);
        } catch (e) { }
    }

    duckMainBgm(duckVolume = 0.15, duration = 350) {
        if (!this._mainBgm || !this.scene?.tweens) return;

        if (this._bgmDuckingTween) {
            this.scene.tweens.killTweensOf(this._bgmDuckingTween);
            if (typeof this._bgmDuckingTween.stop === 'function') {
                this._bgmDuckingTween.stop();
            }
            this._bgmDuckingTween = null;
        }

        const currentVol = (typeof this._mainBgm.volume === 'number')
            ? this._mainBgm.volume
            : (this._mainBgmNormalVolume ?? 0.5);

        if (!this._mainBgmNormalVolume || this._mainBgmNormalVolume <= duckVolume) {
            this._mainBgmNormalVolume = Math.max(currentVol, 0.5);
        }

        const tweenTarget = { volume: currentVol };

        this._bgmDuckingTween = this.scene.tweens.add({
            targets: tweenTarget,
            volume: duckVolume,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => {
                if (this._mainBgm) {
                    if (typeof this._mainBgm.setVolume === 'function') {
                        this._mainBgm.setVolume(tweenTarget.volume);
                    } else {
                        this._mainBgm.volume = tweenTarget.volume;
                    }
                }
            },
            onComplete: () => {
                if (this._mainBgm) {
                    if (typeof this._mainBgm.setVolume === 'function') {
                        this._mainBgm.setVolume(duckVolume);
                    } else {
                        this._mainBgm.volume = duckVolume;
                    }
                }
                this._bgmDuckingTween = null;
            }
        });
    }

    restoreMainBgm(duration = 450) {
        if (!this._mainBgm || !this.scene?.tweens) return;

        if (this._bgmDuckingTween) {
            this.scene.tweens.killTweensOf(this._bgmDuckingTween);
            if (typeof this._bgmDuckingTween.stop === 'function') {
                this._bgmDuckingTween.stop();
            }
            this._bgmDuckingTween = null;
        }

        const targetVol = this._mainBgmNormalVolume ?? 0.5;
        const currentVol = (typeof this._mainBgm.volume === 'number')
            ? this._mainBgm.volume
            : 0.15;

        const tweenTarget = { volume: currentVol };

        this._bgmDuckingTween = this.scene.tweens.add({
            targets: tweenTarget,
            volume: targetVol,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => {
                if (this._mainBgm) {
                    if (typeof this._mainBgm.setVolume === 'function') {
                        this._mainBgm.setVolume(tweenTarget.volume);
                    } else {
                        this._mainBgm.volume = tweenTarget.volume;
                    }
                }
            },
            onComplete: () => {
                if (this._mainBgm) {
                    if (typeof this._mainBgm.setVolume === 'function') {
                        this._mainBgm.setVolume(targetVol);
                    } else {
                        this._mainBgm.volume = targetVol;
                    }
                }
                this._bgmDuckingTween = null;
            }
        });
    }

    fastForwardTransition() {
        if (!this.isTransitioning || !this._activeTransition) return;

        const transition = this._activeTransition;
        this.isTransitioning = false;
        this._activeTransition = null;

        this._stopToiletShake();
        if (this._factoryWorkSound) {
            this._factoryWorkSound.stop();
            this._factoryWorkSound = null;
        }
        if (this._trembleSound) {
            this._trembleSound.stop();
            this._trembleSound = null;
        }
        if (this._celloSound) {
            try { this._celloSound.stop(); } catch (e) { }
            this._celloSound = null;
        }
        if (this._celloFallbackTimer) {
            this._celloFallbackTimer.remove();
            this._celloFallbackTimer = null;
        }
        this._stopAllWalkSounds();
        this._startMainBgm();
        this.restoreMainBgm(200);

        if (this.scene?.cameras?.main) {
            this.scene.tweens.killTweensOf(this.scene.cameras.main);
            this.scene.cameras.main.zoom = 1.0;
        }

        if (transition.tweens && Array.isArray(transition.tweens)) {
            transition.tweens.forEach((t) => {
                if (t && typeof t.stop === 'function') t.stop();
            });
        }

        if (transition.delayedCalls && Array.isArray(transition.delayedCalls)) {
            transition.delayedCalls.forEach((d) => {
                if (d && typeof d.remove === 'function') d.remove();
            });
        }

        if (this.ui.worldContainer) {
            this.scene.tweens.killTweensOf(this.ui.worldContainer);
        }
        if (this.puppets.hero) {
            this.scene.tweens.killTweensOf(this.puppets.hero);
            this.puppets.hero.animator?.playIdle();
        }
        if (this.puppets.girl_1) {
            this.scene.tweens.killTweensOf(this.puppets.girl_1);
            this.puppets.girl_1.animator?.playIdle();
        }
        if (this.puppets.man_1) {
            this.scene.tweens.killTweensOf(this.puppets.man_1);
            this.puppets.man_1.animator?.playIdle();
        }

        if (typeof transition.snap === 'function') {
            transition.snap();
        }
    }

    _getCharacterScale(puppet, facing = 1) {
        if (!puppet) return { x: 1, y: 1 };
        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        const portCfg = this.story?.portrait_multipliers || {};
        const charScaleMul = isPortrait ? (portCfg.character_scale ?? 0.76) : 1.0;

        const base = puppet.baseRootScale || {
            x: Math.abs(puppet.skin?.rootScale?.x || 0.416),
            y: Math.abs(puppet.skin?.rootScale?.y || 0.416)
        };

        const sign = facing < 0 ? -1 : 1;
        return {
            x: base.x * charScaleMul * sign,
            y: base.y * charScaleMul
        };
    }

    start() {
        const startStep = this.story?.start_step || 'step_intro';
        this.goToStep(startStep);
    }

    goToStep(stepId) {
        this.currentStepId = stepId;

        const stepCfg = this.story?.steps?.[stepId];
        if (stepCfg?.location) {
            this.currentLocationKey = stepCfg.location;
        }

        switch (stepId) {
            case 'step_intro':
                this._runStepIntro();
                break;
            case 'step_choose_intro':
                this._runStepChooseIntro();
                break;
            case 'step_business_center':
                this._runStepBusinessCenter();
                break;
            case 'step_golden_toilet':
                this._runStepGoldenToilet();
                break;
            case 'step_walk_to_jewel':
                this._runStepWalkToJewel();
                break;
            case 'step_choose_house':
                this._runStepChooseHouse();
                break;
            case 'step_mansion_arrival':
            case 'step_shack_arrival':
                this._runStepHouseArrival();
                break;
            case 'step_choose_ring':
                this._runStepChooseRing();
                break;
            case 'step_fail_end':
                this._runStepFailEnd();
                break;
            default:
                break;
        }
    }

    _runStepIntro() {
        if (this._toiletHeadTrackingListener) {
            this.scene.events.off('update', this._toiletHeadTrackingListener);
            this._toiletHeadTrackingListener = null;
        }
        if (this._bcHeadTrackingListener) {
            this.scene.events.off('update', this._bcHeadTrackingListener);
            this._bcHeadTrackingListener = null;
        }
        if (this._doorTrackingListener) {
            this.scene.events.off('update', this._doorTrackingListener);
            this._doorTrackingListener = null;
        }
        if (this.doorContainer) {
            this.doorContainer.destroy();
            this.doorContainer = null;
        }

        this.isTransitioning = false;
        this._toiletLanded = false;
        this._heroSeatedOnToilet = false;
        if (this._factoryWorkSound) {
            this._factoryWorkSound.stop();
            this._factoryWorkSound = null;
        }
        if (this._trembleSound) {
            this._trembleSound.stop();
            this._trembleSound = null;
        }
        this._stopAllWalkSounds();
        if (this.scene?.cameras?.main) {
            this.scene.tweens.killTweensOf(this.scene.cameras.main);
            this.scene.cameras.main.zoom = 1.0;
        }
        if (this._activeTransition) {
            if (this._activeTransition.tweens) {
                this._activeTransition.tweens.forEach(t => t?.stop?.());
            }
            if (this._activeTransition.delayedCalls) {
                this._activeTransition.delayedCalls.forEach(d => d?.remove?.());
            }
            this._activeTransition = null;
        }

        const allPuppets = Object.values(this.puppets || {});
        allPuppets.forEach((p) => {
            if (p) p._isCameraApproaching = false;
        });

        if (this.partyFX) {
            this.partyFX.destroy();
            this.partyFX = null;
        }

        if (this.ui?.balance) {
            this.scene.tweens.killTweensOf(this.ui.balance);
            this.ui.balance.setAlpha(1);
            this.ui.balance.setVisible(true);
        }

        const hero = this.puppets.hero;
        const girl1 = this.puppets.girl_1;
        const girl2 = this.puppets.girl_2;
        const man1 = this.puppets.man_1;
        const friend1 = this.puppets.friend1;
        const friend2 = this.puppets.friend2;
        const friend3 = this.puppets.friend3;
        const friend4 = this.puppets.friend4;
        const friend5 = this.puppets.friend5;

        this.currentLocationKey = 'road_bg';

        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        const portCfg = this.story?.portrait_multipliers || {};
        const spacingMul = isPortrait ? (portCfg.crowd_spacing ?? 0.58) : 1.0;
        const charScaleMul = isPortrait ? (portCfg.character_scale ?? 0.76) : 1.0;

        // Reset hero state in center of screen on road_bg
        if (hero) {
            hero.setPosition(0, this.heroGroundY);
            const heroScale = this._getCharacterScale(hero, 1);
            hero.setScale(heroScale.x, heroScale.y);
            hero.setFace('idle');
            hero.setVisible(true);
            hero.resetPose();
            hero.animator?.playIdle();
        }

        // Hide subsequent characters
        if (girl2) {
            girl2.setVisible(false);
            girl2.setFace('idle');
        }
        if (man1) {
            man1.setVisible(false);
            man1.setFace('idle');
        }
        const clown = this.puppets.clown;
        if (clown) {
            clown.setVisible(false);
            clown.setFace('idle');
            clown.angle = 0;
            clown.resetPose();
            clown.animator?.stopAll();
        }

        // Camera starts at road (hero centered at x = 300)
        if (this.ui.worldContainer) {
            this.ui.worldContainer.x = 300;
        }

        // Off-screen Spawning: girl_1 and the 5 new friends (friend1 to friend5)
        // Camera viewport in world container coords is [-300, 300]
        // Staggered depths break pyramid symmetry and yOffset aligns feet with ground perspective:
        // lower depth (further away) -> feet higher in perspective (negative yOffset)
        // higher depth (closer) -> feet lower in perspective (positive yOffset)
        const crowdConfigs = [
            { puppet: girl1, fromX: -420, targetX: -115, baseTargetOffsetX: -115, depth: 21, yOffset: -2, facing: 1, danceStyle: 'girl_turn_dance' },
            { puppet: friend1, fromX: -490, targetX: -210, baseTargetOffsetX: -210, depth: 17, yOffset: -16, facing: 1, danceStyle: 'sharp_jumps' },
            { puppet: friend2, fromX: -560, targetX: -310, baseTargetOffsetX: -310, depth: 23, yOffset: 6, facing: 1, danceStyle: 'wave_arms' },
            { puppet: friend3, fromX: 420, targetX: 115, baseTargetOffsetX: 115, depth: 18, yOffset: -13, facing: -1, danceStyle: 'throw_arms' },
            { puppet: friend4, fromX: 490, targetX: 210, baseTargetOffsetX: 210, depth: 25, yOffset: 9, facing: -1, danceStyle: 'step_raise' },
            { puppet: friend5, fromX: 560, targetX: 310, baseTargetOffsetX: 310, depth: 19, yOffset: -9, facing: -1, danceStyle: 'spins' }
        ];

        let arrivedCount = 0;
        const activeCrowd = crowdConfigs.filter(c => !!c.puppet);
        const totalCrowd = activeCrowd.length;

        const onCrowdArrived = () => {
            // Once crowd is in place and dancing, prompt choices
            this.scene.time.delayedCall(400, () => {
                this.goToStep('step_choose_intro');
            });
        };

        if (totalCrowd === 0) {
            onCrowdArrived();
            return;
        }

        // Start Scene 1 party visual effects (ground smoke, light beams, rhythm sequencer)
        this.partyFX = new PartyFXController(this.scene, this.ui.worldContainer, PARTY_FX_CONFIG, this.groundY);
        this.partyFX.start();

        // Background Music: music_party_loop starts when crowd and Girl 1 enter and begin dancing
        if (!this._partyMusic) {
            try {
                this._partyMusic = Utils.addAudio(this.scene, 'music_party_loop', 0.55, true);
            } catch (e) { }
        }

        activeCrowd.forEach((cfg) => {
            const p = cfg.puppet;
            p.facing = cfg.facing;
            p.baseTargetOffsetX = cfg.baseTargetOffsetX;
            p.baseYOffset = cfg.yOffset || 0;
            const pScale = this._getCharacterScale(p, cfg.facing);
            p.setScale(pScale.x, pScale.y);
            if (cfg.depth !== undefined) p.setDepth(cfg.depth);

            const effectiveTargetX = Math.round(p.baseTargetOffsetX * spacingMul);
            const fromX = isPortrait ? (p.baseTargetOffsetX < 0 ? -380 : 380) : cfg.fromX;
            p.setPosition(fromX, this.groundY + (cfg.yOffset || 0));
            p.setVisible(true);
            p.setFace('idle');
            p.resetPose();
            p.animator?.playWalk();
            p.isArrived = false;

            const dist = Math.abs(effectiveTargetX - fromX);
            const duration = Math.round((dist / (this.story?.walk_speed || 500)) * 1000) + 300;

            p.entranceTween = this.scene.tweens.add({
                targets: p,
                x: effectiveTargetX,
                duration: duration,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    p.entranceTween = null;
                    p.isArrived = true;
                    // Switch to procedural dance idle state with assigned variety
                    p.animator?.playDance(cfg.danceStyle ? { style: cfg.danceStyle } : {});

                    arrivedCount++;
                    if (arrivedCount >= totalCrowd) {
                        onCrowdArrived();
                    }
                }
            });
        });

        if (typeof this.ui.worldContainer.sort === 'function') {
            this.ui.worldContainer.sort('depth');
        }
    }

    _runStepChooseIntro() {
        const step = this.story?.steps?.step_choose_intro;
        if (!step || !step.choices) return;

        // Show choice cards: Business Center vs. Golden Toilet
        const introChoiceY = UI_CONFIG?.choice_group?.positions_y?.multiple ?? 205;
        this.ui.choices?.showChoices(step.choices, { y: introChoiceY, balanceView: this.ui?.balance });

        this.ui.choices.onChoice = (choice) => {
            // Guard: Insufficient funds check
            if (this.ui.balance && choice.price && this.ui.balance.getValue() < choice.price) {
                return;
            }

            // Stop music_party_loop immediately when player confirms choice, play music_party_end one-shot
            if (this._partyMusic) {
                this._partyMusic.stop();
                this._partyMusic = null;
                try {
                    Utils.addAudio(this.scene, 'music_party_end', 0.65, false);
                } catch (e) { }
            }

            // Deduct cost from balance
            if (this.ui.balance && choice.price) {
                this.ui.balance.subtract(choice.price);
            }

            if (choice.id === 'choice_business_center' || choice.next === 'step_business_center') {
                this.goToStep('step_business_center');
            } else if (choice.id === 'choice_golden_toilet' || choice.next === 'step_golden_toilet') {
                this.goToStep('step_golden_toilet');
            } else {
                this.goToStep(choice.next || 'step_walk_to_jewel');
            }
        };
    }

    _runStepBusinessCenter() {
        const hero = this.puppets.hero;
        const girl1 = this.puppets.girl_1;
        const friends = [
            this.puppets.friend1,
            this.puppets.friend2,
            this.puppets.friend3,
            this.puppets.friend4,
            this.puppets.friend5
        ];

        if (this._bcHeadTrackingListener) {
            this.scene.events.off('update', this._bcHeadTrackingListener);
            this._bcHeadTrackingListener = null;
        }

        // 1. Spawn Business Center
        const bcCfg = UI_CONFIG?.business_center || {};
        const bcTex = bcCfg.texture || 'buisnes_center';
        const bcScale = bcCfg.scale || 0.22;
        const bcOrigin = bcCfg.origin || { x: 0.5, y: 1.0 };
        const roadX = this.story?.locations?.road_bg?.x ?? 0;
        const bcOffsetX = bcCfg.offsetX !== undefined ? bcCfg.offsetX : 115;
        const buildingX = roadX + bcOffsetX;
        const buildingY = this.groundY + 40;
        const doorOffsetX = bcCfg.doorOffsetX !== undefined ? bcCfg.doorOffsetX : -113;
        const doorX = buildingX + doorOffsetX;

        if (this.building) {
            this.building.destroy();
        }
        if (this._doorTrackingListener) {
            this.scene.events.off('update', this._doorTrackingListener);
            this._doorTrackingListener = null;
        }
        if (this.doorContainer) {
            this.doorContainer.destroy();
            this.doorContainer = null;
        }
        if (this.buildingDoorL) { this.buildingDoorL.destroy(); this.buildingDoorL = null; }
        if (this.buildingDoorR) { this.buildingDoorR.destroy(); this.buildingDoorR = null; }

        this.buildingBaseScale = bcScale;

        this.building = this.scene.add.image(buildingX, buildingY, bcTex);
        this.building.setOrigin(bcOrigin.x, bcOrigin.y);
        this.building.setScale(0);
        this.building.setDepth(1); // Right after background (depth 0), behind characters (depths 18+)
        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(this.building);
            const houseBg = this.scene.houseBg;
            const houseBgIndex = houseBg ? this.ui.worldContainer.getIndex(houseBg) : -1;
            if (houseBgIndex >= 0) {
                this.ui.worldContainer.moveTo(this.building, houseBgIndex + 1);
            } else {
                this.ui.worldContainer.moveTo(this.building, 3);
            }
            if (typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
        }

        // Spawn closed doors immediately so they scale up synchronously with the building
        this._spawnBuildingDoors(buildingX, buildingY, bcScale);

        // Friends and hero stop dancing to watch the roof appear; girl_1 continues dancing all the time
        const trackingCharacters = [hero, ...friends].filter(p => !!p);
        trackingCharacters.forEach(p => {
            p.animator?.stopAll();
        });
        if (hero) {
            hero.setFace('surprised');
        }
        if (girl1 && girl1.animator && !girl1.animator.isDancing) {
            girl1.animator.playDance({ style: 'girl_turn_dance' });
        }

        // 1. friend4 and friend3 (and friend5) first move aside to the right
        const rightFriends = [
            { puppet: this.puppets.friend3, targetX: 265 },
            { puppet: this.puppets.friend4, targetX: 345 },
            { puppet: this.puppets.friend5, targetX: 425 }
        ];
        rightFriends.forEach(({ puppet, targetX }) => {
            if (!puppet) return;
            puppet.animator?.playWalk();
            this.scene.tweens.add({
                targets: puppet,
                x: targetX,
                duration: 650,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    puppet.animator?.stopAll();
                }
            });
        });

        // Head and body tracking helper: distributes inclination across both body and head
        const updateHeadAndBodyTracking = (tx, ty) => {
            trackingCharacters.forEach(p => {
                if (!p) return;
                const headX = p.x;
                const headY = p.y - 130;
                const facingSign = Math.sign(p.scaleX || 1);
                const localDx = Math.max(20, (tx - headX) * facingSign);
                const localDy = ty - headY;
                let angle = Math.atan2(localDy, localDx) * (180 / Math.PI);
                // Halved upward tilt
                if (angle < 0) {
                    angle = angle * 0.5;
                }
                const totalAngle = Math.max(-36, Math.min(25, angle));
                const bodyAngle = totalAngle * 0.5;
                const headAngle = totalAngle * 0.5;

                if (p.bones?.body) {
                    p.bones.body.angle = bodyAngle;
                }
                if (p.bones?.head) {
                    p.bones.head.angle = headAngle;
                }
            });
        };

        const getRoofPos = () => {
            if (!this.building) return { roofX: buildingX, roofY: buildingY };
            const roofX = this.building.x;
            const h = this.building.height ? (this.building.height * this.building.scaleY) : (this.building.displayHeight || 0);
            const roofY = this.building.y - h;
            return { roofX, roofY };
        };

        // Initially look at where the building sprouts on the ground
        const initialRoof = getRoofPos();
        updateHeadAndBodyTracking(initialRoof.roofX, initialRoof.roofY);

        // Frame-by-frame tracker follows the rising roof as it grows into the sky
        this._bcHeadTrackingListener = () => {
            const { roofX, roofY } = getRoofPos();
            updateHeadAndBodyTracking(roofX, roofY);
        };
        this.scene.events.on('update', this._bcHeadTrackingListener);

        const bcAppearDur = bcCfg.appearDuration || 1500;
        const bcAppearEase = bcCfg.appearEase || 'Cubic.easeOut';

        // Plays when the Business Center starts rising from the ground
        try {
            Utils.addAudio(this.scene, 'building_grow', 1.0);
        } catch (e) { }

        // Appearance animation for building (smooth and longer)
        this.scene.tweens.add({
            targets: this.building,
            scaleX: bcScale,
            scaleY: bcScale,
            duration: bcAppearDur,
            ease: bcAppearEase,
            onUpdate: () => {
                this._syncBuildingDoors();
            },
            onComplete: () => {
                this._syncBuildingDoors();
                if (this._bcHeadTrackingListener) {
                    this.scene.events.off('update', this._bcHeadTrackingListener);
                    this._bcHeadTrackingListener = null;
                }

                // Smoothly lower heads and bodies of all characters back to level horizontal posture
                trackingCharacters.forEach(p => {
                    if (!p) return;
                    if (p.bones?.head) {
                        this.scene.tweens.killTweensOf(p.bones.head);
                        this.scene.tweens.add({
                            targets: p.bones.head,
                            angle: 0,
                            duration: 300,
                            ease: 'Sine.easeOut'
                        });
                    }
                    if (p.bones?.body) {
                        this.scene.tweens.killTweensOf(p.bones.body);
                        this.scene.tweens.add({
                            targets: p.bones.body,
                            angle: 0,
                            duration: 300,
                            ease: 'Sine.easeOut'
                        });
                    }
                });

                // 2. Friends lower heads first, then turn and disperse!
                this.partyFX?.focusOnGirl(girl1);

                this.scene.time.delayedCall(300, () => {
                    friends.forEach((friend, idx) => {
                        if (!friend) return;
                        friend.animator?.stopAll();
                        if (friend.bones?.body) {
                            this.scene.tweens.killTweensOf(friend.bones.body);
                            friend.bones.body.angle = 0;
                        }
                        if (friend.bones?.head) {
                            this.scene.tweens.killTweensOf(friend.bones.head);
                            friend.bones.head.angle = 0;
                        }

                        const isLeft = idx < 2; // friend1, friend2 on left
                        const exitX = isLeft ? -520 : 580;
                        const flipSign = isLeft ? -1 : 1;
                        const friendScale = this._getCharacterScale(friend, flipSign);
                        friend.setScale(friendScale.x, friendScale.y);
                        friend.animator?.playWalk();
                        if (friend.bones?.body) friend.bones.body.angle = 0;
                        if (friend.bones?.head) friend.bones.head.angle = 0;

                        this.scene.tweens.add({
                            targets: friend,
                            x: exitX,
                            duration: 1100 + idx * 70,
                            ease: 'Power1.easeIn',
                            onComplete: () => {
                                friend.setVisible(false);
                                friend.animator?.stopAll();
                            }
                        });
                    });
                });

                // 3. Hero waits for friends to disperse, then walks to the building doors
                this.scene.time.delayedCall(1400, () => {
                    if (hero) {
                        if (hero.bones?.body) {
                            this.scene.tweens.killTweensOf(hero.bones.body);
                            hero.bones.body.angle = 0;
                        }
                        if (hero.bones?.head) {
                            this.scene.tweens.killTweensOf(hero.bones.head);
                            hero.bones.head.angle = 0;
                        }
                        hero.animator?.playWalk();

                        // Open doors ~400ms before hero arrives
                        const walkDuration = 650;
                        this.scene.time.delayedCall(walkDuration - 400, () => {
                            this._openBuildingDoors();
                        });

                        this.scene.tweens.add({
                            targets: hero,
                            x: doorX,
                            duration: walkDuration,
                            ease: 'Power1.easeIn',
                            onComplete: () => {
                                hero.setVisible(false);
                                hero.animator?.stopAll();

                                // Close doors behind hero
                                this._closeBuildingDoors();

                                // 4. Building Dance: 4-second looping animation (sway left/right with squash/stretch)
                                try {
                                    this._factoryWorkSound = Utils.addAudio(this.scene, 'factory_work', 0.8, true);
                                } catch (e) { }

                                const swayTween = this.scene.tweens.add({
                                    targets: this.building,
                                    angle: 3.2,
                                    duration: 340,
                                    yoyo: true,
                                    repeat: -1,
                                    ease: 'Sine.easeInOut'
                                });

                                const squashTween = this.scene.tweens.add({
                                    targets: this.building,
                                    scaleY: bcScale * 1.04,
                                    scaleX: bcScale * 0.97,
                                    duration: 240,
                                    yoyo: true,
                                    repeat: -1,
                                    ease: 'Sine.easeInOut'
                                });

                                // Sparkles appear on girl 2 seconds earlier than when hero exits
                                this.scene.time.delayedCall(2000, () => {
                                    this.partyFX?.sparkleOnGirl(girl1);
                                });

                                // Coins fly out of the business center door and arc to the balance UI (+700 000 awarded)
                                // Building door in mainContainer space: worldContainer is at (300, 450), building at buildingX in world space
                                if (this.ui.balance) {
                                    const doorMainX = 300 + doorX;
                                    const doorMainY = 445;
                                    // 3 waves staggered; only the last wave triggers the business center revenue (+700 000)
                                    const waveDelays = [550, 1350, 2200];
                                    const waveCoins = [5, 5, 5];
                                    const bcRevenue = this.scene?.SETTINGS?.economy?.business_center_revenue
                                        ?? this.story?.steps?.step_business_center?.revenue
                                        ?? 700000;
                                    waveDelays.forEach((waveDelay, wi) => {
                                        this.scene.time.delayedCall(waveDelay, () => {
                                            const isLastWave = wi === waveDelays.length - 1;
                                            this.ui.balance.spawnCoinFlyIn(
                                                doorMainX,
                                                doorMainY,
                                                isLastWave ? bcRevenue : 0,
                                                waveCoins[wi]
                                            );
                                        });
                                    });
                                }

                                // 5. Transition: After 4 seconds, hero emerges from building
                                this.scene.time.delayedCall(4000, () => {
                                    if (this._factoryWorkSound) {
                                        this._factoryWorkSound.stop();
                                        this._factoryWorkSound = null;
                                    }
                                    swayTween.stop();
                                    squashTween.stop();
                                    if (this.building) {
                                        this.building.angle = 0;
                                        this.building.setScale(bcScale);
                                        this._syncBuildingDoors();
                                    }

                                    // Hero leaves work: fade beams & strobe
                                    this.partyFX?.finishParty(girl1);

                                    // Open doors, then show hero, then close doors behind him
                                    this._openBuildingDoors(300, () => {
                                        if (hero) {
                                            hero.setPosition(doorX, this.heroGroundY);
                                            hero.setVisible(true);
                                            const heroScale = this._getCharacterScale(hero, 1);
                                            hero.setScale(heroScale.x, heroScale.y);
                                            hero.setFace('happy');
                                            hero.animator?.playIdle();
                                        }

                                        // Close doors behind the emerging hero after a short beat
                                        this.scene.time.delayedCall(600, () => {
                                            this._closeBuildingDoors();
                                        });

                                        this.scene.time.delayedCall(1000, () => {
                                            this.goToStep('step_walk_to_jewel');
                                        });
                                    });
                                });
                            }
                        });
                    } else {
                        this.goToStep('step_walk_to_jewel');
                    }
                });
            }
        });
    }

    _spawnBuildingDoors(buildingX, buildingY, bcScale = 0.22) {
        if (this._doorTrackingListener) {
            this.scene.events.off('update', this._doorTrackingListener);
            this._doorTrackingListener = null;
        }

        if (this.doorContainer) {
            this.doorContainer.destroy();
            this.doorContainer = null;
        }

        this.buildingBaseScale = bcScale || 0.22;
        const bcCfg = UI_CONFIG?.business_center || {};
        const localOffsetX = bcCfg.doorOffsetX !== undefined ? bcCfg.doorOffsetX : -113;
        const localOffsetY = bcCfg.doorOffsetY !== undefined ? bcCfg.doorOffsetY : 0;
        const scene = this.scene;
        const doorY = buildingY !== undefined ? buildingY : (this.groundY || 205);
        this.doorContainer = scene.add.container(buildingX + localOffsetX, doorY + localOffsetY);
        this.doorContainer.setDepth(16);

        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(this.doorContainer);
            if (typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
        }

        if (scene.textures.exists('buisnes_cente_door_l') && scene.textures.exists('buisnes_cente_door_r')) {
            this.doorL = scene.add.image(0, 0, 'buisnes_cente_door_l').setOrigin(1, 1).setScale(bcScale);
            this.doorR = scene.add.image(0, 0, 'buisnes_cente_door_r').setOrigin(0, 1).setScale(bcScale);
            this.doorL.x = 0;
            this.doorR.x = 0;
            this.doorContainer.add(this.doorL);
            this.doorContainer.add(this.doorR);
        }

        this.doorsOpen = false;

        // Motion tracking: anchor doors directly to building transform during sway/squash dance and idle
        this._syncBuildingDoors();
        this._doorTrackingListener = () => {
            this._syncBuildingDoors();
        };
        this.scene.events.on('update', this._doorTrackingListener);
    }

    _syncBuildingDoors() {
        if (!this.doorContainer || !this.building || !this.building.active) return;
        const bcCfg = UI_CONFIG?.business_center || {};
        const localOffsetX = bcCfg.doorOffsetX !== undefined ? bcCfg.doorOffsetX : -113;
        const localOffsetY = bcCfg.doorOffsetY !== undefined ? bcCfg.doorOffsetY : 0;
        const baseScale = this.buildingBaseScale || 0.22;

        if (baseScale > 0) {
            const scaleFactorX = this.building.scaleX / baseScale;
            const scaleFactorY = this.building.scaleY / baseScale;
            this.doorContainer.scaleX = scaleFactorX;
            this.doorContainer.scaleY = scaleFactorY;

            const rad = (this.building.angle || 0) * (Math.PI / 180);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const scaledOffsetX = localOffsetX * scaleFactorX;
            const scaledOffsetY = localOffsetY * scaleFactorY;

            const rotatedX = scaledOffsetX * cos - scaledOffsetY * sin;
            const rotatedY = scaledOffsetX * sin + scaledOffsetY * cos;

            this.doorContainer.x = this.building.x + rotatedX;
            this.doorContainer.y = this.building.y + rotatedY;
        } else {
            this.doorContainer.x = this.building.x;
            this.doorContainer.y = this.building.y;
            this.doorContainer.scaleX = 0;
            this.doorContainer.scaleY = 0;
        }
        this.doorContainer.angle = this.building.angle;
    }

    _openBuildingDoors(duration = 400, onComplete = null) {
        try {
            Utils.addAudio(this.scene, 'door_sliding_open', 1.0);
        } catch (e) { }

        if (!this.doorL || !this.doorR) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        this.scene.tweens.killTweensOf(this.doorL);
        this.scene.tweens.killTweensOf(this.doorR);

        const bcScale = this.buildingBaseScale || this.doorL.scaleX || 0.22;
        const openDistL = (this.doorL.displayWidth || (257 * bcScale)) + 4;
        const openDistR = (this.doorR.displayWidth || (237 * bcScale)) + 4;

        this.scene.tweens.add({
            targets: this.doorL,
            x: -openDistL,
            duration: duration,
            ease: 'Quad.easeOut'
        });

        this.scene.tweens.add({
            targets: this.doorR,
            x: openDistR,
            duration: duration,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.doorsOpen = true;
                if (typeof onComplete === 'function') onComplete();
            }
        });
    }

    _closeBuildingDoors(duration = 400, onComplete = null) {
        try {
            Utils.addAudio(this.scene, 'door_sliding_close', 1.0);
        } catch (e) { }

        if (!this.doorL || !this.doorR) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        this.scene.tweens.killTweensOf(this.doorL);
        this.scene.tweens.killTweensOf(this.doorR);

        this.scene.tweens.add({
            targets: this.doorL,
            x: 0,
            duration: duration,
            ease: 'Quad.easeInOut'
        });

        this.scene.tweens.add({
            targets: this.doorR,
            x: 0,
            duration: duration,
            ease: 'Quad.easeInOut',
            onComplete: () => {
                this.doorsOpen = false;
                if (typeof onComplete === 'function') onComplete();
            }
        });
    }

    _stopToiletShake() {
        if (this._toiletRumbleSound) {
            this._toiletRumbleSound.stop();
            this._toiletRumbleSound = null;
        }
        if (this._toiletShakeListener) {
            this.scene?.events?.off('update', this._toiletShakeListener);
            this._toiletShakeListener = null;
        }
        const roadX = this.story?.locations?.road_bg?.x ?? 0;
        const gtCfg = UI_CONFIG?.golden_toilet || {};
        const toiletOffsetX = gtCfg.offsetX !== undefined ? gtCfg.offsetX : 175;
        const baseToiletX = roadX + toiletOffsetX;
        const baseToiletY = this.groundY + 77;
        const baseHeroX = baseToiletX - 25;
        const baseHeroY = baseToiletY - 105;

        if (this.toiletContainer && this.toiletContainer.active) {
            this.toiletContainer.setPosition(baseToiletX, baseToiletY);
            this.toiletContainer.angle = 0;
        }
        const hero = this.puppets?.hero;
        if (hero && hero.active && this._heroSeatedOnToilet) {
            hero.setPosition(baseHeroX, baseHeroY);
            hero.angle = 0;
        }
    }

    _startToiletShake(startTime, duration) {
        this._stopToiletShake();

        if (!this._toiletRumbleSound) {
            try {
                this._toiletRumbleSound = Utils.addAudio(this.scene, 'toilet_rumble', 0.85, true);
            } catch (e) { }
        }

        const gtCfg = UI_CONFIG?.golden_toilet || {};
        const toiletOffsetX = gtCfg.offsetX !== undefined ? gtCfg.offsetX : 175;

        const shakeListener = () => {
            if (!this.scene) return;
            const now = this.scene.time.now;
            const elapsed = now - startTime;
            if (elapsed < 0) return;

            const roadX = this.story?.locations?.road_bg?.x ?? 0;
            const baseToiletX = roadX + toiletOffsetX;
            const baseToiletY = this.groundY + 77;
            const baseHeroX = baseToiletX - 25;
            const baseHeroY = baseToiletY - 105;

            if (elapsed >= duration) {
                this._stopToiletShake();
                return;
            }

            // Progress 0 to 1 over duration (2600ms)
            const progress = elapsed / duration;

            // Envelope: smooth bell-shaped arc (starts at 0, increases to peak in middle, decreases to 0 at end)
            const envelope = Math.pow(Math.sin(progress * Math.PI), 1.2);

            // Multi-frequency noise for uneven, organic shaking
            const maxShakeX = 8.5;
            const maxShakeY = 5.5;
            const maxAngle = 3.2;

            const freq1 = Math.sin(elapsed * 0.047);
            const freq2 = Math.cos(elapsed * 0.083);
            const freq3 = Math.sin(elapsed * 0.139);

            const spikeX = (Math.random() - 0.5) * 1.8;
            const spikeY = (Math.random() - 0.5) * 1.8;
            const spikeAngle = (Math.random() - 0.5) * 1.5;

            const offsetX = (freq1 * 0.5 + freq2 * 0.3 + freq3 * 0.2 + spikeX) * maxShakeX * envelope;
            const offsetY = (freq2 * 0.5 + freq3 * 0.3 + spikeY) * maxShakeY * envelope;
            const angleOffset = (freq1 * 0.5 + spikeAngle) * maxAngle * envelope;

            if (this.toiletContainer && this.toiletContainer.active) {
                this.toiletContainer.setPosition(baseToiletX + offsetX, baseToiletY + offsetY);
                this.toiletContainer.angle = angleOffset;
            }

            const hero = this.puppets?.hero;
            if (hero && hero.active && this._heroSeatedOnToilet) {
                hero.setPosition(baseHeroX + offsetX, baseHeroY + offsetY);
                hero.angle = angleOffset;
            }
        };

        this._toiletShakeListener = shakeListener;
        this.scene.events.on('update', shakeListener);
    }

    _runStepGoldenToilet() {
        this._stopToiletShake();
        const hero = this.puppets.hero;
        const friends = [
            this.puppets.friend1,
            this.puppets.friend2,
            this.puppets.friend3,
            this.puppets.friend4,
            this.puppets.friend5
        ];

        // 1. Spawn Golden Toilet (bottom + top) slightly to the right and lower
        const gtCfg = UI_CONFIG?.golden_toilet || {};
        const bottomCfg = gtCfg.bottom || { texture: 'golden_toilet_bottom', scale: 0.44, origin: { x: 0.5, y: 1.0 } };
        const topCfg = gtCfg.top || { texture: 'golden_toilet_top', scale: 0.44, origin: { x: 0.673, y: 0.510 } };
        const girl1 = this.puppets.girl_1;
        const roadX = this.story?.locations?.road_bg?.x ?? 0;
        const toiletOffsetX = gtCfg.offsetX !== undefined ? gtCfg.offsetX : 175;
        const toiletX = roadX + toiletOffsetX;
        const landingY = this.groundY + 77;
        const skyY = this.groundY - 580;
        this._toiletLanded = false;
        this._heroSeatedOnToilet = false;

        if (this.toiletContainer) {
            this.toiletContainer.destroy();
        }

        // Toilet spawns up in the sky with scale 0
        this.toiletContainer = this.scene.add.container(toiletX, skyY);
        // Toilet is in front of the other characters (depths 18-21), but behind hero (depth 30)
        this.toiletContainer.setDepth(25);
        this.toiletContainer.setScale(0);
        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(this.toiletContainer);
            // Reorder: bring toilet in front of crowd characters, and keep hero above toilet
            this.ui.worldContainer.bringToTop(this.toiletContainer);
            if (hero) {
                this.ui.worldContainer.bringToTop(hero);
            }
            if (typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
        }

        const toiletBottom = this.scene.add.image(0, 0, bottomCfg.texture);
        toiletBottom.setOrigin(bottomCfg.origin.x, bottomCfg.origin.y);
        toiletBottom.setScale(bottomCfg.scale);
        this.toiletContainer.add(toiletBottom);

        // Hinge position for top lid
        const bottomW = 419 * bottomCfg.scale;
        const bottomH = 490 * bottomCfg.scale;
        const hingeRelX = -bottomW * 0.5 + (282 * bottomCfg.scale);
        const hingeRelY = -bottomH + (250 * bottomCfg.scale);

        const toiletTop = this.scene.add.image(hingeRelX, hingeRelY, topCfg.texture);
        toiletTop.setOrigin(topCfg.origin.x, topCfg.origin.y);
        toiletTop.setScale(topCfg.scale);
        toiletTop.setDepth(16);
        toiletTop.angle = 0;
        this.toiletContainer.add(toiletTop);

        // 1. Friends and hero stop dancing and look up into the sky; girl_1 continues dancing all the time
        const trackingCharacters = [hero, ...friends].filter(p => !!p);
        trackingCharacters.forEach(p => {
            p.animator?.stopAll();
        });
        if (hero) {
            hero.setFace('surprised');
        }
        // Ensure girl1 continues dancing without interruption
        if (girl1 && girl1.animator && !girl1.animator.isDancing) {
            girl1.animator.playDance({ style: 'girl_turn_dance' });
        }

        // Head and body tracking helper: distributes inclination across both body and head
        const updateHeadTracking = (tx, ty) => {
            trackingCharacters.forEach(p => {
                if (!p) return;
                const headX = p.x;
                const headY = p.y - 130;
                const facingSign = Math.sign(p.scaleX || 1);
                const localDx = Math.max(20, (tx - headX) * facingSign);
                const localDy = ty - headY;
                let angle = Math.atan2(localDy, localDx) * (180 / Math.PI);
                // Halved upward tilt
                if (angle < 0) {
                    angle = angle * 0.5;
                }
                const totalAngle = Math.max(-36, Math.min(25, angle));
                const bodyAngle = totalAngle * 0.5;
                const headAngle = totalAngle * 0.5;

                if (p.bones?.body) {
                    p.bones.body.angle = bodyAngle;
                }
                if (p.bones?.head) {
                    p.bones.head.angle = headAngle;
                }
            });
        };

        // Smoothly tilt both body and head upwards towards the sky
        trackingCharacters.forEach(p => {
            if (!p) return;
            const headX = p.x;
            const headY = p.y - 130;
            const facingSign = Math.sign(p.scaleX || 1);
            const localDx = Math.max(20, (toiletX - headX) * facingSign);
            const localDy = skyY - headY;
            const rawAngle = Math.atan2(localDy, localDx) * (180 / Math.PI);
            const upwardAngle = rawAngle < 0 ? rawAngle * 0.5 : rawAngle;
            const totalAngle = Math.max(-36, Math.min(25, upwardAngle));
            const targetBodyAngle = totalAngle * 0.5;
            const targetHeadAngle = totalAngle * 0.5;

            if (p.bones?.body) {
                this.scene.tweens.add({
                    targets: p.bones.body,
                    angle: targetBodyAngle,
                    duration: 320,
                    ease: 'Sine.easeOut'
                });
            }
            if (p.bones?.head) {
                this.scene.tweens.add({
                    targets: p.bones.head,
                    angle: targetHeadAngle,
                    duration: 320,
                    ease: 'Sine.easeOut'
                });
            }
        });

        // 2. friend4 and friend3 (and friend5) move to the right to clear the drop zone
        const rightFriends = [
            { puppet: this.puppets.friend3, targetX: 265 },
            { puppet: this.puppets.friend4, targetX: 345 },
            { puppet: this.puppets.friend5, targetX: 425 }
        ];
        rightFriends.forEach(({ puppet, targetX }) => {
            if (!puppet) return;
            puppet.animator?.playWalk();
            this.scene.tweens.add({
                targets: puppet,
                x: targetX,
                duration: 650,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    puppet.animator?.stopAll();
                }
            });
        });

        // 3. Toilet appears high up in the sky
        this.scene.time.delayedCall(120, () => {
            this.scene.tweens.add({
                targets: this.toiletContainer,
                scaleX: 1,
                scaleY: 1,
                duration: 360,
                ease: 'Back.easeOut'
            });
        });

        // 4. Toilet falls to the landing spot, and all friends watch it with their heads as it falls
        this.scene.time.delayedCall(520, () => {
            this._toiletHeadTrackingListener = () => {
                if (this.toiletContainer) {
                    updateHeadTracking(this.toiletContainer.x, this.toiletContainer.y);
                }
            };
            this.scene.events.on('update', this._toiletHeadTrackingListener);

            try {
                Utils.addAudio(this.scene, 'fall_whistle', 1.0);
            } catch (e) { }

            this.scene.tweens.add({
                targets: this.toiletContainer,
                y: landingY,
                duration: 720,
                ease: 'Quad.easeIn',
                onComplete: () => {
                    this._toiletLanded = true;
                    try {
                        Utils.addAudio(this.scene, 'gold_impact', 1.0);
                    } catch (e) { }
                    // Stop frame-by-frame tracking listener once landed
                    if (this._toiletHeadTrackingListener) {
                        this.scene.events.off('update', this._toiletHeadTrackingListener);
                        this._toiletHeadTrackingListener = null;
                    }
                    // Settle gaze directly onto the landed toilet
                    updateHeadTracking(toiletX, landingY);

                    // Impact squash and bounce
                    this.scene.tweens.add({
                        targets: this.toiletContainer,
                        scaleY: 0.86,
                        scaleX: 1.14,
                        duration: 80,
                        yoyo: true,
                        ease: 'Quad.easeOut'
                    });

                    // Subtle camera shake on heavy impact
                    this.scene.cameras.main.shake(160, 0.005);

                    // Hinge the lid open
                    this.scene.tweens.add({
                        targets: toiletTop,
                        angle: 75,
                        duration: 450,
                        ease: 'Back.easeOut'
                    });

                    // 5. Hero walks to the toilet and adjusts pose/position to "sit" on it
                    this.scene.time.delayedCall(350, () => {
                        if (hero) {
                            // Ensure hero is higher in Z-index than the toilet
                            hero.setDepth(30);
                            if (this.ui.worldContainer) {
                                this.ui.worldContainer.bringToTop(hero);
                                if (typeof this.ui.worldContainer.sort === 'function') {
                                    this.ui.worldContainer.sort('depth');
                                }
                            }
                            if (hero.bones?.body) hero.bones.body.angle = 0;
                            if (hero.bones?.head) hero.bones.head.angle = 0;
                            hero.animator?.playWalk();
                            this.scene.tweens.add({
                                targets: hero,
                                x: toiletX - 25,
                                duration: 650,
                                ease: 'Power1.easeIn',
                                onComplete: () => {
                                    hero.animator?.stopAll();
                                    this._heroSeatedOnToilet = true;
                                    // Turn hero around to sit facing left
                                    const sitScale = this._getCharacterScale(hero, -1);
                                    hero.setScale(sitScale.x, sitScale.y);
                                    // Seat position is at toiletX - 25 horizontally, and at the bowl seat vertically
                                    hero.setPosition(toiletX - 25, landingY - 105);
                                    hero.setDepth(30);
                                    if (this.ui.worldContainer) {
                                        this.ui.worldContainer.bringToTop(hero);
                                        if (typeof this.ui.worldContainer.sort === 'function') {
                                            this.ui.worldContainer.sort('depth');
                                        }
                                    }
                                    if (hero.bones?.leg_upper_left) hero.bones.leg_upper_left.angle = -82;
                                    if (hero.bones?.leg_upper_right) hero.bones.leg_upper_right.angle = -82;
                                    if (hero.bones?.arm_left) hero.bones.arm_left.angle = -20;
                                    if (hero.bones?.arm_right) hero.bones.arm_right.angle = -20;
                                    if (hero.bones?.body) hero.bones.body.angle = 0;
                                    if (hero.bones?.head) hero.bones.head.angle = 0;
                                    hero.setFace('happy');

                                    // Start uneven toilet shaking 500ms after sitting down (duration 2600ms, stops 500ms before standing up at 3600ms)
                                    this.scene.time.delayedCall(500, () => {
                                        if (this._heroSeatedOnToilet) {
                                            this._startToiletShake(this.scene.time.now, 2600);
                                        }
                                    });

                                    // 6. Simultaneously, all 5 friends walk back off-screen and disappear. girl_1 remains in her spot.
                                    const girl1 = this.puppets.girl_1;
                                    this.partyFX?.focusOnGirl(girl1);

                                    // Sparkles appear and disappear 2 seconds earlier than when hero stands up (at 1600ms instead of 3600ms)
                                    this.scene.time.delayedCall(1600, () => {
                                        this.partyFX?.sparkleOnGirl(girl1);
                                    });

                                    friends.forEach((friend, idx) => {
                                        if (!friend) return;
                                        friend.animator?.stopAll();

                                        const isLeft = idx < 2;
                                        const exitX = isLeft ? -520 : 580;
                                        const flipSign = isLeft ? -1 : 1;
                                        const friendScale = this._getCharacterScale(friend, flipSign);
                                        friend.setScale(friendScale.x, friendScale.y);
                                        if (friend.bones?.body) friend.bones.body.angle = 0;
                                        if (friend.bones?.head) friend.bones.head.angle = 0;
                                        friend.animator?.playWalk();

                                        this.scene.tweens.add({
                                            targets: friend,
                                            x: exitX,
                                            duration: 1300 + idx * 80,
                                            ease: 'Power1.easeIn',
                                            onComplete: () => {
                                                friend.setVisible(false);
                                                friend.animator?.stopAll();
                                            }
                                        });
                                    });

                                    // 4. Transition: Hero stands up, then hero and girl_1 walk to right
                                    this.scene.time.delayedCall(3600, () => {
                                        this._stopToiletShake();
                                        this._heroSeatedOnToilet = false;
                                        // Hero gets up from toilet: fade beams & strobe
                                        this.partyFX?.finishParty(girl1);

                                        if (hero) {
                                            hero.resetPose();
                                            hero.y = this.heroGroundY;
                                            const heroScale = this._getCharacterScale(hero, 1);
                                            hero.setScale(heroScale.x, heroScale.y);
                                            hero.animator?.playIdle();
                                        }

                                        this.scene.time.delayedCall(1000, () => {
                                            this.goToStep('step_walk_to_jewel');
                                        });
                                    });
                                }
                            });
                        } else {
                            this.goToStep('step_walk_to_jewel');
                        }
                    });
                }
            });
        });
    }

    _runStepWalkToJewel() {
        this._startMainBgm();
        this._stopToiletShake();
        if (this._doorTrackingListener) {
            this.scene.events.off('update', this._doorTrackingListener);
            this._doorTrackingListener = null;
        }

        if (this.partyFX) {
            this.partyFX.destroy();
            this.partyFX = null;
        }

        const hero = this.puppets.hero;
        const girl1 = this.puppets.girl_1;
        const man1 = this.puppets.man_1;

        if (hero) {
            hero.setVisible(true);
            hero.resetPose();
            hero.y = this.heroGroundY;
            hero.setDepth(30);
            const heroScale = this._getCharacterScale(hero, 1);
            hero.setScale(heroScale.x, heroScale.y);
        }

        if (girl1) {
            girl1.setVisible(true);
            girl1.resetPose();
            girl1.y = this.groundY;
            girl1.setDepth(21);
            const girlScale = this._getCharacterScale(girl1, 1);
            girl1.setScale(girlScale.x, girlScale.y);
        }

        const startX = this.story?.locations?.road_bg?.x ?? 0;
        const targetX = this.story?.locations?.jewel_building_bg?.x ?? (this.story?.locations?.road_bg?.displayWidth || 1544);
        const spacing = 185;
        const halfCharWidth = 90;
        const heroTargetX = targetX - halfCharWidth;
        const targetGirlX = heroTargetX - 115;
        const heroPreStopX = targetX - 75 - halfCharWidth;
        const girlPreStopX = targetGirlX - 75;
        const manTargetX = targetX + spacing;

        const distance = Math.abs(targetX - startX);
        const walkSpeed = this.story?.walk_speed || 500;
        const cameraDuration = Math.round((distance / walkSpeed) * 1000);

        if (hero) hero.animator?.playWalk();
        if (girl1) girl1.animator?.playWalk();

        let heroStopped = false;
        let girl1Stopped = false;
        const initialHeroX = hero ? hero.x : startX;
        const initialGirlX = girl1 ? girl1.x : (startX - 115);

        this.currentLocationKey = 'jewel_building_bg';
        this.isTransitioning = true;

        const snapWalkToJewel = () => {
            this.currentLocationKey = 'jewel_building_bg';
            if (this.ui.worldContainer) {
                const currentWorldScale = this.ui.worldContainer.scaleX || 1;
                this.ui.worldContainer.x = 300 - targetX * currentWorldScale;
            }
            if (hero) {
                hero.setVisible(true);
                hero.resetPose();
                hero.setPosition(heroTargetX, this.heroGroundY);
                hero.animator?.playIdle();
                hero.setFace('happy');
                const heroScale = this._getCharacterScale(hero, 1);
                hero.setScale(heroScale.x, heroScale.y);
            }
            if (girl1) {
                girl1.setVisible(true);
                girl1.resetPose();
                girl1.setPosition(targetGirlX, this.groundY);
                girl1.animator?.playIdle();
                const girlScale = this._getCharacterScale(girl1, 1);
                girl1.setScale(girlScale.x, girlScale.y);
            }
            if (man1) {
                man1.setPosition(manTargetX, this.groundY);
                const manScale = this._getCharacterScale(man1, -1);
                man1.setScale(manScale.x, manScale.y);
                man1.setVisible(true);
                man1.animator?.playIdle();
            }
            this.goToStep('step_choose_house');
        };

        this._activeTransition = {
            type: 'walk_to_jewel',
            tweens: [],
            delayedCalls: [],
            snap: snapWalkToJewel
        };

        // Pan camera alongside hero to center on jewel building
        if (this.ui.worldContainer) {
            const worldScale = this.ui.worldContainer.scaleX || 1;
            const startCamX = 300 - startX * worldScale;
            const endCamX = 300 - targetX * worldScale;

            const camTween = this.scene.tweens.add({
                targets: this.ui.worldContainer,
                x: endCamX,
                duration: cameraDuration,
                ease: 'Power1.easeInOut',
                onUpdate: () => {
                    const currentWorldScale = this.ui.worldContainer.scaleX || 1;
                    const camMoved = (startCamX - this.ui.worldContainer.x) / currentWorldScale;
                    if (!heroStopped) {
                        if (initialHeroX + camMoved >= heroPreStopX) {
                            heroStopped = true;
                            if (hero) {
                                hero.x = heroPreStopX;
                                hero.animator?.playIdle();
                            }
                        } else {
                            if (hero) hero.x = initialHeroX + camMoved;
                        }
                    }
                    if (!girl1Stopped) {
                        if (initialGirlX + camMoved >= girlPreStopX) {
                            girl1Stopped = true;
                            if (girl1) {
                                girl1.x = girlPreStopX;
                            }
                        } else {
                            if (girl1) girl1.x = initialGirlX + camMoved;
                        }
                    }
                },
                onComplete: () => {
                    let manFinished = false;
                    let heroFinished = false;
                    let girl1Finished = false;
                    const checkDone = () => {
                        if (manFinished && heroFinished && girl1Finished) {
                            const delay = this.scene.time.delayedCall(350, () => {
                                this.isTransitioning = false;
                                this._activeTransition = null;
                                this.goToStep('step_choose_house');
                            });
                            if (this._activeTransition) {
                                this._activeTransition.delayedCalls.push(delay);
                            }
                        }
                    };

                    // Hero approaches half his width to the left of the center of the screen
                    if (hero) {
                        hero.animator?.playWalk();
                        const heroTween = this.scene.tweens.add({
                            targets: hero,
                            x: heroTargetX,
                            duration: 750,
                            ease: 'Power1.easeInOut',
                            onComplete: () => {
                                hero.animator?.playIdle();
                                hero.setFace('happy');
                                heroFinished = true;
                                checkDone();
                            }
                        });
                        if (this._activeTransition) {
                            this._activeTransition.tweens.push(heroTween);
                        }
                    } else {
                        heroFinished = true;
                    }

                    // Girl 1 approaches her companion position alongside hero
                    if (girl1) {
                        girl1.animator?.playWalk();
                        const girl1Tween = this.scene.tweens.add({
                            targets: girl1,
                            x: targetGirlX,
                            duration: 750,
                            ease: 'Power1.easeInOut',
                            onComplete: () => {
                                girl1.animator?.playIdle();
                                girl1Finished = true;
                                checkDone();
                            }
                        });
                        if (this._activeTransition) {
                            this._activeTransition.tweens.push(girl1Tween);
                        }
                    } else {
                        girl1Finished = true;
                    }

                    // Man 1 exits from right and stops to the right of hero
                    if (man1) {
                        man1.setPosition(targetX + 360, this.groundY);
                        const manScale = this._getCharacterScale(man1, -1);
                        man1.setScale(manScale.x, manScale.y);
                        man1.setVisible(true);
                        man1.animator?.playWalk();

                        const manTween = this.scene.tweens.add({
                            targets: man1,
                            x: manTargetX,
                            duration: 900,
                            ease: 'Power1.easeOut',
                            onComplete: () => {
                                man1.animator?.playIdle();
                                manFinished = true;
                                checkDone();

                                try {
                                    const mumble = Utils.addAudio(this.scene, 'voice_man_mumble', 1.0);
                                    let girlReplied = false;
                                    const playGirlInterested = () => {
                                        if (girlReplied) return;
                                        girlReplied = true;
                                        try {
                                            Utils.addAudio(this.scene, 'voice_girl1_interested_mmm', 1.0);
                                        } catch (e) { }
                                    };
                                    if (mumble) {
                                        mumble.once('complete', playGirlInterested);
                                        this.scene.time.delayedCall(1600, playGirlInterested);
                                    } else {
                                        this.scene.time.delayedCall(1200, playGirlInterested);
                                    }
                                } catch (e) { }
                            }
                        });
                        if (this._activeTransition) {
                            this._activeTransition.tweens.push(manTween);
                        }
                    } else {
                        manFinished = true;
                        checkDone();
                    }
                }
            });

            this._activeTransition.tweens.push(camTween);
        } else {
            snapWalkToJewel();
        }
    }

    _runStepChooseHouse() {
        const step = this.story?.steps?.step_choose_house;
        if (!step || !step.choices) return;

        // Show choice cards: Luxury House vs. Simple House
        const houseChoiceY = UI_CONFIG?.choice_group?.positions_y?.multiple ?? 205;
        this.ui.choices?.showChoices(step.choices, { y: houseChoiceY, balanceView: this.ui?.balance });

        this.ui.choices.onChoice = (choice) => {
            // Guard: Insufficient funds check
            if (this.ui.balance && choice.price && this.ui.balance.getValue() < choice.price) {
                return;
            }

            // Deduct cost from balance
            if (this.ui.balance && choice.price) {
                this.ui.balance.subtract(choice.price);
            }

            this.chosenHouse = choice.id;

            // Set house background according to selection
            if (typeof this.ui.setHouseBackground === 'function') {
                this.ui.setHouseBackground(choice.id);
            }

            const hero = this.puppets.hero;
            const girl1 = this.puppets.girl_1;
            const startX = this.story?.locations?.jewel_building_bg?.x ?? (this.story?.locations?.road_bg?.displayWidth || 1544);
            const targetHouseX = this.story?.locations?.luxury_house_bg?.x ?? ((this.story?.locations?.road_bg?.displayWidth || 1544) * 2);
            const spacing = 185;
            const halfCharWidth = 90;
            const houseHeroPreStopX = targetHouseX - 75 - halfCharWidth;
            const houseGirlPreStopX = houseHeroPreStopX - 115;
            const houseTargetGirlX = targetHouseX - spacing;

            const distance = Math.abs(targetHouseX - startX);
            const walkSpeed = this.story?.walk_speed || 500;
            const cameraDuration = Math.round((distance / walkSpeed) * 1000);

            // 1. After selecting a house, hero emotion changes to hero_face_happy
            if (hero) {
                hero.setFace('happy');
            }

            // 2. Girl 1 approaches hero, then both walk together with camera to house scene
            const girl1TargetX = (hero ? hero.x - 115 : startX - halfCharWidth - 115);

            this.isTransitioning = true;
            const targetLocKey = (this.chosenHouse === 'choice_simple') ? 'simple_house_bg' : 'luxury_house_bg';

            const snapWalkToHouse = () => {
                this.currentLocationKey = targetLocKey;
                if (typeof this.ui.setHouseBackground === 'function') {
                    this.ui.setHouseBackground(this.chosenHouse || 'choice_luxury');
                }
                if (this.ui.worldContainer) {
                    const currentWorldScale = this.ui.worldContainer?.scaleX || 1;
                    this.ui.worldContainer.x = 300 - targetHouseX * currentWorldScale;
                }
                if (hero) {
                    hero.setVisible(true);
                    hero.resetPose();
                    hero.setPosition(houseHeroPreStopX, this.heroGroundY);
                    hero.animator?.playIdle();
                    hero.setFace('amazed');
                    const heroScale = this._getCharacterScale(hero, 1);
                    hero.setScale(heroScale.x, heroScale.y);
                }
                if (girl1) {
                    girl1.setVisible(true);
                    girl1.resetPose();
                    girl1.setPosition(houseGirlPreStopX, this.groundY);
                    girl1.animator?.playIdle();
                    const girlScale = this._getCharacterScale(girl1, 1);
                    girl1.setScale(girlScale.x, girlScale.y);
                }
                this._runStepHouseArrival({
                    targetHouseX,
                    spacing,
                    houseTargetGirlX
                });
            };

            this._activeTransition = {
                type: 'walk_to_house',
                tweens: [],
                delayedCalls: [],
                snap: snapWalkToHouse
            };

            this._runWalkToHouse({
                hero,
                girl1,
                startX,
                targetHouseX,
                spacing,
                houseHeroPreStopX,
                houseGirlPreStopX,
                houseTargetGirlX,
                cameraDuration
            });
        };
    }

    _runWalkToHouse(params) {
        const {
            hero,
            girl1,
            startX = (this.story?.locations?.jewel_building_bg?.x ?? (this.story?.locations?.road_bg?.displayWidth || 1544)),
            targetHouseX = (this.story?.locations?.luxury_house_bg?.x ?? ((this.story?.locations?.road_bg?.displayWidth || 1544) * 2)),
            spacing = 185,
            houseHeroPreStopX = (targetHouseX - 75 - 90),
            houseGirlPreStopX = (targetHouseX - 75 - 90 - 115),
            houseTargetGirlX = (targetHouseX - 185),
            cameraDuration = Math.round((Math.abs(targetHouseX - startX) / (this.story?.walk_speed || 500)) * 1000)
        } = params || {};

        this.currentLocationKey = (this.chosenHouse === 'choice_simple') ? 'simple_house_bg' : 'luxury_house_bg';
        this.isTransitioning = true;

        if (!this._activeTransition) {
            const snapWalkToHouse = () => {
                this.currentLocationKey = (this.chosenHouse === 'choice_simple') ? 'simple_house_bg' : 'luxury_house_bg';
                if (typeof this.ui.setHouseBackground === 'function') {
                    this.ui.setHouseBackground(this.chosenHouse || 'choice_luxury');
                }
                if (this.ui.worldContainer) {
                    const currentWorldScale = this.ui.worldContainer?.scaleX || 1;
                    this.ui.worldContainer.x = 300 - targetHouseX * currentWorldScale;
                }
                if (hero) {
                    hero.setVisible(true);
                    hero.resetPose();
                    hero.setPosition(houseHeroPreStopX, this.heroGroundY);
                    hero.animator?.playIdle();
                    hero.setFace('amazed');
                    const heroScale = this._getCharacterScale(hero, 1);
                    hero.setScale(heroScale.x, heroScale.y);
                }
                if (girl1) {
                    girl1.setVisible(true);
                    girl1.resetPose();
                    girl1.setPosition(houseGirlPreStopX, this.groundY);
                    girl1.animator?.playIdle();
                    const girlScale = this._getCharacterScale(girl1, 1);
                    girl1.setScale(girlScale.x, girlScale.y);
                }
                this._runStepHouseArrival({
                    targetHouseX,
                    spacing,
                    houseTargetGirlX
                });
            };

            this._activeTransition = {
                type: 'walk_to_house',
                tweens: [],
                delayedCalls: [],
                snap: snapWalkToHouse
            };
        }

        const worldScale = this.ui.worldContainer?.scaleX || 1;
        const startCamX = 300 - startX * worldScale;
        const endCamX = 300 - targetHouseX * worldScale;

        // Rely on live coordinates rather than resetting or snapping to a precalculated start position
        const liveHeroX = hero ? hero.x : (startX - 90);
        const liveGirl1X = girl1 ? girl1.x : (liveHeroX - 115);

        if (hero) hero.animator?.playWalk();
        if (girl1) girl1.animator?.playWalk();

        let heroStopped = false;

        // Pan camera alongside hero and girl 1 to the house scene
        if (this.ui.worldContainer) {
            const camTween = this.scene.tweens.add({
                targets: this.ui.worldContainer,
                x: endCamX,
                duration: cameraDuration,
                ease: 'Power1.easeInOut',
                onUpdate: () => {
                    const currentWorldScale = this.ui.worldContainer?.scaleX || 1;
                    const camMoved = (startCamX - this.ui.worldContainer.x) / currentWorldScale;
                    if (!heroStopped) {
                        if (liveHeroX + camMoved >= houseHeroPreStopX) {
                            heroStopped = true;
                            if (hero) {
                                hero.x = houseHeroPreStopX;
                                hero.animator?.playIdle();
                            }
                            if (girl1) {
                                girl1.x = liveGirl1X + (houseHeroPreStopX - liveHeroX);
                                girl1.animator?.playIdle();
                            }
                        } else {
                            if (hero) hero.x = liveHeroX + camMoved;
                            if (girl1) girl1.x = liveGirl1X + camMoved;
                        }
                    }
                },
                onComplete: () => {
                    this.isTransitioning = false;
                    this._activeTransition = null;
                    this._runStepHouseArrival({
                        targetHouseX,
                        spacing,
                        houseTargetGirlX
                    });
                }
            });
            if (this._activeTransition) {
                this._activeTransition.tweens.push(camTween);
            }
        } else {
            this.isTransitioning = false;
            this._activeTransition = null;
            this._runStepHouseArrival({
                targetHouseX,
                spacing,
                houseTargetGirlX
            });
        }
    }

    _runStepHouseArrival(params = {}) {
        const houseCenter = params.targetHouseX || this.story?.locations?.luxury_house_bg?.x || ((this.story?.locations?.road_bg?.displayWidth || 1544) * 2);
        const halfCharWidth = 90;
        const hero = this.puppets.hero;
        const girl1 = this.puppets.girl_1;
        const girl2 = this.puppets.girl_2;

        // "The hero's emotion should change to hero_face_amazed."
        if (hero) {
            hero.setFace('amazed');
        }

        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        // Shift arrival destination of girl_2 significantly closer to hero
        const girl2Spacing = isPortrait ? 65 : 75;
        const girl2TargetX = houseCenter + girl2Spacing; // ~1915-1925

        let heroFinished = false;
        let girl2Finished = false;

        const checkDone = () => {
            if (heroFinished && girl2Finished) {
                this.scene.time.delayedCall(350, () => {
                    this.goToStep('step_choose_ring');
                });
            }
        };

        // Hero approaches half his width to the left of the center of the screen
        const heroTargetX = houseCenter - halfCharWidth;
        if (hero) {
            hero.animator?.playWalk();
            this.scene.tweens.add({
                targets: hero,
                x: heroTargetX,
                duration: 750,
                ease: 'Power1.easeInOut',
                onComplete: () => {
                    hero.animator?.playIdle();
                    heroFinished = true;
                    checkDone();
                }
            });
        } else {
            heroFinished = true;
        }

        // "Girl 2 exits from the right."
        if (girl2) {
            girl2.setDepth(35);
            girl2.setPosition(houseCenter + 800, this.groundY + 76);
            const girl2Scale = this._getCharacterScale(girl2, -1);
            girl2.setScale(girl2Scale.x, girl2Scale.y);
            girl2.setVisible(true);
            girl2.animator?.playWalk({ speed: 0.5 });
            try {
                Utils.addAudio(this.scene, 'voice_hero_gasp_aah', 1.0);
            } catch (e) { }

            this.scene.tweens.add({
                targets: girl2,
                x: girl2TargetX, // 2035
                duration: 1800,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    girl2.animator?.playIdle();
                    girl2Finished = true;
                    checkDone();
                }
            });
        } else {
            girl2Finished = true;
            checkDone();
        }
    }

    _runStepChooseRing() {
        const step = this.story?.steps?.step_choose_ring;
        if (!step || !step.choices) return;

        // Display choice cards (clown_ico vs girl2_ico)
        const choiceY = (step.choices.length > 1)
            ? (UI_CONFIG?.choice_group?.positions_y?.multiple ?? 205)
            : (UI_CONFIG?.choice_group?.positions_y?.single ?? -145);
        this.ui.choices?.showChoices(step.choices, { y: choiceY, balanceView: this.ui?.balance });
        try {
            Utils.addAudio(this.scene, 'voice_girl1_jealous_grunt', 1.0);
        } catch (e) { }

        this.ui.choices.onChoice = (choice) => {
            // Guard: Insufficient funds check
            if (this.ui.balance && choice.price && this.ui.balance.getValue() < choice.price) {
                return;
            }

            if (this.ui.balance && choice.price) {
                this.ui.balance.subtract(choice.price);
            }

            if (choice.id === 'choice_clown' || choice.icon === 'clown_ico') {
                this._playClownSequence(() => {
                    this.goToStep('step_fail_end');
                });
            } else {
                // "if you choose girl2_ico the same thing should happen as now happens when you choose a ring"
                this._playRingBoxSequence(() => {
                    this.goToStep('step_fail_end');
                });
            }
        };
    }

    _playClownSequence(onComplete) {
        const hero = this.puppets.hero;
        const girl1 = this.puppets.girl_1;
        const girl2 = this.puppets.girl_2;
        const clown = this.puppets.clown;
        const houseCenter = this.story?.locations?.luxury_house_bg?.x ?? ((this.story?.locations?.road_bg?.displayWidth || 1544) * 2);

        // 1. Girl 2 turns to the right
        if (girl2) {
            girl2.setScale(Math.abs(girl2.scaleX), girl2.scaleY);
        }

        // 2. Clown comes out on the right, walking swaying from right to left, and approaches Girl 2
        if (clown) {
            clown.setDepth(36);
            const isPortrait = this.scene.scale.width < this.scene.scale.height;
            // Pull stopping position inward so clown stays completely within viewport in portrait
            const clownApproachOffset = isPortrait ? 95 : 105;
            const targetClownX = girl2 ? (girl2.x + clownApproachOffset) : (houseCenter + 165);

            const spawnX = Math.max(houseCenter + 550, targetClownX + 360);
            clown.setPosition(spawnX, this.groundY + 76);
            const clownScale = this._getCharacterScale(clown, -1);
            clown.setScale(clownScale.x, clownScale.y); // Facing left towards Girl 2
            clown.setVisible(true);
            clown.setFace('idle');
            clown.animator?.playWalk();
            try {
                Utils.addAudio(this.scene, 'clown_horn', 1.0);
            } catch (e) { }

            // Clown waddle/sway from right to left while walking
            const swayTween = this.scene.tweens.add({
                targets: clown,
                angle: { from: -10, to: 10 },
                duration: 250,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            const clownDist = Math.abs(clown.x - targetClownX);
            const clownWalkSpeed = 190;
            const clownWalkDuration = Math.round((clownDist / clownWalkSpeed) * 1000);

            // Duck main BGM while cello dramatic tension plays
            this.duckMainBgm(0.15, 350);

            let celloSound = null;
            let celloRestored = false;
            const onCelloFinished = () => {
                if (celloRestored) return;
                celloRestored = true;
                if (this._celloFallbackTimer) {
                    this._celloFallbackTimer.remove();
                    this._celloFallbackTimer = null;
                }
                this._celloSound = null;
                this.restoreMainBgm(450);
            };

            try {
                celloSound = Utils.addAudio(this.scene, 'cello_dramatic_tension', 1.0);
                this._celloSound = celloSound;
            } catch (e) { }

            if (celloSound && typeof celloSound.once === 'function') {
                celloSound.once('complete', onCelloFinished);
            }

            // Estimate duration from spritemap or fallback to 8500ms
            let celloDurationMs = 8500;
            if (celloSound?.spritemap?.cello_dramatic_tension) {
                const entry = celloSound.spritemap.cello_dramatic_tension;
                if (typeof entry.end === 'number' && typeof entry.start === 'number') {
                    celloDurationMs = Math.round((entry.end - entry.start) * 1000) + 100;
                }
            }
            this._celloFallbackTimer = this.scene.time.delayedCall(celloDurationMs, onCelloFinished);

            this.scene.tweens.add({
                targets: clown,
                x: targetClownX,
                duration: clownWalkDuration,
                ease: 'Linear',
                onComplete: () => {
                    swayTween.stop();
                    clown.angle = 0;
                    clown.animator?.playIdle();
                    clown.setFace('kiss');

                    // 3. He approaches Girl 2, she starts running to the left, Girl 1 runs away with her,
                    // and at this time the hero trembles slightly out of sync with all parts
                    this.scene.time.delayedCall(300, () => {
                        // Girl 2 turns left and runs
                        if (girl2) {
                            girl2.setScale(-Math.abs(girl2.scaleX), girl2.scaleY);
                            girl2.animator?.playRun();
                        }

                        // Girl 1 turns left and runs
                        if (girl1) {
                            girl1.setScale(-Math.abs(girl1.scaleX), girl1.scaleY);
                            girl1.animator?.playRun();
                        }

                        try {
                            Utils.addAudio(this.scene, 'run_scramble', 1.0);
                        } catch (e) { }

                        // Both girls run away to the left
                        this.scene.tweens.add({
                            targets: [girl1, girl2].filter(Boolean),
                            x: '-=720',
                            duration: 1300,
                            ease: 'Power1.easeIn',
                            onComplete: () => {
                                if (girl1) { girl1.setVisible(false); girl1.animator?.playIdle(); }
                                if (girl2) { girl2.setVisible(false); girl2.animator?.playIdle(); }
                            }
                        });

                        // At this time the hero trembles slightly out of sync with all parts
                        if (hero) {
                            hero.setFace('surprised');
                            hero.animator?.playTremble();
                            try {
                                this._trembleSound = Utils.addAudio(this.scene, 'tremble_teeth', 1.0, true);
                            } catch (e) { }
                        }

                        // 4. Clown starts running towards hero, and hero also runs to the right
                        this.scene.time.delayedCall(700, () => {
                            if (clown) {
                                clown.setFace('idle');
                                clown.animator?.playRun();

                                const chargeTargetX = (hero ? hero.x + 85 : houseCenter);
                                this.scene.tweens.add({
                                    targets: clown,
                                    x: chargeTargetX,
                                    duration: 1100,
                                    ease: 'Power1.easeInOut'
                                });
                            }

                            // Hero sees clown charging, flips to the right and also runs to the right
                            this.scene.time.delayedCall(350, () => {
                                if (this._trembleSound) {
                                    this._trembleSound.stop();
                                    this._trembleSound = null;
                                }
                                if (hero) {
                                    hero.setScale(Math.abs(hero.scaleX), hero.scaleY);
                                    hero.animator?.playRun();

                                    this.scene.tweens.add({
                                        targets: hero,
                                        x: '+=850',
                                        duration: 1200,
                                        ease: 'Power1.easeIn',
                                        onComplete: () => {
                                            hero.setVisible(false);
                                            hero.animator?.playIdle();
                                        }
                                    });
                                }
                            });

                            // 5. Clown stops and executes camera approach zoom-in before final window
                            this.scene.time.delayedCall(1250, () => {
                                if (clown) {
                                    clown.animator?.playIdle();
                                    clown.setFace('kiss');
                                }

                                this.scene.time.delayedCall(450, () => {
                                    this._playCameraApproach(clown, () => {
                                        if (onComplete) onComplete();
                                    });
                                });
                            });
                        });
                    });
                }
            });
        } else {
            if (onComplete) onComplete();
        }
    }

    _playRingBoxSequence(onComplete) {
        const hero = this.puppets.hero;
        const girl1 = this.puppets.girl_1;
        const girl2 = this.puppets.girl_2;
        const houseCenter = this.story?.locations?.luxury_house_bg?.x ?? ((this.story?.locations?.road_bg?.displayWidth || 1544) * 2);

        // Position ring box between hero and girl 2
        const boxX = (hero && girl2) ? Math.round((hero.x + girl2.x) / 2) : (houseCenter + 15);
        const boxY = this.groundY - 50;

        const boxContainer = this.scene.add.container(boxX, boxY);
        boxContainer.setScale(0);
        boxContainer.setDepth(50);
        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(boxContainer);
        }

        const ringBoxCfg = UI_CONFIG?.ring_box || {};
        const bottomCfg = ringBoxCfg.bottom || { texture: 'ring_box_bottom', x: 0, y: 10, scale: 0.55 };
        const topCfg = ringBoxCfg.top || { texture: 'ring_box_top', x: -28, y: 1, scale: 0.55, origin: { x: 0.12, y: 0.88 } };

        // 1. Box Bottom
        const boxBottom = this.scene.add.image(bottomCfg.x, bottomCfg.y, bottomCfg.texture);
        boxBottom.setScale(bottomCfg.scale);
        boxContainer.add(boxBottom);

        // 2. Box Top (hinge lid)
        const boxTop = this.scene.add.image(topCfg.x, topCfg.y, topCfg.texture);
        boxTop.setOrigin(topCfg.origin?.x ?? 0.12, topCfg.origin?.y ?? 0.88);
        boxTop.setScale(topCfg.scale);
        boxContainer.add(boxTop);

        try {
            Utils.addAudio(this.scene, 'click', 1.0);
        } catch (e) { }

        // Box appearance animation
        this.scene.tweens.add({
            targets: boxContainer,
            scaleX: 1,
            scaleY: 1,
            duration: 350,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.scene.time.delayedCall(250, () => {
                    try {
                        Utils.addAudio(this.scene, 'ring_box_open', 1.0);
                    } catch (e) { }
                    // Lid hinges open revealing ring
                    this.scene.tweens.add({
                        targets: boxTop,
                        angle: -65,
                        duration: 500,
                        ease: 'Back.easeOut',
                        onComplete: () => {
                            // The ring should disappear after opening with a delay of 1 second
                            this.scene.time.delayedCall(1000, () => {
                                this.scene.tweens.add({
                                    targets: boxContainer,
                                    alpha: 0,
                                    scaleX: 0,
                                    scaleY: 0,
                                    duration: 300,
                                    ease: 'Power2.easeIn',
                                    onComplete: () => {
                                        if (boxContainer && boxContainer.scene) {
                                            boxContainer.destroy();
                                        }
                                    }
                                });
                            });

                            // Girl 2 turns on the girl2_face_kiss emote for 1600 milliseconds
                            if (girl2) {
                                girl2.setDepth(35);
                                girl2.setFace('kiss');
                            }

                            // girl2_face_kiss should change back to girl2_face_idle after 1600 milliseconds, and only after that girl 2 should go
                            this.scene.time.delayedCall(1600, () => {
                                if (girl2) {
                                    girl2.setDepth(35);
                                    girl2.setFace('idle');
                                    girl2.animator?.playWalk();

                                    const targetX = (girl1 ? girl1.x + 110 : houseCenter - 75);
                                    const distToGirl1 = Math.abs(girl2.x - targetX);
                                    // Walk speed consistent with other characters (~180-200 px/s)
                                    const characterWalkSpeed = 190;
                                    const walkToGirlDuration = Math.round((distToGirl1 / characterWalkSpeed) * 1000);

                                    this.scene.tweens.add({
                                        targets: girl2,
                                        x: targetX,
                                        duration: walkToGirlDuration,
                                        ease: 'Linear',
                                        onComplete: () => {
                                            girl2.animator?.playIdle();
                                            try {
                                                Utils.addAudio(this.scene, 'kiss_smack', 1.0);
                                            } catch (e) { }

                                            // "Girl 1 turns around (flips horizontally)."
                                            if (girl1) {
                                                girl1.setScale(-Math.abs(girl1.scaleX), girl1.scaleY);
                                            }

                                            // "The hero's emotion should change to hero_face_surprised."
                                            if (hero) {
                                                hero.setFace('surprised');
                                            }

                                            // "Girl 1 and Girl 2 move to the left, and the final window is enabled"
                                            this.scene.time.delayedCall(750, () => {
                                                try {
                                                    Utils.addAudio(this.scene, 'hero_shock_sting', 1.0);
                                                } catch (e) { }
                                                if (girl1) girl1.animator?.playWalk();
                                                if (girl2) {
                                                    girl2.setScale(-Math.abs(girl2.scaleX), girl2.scaleY);
                                                    girl2.animator?.playWalk();
                                                }

                                                // Both girls walk away to the left at consistent character walk speed
                                                const exitDist = 520;
                                                const exitDuration = Math.round((exitDist / characterWalkSpeed) * 1000);

                                                this.scene.tweens.add({
                                                    targets: [girl1, girl2].filter(Boolean),
                                                    x: `-=${exitDist}`,
                                                    duration: exitDuration,
                                                    ease: 'Linear',
                                                    onComplete: () => {
                                                        if (girl1) { girl1.setVisible(false); girl1.animator?.stopAll(); }
                                                        if (girl2) { girl2.setVisible(false); girl2.animator?.stopAll(); }

                                                        // Hero remains on stage and performs camera approach zoom-in before final window
                                                        if (hero) {
                                                            this._playCameraApproach(hero, () => {
                                                                if (onComplete) onComplete();
                                                            });
                                                        } else {
                                                            if (onComplete) onComplete();
                                                        }
                                                    }
                                                });
                                            });
                                        }
                                    });
                                } else {
                                    if (onComplete) onComplete();
                                }
                            });
                        }
                    });
                });
            }
        });
    }

    _playCameraApproach(character, onComplete) {
        if (!character) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        // Smoothly fade out & hide balance plate so it does not obstruct the cinematic approach
        if (this.ui?.balance) {
            const balance = this.ui.balance;
            this.scene.tweens.killTweensOf(balance);
            this.scene.tweens.add({
                targets: balance,
                alpha: 0,
                duration: 300,
                ease: 'Sine.easeOut',
                onComplete: () => {
                    balance.setVisible(false);
                }
            });
        }

        const houseCenter = this.story?.locations?.luxury_house_bg?.x ?? ((this.story?.locations?.road_bg?.displayWidth || 1544) * 2);

        // 1. Depth & Layering: bring approaching character to the top of the character layer
        character.setDepth(150);
        if (this.ui.worldContainer) {
            this.ui.worldContainer.bringToTop(character);
            if (typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
        }

        character._isCameraApproaching = true;

        // 2. Active walk cycle: character walks directly forward toward the camera/player
        character.animator?.playWalk();

        const approachCfg = this.story?.camera_approach || {};
        const duration = approachCfg.duration ?? 1400;
        const ease = approachCfg.ease ?? 'Power1.easeInOut';
        const cameraZoom = approachCfg.camera_zoom ?? 1.25;
        const scaleMult = approachCfg.character_scale_multiplier ?? 2;

        // 3. Scale increase: smoothly scale up while maintaining horizontal sign/facing
        const targetScaleX = character.scaleX * scaleMult;
        const targetScaleY = character.scaleY * scaleMult;

        // 4. Vertical perspective displacement (Y-axis shift): smoothly move character downward/forward along Y axis
        // to ground the character's feet and simulate realistic 2.5D perspective walking directly toward the camera viewport
        const approachYOffset = approachCfg.y_offset ?? 180;
        const startY = character.y;
        const targetY = startY + approachYOffset - 200;

        // 5. Horizontal framing: pull smoothly toward center of viewport
        const targetX = houseCenter;

        try {
            Utils.addAudio(this.scene, 'zoom_approach', 1.0);
        } catch (e) { }

        // 6. Dolly Zoom on the camera: smooth camera zoom alongside physical character approach
        const camera = this.scene.cameras?.main;
        if (camera) {
            this.scene.tweens.killTweensOf(camera);
            this.scene.tweens.add({
                targets: camera,
                zoom: cameraZoom,
                duration: duration,
                ease: ease
            });
        }

        this.scene.tweens.killTweensOf(character);
        this.scene.tweens.add({
            targets: character,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            x: targetX,
            y: targetY,
            duration: duration,
            ease: ease,
            onComplete: () => {
                // Settle animation once the approach completes
                character.animator?.playIdle();
                try {
                    this.scene.cameras?.main?.shake(120, 0.003);
                } catch (e) { }
                this.scene.time.delayedCall(250, () => {
                    if (typeof onComplete === 'function') onComplete();
                });
            }
        });
    }

    _runStepFailEnd() {
        if (this._celloFallbackTimer) {
            this._celloFallbackTimer.remove();
            this._celloFallbackTimer = null;
        }
        this.restoreMainBgm(350);

        // Activate final modal window (FinalWindow) with "TRY AGAIN" and "RESTART" buttons
        if (this.ui.finalWindow) {
            this.ui.finalWindow.show();
        }

        this._createFinaleButtons();
    }

    _createFinaleButtons() {
        if (this.finaleButtons.length > 0) return;

        const container = this.scene.mainContainer;
        if (!container) return;

        // Left button: TRY AGAIN (green)
        this.btnTryAgain = new Button({
            scene: this.scene,
            container: container,
            texture: 'btn_try_again_green',
            text: '',
            align: 'Center',
            px: -125,
            py: 320,
            lx: -140,
            ly: 290,
            pScaleX: 0,
            pScaleY: 0,
            lScaleX: 0,
            lScaleY: 0,
            depth: 110,
            callback: () => this._onCta()
        });

        // Right button: RESTART (red)
        this.btnRestart = new Button({
            scene: this.scene,
            container: container,
            texture: 'btn_restart_red',
            text: '',
            align: 'Center',
            px: 125,
            py: 320,
            lx: 140,
            ly: 290,
            pScaleX: 0,
            pScaleY: 0,
            lScaleX: 0,
            lScaleY: 0,
            depth: 110,
            callback: () => this._onCta()
        });

        this.finaleButtons = [this.btnTryAgain, this.btnRestart];

        // Animate entrance of both buttons
        this.scene.tweens.add({
            targets: [this.btnTryAgain, this.btnRestart],
            pScaleX: 0.50,
            pScaleY: 0.50,
            lScaleX: 0.52,
            lScaleY: 0.52,
            duration: 450,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.finaleButtons.forEach((btn) => {
                    this.scene.tweens.add({
                        targets: btn,
                        pScaleX: 0.50 * 1.06,
                        pScaleY: 0.50 * 1.06,
                        lScaleX: 0.52 * 1.06,
                        lScaleY: 0.52 * 1.06,
                        duration: 800,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });
                });
            }
        });
    }

    updateLayout(isPortrait) {
        const portCfg = this.story?.portrait_multipliers || {};
        const landCfg = this.story?.landscape_multipliers || {};
        const currentMult = isPortrait ? portCfg : landCfg;
        this.heroYOffset = currentMult?.hero_y_offset !== undefined
            ? currentMult.hero_y_offset
            : (this.story?.hero_y_offset !== undefined ? this.story.hero_y_offset : 26);
        this.heroGroundY = this.groundY + this.heroYOffset;

        const charScaleMul = isPortrait ? (portCfg.character_scale ?? 0.76) : 1.0;
        const spacingMul = isPortrait ? (portCfg.crowd_spacing ?? 0.58) : 1.0;

        // 1. Update character scales & facing
        const allPuppets = Object.values(this.puppets || {});
        allPuppets.forEach((p) => {
            if (!p) return;
            if (p._isCameraApproaching) return;
            const facing = p.facing !== undefined ? p.facing : (p.scaleX < 0 ? -1 : 1);
            const pScale = this._getCharacterScale(p, facing);
            p.setScale(pScale.x, pScale.y);
        });

        // 2. Update character ground baseline & horizontal offsets for current step
        const isRoadBg = !this.currentLocationKey || this.currentLocationKey === 'road_bg';
        if (isRoadBg) {
            const hero = this.puppets?.hero;
            if (hero && this.currentStepId !== 'step_walk_to_jewel') {
                hero.y = this.heroGroundY;
            }

            const crowd = [
                this.puppets?.girl_1,
                this.puppets?.friend1,
                this.puppets?.friend2,
                this.puppets?.friend3,
                this.puppets?.friend4,
                this.puppets?.friend5
            ];

            crowd.forEach((p) => {
                if (!p || p.baseTargetOffsetX === undefined) return;
                p.y = this.groundY + (p.baseYOffset || 0);

                const targetX = Math.round(p.baseTargetOffsetX * spacingMul);
                if (p.entranceTween && p.entranceTween.isPlaying()) {
                    p.entranceTween.updateTo('x', targetX, true);
                } else if (p.isArrived || p.visible) {
                    p.x = targetX;
                }
            });
        }

        // 2b. Recompute Business Center & Golden Toilet positions relative to road_bg on resize
        const roadX = this.story?.locations?.road_bg?.x ?? 0;

        if (this.building && this.building.active) {
            const bcCfg = UI_CONFIG?.business_center || {};
            const bcOffsetX = bcCfg.offsetX !== undefined ? bcCfg.offsetX : 115;
            this.building.x = roadX + bcOffsetX;
            this.building.y = this.groundY + 40;

            if (this.doorContainer && this.doorContainer.active) {
                this._syncBuildingDoors();
            }
        }

        if (this.toiletContainer && this.toiletContainer.active) {
            const gtCfg = UI_CONFIG?.golden_toilet || {};
            const toiletOffsetX = gtCfg.offsetX !== undefined ? gtCfg.offsetX : 175;
            this.toiletContainer.x = roadX + toiletOffsetX;
            if (this._toiletLanded) {
                this.toiletContainer.y = this.groundY + 77;
            }
            if (this.currentStepId === 'step_choose_toilet' && this.puppets?.hero && this._heroSeatedOnToilet) {
                this.puppets.hero.x = this.toiletContainer.x - 25;
                this.puppets.hero.y = this.toiletContainer.y - 105;
            }
        }

        // 3. Update PartyFX ground line
        if (this.partyFX && typeof this.partyFX.setGroundY === 'function') {
            this.partyFX.setGroundY(this.groundY);
        }

        // 4. Update camera world container offset if panned
        if (this.ui.worldContainer) {
            const currentLoc = this.story?.locations?.[this.currentLocationKey || 'road_bg'];
            const locX = currentLoc?.x || 0;
            this.ui.worldContainer.x = 300 - locX * (this.ui.worldContainer.scaleX || 1);
        }

        // 5. Update Finale Buttons
        this._updateFinaleButtonsLayout(isPortrait);
    }

    _updateFinaleButtonsLayout(isPortrait) {
        if (!this.finaleButtons || this.finaleButtons.length === 0) return;
        if (isPortrait) {
            if (this.btnTryAgain) {
                this.btnTryAgain.setCustomPosition(-125, 320);
                this.btnTryAgain.setScale(0.40);
            }
            if (this.btnRestart) {
                this.btnRestart.setCustomPosition(125, 320);
                this.btnRestart.setScale(0.40);
            }
        } else {
            if (this.btnTryAgain) {
                this.btnTryAgain.setCustomPosition(-140, 290);
                this.btnTryAgain.setScale(0.42);
            }
            if (this.btnRestart) {
                this.btnRestart.setCustomPosition(140, 290);
                this.btnRestart.setScale(0.42);
            }
        }
    }

    _onCta() {
        if (window.App && window.App.network) {
            window.App.network.ctaClick();
        }
    }
}