import Utils from "../core/framework/Utils";
import ParentScene from "../core/framework/components/Scene";
import SETTINGS from "../transition-screen-settings.json";

export default class TransitionScene extends ParentScene {
    constructor() {
        super('TransitionScene');
    }

    create() {
        if (this.mainContainer) {
            this._isTransitioning = false;
            this.mainContainer.removeAll(true);
        }

        this._buildUI();

        this.scale.on('resize', this._onResize, this);

        this.events.once('shutdown', () => {
            this.scale.off('resize', this._onResize, this);
        });
    }

    _buildUI() {
        let available = window.App.stateManager.getAvailableScenes();
        if (window.App.isDev && SETTINGS.devLevelButtons && typeof SETTINGS.devLevelButtons === 'object') {
            available = Object.keys(SETTINGS.devLevelButtons).filter((sceneId) => SETTINGS.devLevelButtons[sceneId]);
        }

        const background = this.add.graphics();
        const backgroundColor = (SETTINGS.background && SETTINGS.background.color) ? SETTINGS.background.color : '#000000';
        const backgroundAlpha = (SETTINGS.background && typeof SETTINGS.background.alpha === 'number') ? SETTINGS.background.alpha : 1;
        background.fillStyle(parseInt(backgroundColor.replace('#', ''), 16), backgroundAlpha);
        background.fillRect(-3000, -3000, 6000, 6000);
        background.setCustomPosition(0, 0);
        background.setDepth(10);
        this.mainContainer.add(background);

        const titleStyle = {
            fontFamily: SETTINGS.title?.fontFamily || 'tt rounds neue trial bold',
            fontSize: SETTINGS.title?.fontSize || '40px',
            color: SETTINGS.title?.color || '#ffffff',
            align: 'center'
        };

        const title = this.add.text(0, 0, SETTINGS.title?.text || 'Next', titleStyle)
            .setOrigin(0.5, 0.5).setDepth(20);
        title.addProperties(['pos']);
        title.px = 0; title.py = SETTINGS.title?.y || -100;
        title.lx = 0; title.ly = SETTINGS.title?.y || -100;
        this.mainContainer.add(title);

        const count = available.length;
        const spacing = SETTINGS.buttons?.spacing || 100;
        const totalWidth = (count - 1) * spacing;
        const startX = -totalWidth / 2;

        this._buttons = [];

        available.forEach((sceneId, i) => {
            const bx = startX + i * spacing;

            const btn = this.add.image(0, 0, 'ui_button')
                .setScale(0.4)
                .setDepth(20)
                .setInteractive({ useHandCursor: true });

            const labelText = SETTINGS.sceneButtonLabels?.[sceneId] || sceneId;
            const label = this.add.text(0, 0, labelText, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '24px',
                fontStyle: 'bold',
                color: '#ffffff',
                align: 'center'
            }).setDepth(21).setOrigin(0.5, 0.5);

            label.addProperties(['pos']);
            label.px = bx;
            label.py = (SETTINGS.buttons?.y || 100);
            label.lx = bx;
            label.ly = (SETTINGS.buttons?.y || 100);
            this.mainContainer.add(label);
            btn._label = label;

            btn.addProperties(['pos']);
            btn.px = bx; btn.py = (SETTINGS.buttons?.y || 100);
            btn.lx = bx; btn.ly = (SETTINGS.buttons?.y || 100);
            this.mainContainer.add(btn);
            this._buttons.push(btn);

            if (typeof this.mainContainer.sort === 'function') {
                this.mainContainer.sort('depth');
            }

            btn.on('pointerdown', () => {
                Utils.addAudio(this, 'click', 1.5);
                this._selectScene(sceneId, btn);
            });
        });
    }

    _selectScene(sceneId, clickedButton) {
        if (this._isTransitioning) return;
        this._isTransitioning = true;
        if (!window.App._challengeStarted) {
            window.App._challengeStarted = true;
            if (typeof window.trackAxonEvent === 'function') window.trackAxonEvent('CHALLENGE_STARTED');
        }

        if (this._buttons) {
            this._buttons.forEach((btn) => btn.disableInteractive());
        }

        this.tweens.add({
            targets: this.mainContainer,
            alpha: 0,
            duration: 300,
            ease: 'Power1.Out',
            onComplete: () => {
                this.scene.start('Game', { sceneId });
            }
        });
    }

    _onResize() {
        if (!this.game || !this.mainContainer) return;
        if (typeof this.game.resizeObj === 'function') {
            this.game.resizeObj(this.mainContainer);
        }
    }
}