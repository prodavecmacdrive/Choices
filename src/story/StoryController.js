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
        this.groundY = this.story?.ground_y || 355;
        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        const portCfg = this.story?.portrait_multipliers || {};
        const landCfg = this.story?.landscape_multipliers || {};
        const currentMult = isPortrait ? portCfg : landCfg;
        this.heroYOffset = currentMult?.hero_y_offset !== undefined
            ? currentMult.hero_y_offset
            : (this.story?.hero_y_offset !== undefined ? this.story.hero_y_offset : 26);
        this.heroGroundY = this.groundY + this.heroYOffset;
        this.girl2YOffset = 38;
        this.girl2GroundY = this.heroGroundY + this.girl2YOffset;
        this.chosenRing = null;
        this.ringBoxContainer = null;
        this.currentLocationKey = 'jewel_building_bg';
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

        this._isStoppingPartyMusic = false;
        this._partyMusicHandOffTimer = null;

        this.scene?.events?.once('shutdown', () => {
            this.restoreMainBgm(0);
            if (this._partyMusicHandOffTimer) {
                this._partyMusicHandOffTimer.remove();
                this._partyMusicHandOffTimer = null;
            }
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
            this._walkerSounds.forEach(s => {
                try { s?.stop?.(); } catch (e) { }
            });
            this._walkerSounds = [];
        }
    }

    stopAllWalkSounds() {
        this._stopAllWalkSounds();
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
        if (!this._mainBgm) {
            this._startMainBgm();
        }
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
            : 0;

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

    _startPartyMusic() {
        this.duckMainBgm(0, 800);

        if (this._partyMusic) {
            try { this._partyMusic.stop(); } catch (e) { }
            this._partyMusic = null;
        }

        try {
            this._partyMusic = Utils.addAudio(this.scene, 'music_party_loop', 0, true);
            if (this._partyMusic) {
                const target = { volume: 0 };
                this.scene.tweens.add({
                    targets: target,
                    volume: 0.65,
                    duration: 800,
                    ease: 'Linear',
                    onUpdate: () => {
                        if (this._partyMusic) {
                            if (typeof this._partyMusic.setVolume === 'function') {
                                this._partyMusic.setVolume(target.volume);
                            } else {
                                this._partyMusic.volume = target.volume;
                            }
                        }
                    }
                });
            }
        } catch (e) { }
    }

    _stopPartyMusic() {
        if (this._isStoppingPartyMusic) return;
        this._isStoppingPartyMusic = true;

        if (this._partyMusic) {
            const currentVol = (typeof this._partyMusic.volume === 'number') ? this._partyMusic.volume : 0.65;
            const target = { volume: currentVol };
            const pMusic = this._partyMusic;
            this._partyMusic = null;

            this.scene.tweens.add({
                targets: target,
                volume: 0,
                duration: 600,
                ease: 'Linear',
                onUpdate: () => {
                    if (pMusic) {
                        if (typeof pMusic.setVolume === 'function') {
                            pMusic.setVolume(target.volume);
                        } else {
                            pMusic.volume = target.volume;
                        }
                    }
                },
                onComplete: () => {
                    try { pMusic.stop(); } catch (e) { }
                }
            });
        }

        let outroSound = null;
        try {
            outroSound = Utils.addAudio(this.scene, 'music_party_end', 0.6, false);
        } catch (e) { }

        let handedOff = false;
        const handOff = () => {
            if (handedOff) return;
            handedOff = true;
            this._isStoppingPartyMusic = false;
            if (this._partyMusicHandOffTimer) {
                this._partyMusicHandOffTimer.remove();
                this._partyMusicHandOffTimer = null;
            }
            // Only start main BGM loop after party music outro has fully finished
            this.restoreMainBgm(800);
        };

        if (outroSound && typeof outroSound.once === 'function') {
            outroSound.once('complete', handOff);
            outroSound.once('ended', handOff);
            this._partyMusicHandOffTimer = this.scene.time.delayedCall(5300, handOff);
        } else {
            this._partyMusicHandOffTimer = this.scene.time.delayedCall(5300, handOff);
        }
    }

    _stopToiletShake() { }

    fastForwardTransition() {
        if (!this.isTransitioning || !this._activeTransition) return;

        const transition = this._activeTransition;
        this.isTransitioning = false;
        this._activeTransition = null;

        this._stopToiletShake();
        if (this._partyMusicHandOffTimer) {
            this._partyMusicHandOffTimer.remove();
            this._partyMusicHandOffTimer = null;
            this._isStoppingPartyMusic = false;
            this.restoreMainBgm(300);
        }
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
        const landCfg = this.story?.landscape_multipliers || {};
        const charScaleMul = isPortrait ? (portCfg.character_scale ?? 0.88) : (landCfg.character_scale ?? 0.88);

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
            case 'step_lemonade_stand':
                this._runStepLemonadeStand();
                break;
            case 'step_good_business':
                this._runStepGoodBusiness();
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
            case 'step_choose_woman':
                this._runStepChooseWoman();
                break;
            case 'step_choose_ring':
                this._runStepChooseRing();
                break;
            case 'step_fail_end':
                this._runStepFailEnd();
                break;
            case 'step_fail_end_woman':
                this._runStepFailEndWoman();
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
            this.scene.cameras.main.scrollX = 0;
            this.scene.cameras.main.scrollY = 0;
        }
        if (this.scene?.uiCamera) {
            this.scene.uiCamera.zoom = 1.0;
            this.scene.uiCamera.scrollX = 0;
            this.scene.uiCamera.scrollY = 0;
        }
        if (this.finaleButtons && this.finaleButtons.length > 0) {
            this.finaleButtons.forEach(b => {
                if (b && b.destroy) b.destroy();
            });
            this.finaleButtons = [];
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

        this.currentLocationKey = 'jewel_building_bg';

        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        const portCfg = this.story?.portrait_multipliers || {};
        const spacingMul = isPortrait ? (portCfg.crowd_spacing ?? 0.58) : 1.0;
        const charScaleMul = isPortrait ? (portCfg.character_scale ?? 0.88) : 1.0;

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

        const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5];
        friends.forEach(p => {
            if (p) {
                const pScale = this._getCharacterScale(p, 1);
                p.setScale(pScale.x, pScale.y);
            }
        });

        // Hide subsequent characters
        if (girl1) {
            girl1.setVisible(false);
            girl1.setFace('idle');
            girl1.angle = 0;
            girl1.resetPose();
            girl1.animator?.stopAll();
        }
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

        // Off-screen Spawning removed per requirement. Hero is completely alone.

        // Start background music as before
        this._startMainBgm();

        // Immediately go to choice
        this.scene.time.delayedCall(400, () => {
            this.goToStep('step_choose_intro');
        });
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

            if (choice.id === 'choice_lemonade_stand' || choice.next === 'step_lemonade_stand') {
                this.goToStep('step_lemonade_stand');
            } else if (choice.id === 'choice_good_business' || choice.next === 'step_good_business') {
                this.goToStep('step_good_business');
            } else {
                this.goToStep(choice.next || 'step_walk_to_jewel');
            }
        };
    }


    _runStepLemonadeStand() {
        const hero = this.puppets.hero;
        const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5];

        const standX = 160;
        const standY = this.story?.lemonade_stand_y !== undefined ? this.story.lemonade_stand_y : 355;

        if (this.building) this.building.destroy();
        this.building = this.scene.add.image(standX, standY, 'lemonade_stand');
        this.building.setOrigin(0.5, 1.0);
        this.building.setScale(0);
        this.building.setDepth(20);
        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(this.building);
            this.ui.worldContainer.sort('depth');
        }

        // 1. Stand pop up
        this.scene.tweens.add({
            targets: this.building,
            scale: 0.25,
            duration: 800,
            ease: 'Back.easeOut',
            onComplete: () => {
                // 2. Hero moves left of the stand, then goes around behind counter on the left
                if (hero) {
                    const counterY = 215; // Elevated behind counter (standY: 355 - 140 = 215)
                    hero.animator?.playWalk();
                    hero.setDepth(30);
                    if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');
                    hero.scaleX = -Math.abs(hero.scaleX || 1); // Face left
                    this.scene.tweens.add({
                        targets: hero,
                        x: -60, // Clear the left edge of the bench
                        y: this.heroGroundY,
                        duration: 500,
                        ease: 'Linear',
                        onComplete: () => {
                            // Step around the left side to behind the stand
                            this.scene.tweens.add({
                                targets: hero,
                                y: counterY,
                                duration: 250,
                                ease: 'Linear',
                                onComplete: () => {
                                    hero.setDepth(19); // behind counter
                                    if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');
                                    hero.scaleX = Math.abs(hero.scaleX || 1); // Face right towards counter

                                    this.scene.tweens.add({
                                        targets: hero,
                                        x: standX,
                                        duration: 450,
                                        ease: 'Linear',
                                        onComplete: () => {
                                            hero.animator?.stopAll();
                                            hero.scaleX = Math.abs(hero.scaleX || 1); // Face right again

                                            // 3. Shaking stand & rapid arm waving
                                            this.scene.tweens.add({
                                                targets: this.building,
                                                angle: 3,
                                                duration: 80,
                                                yoyo: true,
                                                repeat: 20
                                            });

                                            if (hero.bones?.arm_left) {
                                                this.scene.tweens.add({
                                                    targets: hero.bones.arm_left,
                                                    angle: -100,
                                                    duration: 100,
                                                    yoyo: true,
                                                    repeat: 16
                                                });
                                            }
                                            if (hero.bones?.arm_right) {
                                                this.scene.tweens.add({
                                                    targets: hero.bones.arm_right,
                                                    angle: -100,
                                                    duration: 120,
                                                    yoyo: true,
                                                    repeat: 14
                                                });
                                            }

                                            // 4. Coin farming sequence
                                            const revenue = this.story?.steps?.step_lemonade_stand?.revenue ?? 750000;
                                            if (this.ui.balance) {
                                                this.scene.time.delayedCall(500, () => {
                                                    this.ui.balance.spawnCoinFlyIn(300 + standX, 445, revenue, 10);
                                                });
                                            }

                                            // 5. Crowd runs in - distribute widely along X up to screen edge, spread Y, and sort Z-index
                                            const worldScale = this.ui.worldContainer?.scaleX || 1;
                                            const containerX = this.ui.worldContainer?.x ?? 300;
                                            const screenLeftLocal = (0 - containerX) / worldScale;
                                            const minX = Math.round(screenLeftLocal + 35); // right at the edge of the screen
                                            const maxX = 30; // before the lemonade stand
                                            const crowdCenterX = Math.round((minX + maxX) / 2);

                                            let arrivedCount = 0;
                                            const activeCrowd = friends.filter(c => !!c);
                                            const count = activeCrowd.length;

                                            this._startPartyMusic();
                                            this.partyFX = new PartyFXController(this.scene, this.ui.worldContainer, PARTY_FX_CONFIG, this.groundY);
                                            this.partyFX.start();

                                            const danceStyles = ['sharp_jumps', 'wave_arms', 'throw_arms', 'step_raise', 'spins'];
                                            const yLevels = [-26, -13, 0, 13, 26];
                                            yLevels.sort(() => Math.random() - 0.5);

                                            const placements = activeCrowd.map((p, idx) => {
                                                const stepX = count > 1 ? (maxX - minX) / (count - 1) : 0;
                                                const jitterX = (Math.random() - 0.5) * 20;
                                                const targetX = Math.round(minX + idx * stepX + jitterX);
                                                const yOffset = (yLevels[idx] !== undefined ? yLevels[idx] : 0) + (Math.random() - 0.5) * 6;
                                                const targetY = Math.round(this.groundY + yOffset);
                                                return {
                                                    puppet: p,
                                                    targetX,
                                                    targetY
                                                };
                                            });

                                            // Lower along Y (larger targetY) = higher Z-index (higher depth)
                                            placements.slice().sort((a, b) => a.targetY - b.targetY).forEach((item, rank) => {
                                                item.puppet.setDepth(22 + rank);
                                            });
                                            if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                                                this.ui.worldContainer.sort('depth');
                                            }

                                            placements.forEach((item, idx) => {
                                                const p = item.puppet;
                                                p.setVisible(true);
                                                const pScale = this._getCharacterScale(p, 1);
                                                p.setScale(pScale.x, pScale.y);
                                                p.animator?.playWalk();
                                                const fromX = -450 - (idx * 80);
                                                p.setPosition(fromX, item.targetY);

                                                this.scene.tweens.add({
                                                    targets: p,
                                                    x: item.targetX,
                                                    duration: 1200 + idx * 100,
                                                    ease: 'Power1.easeOut',
                                                    onComplete: () => {
                                                        const style = danceStyles[idx % danceStyles.length];
                                                        p.animator?.playDance({ style });
                                                        arrivedCount++;
                                                        if (arrivedCount === activeCrowd.length) {
                                                            // Friends are dancing, Hero exits to join the crowd
                                                            this.scene.time.delayedCall(1500, () => {
                                                                // Exit sequence: walk left of stand, weave down Y and across X with increasing Z-index into center of crowd
                                                                const counterY = 215;
                                                                hero.animator?.playWalk();
                                                                hero.scaleX = -Math.abs(hero.scaleX || 1);

                                                                // 1. Move to the left of the lemonade stand behind counter (clearing the bench edge)
                                                                this.scene.tweens.add({
                                                                    targets: hero,
                                                                    x: -60,
                                                                    y: counterY,
                                                                    duration: 450,
                                                                    ease: 'Linear',
                                                                    onComplete: () => {
                                                                        // Pass 1: to the right & down Y
                                                                        hero.scaleX = Math.abs(hero.scaleX || 1);
                                                                        hero.setDepth(23);
                                                                        if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');

                                                                        this.scene.tweens.add({
                                                                            targets: hero,
                                                                            x: 0,
                                                                            y: this.groundY,
                                                                            duration: 320,
                                                                            ease: 'Linear',
                                                                            onComplete: () => {
                                                                                // Pass 2: to the left & down Y
                                                                                hero.scaleX = -Math.abs(hero.scaleX || 1);
                                                                                hero.setDepth(25);
                                                                                if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');

                                                                                this.scene.tweens.add({
                                                                                    targets: hero,
                                                                                    x: -80,
                                                                                    y: this.groundY + 15,
                                                                                    duration: 380,
                                                                                    ease: 'Linear',
                                                                                    onComplete: () => {
                                                                                        // Pass 3: to the right & down Y
                                                                                        hero.scaleX = Math.abs(hero.scaleX || 1);
                                                                                        hero.setDepth(27);
                                                                                        if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');

                                                                                        this.scene.tweens.add({
                                                                                            targets: hero,
                                                                                            x: -40,
                                                                                            y: this.groundY + 28,
                                                                                            duration: 300,
                                                                                            ease: 'Linear',
                                                                                            onComplete: () => {
                                                                                                // Pass 4: to the left into crowd center in foreground
                                                                                                hero.scaleX = -Math.abs(hero.scaleX || 1);
                                                                                                hero.setDepth(30);
                                                                                                if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');

                                                                                                this.scene.tweens.add({
                                                                                                    targets: hero,
                                                                                                    x: crowdCenterX,
                                                                                                    y: this.groundY + 38,
                                                                                                    duration: 480,
                                                                                                    ease: 'Power1.easeOut',
                                                                                                    onComplete: () => {
                                                                                                        hero.scaleX = Math.abs(hero.scaleX || 1);
                                                                                                        hero.animator?.playIdle();
                                                                                                        hero.setFace('happy');

                                                                                                        // Sequence Man 1 (realtor) entrance from the right before displaying House choice
                                                                                                        const man1 = this.puppets.man_1;
                                                                                                        if (man1) {
                                                                                                            const worldScale = this.ui.worldContainer?.scaleX || 1;
                                                                                                            const containerX = this.ui.worldContainer?.x ?? 300;
                                                                                                            const screenRightLocal = (this.scene.scale.width - containerX) / worldScale;
                                                                                                            const fromX = Math.max(Math.round(screenRightLocal + 120), 460);
                                                                                                            const manTargetX = 240;

                                                                                                            man1.setPosition(fromX, this.groundY);
                                                                                                            const manScale = this._getCharacterScale(man1, -1);
                                                                                                            man1.setScale(manScale.x, manScale.y);
                                                                                                            man1.setVisible(true);
                                                                                                            man1.resetPose();
                                                                                                            man1.setDepth(24);
                                                                                                            if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                                                                                                                this.ui.worldContainer.sort('depth');
                                                                                                            }
                                                                                                            man1.animator?.playWalk({ speed: 0.55 });

                                                                                                            this.scene.tweens.add({
                                                                                                                targets: man1,
                                                                                                                x: manTargetX,
                                                                                                                duration: 2000,
                                                                                                                ease: 'Power1.easeOut',
                                                                                                                onComplete: () => {
                                                                                                                    man1.animator?.playIdle();
                                                                                                                    try {
                                                                                                                        Utils.addAudio(this.scene, 'voice_man_mumble', 1.0);
                                                                                                                    } catch (e) { }

                                                                                                                    // Display House choice cards ONLY after Man 1 reaches final idle position
                                                                                                                    this.scene.time.delayedCall(400, () => {
                                                                                                                        this.goToStep('step_choose_house');
                                                                                                                    });
                                                                                                                }
                                                                                                            });
                                                                                                        } else {
                                                                                                            this.scene.time.delayedCall(400, () => {
                                                                                                                this.goToStep('step_choose_house');
                                                                                                            });
                                                                                                        }
                                                                                                    }
                                                                                                });
                                                                                            }
                                                                                        });
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            });
                                                        }
                                                    }
                                                });
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
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


    _playSmokeTransformation(hero, onCovered, onComplete) {
        if (!hero) {
            if (typeof onCovered === 'function') onCovered();
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        const scene = this.scene;

        // Ensure soft radial smoke texture exists
        const texKey = 'suit_smoke_puff';
        if (!scene.textures.exists(texKey)) {
            const size = 128;
            const canvas = scene.textures.createCanvas(texKey, size, size);
            if (canvas) {
                const ctx = canvas.context;
                const center = size / 2;
                const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
                grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
                grad.addColorStop(0.35, 'rgba(240, 245, 255, 0.95)');
                grad.addColorStop(0.70, 'rgba(220, 235, 255, 0.5)');
                grad.addColorStop(1.0, 'rgba(200, 220, 250, 0.0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(center, center, center, 0, Math.PI * 2);
                ctx.fill();
                canvas.refresh();
            }
        }

        const smokeContainer = scene.add.container(hero.x, hero.y);
        smokeContainer.setDepth((hero.depth || 30) + 15);
        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(smokeContainer);
            if (typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
        }

        const puffCount = 26;
        const puffs = [];

        for (let i = 0; i < puffCount; i++) {
            const startX = (Math.random() - 0.5) * 70;
            const startY = -150 - Math.random() * 80; // falling from above the hero
            const targetX = (Math.random() - 0.5) * 85;
            const targetY = -60 + Math.random() * 95; // covering head, torso, legs

            const puff = scene.add.image(startX, startY, texKey);
            const targetScale = 1.35 + Math.random() * 0.55; // 170px to 240px wide puff size
            puff.setScale(0.5);
            puff.setAlpha(0);
            puff.setTint(Math.random() > 0.4 ? 0xffffff : 0xecf3fc);
            smokeContainer.add(puff);
            puffs.push({ puff, targetX, targetY, targetScale });
        }

        // 1. Fall down from above and envelope the entire Hero completely
        puffs.forEach((p) => {
            const delay = Math.random() * 80;
            scene.tweens.add({
                targets: p.puff,
                x: p.targetX,
                y: p.targetY,
                scaleX: p.targetScale,
                scaleY: p.targetScale,
                alpha: 0.96,
                duration: 400 + Math.random() * 80,
                delay: delay,
                ease: 'Quad.easeIn'
            });
        });

        // 2. Skin swap while completely enveloped in smoke
        scene.time.delayedCall(480, () => {
            if (typeof onCovered === 'function') {
                onCovered();
            }

            // 3. Smooth dissipation once new outfit is applied
            puffs.forEach(p => {
                scene.tweens.add({
                    targets: p.puff,
                    y: p.targetY - 35 - Math.random() * 40,
                    x: p.targetX + (Math.random() - 0.5) * 50,
                    scaleX: p.targetScale * 1.25,
                    scaleY: p.targetScale * 1.25,
                    alpha: 0,
                    duration: 520 + Math.random() * 120,
                    ease: 'Power2.easeOut'
                });
            });

            scene.time.delayedCall(620, () => {
                smokeContainer.destroy();
                if (typeof onComplete === 'function') {
                    onComplete();
                }
            });
        });
    }

    _runStepGoodBusiness() {
        const hero = this.puppets.hero;
        const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5];

        // 1. Hero stays in-place at current position during transformation
        if (hero) {
            hero.animator?.playIdle();
            hero.setFace('idle');
        }

        // 2. Start Party Music and Party FX (spotlight rays, darkening overlay)
        this._startPartyMusic();
        this.partyFX = new PartyFXController(this.scene, this.ui.worldContainer, PARTY_FX_CONFIG, this.groundY);
        this.partyFX.start();

        // 3. Crowd runs in from the left and begins disco dancing
        const worldScale = this.ui.worldContainer?.scaleX || 1;
        const containerX = this.ui.worldContainer?.x ?? 300;
        const screenLeftLocal = (0 - containerX) / worldScale;
        const minX = Math.round(screenLeftLocal + 35);
        const maxX = 30;
        const crowdCenterX = Math.round((minX + maxX) / 2);

        let arrivedCount = 0;
        const activeCrowd = friends.filter(c => !!c);
        const count = activeCrowd.length;

        const danceStyles = ['sharp_jumps', 'wave_arms', 'throw_arms', 'step_raise', 'spins'];
        const yLevels = [-26, -13, 0, 13, 26];
        yLevels.sort(() => Math.random() - 0.5);

        const placements = activeCrowd.map((p, idx) => {
            const stepX = count > 1 ? (maxX - minX) / (count - 1) : 0;
            const jitterX = (Math.random() - 0.5) * 20;
            const targetX = Math.round(minX + idx * stepX + jitterX);
            const yOffset = (yLevels[idx] !== undefined ? yLevels[idx] : 0) + (Math.random() - 0.5) * 6;
            const targetY = Math.round(this.groundY + yOffset);
            return {
                puppet: p,
                targetX,
                targetY
            };
        });

        // Lower along Y (larger targetY) = higher Z-index
        placements.slice().sort((a, b) => a.targetY - b.targetY).forEach((item, rank) => {
            item.puppet.setDepth(22 + rank);
        });
        if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
            this.ui.worldContainer.sort('depth');
        }

        placements.forEach((item, idx) => {
            const p = item.puppet;
            p.setVisible(true);
            const pScale = this._getCharacterScale(p, 1);
            p.setScale(pScale.x, pScale.y);
            p.animator?.playWalk();
            const fromX = -450 - (idx * 80);
            p.setPosition(fromX, item.targetY);

            this.scene.tweens.add({
                targets: p,
                x: item.targetX,
                duration: 1200 + idx * 100,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    const style = danceStyles[idx % danceStyles.length];
                    p.animator?.playDance({ style });
                    arrivedCount++;
                }
            });
        });

        // 4. In-place Smoke Transformation for Hero
        this._playSmokeTransformation(
            hero,
            // onCovered: Swap skins while completely covered by the smoke cloud
            () => {
                if (hero) {
                    hero.setAttachment('head', 'hero_head_prestige');
                    hero.setAttachment('hair', 'hero_hair_prestige');
                    hero.setAttachment('body', 'hero_body_prestige');
                    hero.setAttachment('arm_left', 'hero_arm_l_prestige');
                    hero.setAttachment('arm_right', 'hero_arm_r_prestige');
                    hero.setAttachment('leg_left', 'hero_leg_l_prestige');
                    hero.setAttachment('leg_right', 'hero_leg_r_prestige');
                    hero.setAttachment('foot_left', 'hero_foot_prestige_l');
                    hero.setAttachment('foot_right', 'hero_foot_prestige_r');
                    hero.setFace('happy');
                }
                try {
                    Utils.addAudio(this.scene, 'magic_sparkle', 1.0);
                } catch (e) { }
            },
            // onComplete: Smoke has smoothly dissipated
            () => {
                // 5. Join the crowd: tween Hero leftward into the group of friends
                if (hero) {
                    hero.scaleX = -Math.abs(hero.scaleX || 1); // Face left while walking
                    hero.animator?.playWalk();
                    hero.setDepth(30);
                    if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                        this.ui.worldContainer.sort('depth');
                    }

                    this.scene.tweens.add({
                        targets: hero,
                        x: crowdCenterX,
                        y: this.groundY + 38,
                        duration: 650,
                        ease: 'Power1.easeInOut',
                        onComplete: () => {
                            // After reaching position within group, Hero faces right (toward upcoming visitor)
                            hero.scaleX = Math.abs(hero.scaleX || 1);
                            hero.animator?.playIdle();
                            hero.setFace('happy');

                            // 6. Sequence Man 1 (realtor) entrance from the right edge
                            const man1 = this.puppets.man_1;
                            if (man1) {
                                const screenRightLocal = (this.scene.scale.width - containerX) / worldScale;
                                const fromX = Math.max(Math.round(screenRightLocal + 120), 460);
                                const manTargetX = 220;

                                man1.setPosition(fromX, this.groundY);
                                const manScale = this._getCharacterScale(man1, -1);
                                man1.setScale(manScale.x, manScale.y);
                                man1.setVisible(true);
                                man1.resetPose();
                                man1.setDepth(24);
                                if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                                    this.ui.worldContainer.sort('depth');
                                }
                                man1.animator?.playWalk({ speed: 0.55 });

                                this.scene.tweens.add({
                                    targets: man1,
                                    x: manTargetX,
                                    duration: 2000,
                                    ease: 'Power1.easeOut',
                                    onComplete: () => {
                                        man1.animator?.playIdle();
                                        try {
                                            Utils.addAudio(this.scene, 'voice_man_mumble', 1.0);
                                        } catch (e) { }

                                        // Display House choice cards ONLY after Man 1 reaches destination
                                        this.scene.time.delayedCall(400, () => {
                                            this.goToStep('step_choose_house');
                                        });
                                    }
                                });
                            } else {
                                this.scene.time.delayedCall(400, () => {
                                    this.goToStep('step_choose_house');
                                });
                            }
                        }
                    });
                } else {
                    this.scene.time.delayedCall(400, () => {
                        this.goToStep('step_choose_house');
                    });
                }
            }
        );
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

            // Fade out party visual effects and stop party music smoothly when camera pan begins
            if (this.partyFX) {
                this.partyFX.finishParty();
            }
            this._stopPartyMusic();

            // Set house background according to selection
            if (typeof this.ui.setHouseBackground === 'function') {
                this.ui.setHouseBackground(choice.id);
            }

            const hero = this.puppets.hero;
            const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5].filter(c => !!c);
            const startX = this.story?.locations?.jewel_building_bg?.x ?? 0;
            const targetHouseX = this.story?.locations?.luxury_house_bg?.x ?? (this.story?.locations?.jewel_building_bg?.displayWidth || 1544);
            const halfCharWidth = 90;
            const houseHeroTargetX = targetHouseX - halfCharWidth;

            const distance = Math.abs(targetHouseX - startX);
            const walkSpeed = this.story?.walk_speed || 500;
            const cameraDuration = Math.round((distance / walkSpeed) * 1000);

            if (hero) {
                hero.setFace('happy');
            }

            this.isTransitioning = true;
            const targetLocKey = (this.chosenHouse === 'choice_simple') ? 'simple_house_bg' : 'luxury_house_bg';

            const snapWalkToHouse = () => {
                this.currentLocationKey = targetLocKey;
                if (this.partyFX) {
                    this.partyFX.destroy();
                    this.partyFX = null;
                }
                this._stopPartyMusic();
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
                    hero.setPosition(houseHeroTargetX, this.heroGroundY);
                    hero.animator?.playIdle();
                    hero.setFace('amazed');
                    const heroScale = this._getCharacterScale(hero, 1);
                    hero.setScale(heroScale.x, heroScale.y);
                }
                friends.forEach((p, idx) => {
                    p.setVisible(true);
                    p.resetPose();
                    p.setPosition(houseHeroTargetX - 120 - (idx * 60), this.groundY);
                    p.animator?.playIdle();
                });
                this._runStepHouseArrival({ targetHouseX });
            };

            this._activeTransition = {
                type: 'walk_to_house',
                tweens: [],
                delayedCalls: [],
                snap: snapWalkToHouse
            };

            this._runWalkToHouse({
                hero,
                friends,
                startX,
                targetHouseX,
                houseHeroTargetX,
                cameraDuration
            });
        };
    }

    _runWalkToHouse(params) {
        const {
            hero,
            friends = [],
            startX = (this.story?.locations?.jewel_building_bg?.x ?? 0),
            targetHouseX = (this.story?.locations?.luxury_house_bg?.x ?? 1544),
            houseHeroTargetX = (targetHouseX - 90),
            cameraDuration = 2500
        } = params || {};

        this.currentLocationKey = (this.chosenHouse === 'choice_simple') ? 'simple_house_bg' : 'luxury_house_bg';
        this.isTransitioning = true;

        if (this.partyFX) {
            this.partyFX.finishParty();
        }

        const worldScale = this.ui.worldContainer?.scaleX || 1;
        const startCamX = 300 - startX * worldScale;
        const endCamX = 300 - targetHouseX * worldScale;

        const liveHeroX = hero ? hero.x : (startX - 90);

        // 1. Hero starts walking forward towards the house
        if (hero) {
            hero.animator?.playWalk();
            const heroTween = this.scene.tweens.add({
                targets: hero,
                x: houseHeroTargetX,
                duration: cameraDuration,
                ease: 'Power1.easeInOut',
                onComplete: () => {
                    hero.animator?.playIdle();
                }
            });
            if (this._activeTransition) {
                this._activeTransition.tweens.push(heroTween);
            }
        }

        // 2. Friends: NO TELEPORTING - start strictly from their current resting positions where they finished dancing
        // with sequential per-character stagger (50-150ms delay) so they do not snap or move in rigid synchrony
        friends.forEach((p, idx) => {
            const startFriendX = p.x;
            const targetFriendX = houseHeroTargetX - 120 - (idx * 60);
            const staggerDelay = 60 + (idx * 90); // 60ms, 150ms, 240ms, 330ms, 420ms
            const friendDuration = Math.max(1200, cameraDuration - staggerDelay);

            const friendTween = this.scene.tweens.add({
                targets: p,
                x: targetFriendX,
                delay: staggerDelay,
                duration: friendDuration,
                ease: 'Power1.easeInOut',
                onStart: () => {
                    const pScale = this._getCharacterScale(p, 1);
                    p.setScale(pScale.x, pScale.y);
                    p.animator?.playWalk({ speed: 0.52 + (idx % 3) * 0.05 });
                },
                onComplete: () => {
                    p.animator?.playIdle();
                }
            });

            if (this._activeTransition) {
                this._activeTransition.tweens.push(friendTween);
            }
        });

        // 3. Camera pan
        if (this.ui.worldContainer) {
            const camTween = this.scene.tweens.add({
                targets: this.ui.worldContainer,
                x: endCamX,
                duration: cameraDuration,
                ease: 'Power1.easeInOut',
                onComplete: () => {
                    this.isTransitioning = false;
                    this._activeTransition = null;
                    if (hero) hero.animator?.playIdle();
                    friends.forEach(p => p.animator?.playIdle());
                    this._runStepHouseArrival({ targetHouseX });
                }
            });
            if (this._activeTransition) {
                this._activeTransition.tweens.push(camTween);
            }
        } else {
            this.isTransitioning = false;
            this._activeTransition = null;
            this._runStepHouseArrival({ targetHouseX });
        }
    }

    _runStepHouseArrival(params = {}) {
        const houseCenter = params.targetHouseX || this.story?.locations?.luxury_house_bg?.x || 1544;
        const halfCharWidth = 90;
        const hero = this.puppets.hero;
        const girl2 = this.puppets.girl_2;

        if (hero) {
            hero.setFace('amazed');
        }
        if (this.puppets.man_1) {
            this.puppets.man_1.setVisible(false);
        }

        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        const fullCharWidth = halfCharWidth * 2; // ~180px body width
        // Stop further to the right by approximately one full body width compared to current resting position
        const girl2Spacing = (isPortrait ? 65 : 75) + fullCharWidth;
        const girl2TargetX = houseCenter + girl2Spacing;

        let heroFinished = false;
        let girl2Finished = false;

        const checkDone = () => {
            if (heroFinished && girl2Finished) {
                this.scene.time.delayedCall(350, () => {
                    this.goToStep('step_choose_woman');
                });
            }
        };

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

        if (girl2) {
            girl2.setDepth(28); // Rendered behind Hero (depth 30)
            girl2.setPosition(houseCenter + 800, this.girl2GroundY);
            girl2.y = this.girl2GroundY;
            const girl2Scale = this._getCharacterScale(girl2, -1);
            girl2.setScale(girl2Scale.x, girl2Scale.y);
            girl2.setVisible(true);
            girl2.animator?.playWalk({ speed: 0.5 });
            try {
                Utils.addAudio(this.scene, 'voice_hero_gasp_aah', 1.0);
            } catch (e) { }

            // Friends remain strictly in their current positions on screen (idle animation / subtle ambient breathing/sway) without retreating
            const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5].filter(c => !!c);
            friends.forEach(p => {
                const pScale = this._getCharacterScale(p, 1);
                p.setScale(pScale.x, pScale.y); // Face right toward Hero and girl_2
                p.animator?.playIdle();
            });

            this.scene.tweens.add({
                targets: girl2,
                x: girl2TargetX,
                y: this.girl2GroundY,
                duration: 1800,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    girl2.y = this.girl2GroundY;
                    girl2.setDepth(28);
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

    _runStepChooseWoman() {
        const step = this.story?.steps?.step_choose_woman;
        if (!step || !step.choices) return;

        // Friends remain strictly in place (no parting or retreat)

        const introChoiceY = UI_CONFIG?.choice_group?.positions_y?.multiple ?? 205;
        this.ui.choices?.showChoices(step.choices, { y: introChoiceY, balanceView: this.ui?.balance });

        this.ui.choices.onChoice = (choice) => {
            if (this.ui.balance && choice.price && this.ui.balance.getValue() < choice.price) {
                return;
            }
            if (this.ui.balance && choice.price) {
                this.ui.balance.subtract(choice.price);
            }
            if (choice.id === 'choice_girl_1') {
                this.goToStep('step_fail_end_woman');
            } else {
                // Girl 2 steps up
                const girl2 = this.puppets.girl_2;
                const hero = this.puppets.hero;
                if (girl2 && hero) {
                    girl2.setDepth(28); // Behind Hero (depth 30)
                    girl2.animator?.playWalk();
                    // Subtle step forward toward Hero, maintaining ~half character body width of breathing room
                    const stepDistance = 65;
                    const targetX = Math.max(hero.x + 220, girl2.x - stepDistance);
                    this.scene.tweens.add({
                        targets: girl2,
                        x: targetX,
                        y: this.girl2GroundY,
                        duration: 800,
                        onComplete: () => {
                            girl2.y = this.girl2GroundY;
                            girl2.setDepth(28);
                            girl2.animator?.stopAll();
                            girl2.setFace('idle');
                            this.goToStep('step_choose_ring');
                        }
                    });
                } else {
                    this.goToStep('step_choose_ring');
                }
            }
        };
    }

    _runStepFailEndWoman() {
        const hero = this.puppets.hero;
        const girl1 = this.puppets.girl_1;
        const girl2 = this.puppets.girl_2;
        const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5].filter(c => !!c && c.visible !== false);

        // Find nearest friend to girl2 (friends are located to the left of Hero)
        let nearestFriend = null;
        if (girl2 && friends.length > 0) {
            let minDistance = Infinity;
            friends.forEach(f => {
                const dist = Math.abs(f.x - girl2.x);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestFriend = f;
                }
            });
        }
        if (!nearestFriend && friends.length > 0) {
            nearestFriend = friends[friends.length - 1];
        }

        // --- Step 1: Girl 2 Spurns & Kisses a Friend ---
        const onKissComplete = () => {
            // --- Step 2: Girl 1 Entrance from the Right ---
            this.scene.time.delayedCall(400, () => {
                bringGirl1In();
            });
        };

        if (girl2 && nearestFriend) {
            const targetKissX = nearestFriend.x + 60;
            const girl2Scale = this._getCharacterScale(girl2, -1); // Face left toward friend
            girl2.setScale(girl2Scale.x, girl2Scale.y);
            girl2.animator?.playWalk({ speed: 0.65 });

            this.scene.tweens.add({
                targets: girl2,
                x: targetKissX,
                y: this.girl2GroundY,
                duration: 950,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    girl2.y = this.girl2GroundY;
                    girl2.animator?.stopAll();
                    girl2.setAttachment('face', 'girl2_face_kiss');
                    try {
                        Utils.addAudio(this.scene, 'kiss_smack', 1.0);
                    } catch (e) { }

                    // Kiss animation head tilt
                    if (girl2.bones?.head) {
                        this.scene.tweens.add({
                            targets: girl2.bones.head,
                            angle: -14,
                            duration: 250,
                            yoyo: true,
                            repeat: 1
                        });
                    }
                    if (nearestFriend.bones?.head) {
                        nearestFriend.animator?.stopAll();
                        this.scene.tweens.add({
                            targets: nearestFriend.bones.head,
                            angle: 14,
                            duration: 250,
                            yoyo: true,
                            repeat: 1
                        });
                    }

                    onKissComplete();
                }
            });
        } else {
            onKissComplete();
        }

        // --- Step 2: Girl 1 Entrance from the Right ---
        const bringGirl1In = () => {
            if (!girl1) {
                startMockeryAndExit();
                return;
            }

            const worldScale = this.ui.worldContainer?.scaleX || 1;
            const containerX = this.ui.worldContainer?.x ?? 0;
            const screenRightLocal = (this.scene.scale.width - containerX) / worldScale;
            const fromX = Math.max(Math.round(screenRightLocal + 140), (hero ? hero.x : 1500) + 550);
            const girl1RestingX = hero ? hero.x + 130 : 1600;
            const girl1Y = this.groundY + (girl1.baseYOffset || 0);

            girl1.setPosition(fromX, girl1Y);
            const girl1Scale = this._getCharacterScale(girl1, -1); // Face left toward Hero
            girl1.setScale(girl1Scale.x, girl1Scale.y);
            girl1.setVisible(true);
            girl1.setDepth(29);
            if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
            girl1.animator?.playWalk({ speed: 0.6 });

            this.scene.tweens.add({
                targets: girl1,
                x: girl1RestingX,
                duration: 1250,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    girl1.animator?.stopAll();
                    girl1.animator?.playIdle();
                    girl1.setFace('idle');

                    // --- Step 3: Crowd Reaction & Mockery ---
                    this.scene.time.delayedCall(300, () => {
                        startMockeryAndExit();
                    });
                }
            });
        };

        // --- Step 3: Crowd Reaction & Mockery, Step 4: Hero Cry & Exit, Step 5: Finale Window ---
        const startMockeryAndExit = () => {
            try {
                Utils.addAudio(this.scene, 'crowd_laugh', 1.0);
            } catch (e) { }

            // All characters mock and point at Hero
            const mockCrowd = [...friends, girl2, girl1].filter(c => !!c);
            mockCrowd.forEach(p => {
                p.setFace('happy');
                if (hero && p.x < hero.x) {
                    // Left of Hero: face right and point arm at Hero
                    const s = this._getCharacterScale(p, 1);
                    p.setScale(s.x, s.y);
                    if (p.bones?.arm_right) {
                        this.scene.tweens.add({
                            targets: p.bones.arm_right,
                            angle: -65,
                            duration: 220,
                            yoyo: true,
                            repeat: 3,
                            ease: 'Sine.easeInOut'
                        });
                    }
                } else if (hero && p.x >= hero.x) {
                    // Right of Hero: face left and point arm at Hero
                    const s = this._getCharacterScale(p, -1);
                    p.setScale(s.x, s.y);
                    if (p.bones?.arm_left) {
                        this.scene.tweens.add({
                            targets: p.bones.arm_left,
                            angle: 65,
                            duration: 220,
                            yoyo: true,
                            repeat: 3,
                            ease: 'Sine.easeInOut'
                        });
                    }
                }
            });

            // --- Step 4: Hero Cry & Exit of All Characters ---
            this.scene.time.delayedCall(400, () => {
                this._stopAllWalkSounds();
                if (hero) {
                    hero.setFace('crying');
                    hero.setAttachment('face', 'hero_face_crying');
                    hero.animator?.playCry();
                    if (hero.bones?.arm_left) {
                        this.scene.tweens.add({ targets: hero.bones.arm_left, angle: 160, duration: 400, ease: 'Power1.easeOut' });
                    }
                    if (hero.bones?.arm_right) {
                        this.scene.tweens.add({ targets: hero.bones.arm_right, angle: -160, duration: 400, ease: 'Power1.easeOut' });
                    }
                }
            });

            // Characters turn around and walk off-screen, leaving Hero completely alone
            this.scene.time.delayedCall(1200, () => {
                // Left group (friends & girl_2) turn left and walk off to the left
                const leftGroup = [...friends, girl2].filter(c => !!c);
                leftGroup.forEach((p, idx) => {
                    const s = this._getCharacterScale(p, -1); // Turn left to walk away
                    p.setScale(s.x, s.y);
                    p.animator?.playWalk({ speed: 0.7 });
                    this.scene.tweens.add({
                        targets: p,
                        x: p.x - 900,
                        duration: 1800,
                        delay: idx * 60,
                        ease: 'Power1.easeIn',
                        onComplete: () => {
                            p.setVisible(false);
                            p.animator?.stopAll();
                            this._stopAllWalkSounds();
                        }
                    });
                });

                // Girl 1 (on the right) turns right and walks off to the right
                if (girl1) {
                    const s = this._getCharacterScale(girl1, 1); // Turn right to walk away
                    girl1.setScale(s.x, s.y);
                    girl1.animator?.playWalk({ speed: 0.7 });
                    this.scene.tweens.add({
                        targets: girl1,
                        x: girl1.x + 900,
                        duration: 1800,
                        ease: 'Power1.easeIn',
                        onComplete: () => {
                            girl1.setVisible(false);
                            girl1.animator?.stopAll();
                            this._stopAllWalkSounds();
                        }
                    });
                }

                // --- Step 5: Finale Window (Camera zooms in on crying Hero who stays in place) ---
                this.scene.time.delayedCall(1100, () => {
                    this._stopAllWalkSounds();
                    this._zoomInOnHero(() => {
                        if (this.ui.finalWindow) {
                            this.ui.finalWindow.show();
                        }
                        this._createFinaleButtons();
                    });
                });
            });
        };
    }

    _runStepChooseRing() {
        const step = this.story?.steps?.step_choose_ring;
        if (!step || !step.choices) return;

        const introChoiceY = UI_CONFIG?.choice_group?.positions_y?.multiple ?? 205;
        this.ui.choices?.showChoices(step.choices, { y: introChoiceY, balanceView: this.ui?.balance });

        this.ui.choices.onChoice = (choice) => {
            if (this.ui.balance && choice.price && this.ui.balance.getValue() < choice.price) {
                // Handled internally by choice group (red flash, error)
                return;
            }

            if (this.ui.balance && choice.price) {
                this.ui.balance.subtract(choice.price);
            }

            this.chosenRing = choice.id;

            if (choice.id === 'choice_bad_ring') {
                this.goToStep('step_fail_end');
            } else {
                this.goToStep('step_fail_end');
            }
        };
    }

    _runStepFailEnd() {
        const hero = this.puppets.hero;
        const girl2 = this.puppets.girl_2;
        const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5];

        // 1. Play box opening animation using unified ring box container
        const halfCharWidth = 90;
        // Shift spawn position of ring box container to the right by approximately half of Hero's body width
        const boxX = hero.x + halfCharWidth + 45;
        const boxY = this.heroGroundY - 45;

        // Horizontally mirror ring box container (scaleX = -0.55) so it faces correctly toward Hero
        const boxContainer = this.scene.add.container(boxX, boxY);
        boxContainer.setScale(-0.55, 0.55);
        boxContainer.setDepth(40);

        const boxBottomTexture = (this.chosenRing === 'choice_luxury_ring') ? 'ring_luxury_box_bottom' : 'ring_bad_box_bottom';
        const boxTopTexture = (this.chosenRing === 'choice_luxury_ring') ? 'ring_luxury_box_top' : 'ring_bad_box_top';

        const boxBottom = this.scene.add.image(0, 0, boxBottomTexture);
        // Shifted downward by ~one lid height (~51px, from -45 to 6) so bottom edge sits flush on box base rim
        const boxTop = this.scene.add.image(72, 6, boxTopTexture);
        // Anchor/origin strictly set to bottom-right corner (originX = 1, originY = 1)
        boxTop.setOrigin(1, 1);

        boxContainer.add(boxBottom);
        boxContainer.add(boxTop);
        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(boxContainer);
        }
        this.ringBoxContainer = boxContainer;

        // Opening animation pivots cleanly upward and backward from bottom-right anchor relative to base sprite
        this.scene.tweens.add({
            targets: boxTop,
            angle: 100,
            duration: 450,
            ease: 'Power2.easeOut'
        });

        // girl_2 disgusted
        if (girl2) {
            girl2.setFace('idle');
            girl2.setDepth(28); // Behind Hero (depth 30)
        }

        try { Utils.addAudio(this.scene, 'crowd_laugh', 1.0); } catch (e) { }

        // girl_2 walks to nearest friend (let's say friend1) and plays kiss
        const nearestFriend = friends.find(f => !!f);
        if (girl2 && nearestFriend) {
            girl2.animator?.playWalk();
            this.scene.tweens.add({
                targets: girl2,
                x: nearestFriend.x + 60,
                y: this.girl2GroundY,
                duration: 1000,
                onComplete: () => {
                    girl2.y = this.girl2GroundY;
                    girl2.animator?.stopAll();
                    girl2.setAttachment('face', 'girl2_face_kiss');
                    try { Utils.addAudio(this.scene, 'kiss_smack', 1.0); } catch (e) { }

                    this.scene.time.delayedCall(800, () => {
                        // turn around and walk off
                        const allCrowd = [girl2, ...friends].filter(c => !!c);
                        allCrowd.forEach(p => {
                            const scale = this._getCharacterScale(p, 1);
                            p.setScale(scale.x, scale.y);
                            p.animator?.playWalk();
                            this.scene.tweens.add({
                                targets: p,
                                x: p.x + 800,
                                duration: 2000,
                                onComplete: () => {
                                    p.setVisible(false);
                                    p.animator?.stopAll();
                                    this._stopAllWalkSounds();
                                }
                            });
                        });

                        // Hero crying alone
                        this._stopAllWalkSounds();
                        if (hero) {
                            hero.setAttachment('face', 'hero_face_crying');
                            if (hero.bones?.arm_left) {
                                this.scene.tweens.add({ targets: hero.bones.arm_left, angle: 160, duration: 500 });
                            }
                            if (hero.bones?.arm_right) {
                                this.scene.tweens.add({ targets: hero.bones.arm_right, angle: -160, duration: 500 });
                            }

                            // Zoom in
                            this.scene.time.delayedCall(1000, () => {
                                this._stopAllWalkSounds();
                                this._zoomInOnHero(() => {
                                    if (this.ui.finalWindow) {
                                        this.ui.finalWindow.show();
                                    }
                                    this._createFinaleButtons();
                                });
                            });
                        }
                    });
                }
            });
        }
    }

    _zoomInOnHero(onComplete) {
        const hero = this.puppets.hero;
        if (!hero) {
            if (onComplete) onComplete();
            return;
        }

        const cam = this.scene.cameras.main;
        const zoom = 1.5;
        const halfViewH = cam.height / (2 * zoom);
        const halfViewW = cam.width / (2 * zoom);

        const matrix = (typeof hero.getWorldTransformMatrix === 'function') ? hero.getWorldTransformMatrix() : null;
        const heroCamX = matrix ? matrix.tx : hero.x;
        const heroCamY = matrix ? matrix.ty : hero.y;

        // 1. Shift zoom target higher on the Y-axis (focus closer to torso/head level rather than feet)
        let targetCamY = heroCamY - 180;
        if (hero.bones?.head && typeof hero.bones.head.getWorldTransformMatrix === 'function') {
            const headMat = hero.bones.head.getWorldTransformMatrix();
            if (headMat && headMat.ty) {
                targetCamY = headMat.ty + 40;
            }
        }
        let targetCamX = heroCamX;

        // 2. Strict background clamping:
        // Ensure zoomed camera view remains clamped within background bounds
        // so the bottom edge of the background NEVER lifts to expose a black gap
        const bg = this.scene.houseBg || this.scene.jewelBg;
        if (bg && typeof bg.getWorldTransformMatrix === 'function') {
            const bgMat = bg.getWorldTransformMatrix();
            if (bgMat) {
                const worldContainerScaleY = Math.abs(this.ui.worldContainer?.scaleY || 1);
                const mainContainerScaleY = Math.abs(this.scene.mainContainer?.scaleY || 1);
                const worldContainerScaleX = Math.abs(this.ui.worldContainer?.scaleX || 1);
                const mainContainerScaleX = Math.abs(this.scene.mainContainer?.scaleX || 1);

                const bgScaleY = (bg.scaleY !== undefined ? Math.abs(bg.scaleY) : 1) * worldContainerScaleY * mainContainerScaleY;
                const bgScaleX = (bg.scaleX !== undefined ? Math.abs(bg.scaleX) : 1) * worldContainerScaleX * mainContainerScaleX;

                const bgHeight = (bg.height || bg.displayHeight || 982) * bgScaleY;
                const bgWidth = (bg.width || bg.displayWidth || 988) * bgScaleX;

                const originY = bg.originY !== undefined ? bg.originY : 0.5;
                const originX = bg.originX !== undefined ? bg.originX : 0.5;

                const bgTop = bgMat.ty - bgHeight * originY;
                const bgBottom = bgMat.ty + bgHeight * (1 - originY);
                const bgLeft = bgMat.tx - bgWidth * originX;
                const bgRight = bgMat.tx + bgWidth * (1 - originX);

                // Ensure bottom edge of camera view (targetCamY + halfViewH) never exceeds bgBottom:
                if (targetCamY + halfViewH > bgBottom) {
                    targetCamY = bgBottom - halfViewH;
                }
                // Ensure top edge of camera view never goes above bgTop:
                if (targetCamY - halfViewH < bgTop) {
                    targetCamY = bgTop + halfViewH;
                }

                // Ensure horizontal bounds
                if (targetCamX - halfViewW < bgLeft) {
                    targetCamX = bgLeft + halfViewW;
                }
                if (targetCamX + halfViewW > bgRight) {
                    targetCamX = bgRight - halfViewW;
                }
            }
        }

        cam.pan(targetCamX, targetCamY, 1000, 'Power2');
        cam.zoomTo(zoom, 1000, 'Power2', true);

        if (onComplete) {
            this.scene.time.delayedCall(1100, () => {
                this._stopAllWalkSounds();
                onComplete();
            });
        }
    }

    _createFinaleButtons() {
        if (this.finaleButtons.length > 0) return;

        const container = this.scene.finaleContainer || this.scene.mainContainer;
        if (!container) return;

        // Left button: TRY AGAIN (green)
        this.btnTryAgain = new Button({
            scene: this.scene,
            container: container,
            texture: 'btn_try_again_green',
            text: '',
            align: 'Center',
            px: -120,
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
            px: 120,
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

        // Ensure main camera ignores finale buttons and uiCamera renders them
        if (this.scene.cameras?.main && this.scene.finaleContainer) {
            this.scene.cameras.main.ignore(this.scene.finaleContainer);
        }

        // Animate entrance of both buttons
        this.scene.tweens.add({
            targets: [this.btnTryAgain, this.btnRestart],
            pScaleX: 0.45,
            pScaleY: 0.45,
            lScaleX: 0.48,
            lScaleY: 0.48,
            duration: 450,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.finaleButtons.forEach((btn) => {
                    this.scene.tweens.add({
                        targets: btn,
                        pScaleX: 0.45 * 1.06,
                        pScaleY: 0.45 * 1.06,
                        lScaleX: 0.48 * 1.06,
                        lScaleY: 0.48 * 1.06,
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
        this.girl2GroundY = this.heroGroundY + (this.girl2YOffset || 38);

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
        } else {
            // In house scene or non-road locations, ensure hero and girl2 maintain their ground baselines
            const hero = this.puppets?.hero;
            const girl2 = this.puppets?.girl_2;
            if (hero && hero.visible) {
                hero.y = this.heroGroundY;
            }
            if (girl2 && girl2.visible) {
                girl2.y = this.girl2GroundY;
                girl2.setDepth(28); // Behind Hero (depth 30)
            }
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
                this.btnTryAgain.setCustomPosition(-120, 320);
                this.btnTryAgain.setScale(0.45);
            }
            if (this.btnRestart) {
                this.btnRestart.setCustomPosition(120, 320);
                this.btnRestart.setScale(0.45);
            }
        } else {
            if (this.btnTryAgain) {
                this.btnTryAgain.setCustomPosition(-140, 290);
                this.btnTryAgain.setScale(0.48);
            }
            if (this.btnRestart) {
                this.btnRestart.setCustomPosition(140, 290);
                this.btnRestart.setScale(0.48);
            }
        }
    }

    _onCta() {
        if (window.App && window.App.network) {
            window.App.network.ctaClick();
        }
    }
}
