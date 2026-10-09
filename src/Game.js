import ParentScene from "../core/framework/components/Scene";
import Utils from "../core/framework/Utils";
import FinalWindow from "./FinalWindow";

import PuppetCharacter from "./puppet/PuppetCharacter";
import PuppetAnimator from "./puppet/PuppetAnimator";
import BalanceView from "./ui/BalanceView";
import ChoiceGroup from "./ui/ChoiceGroup";
import StoryController from "./story/StoryController";

import SKELETON_CONFIG from "./config/skeleton.json";
import HERO_CONFIG from "./config/character_hero.json";
import GIRL1_CONFIG from "./config/character_girl1.json";
import GIRL2_CONFIG from "./config/character_girl2.json";
import CLOWN_CONFIG from "./config/character_clown.json";
import MAN1_CONFIG from "./config/character_man1.json";
import FRIEND1_CONFIG from "./config/character_friend1.json";
import FRIEND2_CONFIG from "./config/character_friend2.json";
import FRIEND3_CONFIG from "./config/character_friend3.json";
import FRIEND4_CONFIG from "./config/character_friend4.json";
import FRIEND5_CONFIG from "./config/character_friend5.json";
import STORY_CONFIG from "./config/story.json";
import UI_CONFIG from "./config/ui.json";
import BASE_SETTINGS from "../game-settings.json";

export default class Game extends ParentScene {
    init(data) {
        this._sceneId = (data && data.sceneId)
            ? data.sceneId
            : (window.App?.stateManager ? window.App.stateManager.getNextScene() : (window.App?.flow && window.App.flow[0])) || 'scene-1';

        const sceneData = (window.App?.scenesData && window.App.scenesData[this._sceneId]) || {};
        this.SETTINGS = Object.assign({}, BASE_SETTINGS, sceneData);
    }

