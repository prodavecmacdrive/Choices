import Utils from "../core/framework/Utils";
import Button from "./Button";
import SETTINGS from "../final-window-settings.json";

export default class FinalWindow {
    constructor({ scene, container, onCta }) {
        this._scene = scene;
        this._container = container;
        this._onCta = onCta;
        this._lastCtaTime = 0;

        this._buildOverlay();
        this._buildButton();

        this.setVisible(false);
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

    show() {
        if (typeof window.trackAxonEvent === 'function') {
            window.trackAxonEvent('CHALLENGE_SOLVED');
            window.trackAxonEvent('ENDCARD_SHOWN');
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
