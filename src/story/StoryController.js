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
        this.friendGroundY = this.heroGroundY - 26;
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

    get isPartyFXEnabled() {
        if (this.scene?.SETTINGS?.enablePartyFX !== undefined) {
            return !!this.scene.SETTINGS.enablePartyFX;
        }
        if (this.scene?.SETTINGS?.enableDiscoMode !== undefined) {
            return !!this.scene.SETTINGS.enableDiscoMode;
        }
        if (this.story?.enablePartyFX !== undefined) {
            return !!this.story.enablePartyFX;
        }
        if (this.story?.enableDiscoMode !== undefined) {
            return !!this.story.enableDiscoMode;
        }
        return false;
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
        if (!this.isPartyFXEnabled) return;
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
        if (!this._partyMusic && !this._isStoppingPartyMusic) return;
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
            if (typeof this.scene.applyCameraSettings === 'function') {
                this.scene.applyCameraSettings();
            } else {
                this.scene.cameras.main.zoom = 1.0;
            }
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
        if (this.entranceContainer) {
            this.entranceContainer.destroy();
            this.entranceContainer = null;
        }
        if (this.carpetGraphics) {
            this.carpetGraphics.destroy();
            this.carpetGraphics = null;
        }
        this._carpetProgress = 0;

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
            if (typeof this.scene.applyCameraSettings === 'function') {
                this.scene.applyCameraSettings();
            } else {
                this.scene.cameras.main.zoom = 1.0;
                this.scene.cameras.main.scrollX = 0;
                this.scene.cameras.main.scrollY = 0;
            }
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
            this.ui.balance.ignoreResize = false;
            if (typeof this.ui.balance.restoreRestingPosition === 'function') {
                this.ui.balance.restoreRestingPosition();
            }
            this.ui.balance.plateBg?.clearTint();
            this.ui.balance.coinIcon?.clearTint();
            this.ui.balance.balanceText?.setColor('#ffffff');
            this.ui.balance.cashLabel?.setColor('#ffea00');
        }
        if (this._brokeText) {
            this._brokeText.destroy();
            this._brokeText = null;
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

            if (typeof window.trackAxonEvent === 'function') {
                window.trackAxonEvent('CHALLENGE_STARTED');
                window.trackAxonEvent('CHALLENGE_PASS_25');
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

                                            // 3. Shaking stand & high-rising rotating arms
                                            const armL = hero.bones?.arm_left;
                                            const armR = hero.bones?.arm_right;
                                            const body = hero.bones?.body;
                                            const bodyInitialY = body?.initial?.y ?? 0;
                                            const armLInitialY = armL?.initial?.y ?? -30;
                                            const armRInitialY = armR?.initial?.y ?? -30;

                                            // Stand shakes energetically
                                            this.scene.tweens.add({
                                                targets: this.building,
                                                angle: 3.5,
                                                duration: 60,
                                                yoyo: true,
                                                repeat: -1,
                                                ease: 'Sine.easeInOut'
                                            });

                                            // Body bobs upwards with high energy behind counter
                                            if (body) {
                                                this.scene.tweens.add({
                                                    targets: body,
                                                    y: bodyInitialY - 20,
                                                    duration: 100,
                                                    yoyo: true,
                                                    repeat: -1,
                                                    ease: 'Sine.easeInOut'
                                                });
                                            }

                                            // Both arms rise high into the air and bob as they rotate
                                            if (armL) {
                                                armL.y = armLInitialY - 45;
                                                this.scene.tweens.add({
                                                    targets: armL,
                                                    y: armLInitialY - 70, // Rises high above the stand
                                                    duration: 140,
                                                    yoyo: true,
                                                    repeat: -1,
                                                    ease: 'Sine.easeInOut'
                                                });
                                                this.scene.tweens.add({
                                                    targets: armL,
                                                    angle: { from: 0, to: -360 }, // Full continuous rotation
                                                    duration: 150,
                                                    repeat: -1,
                                                    ease: 'Linear'
                                                });
                                            }

                                            if (armR) {
                                                armR.y = armRInitialY - 45;
                                                this.scene.tweens.add({
                                                    targets: armR,
                                                    y: armRInitialY - 70, // Rises high above the stand
                                                    duration: 140,
                                                    yoyo: true,
                                                    repeat: -1,
                                                    ease: 'Sine.easeInOut'
                                                });
                                                this.scene.tweens.add({
                                                    targets: armR,
                                                    angle: { from: 180, to: 540 }, // Full continuous rotation offset by 180°
                                                    duration: 150,
                                                    repeat: -1,
                                                    ease: 'Linear'
                                                });
                                            }

                                            let workActive = true;
                                            const stopStandWork = () => {
                                                if (!workActive) return;
                                                workActive = false;

                                                if (this.building) {
                                                    this.scene.tweens.killTweensOf(this.building);
                                                    this.building.angle = 0;
                                                }
                                                if (armL) {
                                                    this.scene.tweens.killTweensOf(armL);
                                                }
                                                if (armR) {
                                                    this.scene.tweens.killTweensOf(armR);
                                                }
                                                if (body) {
                                                    this.scene.tweens.killTweensOf(body);
                                                }
                                                hero.resetPose();
                                                hero.animator?.stopAll();
                                            };

                                            // Fallback timeout ensuring stand work stops
                                            this.scene.time.delayedCall(2400, () => {
                                                if (workActive) {
                                                    stopStandWork();
                                                }
                                            });

                                            // 4. Stand sequence - no money earned (pure deduction economy)

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

                                            if (this.isPartyFXEnabled) {
                                                this._startPartyMusic();
                                                this.partyFX = new PartyFXController(this.scene, this.ui.worldContainer, PARTY_FX_CONFIG, this.groundY);
                                                this.partyFX.start();
                                            }

                                            const danceStyles = ['sharp_jumps', 'wave_arms', 'throw_arms', 'step_raise', 'spins'];
                                            // Friends are placed higher along the game axis than hero (smaller Y, depths behind hero)
                                            const yOffsets = [-12, -6, 0, 6, 10];
                                            yOffsets.sort(() => Math.random() - 0.5);

                                            const placements = activeCrowd.map((p, idx) => {
                                                const stepX = count > 1 ? (maxX - minX) / (count - 1) : 0;
                                                const jitterX = (Math.random() - 0.5) * 20;
                                                const targetX = Math.round(minX + idx * stepX + jitterX);
                                                const yOffset = (yOffsets[idx] !== undefined ? yOffsets[idx] : 0) + (Math.random() - 0.5) * 4;
                                                const targetY = Math.round(this.friendGroundY + yOffset);
                                                p._groundY = targetY;
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
                                                        if (this.isPartyFXEnabled) {
                                                            const style = danceStyles[idx % danceStyles.length];
                                                            p.animator?.playDance({ style });
                                                        } else {
                                                            p.resetPose();
                                                            p.animator?.playIdle();
                                                        }
                                                        arrivedCount++;
                                                        if (arrivedCount === activeCrowd.length) {
                                                            // Work is finished: stop arm rotation immediately and restore clean pose
                                                            stopStandWork();

                                                            // Friends are dancing, Hero smoothly exits to join the crowd weaving past friends
                                                            this.scene.time.delayedCall(120, () => {
                                                                const counterY = 215;
                                                                hero.animator?.stopAll();
                                                                hero.scaleX = -Math.abs(hero.scaleX || 1);
                                                                hero.animator?.playWalk();
                                                                hero.setDepth(19); // Behind counter

                                                                const cCenter = crowdCenterX;

                                                                // Dynamic depth update: change Hero's z-index only after he has passed a friend along the Y-axis
                                                                const updateHeroDepth = () => {
                                                                    let currentDepth = 21; // Baseline in front of stand (20) but behind all friends (22-26)
                                                                    placements.forEach(item => {
                                                                        const p = item.puppet;
                                                                        if (p && p.visible !== false) {
                                                                            // Only after hero has passed this friend along the y-axis
                                                                            if (hero.y > item.targetY) {
                                                                                currentDepth = Math.max(currentDepth, p.depth + 1);
                                                                            }
                                                                        }
                                                                    });
                                                                    if (hero.y >= this.heroGroundY - 3) {
                                                                        currentDepth = 30; // Final foreground depth
                                                                    }
                                                                    if (hero.depth !== currentDepth) {
                                                                        hero.setDepth(currentDepth);
                                                                        if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                                                                            this.ui.worldContainer.sort('depth');
                                                                        }
                                                                    }
                                                                };

                                                                // Step 1: Move left behind counter to clear bench edge
                                                                this.scene.tweens.add({
                                                                    targets: hero,
                                                                    x: -60,
                                                                    y: counterY,
                                                                    duration: 250,
                                                                    ease: 'Linear',
                                                                    onComplete: () => {
                                                                        hero.setDepth(21);
                                                                        if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');

                                                                        // Pass 1: Weave left & down Y past initial friend boundary
                                                                        hero.scaleX = -Math.abs(hero.scaleX || 1);
                                                                        this.scene.tweens.add({
                                                                            targets: hero,
                                                                            x: cCenter - 45,
                                                                            y: 275,
                                                                            duration: 260,
                                                                            ease: 'Linear',
                                                                            onUpdate: updateHeroDepth,
                                                                            onComplete: () => {
                                                                                // Pass 2: Weave right & down Y between friends
                                                                                hero.scaleX = Math.abs(hero.scaleX || 1);
                                                                                this.scene.tweens.add({
                                                                                    targets: hero,
                                                                                    x: cCenter + 45,
                                                                                    y: 325,
                                                                                    duration: 280,
                                                                                    ease: 'Linear',
                                                                                    onUpdate: updateHeroDepth,
                                                                                    onComplete: () => {
                                                                                        // Pass 3: Weave left & down Y past remaining friends
                                                                                        hero.scaleX = -Math.abs(hero.scaleX || 1);
                                                                                        this.scene.tweens.add({
                                                                                            targets: hero,
                                                                                            x: cCenter - 30,
                                                                                            y: 355,
                                                                                            duration: 260,
                                                                                            ease: 'Linear',
                                                                                            onUpdate: updateHeroDepth,
                                                                                            onComplete: () => {
                                                                                                // Pass 4: Settle right into crowd center foreground at heroGroundY
                                                                                                hero.scaleX = Math.abs(hero.scaleX || 1);
                                                                                                this.scene.tweens.add({
                                                                                                    targets: hero,
                                                                                                    x: cCenter,
                                                                                                    y: this.heroGroundY,
                                                                                                    duration: 300,
                                                                                                    ease: 'Power1.easeOut',
                                                                                                    onUpdate: updateHeroDepth,
                                                                                                    onComplete: () => {
                                                                                                        hero.setDepth(30);
                                                                                                        if (this.ui.worldContainer) this.ui.worldContainer.sort('depth');
                                                                                                        hero.scaleX = Math.abs(hero.scaleX || 1);
                                                                                                        hero.animator?.playIdle();
                                                                                                        hero.setFace('happy');

                                                                                                        // Sequence Man 1 (realtor) entrance immediately from right edge
                                                                                                        this._sequenceMan1Entrance(240);
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

    _sequenceMan1Entrance(manTargetX = 240) {
        const man1 = this.puppets.man_1;
        if (!man1) {
            this.scene.time.delayedCall(250, () => {
                this.goToStep('step_choose_house');
            });
            return;
        }

        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        let fromX = manTargetX + 185;
        if (isPortrait) {
            const worldScale = this.ui.worldContainer?.scaleX || 1;
            const containerX = this.ui.worldContainer?.x ?? 0;
            const cam = this.scene.cameras?.main;
            const zoom = cam?.zoom || 1;
            const halfVisWidth = (this.scene.scale.width / zoom) / 2;
            const camCenterX = this.scene.scale.width / 2;
            const visibleRightWorld = camCenterX + halfVisWidth;
            const screenRightLocal = (visibleRightWorld - containerX) / worldScale;
            // Ensure Man 1 starts just at/past the visible edge in portrait, capped so he never starts too far away
            fromX = Math.round(Math.min(manTargetX + 210, Math.max(fromX, screenRightLocal + 35)));
        }

        const walkDist = Math.abs(fromX - manTargetX);
        const walkDuration = Math.round((walkDist / 145) * 1000); // 145 px/sec natural walking velocity

        this.scene.tweens.killTweensOf(man1);
        man1.setPosition(fromX, this.groundY);
        const manScale = this._getCharacterScale(man1, -1);
        man1.setScale(manScale.x, manScale.y);
        man1.setVisible(true);
        man1.resetPose();
        man1.setDepth(24);
        if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
            this.ui.worldContainer.sort('depth');
        }
        man1.animator?.playWalk({ speed: 1.1 });

        this.scene.tweens.add({
            targets: man1,
            x: manTargetX,
            duration: walkDuration,
            ease: 'Linear',
            onComplete: () => {
                man1.animator?.playIdle();
                try {
                    Utils.addAudio(this.scene, 'voice_man_mumble', 1.0);
                } catch (e) { }

                // Display House choice cards promptly after Man 1 reaches destination
                this.scene.time.delayedCall(250, () => {
                    this.goToStep('step_choose_house');
                });
            }
        });
    }

    _getBusinessCenterConfig() {
        const rootCfg = this.story?.business_center_entrance || this.scene?.SETTINGS?.business_center_entrance || {};
        const stepEntrance = this.story?.steps?.step_good_business?.entrance || this.story?.steps?.step_good_business?.business_center_entrance || {};
        const cfg = Object.assign({}, stepEntrance, rootCfg);

        const scale = typeof cfg.scale === 'number' ? cfg.scale : (typeof cfg.entrance_scale === 'number' ? cfg.entrance_scale : 0.86);
        const y = typeof cfg.y === 'number' ? cfg.y : 241;
        // Local aperture center in buisnes_center.png is -8.5. If x is not explicitly set, align aperture with world x = 9.4:
        const defaultX = Math.round(9.4 - (-8.5 * scale));
        const x = (typeof cfg.x === 'number' && !(cfg.x === 17 && scale !== 0.86)) ? cfg.x : defaultX;
        const carpetTopHalfW = typeof cfg.carpet_top_half_width === 'number'
            ? cfg.carpet_top_half_width
            : (typeof cfg.carpet?.top_half_width === 'number' ? cfg.carpet.top_half_width : Math.round(30 * (scale / 0.86)));
        const carpetBottomHalfW = typeof cfg.carpet_bottom_half_width === 'number'
            ? cfg.carpet_bottom_half_width
            : (typeof cfg.carpet?.bottom_half_width === 'number' ? cfg.carpet.bottom_half_width : Math.round(65 * (scale / 0.86)));

        return {
            scale,
            x,
            y,
            carpetTopHalfW,
            carpetBottomHalfW
        };
    }

    _spawnBusinessCenterEntrance() {
        if (this._doorTrackingListener) {
            this.scene.events.off('update', this._doorTrackingListener);
            this._doorTrackingListener = null;
        }

        if (this.portalFrame) {
            this.portalFrame.destroy();
            this.portalFrame = null;
        }
        if (this.doorContainer) {
            this.doorContainer.destroy();
            this.doorContainer = null;
        }
        if (this.entranceContainer) {
            this.entranceContainer.destroy();
            this.entranceContainer = null;
        }

        const scene = this.scene;
        const bcCfg = this._getBusinessCenterConfig();
        const doorwayX = bcCfg.x;
        const doorwayY = bcCfg.y;
        const bcScale = bcCfg.scale;
        this.doorwayX = doorwayX;
        this.doorwayY = doorwayY;
        this.bcScale = bcScale;
        this.doorwayCenterWorldX = doorwayX + (-8.5 * bcScale);

        // 1. doorContainer (depth 14): holds door_bg and sliding doors behind Hero (depth 15)
        this.doorContainer = scene.add.container(doorwayX, doorwayY);
        this.doorContainer.setScale(bcScale);
        this.doorContainer.setDepth(14);

        // door_bg (buisnes_cente_door_bg.png): 168 x 214
        this.doorBg = scene.add.image(-8.5, -112, 'buisnes_cente_door_bg').setOrigin(0.5, 0.5);
        this.doorBg.setDepth(1);

        // door_l (buisnes_cente_door_l.png): 84 x 214
        this.doorL = scene.add.image(-92.5, -112, 'buisnes_cente_door_l').setOrigin(0, 0.5);
        this.doorL.setDepth(2);

        // door_r (buisnes_cente_door_r.png): 84 x 214
        this.doorR = scene.add.image(75.5, -112, 'buisnes_cente_door_r').setOrigin(1, 0.5);
        this.doorR.setDepth(2);

        this.doorContainer.add([this.doorBg, this.doorL, this.doorR]);

        // 2. portalFrame (buisnes_center.png): Front arch and planter frame (depth 16) in front of Hero (depth 15)
        this.portalFrame = scene.add.image(doorwayX, doorwayY, 'buisnes_center').setOrigin(0.5, 1.0);
        this.portalFrame.setScale(bcScale);
        this.portalFrame.setDepth(16);

        if (this.ui.worldContainer) {
            this.ui.worldContainer.add([this.doorContainer, this.portalFrame]);
            if (typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
        }

        this.entranceContainer = this.doorContainer;
        this.building = this.portalFrame;
        this.doorsOpen = false;

        return this.entranceContainer;
    }

    _openDoors(duration = 350, onComplete = null) {
        try {
            Utils.addAudio(this.scene, 'door_sliding_open', 1.0);
        } catch (e) { }

        if (!this.doorL || !this.doorR) {
            if (typeof onComplete === 'function') onComplete();
            return;
        }

        this.scene.tweens.killTweensOf(this.doorL);
        this.scene.tweens.killTweensOf(this.doorR);

        this.scene.tweens.add({
            targets: [this.doorL, this.doorR],
            scaleX: 0,
            duration: duration,
            ease: 'Quad.easeInOut',
            onComplete: () => {
                this.doorsOpen = true;
                if (typeof onComplete === 'function') onComplete();
            }
        });
    }

    _closeDoors(duration = 350, onComplete = null) {
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
            targets: [this.doorL, this.doorR],
            scaleX: 1,
            duration: duration,
            ease: 'Quad.easeInOut',
            onComplete: () => {
                this.doorsOpen = false;
                if (typeof onComplete === 'function') onComplete();
            }
        });
    }

    _spawnBuildingDoors(buildingX, buildingY, bcScale = 1.0) {
        return this._spawnBusinessCenterEntrance();
    }

    _openBuildingDoors(duration = 350, onComplete = null) {
        return this._openDoors(duration, onComplete);
    }

    _closeBuildingDoors(duration = 350, onComplete = null) {
        return this._closeDoors(duration, onComplete);
    }

    _initCarpetGraphics() {
        if (this.carpetGraphics) {
            this.carpetGraphics.destroy();
            this.carpetGraphics = null;
        }
        this.carpetGraphics = this.scene.add.graphics();
        this.carpetGraphics.setDepth(10); // Placed below Hero (30) and above ground pavement (0)
        if (this.ui.worldContainer) {
            this.ui.worldContainer.add(this.carpetGraphics);
            if (typeof this.ui.worldContainer.sort === 'function') {
                this.ui.worldContainer.sort('depth');
            }
        }
        this._carpetProgress = 0;
    }

    _drawCarpet(progress) {
        if (!this.carpetGraphics) return;
        this._carpetProgress = progress;
        this.carpetGraphics.clear();
        if (progress <= 0) return;

        const bcCfg = this._getBusinessCenterConfig();
        const doorwayX = this.doorwayCenterWorldX !== undefined ? this.doorwayCenterWorldX : (bcCfg.x + (-8.5 * bcCfg.scale));
        const topY = this.doorwayY !== undefined ? this.doorwayY : bcCfg.y;
        const bottomY = Math.max(this.heroGroundY + 14, 395);

        // Perspective trapezoid dimensions from config:
        const topHalfW = bcCfg.carpetTopHalfW;
        const bottomHalfW = bcCfg.carpetBottomHalfW;

        const curY = topY + (bottomY - topY) * progress;
        const curHalfW = topHalfW + (bottomHalfW - topHalfW) * progress;

        // Main red fill (0xb71c1c)
        this.carpetGraphics.fillStyle(0xb71c1c, 1);
        this.carpetGraphics.beginPath();
        this.carpetGraphics.moveTo(doorwayX - topHalfW, topY);
        this.carpetGraphics.lineTo(doorwayX + topHalfW, topY);
        this.carpetGraphics.lineTo(doorwayX + curHalfW, curY);
        this.carpetGraphics.lineTo(doorwayX - curHalfW, curY);
        this.carpetGraphics.closePath();
        this.carpetGraphics.fillPath();

        // Narrow gold accent borders (0xd4af37) along left and right edges
        this.carpetGraphics.lineStyle(3, 0xd4af37, 1);
        this.carpetGraphics.beginPath();
        this.carpetGraphics.moveTo(doorwayX - topHalfW, topY);
        this.carpetGraphics.lineTo(doorwayX - curHalfW, curY);
        this.carpetGraphics.strokePath();

        this.carpetGraphics.beginPath();
        this.carpetGraphics.moveTo(doorwayX + topHalfW, topY);
        this.carpetGraphics.lineTo(doorwayX + curHalfW, curY);
        this.carpetGraphics.strokePath();

        // Top gold threshold trim
        this.carpetGraphics.lineStyle(2, 0xd4af37, 0.9);
        this.carpetGraphics.beginPath();
        this.carpetGraphics.moveTo(doorwayX - topHalfW, topY);
        this.carpetGraphics.lineTo(doorwayX + topHalfW, topY);
        this.carpetGraphics.strokePath();

        // Optional visual touch: rolling cylinder at rolling front edge
        if (progress < 0.99) {
            const rollW = (curHalfW + 2) * 2;
            const rollH = 8;
            this.carpetGraphics.fillStyle(0x7f1010, 1);
            this.carpetGraphics.fillEllipse(doorwayX, curY, rollW, rollH);
            this.carpetGraphics.lineStyle(1.5, 0xd4af37, 0.9);
            this.carpetGraphics.strokeEllipse(doorwayX, curY, rollW, rollH);
        } else {
            // Gold accent border along bottom edge
            this.carpetGraphics.lineStyle(3, 0xd4af37, 1);
            this.carpetGraphics.beginPath();
            this.carpetGraphics.moveTo(doorwayX - bottomHalfW, bottomY);
            this.carpetGraphics.lineTo(doorwayX + bottomHalfW, bottomY);
            this.carpetGraphics.strokePath();
        }
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
        const hero = this.puppets?.hero;
        if (!hero) {
            this.goToStep('step_choose_house');
            return;
        }

        const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5];

        this.isTransitioning = true;
        const activeTweens = [];
        const activeDelays = [];

        const bcCfg = this._getBusinessCenterConfig();
        const doorwayX = bcCfg.x;
        const doorwayY = bcCfg.y;
        const bcScale = bcCfg.scale;
        const carpetCenterX = doorwayX + (-8.5 * bcScale);
        this.doorwayX = doorwayX;
        this.doorwayY = doorwayY;
        this.bcScale = bcScale;
        this.doorwayCenterWorldX = carpetCenterX;

        // Calculate crowd placement on the left side of the street (matching lemonade stand distribution)
        const worldScale = this.ui.worldContainer?.scaleX || 1;
        const containerX = this.ui.worldContainer?.x ?? 300;
        const screenLeftLocal = (0 - containerX) / worldScale;
        const rawMinX = Math.round(screenLeftLocal + 35);
        const maxX = -65; // Positioned comfortably to the left of the walkway carpet
        // Guarantee friends are spread naturally across a wide span (at least 220px) identical to the lemonade stand
        const minX = Math.min(rawMinX, maxX - 220);
        const crowdCenterX = Math.round((minX + maxX) / 2);

        const activeCrowd = friends.filter(c => !!c);
        const count = activeCrowd.length;
        // Staggered Y offsets along the game ground axis for natural crowd depth
        const yOffsets = [-12, 8, -6, 12, 0];

        const placements = activeCrowd.map((p, idx) => {
            const stepX = count > 1 ? (maxX - minX) / (count - 1) : 0;
            const jitterX = (idx % 2 === 0 ? 8 : -8);
            const targetX = Math.round(minX + idx * stepX + jitterX);
            const yOffset = yOffsets[idx % yOffsets.length];
            const targetY = Math.round(this.friendGroundY + yOffset);
            p._groundY = targetY;
            return { puppet: p, targetX, targetY };
        });

        // Trigger friends arrival after hero enters the door
        const triggerFriendsArrival = () => {
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

                const friendTween = this.scene.tweens.add({
                    targets: p,
                    x: item.targetX,
                    duration: 1100 + idx * 100,
                    ease: 'Power1.easeOut',
                    onComplete: () => {
                        p.resetPose();
                        p.animator?.playIdle();
                    }
                });
                activeTweens.push(friendTween);
            });
        };

        const snapGoodBusiness = () => {
            this.isTransitioning = false;
            this._drawCarpet(1);
            if (this.doorContainer) {
                this.doorContainer.x = doorwayX;
                this.doorContainer.y = doorwayY;
                this.doorContainer.setScale(bcScale);
                if (this.doorL) this.doorL.scaleX = 1;
                if (this.doorR) this.doorR.scaleX = 1;
            }
            if (this.portalFrame) {
                this.portalFrame.x = doorwayX;
                this.portalFrame.y = doorwayY;
                this.portalFrame.setScale(bcScale);
            }
            placements.forEach((item) => {
                const p = item.puppet;
                p.setVisible(true);
                p.setPosition(item.targetX, item.targetY);
                const pScale = this._getCharacterScale(p, 1);
                p.setScale(pScale.x, pScale.y);
                p.resetPose();
                p.animator?.playIdle();
            });
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
                hero.setVisible(true);
                this.ui.worldContainer.add(hero);
                hero.setDepth(30);
                hero.setPosition(crowdCenterX, this.heroGroundY);
                const heroScale = this._getCharacterScale(hero, 1);
                hero.setScale(heroScale.x, heroScale.y);
                hero.animator?.playIdle();
            }
            this._sequenceMan1Entrance(220);
        };

        this._activeTransition = {
            type: 'good_business',
            tweens: activeTweens,
            delayedCalls: activeDelays,
            snap: snapGoodBusiness
        };

        // 1. Hide Choice UI cards
        if (this.ui?.choices) {
            this.ui.choices.hide(180);
        }

        // Setup entrance container and red carpet graphics
        this._spawnBusinessCenterEntrance();
        this._initCarpetGraphics();

        const initialHeroScale = this._getCharacterScale(hero, 1);

        // Entrance structure subtle pop-in replacing central doorway
        if (this.doorContainer) {
            this.doorContainer.setScale(bcScale * 0.88);
            this.doorContainer.setAlpha(0);
        }
        if (this.portalFrame) {
            this.portalFrame.setScale(bcScale * 0.88);
            this.portalFrame.setAlpha(0);
        }
        const entranceTargets = [this.doorContainer, this.portalFrame].filter(t => !!t);
        const entranceTween = this.scene.tweens.add({
            targets: entranceTargets,
            scaleX: bcScale,
            scaleY: bcScale,
            alpha: 1,
            duration: 300,
            ease: 'Back.easeOut'
        });
        activeTweens.push(entranceTween);

        // 2. Animate procedural carpet rollout toward the Hero
        try {
            Utils.addAudio(this.scene, 'building_grow', 0.85);
        } catch (e) { }

        const rolloutObj = { progress: 0 };
        const carpetTween = this.scene.tweens.add({
            targets: rolloutObj,
            progress: 1,
            duration: 750,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                this._drawCarpet(rolloutObj.progress);
            },
            onComplete: () => {
                this._drawCarpet(1);

                // 3. Hero walks along the carpet toward the doorway (maintaining constant scale)
                hero.setDepth(20);
                hero.animator?.playWalk({ speed: 1.0 });

                const heroWalkTween = this.scene.tweens.add({
                    targets: hero,
                    x: carpetCenterX,
                    y: doorwayY,
                    duration: 850,
                    ease: 'Linear',
                    onComplete: () => {
                        // 4. Open Doors (duration: 350ms)
                        this._openDoors(350, () => {
                            // 5. Hero enters behind portalFrame (depth 16) and in front of doorContainer (depth 14)
                            // Hero NEVER leaves worldContainer, scale remains strictly invariant
                            hero.setDepth(15);
                            if (typeof this.ui.worldContainer?.sort === 'function') {
                                this.ui.worldContainer.sort('depth');
                            }

                            const heroEnterTween = this.scene.tweens.add({
                                targets: hero,
                                y: doorwayY - 45,
                                duration: 380,
                                ease: 'Linear',
                                onComplete: () => {
                                    // Walked through threshold into door_bg, set Hero visible = false
                                    hero.setVisible(false);
                                    hero.animator?.stopAll();

                                    // Close doors: Tween door_l and door_r scaleX back to 1 (duration: 350ms)
                                    this._closeDoors(350, () => {
                                        // ONLY AFTER HERO ENTERS: Friends run in from the left and stand in place
                                        triggerFriendsArrival();

                                        // 6. Suit Swap: Wait 1000ms delay
                                        const swapDelay = this.scene.time.delayedCall(1000, () => {
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

                                            try {
                                                Utils.addAudio(this.scene, 'magic_sparkle', 1.0);
                                            } catch (e) { }

                                            // 7. Hero exits: Open doors (Tween scaleX back to 0)
                                            this._openDoors(350, () => {
                                                hero.setPosition(carpetCenterX, doorwayY - 45);
                                                hero.setDepth(15);
                                                hero.setVisible(true);
                                                hero.animator?.playWalk({ speed: 1.0 });

                                                // Hero steps through threshold into worldContainer
                                                const heroStepOutTween = this.scene.tweens.add({
                                                    targets: hero,
                                                    y: doorwayY,
                                                    duration: 250,
                                                    ease: 'Linear',
                                                    onComplete: () => {
                                                        // Stepped out onto carpet in front of portal frame
                                                        hero.setDepth(21);
                                                        if (typeof this.ui.worldContainer?.sort === 'function') {
                                                            this.ui.worldContainer.sort('depth');
                                                        }

                                                        // Close doors (scaleX to 1)
                                                        this._closeDoors(350);

                                                        const cCenter = crowdCenterX;

                                                        // Dynamic depth update: change Hero's z-index only after he has passed a friend along the Y-axis
                                                        const updateHeroDepth = () => {
                                                            let currentDepth = 21; // Baseline in front of entrance (16-20) but behind all friends (22-26)
                                                            placements.forEach(item => {
                                                                const p = item.puppet;
                                                                if (p && p.visible !== false) {
                                                                    // Only after hero has passed this friend along the y-axis
                                                                    if (hero.y > item.targetY) {
                                                                        currentDepth = Math.max(currentDepth, p.depth + 1);
                                                                    }
                                                                }
                                                            });
                                                            if (hero.y >= this.heroGroundY - 3) {
                                                                currentDepth = 30; // Final foreground depth
                                                            }
                                                            if (hero.depth !== currentDepth) {
                                                                hero.setDepth(currentDepth);
                                                                if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                                                                    this.ui.worldContainer.sort('depth');
                                                                }
                                                            }
                                                        };

                                                        // Walk straight down the path (carpet) along the game axis without wobbling
                                                        hero.scaleX = Math.abs(hero.scaleX || initialHeroScale.x);
                                                        hero.animator?.playWalk({ speed: 1.0 });

                                                        const heroWalkDownPathTween = this.scene.tweens.add({
                                                            targets: hero,
                                                            x: carpetCenterX,
                                                            y: this.heroGroundY,
                                                            duration: 850,
                                                            ease: 'Linear',
                                                            onUpdate: updateHeroDepth,
                                                            onComplete: () => {
                                                                hero.setDepth(30);
                                                                if (this.ui.worldContainer && typeof this.ui.worldContainer.sort === 'function') {
                                                                    this.ui.worldContainer.sort('depth');
                                                                }

                                                                // Come out to the friends ("выехать к друзьям")
                                                                hero.scaleX = -Math.abs(hero.scaleX || initialHeroScale.x); // Face left
                                                                hero.animator?.playWalk({ speed: 1.0 });

                                                                const heroJoinFriendsTween = this.scene.tweens.add({
                                                                    targets: hero,
                                                                    x: crowdCenterX,
                                                                    y: this.heroGroundY,
                                                                    duration: 650,
                                                                    ease: 'Power1.easeInOut',
                                                                    onUpdate: updateHeroDepth,
                                                                    onComplete: () => {
                                                                        // Settle among friends, face right towards incoming visitor
                                                                        hero.scaleX = Math.abs(hero.scaleX || initialHeroScale.x);
                                                                        hero.animator?.playIdle();
                                                                        hero.setFace('happy');

                                                                        this.isTransitioning = false;
                                                                        this._activeTransition = null;

                                                                        // 8. Proceed to Choice 2: House (Realtor entrance)
                                                                        const nextStepDelay = this.scene.time.delayedCall(240, () => {
                                                                            this._sequenceMan1Entrance(220);
                                                                        });
                                                                        activeDelays.push(nextStepDelay);
                                                                    }
                                                                });
                                                                activeTweens.push(heroJoinFriendsTween);
                                                            }
                                                        });
                                                        activeTweens.push(heroWalkDownPathTween);
                                                    }
                                                });
                                                activeTweens.push(heroStepOutTween);
                                            });
                                        });
                                        activeDelays.push(swapDelay);
                                    });
                                }
                            });
                            activeTweens.push(heroEnterTween);
                        });
                    }
                });
                activeTweens.push(heroWalkTween);
            }
        });
        activeTweens.push(carpetTween);
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

            if (typeof window.trackAxonEvent === 'function') {
                window.trackAxonEvent('CHALLENGE_PASS_50');
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
            const cameraDuration = 1400; // Fast, responsive transition between locations

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
                    const fY = p._groundY || p.y || this.friendGroundY;
                    p.setPosition(houseHeroTargetX - 130 - (idx * 55), fY);
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
            hero.animator?.playWalk({ speed: 1.1 });
            const heroTween = this.scene.tweens.add({
                targets: hero,
                x: houseHeroTargetX,
                y: this.heroGroundY,
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
        // with sequential per-character stagger so they do not snap or move in rigid synchrony
        friends.forEach((p, idx) => {
            const startFriendX = p.x;
            const targetFriendX = houseHeroTargetX - 130 - (idx * 55);
            const targetFriendY = p._groundY || p.y || this.friendGroundY;
            const staggerDelay = 30 + (idx * 40); // 30ms, 70ms, 110ms, 150ms, 190ms
            const friendDuration = Math.max(900, cameraDuration - staggerDelay);

            // Cohesive, moderately cartoonish walk parameters with subtle individual variations
            const cartoonStyle = {
                duration: friendDuration,
                speed: 1.12 + (idx % 3) * 0.03, // Harmonious group cadence (1.12, 1.15, 1.18)
                phaseOffset: idx * 0.45,        // Subtle step phase offset so friends don't step in rigid lockstep
                maxLegAngle: 29 + (idx % 2) * 1.5, // 29° - 30.5° (toned down, charming cartoon stride)
                maxArmAngle: 24 + (idx % 2) * 1.5, // 24° - 25.5° (toned down, gentle arm swings)
                maxBounce: 8.5 + (idx % 2) * 1.0,  // 8.5px - 9.5px (springy but grounded)
                maxHeadAngle: 3.5,                 // 3.5° (subtle jaunty bobbing)
                maxBodyAngle: 2.5                  // 2.5° (subtle playful sway)
            };

            const friendTween = this.scene.tweens.add({
                targets: p,
                x: targetFriendX,
                y: targetFriendY,
                delay: staggerDelay,
                duration: friendDuration,
                ease: 'Power1.easeInOut',
                onStart: () => {
                    const pScale = this._getCharacterScale(p, 1);
                    p.setScale(pScale.x, pScale.y);
                    p.animator?.playCartoonWalk(cartoonStyle);
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
        const girl1 = this.puppets.girl_1;
        const girl2 = this.puppets.girl_2;

        if (this.puppets.man_1) {
            this.puppets.man_1.setVisible(false);
        }

        const isPortrait = this.scene.scale.width < this.scene.scale.height;
        const heroTargetX = houseCenter - halfCharWidth;
        const girl2TargetX = heroTargetX + 185;
        const girl1TargetX = heroTargetX + 315;

        let heroFinished = true;
        let girl1Finished = false;
        let girl2Finished = false;

        const checkDone = () => {
            if (heroFinished && girl1Finished && girl2Finished) {
                this.scene.time.delayedCall(250, () => {
                    this.goToStep('step_choose_woman');
                });
            }
        };

        if (hero) {
            hero.setPosition(heroTargetX, this.heroGroundY);
            hero.animator?.playIdle();
            hero.setFace('amazed');
        }

        // Friends remain strictly in their current positions on screen in idle
        const friends = [this.puppets.friend1, this.puppets.friend2, this.puppets.friend3, this.puppets.friend4, this.puppets.friend5].filter(c => !!c);
        friends.forEach(p => {
            const pScale = this._getCharacterScale(p, 1);
            p.setScale(pScale.x, pScale.y);
            p.animator?.playIdle();
        });

        // 1. Girl 2 Entrance from the right
        if (girl2) {
            girl2.setDepth(28); // Behind Hero (depth 30)
            const girl2FromX = girl2TargetX + 260;
            girl2.setPosition(girl2FromX, this.girl2GroundY);
            girl2.y = this.girl2GroundY;
            girl2.facing = -1;
            const girl2Scale = this._getCharacterScale(girl2, -1);
            girl2.setScale(girl2Scale.x, girl2Scale.y);
            girl2.setVisible(true);
            girl2.resetPose();
            girl2.setFace('idle');
            girl2.animator?.playWalk({ speed: 0.85 });
            try {
                Utils.addAudio(this.scene, 'voice_hero_gasp_aah', 1.0);
            } catch (e) { }

            this.scene.tweens.add({
                targets: girl2,
                x: girl2TargetX,
                y: this.girl2GroundY,
                duration: 1100,
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

        // 2. Girl 1 Entrance on the right next to Girl 2
        if (girl1) {
            girl1.setDepth(29);
            const girl1GroundY = this.groundY + (girl1.baseYOffset || 0);
            const girl1FromX = girl1TargetX + 260;
            girl1.setPosition(girl1FromX, girl1GroundY);
            girl1.y = girl1GroundY;
            girl1.facing = -1;
            const girl1Scale = this._getCharacterScale(girl1, -1);
            girl1.setScale(girl1Scale.x, girl1Scale.y);
            girl1.setVisible(true);
            girl1.resetPose();
            girl1.setFace('idle');
            girl1.animator?.playWalk({ speed: 0.85 });

            this.scene.tweens.add({
                targets: girl1,
                x: girl1TargetX,
                y: girl1GroundY,
                duration: 1100,
                ease: 'Power1.easeOut',
                onComplete: () => {
                    girl1.y = girl1GroundY;
                    girl1.setDepth(29);
                    girl1.animator?.playIdle();
                    girl1Finished = true;
                    checkDone();
                }
            });
        } else {
            girl1Finished = true;
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

            if (typeof window.trackAxonEvent === 'function') {
                window.trackAxonEvent('CHALLENGE_PASS_75');
            }
            if (choice.id === 'choice_girl_1') {
                this.goToStep('step_fail_end_woman');
            } else {
                // Handling Girl 2 (Hot Model) Selection
                // 1. Hide or disable the Choice UI
                if (this.ui.choices) {
                    this.ui.choices.disableAllInteractivity?.();
                    this.ui.choices.hide?.(150);
                }

                const girl2 = this.puppets.girl_2;
                const girl1 = this.puppets.girl_1;
                const hero = this.puppets.hero;

                // 2. Trigger the selected reaction for Girl 2 (smile / approach the Hero)
                if (girl2) {
                    girl2.setFace('happy');
                    girl2.setDepth(28); // Behind Hero (depth 30)
                    girl2.animator?.playWalk({ speed: 0.75 });

                    // Approach the Hero with clean breathing room (no body clipping)
                    const targetX = hero ? (hero.x + 155) : (girl2.x - 30);
                    this.scene.tweens.add({
                        targets: girl2,
                        x: targetX,
                        y: this.girl2GroundY,
                        duration: 800,
                        ease: 'Power1.easeOut',
                        onComplete: () => {
                            girl2.y = this.girl2GroundY;
                            girl2.setDepth(28);
                            girl2.animator?.playIdle();
                            girl2.setFace('happy');
                        }
                    });
                }

                // 3. Girl 1 Arm-Waving Animation & Exit
                if (girl1) {
                    girl1.animator?.playUpsetWaving();
                    try {
                        Utils.addAudio(this.scene, 'voice_girl1_jealous_grunt', 1.0);
                    } catch (e) { }

                    // Maintain the waving sequence for exactly 1000ms
                    this.scene.time.delayedCall(1000, () => {
                        // 1. Stop waving tween and reset arms to standard walking position
                        girl1.animator?.stopAll();
                        girl1.resetPose();

                        // 2. Flip Girl 1 horizontally to face exit direction (right)
                        girl1.facing = 1;
                        girl1.scaleX = Math.abs(girl1.scaleX);

                        // 3. Play walking animation loop and tween Girl 1 completely off-screen to the right
                        girl1.animator?.playWalk({ speed: 1.0 });

                        const exitTargetX = girl1.x + 650;
                        this.scene.tweens.add({
                            targets: girl1,
                            x: exitTargetX,
                            duration: 1300,
                            ease: 'Power1.easeIn',
                            onComplete: () => {
                                // 4. Set visible = false on Girl 1's container once off-screen
                                girl1.setVisible(false);
                                girl1.animator?.stopAll();
                                this.stopWalking(girl1);
                            }
                        });
                    });
                }

                // 4. Progression Flow: Transition to Choice 4 (Ring selection) smoothly without blocking input on Girl 1's exit
                this.scene.time.delayedCall(850, () => {
                    this.goToStep('step_choose_ring');
                });
            }
        };
    }

    _runStepFailEndWoman() {
        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_FAILED');
        }

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

        const bringGirl1In = () => {
            if (!girl1) {
                startMockeryAndExit();
                return;
            }

            if (girl1.visible) {
                girl1.animator?.playWalk({ speed: 0.6 });
                this.scene.tweens.add({
                    targets: girl1,
                    x: hero ? hero.x + 155 : girl1.x,
                    duration: 650,
                    ease: 'Power1.easeOut',
                    onComplete: () => {
                        girl1.animator?.stopAll();
                        girl1.animator?.playIdle();
                        girl1.setFace('idle');
                        this.scene.time.delayedCall(300, () => {
                            startMockeryAndExit();
                        });
                    }
                });
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
                        if (this.ui.videoOverlay && (window.App?.resources?.video?.pre_final || window.App?.resources?.videos?.pre_final)) {
                            this.ui.videoOverlay.startTransition();
                        } else {
                            if (this.ui.finalWindow) {
                                this.ui.finalWindow.show();
                            }
                            this._createFinaleButtons();
                        }
                    });
                });
            });
        };
    }

    _runStepChooseRing() {
        const step = this.story?.steps?.step_choose_ring;
        if (!step || !step.choices) return;

        const introChoiceY = UI_CONFIG?.choice_group?.positions_y?.multiple ?? 205;
        this.ui.choices?.showChoices(step.choices, {
            y: introChoiceY,
            balanceView: this.ui?.balance,
            allowNegativeBalance: true
        });

        this.ui.choices.onChoice = (choice) => {
            this.chosenRing = choice.id;

            // Immediately lock user input to prevent duplicate clicks
            if (this.ui.choices) {
                this.ui.choices.onChoice = null;
                this.ui.choices.disableAllInteractivity?.();
                this.ui.choices.hide?.(150);
            }

            const currentVal = this.ui.balance ? this.ui.balance.getValue() : 0;
            const price = Number(choice.price || 0);
            const finalBalance = currentVal - price;

            if (this.ui.balance && price) {
                // Deduct cash smoothly and skip plate bounce so it does not conflict with bankrupt animation
                this.ui.balance.subtract(price, 1100, true);
            }

            // Both negative and 0 balance trigger the bankrupt sequence
            if (finalBalance <= 0) {
                this._runBrokeSequence(() => {
                    this.goToStep('step_fail_end');
                });
            } else {
                this.goToStep('step_fail_end');
            }
        };
    }

    _runBrokeSequence(onComplete) {
        const balance = this.ui.balance;
        if (!balance) {
            if (onComplete) onComplete();
            return;
        }

        if (this._brokeText) {
            this.scene.tweens.killTweensOf(this._brokeText);
            this._brokeText.destroy();
            this._brokeText = null;
        }

        balance.ignoreResize = true;
        balance.setDepth(200);
        this.scene.tweens.killTweensOf(balance);

        // Center coordinates in mainContainer (600x900 coordinate space)
        const screenCenterX = 300;
        const brokeTextY = 385;
        const balanceTargetY = 485;

        const baseScale = balance.uiScale || 1;
        const targetScale = baseScale * 1.35;

        // 1. Reposition Balance Container: Smooth slide from top to screen center (5x slower: 1100ms)
        this.scene.tweens.add({
            targets: balance,
            x: screenCenterX,
            y: balanceTargetY,
            scaleX: targetScale,
            scaleY: targetScale,
            duration: 1100,
            ease: 'Cubic.easeOut'
        });

        // 2. Display "Broke!" Text: Spawn stylized single text centered directly above balance container
        const brokeText = this.scene.add.text(screenCenterX, brokeTextY, 'Broke!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '70px',
            fontStyle: 'bold',
            color: '#ff2222',
            stroke: '#140000',
            strokeThickness: 9,
            shadow: {
                offsetX: 0,
                offsetY: 6,
                color: '#ff0000',
                blur: 14,
                stroke: true,
                fill: true
            },
            align: 'center'
        }).setOrigin(0.5, 0.5);

        brokeText.setScale(0);
        brokeText.setAlpha(0);
        brokeText.setAngle(-6);
        brokeText.setDepth(205);

        if (this.scene.mainContainer) {
            this.scene.mainContainer.add(brokeText);
        }

        // Strictly ensure uiCamera ignores brokeText so only main camera renders it (prevents duplicate text)
        if (this.scene.uiCamera) {
            this.scene.uiCamera.ignore(brokeText);
        }

        this._brokeText = brokeText;

        // Beautiful punchy pop-up animation: scale 0 -> 1.25 -> 1.0 with subtle angle settle (5x slower: 700ms + 350ms)
        this.scene.tweens.add({
            targets: brokeText,
            scaleX: 1.25,
            scaleY: 1.25,
            alpha: 1,
            angle: 2,
            duration: 700,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: brokeText,
                    scaleX: 1.0,
                    scaleY: 1.0,
                    angle: 0,
                    duration: 350,
                    ease: 'Quad.easeOut'
                });
            }
        });

        // 3. Audio Alert & Flashing Pulses (5x slower: 275ms per flash)
        try {
            Utils.addAudio(this.scene, 'error', 1.0);
        } catch (e) { }

        let flashCount = 0;
        const flashTimer = this.scene.time.addEvent({
            delay: 275,
            repeat: 7, // 4 red pulse cycles
            callback: () => {
                flashCount++;
                const isRed = flashCount % 2 === 1;
                if (isRed) {
                    balance.plateBg?.setTint(0xff2222);
                    balance.coinIcon?.setTint(0xff2222);
                    balance.balanceText?.setColor('#ff2222');
                    balance.cashLabel?.setColor('#ff2222');
                    balance.scaleX = targetScale * 1.04;
                    balance.scaleY = targetScale * 1.04;
                    if (this._brokeText) {
                        this._brokeText.scaleX = 1.05;
                        this._brokeText.scaleY = 1.05;
                    }
                } else {
                    balance.plateBg?.clearTint();
                    balance.coinIcon?.clearTint();
                    balance.balanceText?.setColor('#ffffff');
                    balance.cashLabel?.setColor('#ffea00');
                    balance.scaleX = targetScale;
                    balance.scaleY = targetScale;
                    if (this._brokeText) {
                        this._brokeText.scaleX = 1.0;
                        this._brokeText.scaleY = 1.0;
                    }
                }
            }
        });

        // 4. Fade Out & Fail Transition (5x slower hold: 2500ms, fade duration: 800ms)
        this.scene.time.delayedCall(2500, () => {
            this.scene.tweens.add({
                targets: [brokeText, balance],
                alpha: 0,
                duration: 800,
                ease: 'Quad.easeIn',
                onComplete: () => {
                    if (flashTimer) flashTimer.remove();
                    if (this._brokeText) {
                        this._brokeText.destroy();
                        this._brokeText = null;
                    }
                    balance.setVisible(false);
                    balance.alpha = 1;
                    balance.ignoreResize = false;
                    if (typeof balance.restoreRestingPosition === 'function') {
                        balance.restoreRestingPosition();
                    }
                    balance.plateBg?.clearTint();
                    balance.coinIcon?.clearTint();
                    if (onComplete) onComplete();
                }
            });
        });
    }

    _runStepFailEnd() {
        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_FAILED');
        }

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
                                    if (this.ui.videoOverlay && (window.App?.resources?.video?.pre_final || window.App?.resources?.videos?.pre_final)) {
                                        this.ui.videoOverlay.startTransition();
                                    } else {
                                        if (this.ui.finalWindow) {
                                            this.ui.finalWindow.show();
                                        }
                                        this._createFinaleButtons();
                                    }
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
            py: 196, // Raised by 1.5 button heights (was 320; 320 - 124 = 196)
            lx: -140,
            ly: 290,
            pScaleX: 0,
            pScaleY: 0,
            lScaleX: 0,
            lScaleY: 0,
            depth: 110,
            callback: () => {
                if (typeof window.trackAxonEvent === 'function') {
                    window.trackAxonEvent('CHALLENGE_RETRY');
                }
                this._onCta();
            }
        });

        // Right button: RESTART (red)
        this.btnRestart = new Button({
            scene: this.scene,
            container: container,
            texture: 'btn_restart_red',
            text: '',
            align: 'Center',
            px: 120,
            py: 196, // Raised by 1.5 button heights (was 320; 320 - 124 = 196)
            lx: 140,
            ly: 290,
            pScaleX: 0,
            pScaleY: 0,
            lScaleX: 0,
            lScaleY: 0,
            depth: 110,
            callback: () => {
                if (typeof window.trackAxonEvent === 'function') {
                    window.trackAxonEvent('CHALLENGE_RETRY');
                }
                this._onCta();
            }
        });

        this.finaleButtons = [this.btnTryAgain, this.btnRestart];

        if (this.ui.finalWindow && typeof this.ui.finalWindow.setButtons === 'function') {
            this.ui.finalWindow.setButtons(this.finaleButtons);
        }

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
            // In house scene or non-road locations, ensure hero, girl2, and girl1 maintain their ground baselines
            const hero = this.puppets?.hero;
            const girl2 = this.puppets?.girl_2;
            const girl1 = this.puppets?.girl_1;
            if (hero && hero.visible) {
                hero.y = this.heroGroundY;
            }
            if (girl2 && girl2.visible) {
                girl2.y = this.girl2GroundY;
                girl2.setDepth(28); // Behind Hero (depth 30)
            }
            if (girl1 && girl1.visible && this.currentStepId === 'step_choose_woman') {
                girl1.y = this.groundY + (girl1.baseYOffset || 0);
                girl1.setDepth(29);
            }
        }

        // 2b. Recompute Business Center & Golden Toilet positions relative to road_bg on resize
        const roadX = this.story?.locations?.road_bg?.x ?? 0;

        if (this.doorContainer && this.doorContainer.active) {
            this.doorContainer.x = this.doorwayX !== undefined ? this.doorwayX : 24;
            this.doorContainer.y = this.doorwayY !== undefined ? this.doorwayY : 241;
            this.doorContainer.setScale(this.bcScale !== undefined ? this.bcScale : 1.72);
        }
        if (this.portalFrame && this.portalFrame.active) {
            this.portalFrame.x = this.doorwayX !== undefined ? this.doorwayX : 24;
            this.portalFrame.y = this.doorwayY !== undefined ? this.doorwayY : 241;
            this.portalFrame.setScale(this.bcScale !== undefined ? this.bcScale : 1.72);
        }
        if (this.carpetGraphics && this.carpetGraphics.active && this._carpetProgress !== undefined) {
            this._drawCarpet(this._carpetProgress);
        }

        if (this.building && this.building.active && !this.entranceContainer) {
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
        if (this.ui.finalWindow && typeof this.ui.finalWindow._clearHelperHand === 'function') {
            this.ui.finalWindow._clearHelperHand();
        }
        if (window.App && window.App.network) {
            window.App.network.ctaClick();
        }
    }
}