    create() {
        this.cameras.main.setBackgroundColor('#1a1a24');

        // 1. World container holding panoramic backgrounds and characters
        this.worldContainer = this.add.container(300, 450);
        this.worldContainer.ignoreResize = true;
        this.mainContainer.add(this.worldContainer);

        // 2. Continuous horizontal backgrounds layout based on texture width and scale
        const locs = STORY_CONFIG?.locations || {};

        const BG_ASSET_RATIO = 0.32;
        const BG_SCALE_COMPENSATION = 1 / BG_ASSET_RATIO; // 3.125 compensation for 32% asset downsizing

        const getScale = (cfg, def = 1.5625) => {
            let sx = cfg?.scale?.x !== undefined ? cfg.scale.x : (typeof cfg?.scale === 'number' ? cfg.scale : def);
            let sy = cfg?.scale?.y !== undefined ? cfg.scale.y : (typeof cfg?.scale === 'number' ? cfg.scale : def);
            if (sx <= 0.6) sx *= BG_SCALE_COMPENSATION;
            if (sy <= 0.6) sy *= BG_SCALE_COMPENSATION;
            return { x: sx, y: sy };
        };

        const getShift = (cfg) => {
            const sx = cfg?.shift?.x ?? (cfg?.shift_x !== undefined ? cfg.shift_x : (cfg?.x !== undefined ? cfg.x : 0));
            const sy = cfg?.shift?.y ?? (cfg?.shift_y !== undefined ? cfg.shift_y : (cfg?.y !== undefined ? cfg.y : 0));
            return { x: sx, y: sy };
        };

        // 1) Jewel Building Background: primary starting location
        const jewelCfg = locs.jewel_building_bg || {};
        const jewelScale = getScale(jewelCfg, 1.5625);
        const jewelShift = getShift(jewelCfg);
        const jewelBaseWidth = this.textures.get('jewel_building_bg')?.getSourceImage()?.width || 988;
        const jewelWidth = jewelBaseWidth * jewelScale.x;
        const jewelX = 0 + jewelShift.x;
        const jewelY = 0;
        this.jewelBg = this.add.image(jewelX, jewelY, 'jewel_building_bg').setScale(jewelScale.x, jewelScale.y);
        this.jewelBg.setDepth(0);
        this.worldContainer.add(this.jewelBg);

        // 2) House Background: placed seamlessly adjacent to Jewel Building
        const houseCfg = locs.luxury_house_bg || {};
        const houseScale = getScale(houseCfg, jewelScale.x);
        const houseShift = getShift(houseCfg);
        const houseBaseWidth = this.textures.get('luxury_house_bg')?.getSourceImage()?.width || 988;
        const houseWidth = houseBaseWidth * houseScale.x;
        const houseX = jewelX + (jewelWidth / 2) + (houseWidth / 2) + houseShift.x;
        const houseY = 0;
        this.houseBg = this.add.image(houseX, houseY, 'luxury_house_bg').setScale(houseScale.x, houseScale.y);
        this.houseBg.setDepth(0);
        this.worldContainer.add(this.houseBg);

        // Publish computed absolute coordinates and sizes into STORY_CONFIG.locations so all controllers dynamically use them
        if (!STORY_CONFIG.locations) STORY_CONFIG.locations = {};
        STORY_CONFIG.locations.jewel_building_bg = Object.assign({}, jewelCfg, { x: jewelX, y: jewelY, displayWidth: jewelWidth });
        STORY_CONFIG.locations.luxury_house_bg = Object.assign({}, houseCfg, { x: houseX, y: houseY, displayWidth: houseWidth });
        STORY_CONFIG.locations.simple_house_bg = Object.assign({}, locs.simple_house_bg || {}, { x: houseX, y: houseY, displayWidth: houseWidth });

        // 3. Characters (Puppets) setup
        const isPortrait = this.scale.width < this.scale.height;
        const portCfg = STORY_CONFIG?.portrait_multipliers || {};
        const landCfg = STORY_CONFIG?.landscape_multipliers || {};
        const currentMult = isPortrait ? portCfg : landCfg;
        const groundY = STORY_CONFIG.ground_y || 355;
        const heroYOffset = currentMult?.hero_y_offset !== undefined 
            ? currentMult.hero_y_offset 
            : (STORY_CONFIG.hero_y_offset !== undefined ? STORY_CONFIG.hero_y_offset : 26);

        const hero = new PuppetCharacter(this, jewelX, groundY + heroYOffset, SKELETON_CONFIG, HERO_CONFIG);
        hero.animator = new PuppetAnimator(this, hero);
        hero.setDepth(30);
        this.worldContainer.add(hero);

        const girl1 = new PuppetCharacter(this, jewelX - 420, groundY - 2, SKELETON_CONFIG, GIRL1_CONFIG);
        girl1.animator = new PuppetAnimator(this, girl1);
        girl1.setVisible(false);
        girl1.setDepth(21);
        this.worldContainer.add(girl1);

        const friend1 = new PuppetCharacter(this, jewelX - 490, groundY - 16, SKELETON_CONFIG, FRIEND1_CONFIG);
        friend1.animator = new PuppetAnimator(this, friend1);
        friend1.setVisible(false);
        friend1.setDepth(17);
        this.worldContainer.add(friend1);

        const friend2 = new PuppetCharacter(this, jewelX - 560, groundY + 6, SKELETON_CONFIG, FRIEND2_CONFIG);
        friend2.animator = new PuppetAnimator(this, friend2);
        friend2.setVisible(false);
        friend2.setDepth(23);
        this.worldContainer.add(friend2);

        const friend3 = new PuppetCharacter(this, jewelX + 420, groundY - 13, SKELETON_CONFIG, FRIEND3_CONFIG);
        friend3.animator = new PuppetAnimator(this, friend3);
        friend3.setVisible(false);
        friend3.setDepth(18);
        this.worldContainer.add(friend3);

        const friend4 = new PuppetCharacter(this, jewelX + 490, groundY + 9, SKELETON_CONFIG, FRIEND4_CONFIG);
        friend4.animator = new PuppetAnimator(this, friend4);
        friend4.setVisible(false);
        friend4.setDepth(25);
        this.worldContainer.add(friend4);

        const friend5 = new PuppetCharacter(this, jewelX + 560, groundY - 9, SKELETON_CONFIG, FRIEND5_CONFIG);
        friend5.animator = new PuppetAnimator(this, friend5);
        friend5.setVisible(false);
        friend5.setDepth(19);
        this.worldContainer.add(friend5);

        const man1 = new PuppetCharacter(this, jewelX + 360, groundY, SKELETON_CONFIG, MAN1_CONFIG);
        man1.animator = new PuppetAnimator(this, man1);
        man1.setVisible(false);
        man1.setDepth(20);
        this.worldContainer.add(man1);

        const girl2 = new PuppetCharacter(this, houseX + 360, groundY + heroYOffset + 38, SKELETON_CONFIG, GIRL2_CONFIG);
        girl2.animator = new PuppetAnimator(this, girl2);
        girl2.setVisible(false);
        girl2.setDepth(28);
        this.worldContainer.add(girl2);

        const clown = new PuppetCharacter(this, houseX + 800, groundY, SKELETON_CONFIG, CLOWN_CONFIG);
        clown.animator = new PuppetAnimator(this, clown);
        clown.setVisible(false);
        clown.setDepth(36);
        this.worldContainer.add(clown);

        if (typeof this.worldContainer.sort === 'function') {
            this.worldContainer.sort('depth');
        }

        const puppetsList = [
            { puppet: hero, facing: 1, baseTargetOffsetX: 0, baseYOffset: heroYOffset },
            { puppet: girl1, facing: 1, baseTargetOffsetX: -115, baseYOffset: -2 },
            { puppet: friend1, facing: 1, baseTargetOffsetX: -210, baseYOffset: -16 },
            { puppet: friend2, facing: 1, baseTargetOffsetX: -310, baseYOffset: 6 },
            { puppet: friend3, facing: -1, baseTargetOffsetX: 115, baseYOffset: -13 },
            { puppet: friend4, facing: -1, baseTargetOffsetX: 210, baseYOffset: 9 },
            { puppet: friend5, facing: -1, baseTargetOffsetX: 310, baseYOffset: -9 },
            { puppet: man1, facing: -1, baseTargetOffsetX: 360, baseYOffset: 0 },
            { puppet: girl2, facing: -1, baseTargetOffsetX: 360, baseYOffset: heroYOffset + 38 },
            { puppet: clown, facing: -1, baseTargetOffsetX: 750, baseYOffset: 76 }
        ];

        puppetsList.forEach((entry) => {
            const p = entry.puppet;
            if (!p) return;
            p.facing = entry.facing;
            p.baseTargetOffsetX = entry.baseTargetOffsetX;
            p.baseYOffset = entry.baseYOffset;
            p.baseRootScale = {
                x: Math.abs(p.skin?.rootScale?.x || 0.416),
                y: Math.abs(p.skin?.rootScale?.y || 0.416)
            };
        });

        const puppetsMap = {
            hero,
            girl_1: girl1,
            friend1,
            friend2,
            friend3,
            friend4,
            friend5,
            man_1: man1,
            girl_2: girl2,
            clown
        };

        // 4. Fixed screen UI components
        const balPos = UI_CONFIG?.balance?.position || { x: 450, y: 120 };
        const startBalance = this.SETTINGS?.economy?.start_balance ?? STORY_CONFIG.start_balance ?? 500000;
        this.balanceView = new BalanceView(this, balPos.x, balPos.y, startBalance);
        this.balanceView.ignoreResize = true;
        this.mainContainer.add(this.balanceView);

        const groupPos = UI_CONFIG?.choice_group?.position || { x: 300, y: 150 };
        const groupX = groupPos.x !== undefined ? groupPos.x : 300;
        const groupY = groupPos.y !== undefined ? groupPos.y : 150;
        this.choiceGroup = new ChoiceGroup(this, groupX, groupY, null, this.balanceView);
        this.choiceGroup.setDepth(160);
        this.choiceGroup.ignoreResize = true;
        this.mainContainer.add(this.choiceGroup);

        // Dedicated finale UI container decoupled from main camera zoom
        this.finaleContainer = this.add.container(0, 0);
        this.finaleContainer.setDepth(170);
        this.mainContainer.add(this.finaleContainer);

        this.finalWindow = new FinalWindow({
            scene: this,
            container: this.finaleContainer,
            onCta: () => this._onCta()
        });

        // Dedicated non-zoomed UI camera for FinalWindow and finale CTA buttons
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.setScroll(0, 0);
        this.uiCamera.setZoom(1.0);
        this.uiCamera.ignore([this.worldContainer, this.balanceView, this.choiceGroup]);
        this.cameras.main.ignore(this.finaleContainer);

        // 5. Story Controller
        this.storyController = new StoryController(this, STORY_CONFIG, puppetsMap, {
            balance: this.balanceView,
            choices: this.choiceGroup,
            finalWindow: this.finalWindow,
            worldContainer: this.worldContainer,
            setHouseBackground: (choiceId) => {
                const tex = (choiceId === 'choice_simple') ? 'simple_house_bg' : 'luxury_house_bg';
                const chosenCfg = locs[tex] || houseCfg;
                const chosenShift = getShift(chosenCfg);
                const currentScaleX = this.jewelBg ? this.jewelBg.scaleX : (getScale(chosenCfg, 1.5625).x);
                const currentScaleY = this.jewelBg ? this.jewelBg.scaleY : (getScale(chosenCfg, 1.5625).y);
                const chosenBaseWidth = this.textures.get(tex)?.getSourceImage()?.width || 988;
                const chosenWidth = chosenBaseWidth * currentScaleX;
                const currentJewelX = STORY_CONFIG.locations.jewel_building_bg?.x || jewelX;
                const currentJewelWidth = STORY_CONFIG.locations.jewel_building_bg?.displayWidth || jewelWidth;
                const currentHouseX = currentJewelX + (currentJewelWidth / 2) + (chosenWidth / 2) + chosenShift.x;
                const currentHouseY = this.jewelBg ? this.jewelBg.y : 0;

                if (this.houseBg) {
                    this.houseBg.setTexture(tex);
                    this.houseBg.setScale(currentScaleX, currentScaleY);
                    this.houseBg.setX(currentHouseX);
                    this.houseBg.setY(currentHouseY);
                }
                if (STORY_CONFIG.locations[tex]) {
                    STORY_CONFIG.locations[tex].x = currentHouseX;
                    STORY_CONFIG.locations[tex].y = currentHouseY;
                    STORY_CONFIG.locations[tex].displayWidth = chosenWidth;
                }
            }
        });

        // Initialize world scale, ground-level anchoring, and crowd layout for current orientation
        this.onResize();

        this.storyController.start();
    }

    onResize() {
        const width = this.scale.width;
        const height = this.scale.height;
        if (!width || !height) return;

        if (this.uiCamera) {
            this.uiCamera.setViewport(0, 0, width, height);
            this.uiCamera.setSize(width, height);
            this.uiCamera.setScroll(0, 0);
            this.uiCamera.setZoom(1.0);
        }

        // Cleanly resolve and fast-forward in-flight transitions on orientation/resize change before layout recalculation
        if (this.storyController && this.storyController.isTransitioning) {
            this.storyController.fastForwardTransition();
        }

        const isPortrait = width < height;
        const appScale = Math.min(width / 600, height / 900);
        if (!appScale) return;

        const screenWidth = width / appScale;
        const screenHeight = height / appScale;

        const locs = STORY_CONFIG?.locations || {};
        const portCfg = STORY_CONFIG?.portrait_multipliers || {};
        const landCfg = STORY_CONFIG?.landscape_multipliers || {};

        const BG_ASSET_RATIO = 0.32;
        const BG_SCALE_COMPENSATION = 1 / BG_ASSET_RATIO; // 3.125
        const getScale = (cfg, def = 1.5625) => {
            let sx = cfg?.scale?.x ?? (cfg?.scale_x !== undefined ? cfg.scale_x : (typeof cfg?.scale === 'number' ? cfg.scale : def));
            let sy = cfg?.scale?.y ?? (cfg?.scale_y !== undefined ? cfg.scale_y : (typeof cfg?.scale === 'number' ? cfg.scale : def));
            if (sx <= 0.6) sx *= BG_SCALE_COMPENSATION;
            if (sy <= 0.6) sy *= BG_SCALE_COMPENSATION;
            return { x: sx, y: sy };
        };

        // 1. Background dimensions & world scaling
        // Backgrounds use ONE fixed scale (never scaled separately from the game world).
        // The whole worldContainer is scaled so the background covers the screen:
        //  - portrait: fit background height to screen height
        //  - landscape: fit background width to screen width
        const jewelCfg = locs.jewel_building_bg || {};
        const jewelBaseWidth = this.textures.get('jewel_building_bg')?.getSourceImage()?.width || 988;
        const jewelBaseHeight = this.textures.get('jewel_building_bg')?.getSourceImage()?.height || 982;

        const jewelScale = getScale(jewelCfg, 1.5625);
        const bgScaleX = jewelScale.x;
        const bgScaleY = jewelScale.y;

        const worldScale = isPortrait
            ? screenHeight / (jewelBaseHeight * bgScaleY)
            : screenWidth / (jewelBaseWidth * bgScaleX);

        if (this.worldContainer) {
            this.worldContainer.setScale(worldScale);
        }

        // All backgrounds share the same horizon: vertically centered in worldContainer (y = 0)
        const bgY = 0;

        // 2. Ground Baseline (groundY) calculation:
        // Single source of truth for character placement: distance (in texture px) from the
        // background center down to the sidewalk line where characters stand.
        // In 32% resolution assets (height ~982px, center at 491px), distance is 182.4px
        // (corresponding to 570px in 100% assets).
        const rawGroundTexY = STORY_CONFIG?.ground_texture_y ?? 227.2;
        const groundTexY = rawGroundTexY > 300 ? (rawGroundTexY * 0.32) : rawGroundTexY;
        const groundY = Math.round(bgY + (groundTexY * bgScaleY));
        STORY_CONFIG.ground_y = groundY;
        const currentMult = isPortrait ? portCfg : landCfg;
        const heroYOffset = currentMult?.hero_y_offset !== undefined
            ? currentMult.hero_y_offset
            : (STORY_CONFIG?.hero_y_offset !== undefined ? STORY_CONFIG.hero_y_offset : 26);
        if (this.storyController) {
            this.storyController.groundY = groundY;
            this.storyController.heroGroundY = groundY + heroYOffset;
            this.storyController.girl2YOffset = 38;
            this.storyController.girl2GroundY = groundY + heroYOffset + 38;
        }

        // 3. Update adjacent continuous horizontal backgrounds using identical anchoring logic
        const jewelWidth = jewelBaseWidth * bgScaleX;
        const jewelShiftX = jewelCfg.shift?.x || 0;
        const jewelShiftY = bgY;
        const jewelX = 0 + jewelShiftX;
        if (this.jewelBg) {
            this.jewelBg.setScale(bgScaleX, bgScaleY);
            this.jewelBg.setPosition(jewelX, jewelShiftY);
        }

        const chosenHouse = this.storyController?.chosenHouse;
        const houseKey = (chosenHouse === 'choice_simple') ? 'simple_house_bg' : 'luxury_house_bg';
        const houseCfg = locs[houseKey] || locs.luxury_house_bg || {};
        const houseBaseWidth = this.textures.get(houseKey)?.getSourceImage()?.width || 988;
        const houseWidth = houseBaseWidth * bgScaleX;
        const houseShiftX = houseCfg.shift?.x || 0;
        const houseShiftY = bgY;
        const houseX = jewelX + (jewelWidth / 2) + (houseWidth / 2) + houseShiftX;
        if (this.houseBg) {
            this.houseBg.setScale(bgScaleX, bgScaleY);
            this.houseBg.setPosition(houseX, houseShiftY);
        }

        // Publish updated coordinates into STORY_CONFIG.locations
        STORY_CONFIG.locations.jewel_building_bg = Object.assign({}, jewelCfg, { x: jewelX, y: jewelShiftY, displayWidth: jewelWidth });
        STORY_CONFIG.locations.luxury_house_bg = Object.assign({}, locs.luxury_house_bg, { x: houseX, y: houseShiftY, displayWidth: houseWidth });
        STORY_CONFIG.locations.simple_house_bg = Object.assign({}, locs.simple_house_bg, { x: houseX, y: houseShiftY, displayWidth: houseWidth });

        // 4. Update Story Controller layout (characters, offsets, crowd spacing, UI)
        if (this.storyController && typeof this.storyController.updateLayout === 'function') {
            this.storyController.updateLayout(isPortrait);
        }

        // 5. Update UI elements layout
        if (this.balanceView && typeof this.balanceView.updateLayout === 'function') {
            this.balanceView.updateLayout(isPortrait, screenWidth, screenHeight);
        }
        if (this.choiceGroup && typeof this.choiceGroup.updateLayout === 'function') {
            this.choiceGroup.updateLayout(isPortrait, screenWidth, screenHeight);
        }
    }

    _onCta() {
        if (window.App && window.App.network) {
            window.App.network.ctaClick();
        }
    }
}
