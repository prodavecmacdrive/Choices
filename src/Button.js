import Utils from "../core/framework/Utils";

export default class Button extends Phaser.GameObjects.Container {
    constructor({
        scene,
        texture = "ui_button",
        text,
        textStyle,
        px = 0,
        py = 0,
        lx = 0,
        ly = 0,
        pScaleX = 1,
        pScaleY = 1,
        lScaleX = 1,
        lScaleY = 1,
        callback,
        align = "Center",
        depth = 10,
        container
    }) {
        super(scene, 0, 0);
        this.scene = scene;
        this.callback = callback;
        this.enabled = true;

        this._createButton(texture, text, textStyle);
        this.setDepth(depth);

        this.addProperties(["pos", "scale"]);
        this.px = px;
        this.py = py;
        this.lx = lx;
        this.ly = ly;
        this.pScaleX = pScaleX;
        this.pScaleY = pScaleY;
        this.lScaleX = lScaleX;
        this.lScaleY = lScaleY;

        this.setCustomPosition(0, 0).setAlign(align);

        if (container) {
            container.add(this);
        }
    }

    _createButton(texture, text, textStyle) {
        this.buttonImage = this.scene.add.image(0, 0, texture);
        this.buttonImage.setInteractive({ useHandCursor: true });
        this.buttonImage.on("pointerdown", this.onClick, this);
        this.add(this.buttonImage);

        if (text) {
            const defaultTextStyle = {
                fontFamily: "Arial, sans-serif",
                fontSize: "48px",
                fontStyle: "bold",
                color: "#ffffff",
                stroke: "#074512",
                strokeThickness: 5,
                align: "center"
            };
            this.label = this.scene.add.text(0, 0, text, Object.assign({}, defaultTextStyle, textStyle));
            this.label.setOrigin(0.5, 0.5);
            this.add(this.label);
        }
    }

    onClick() {
        if (!this.enabled) return;

        try {
            Utils.addAudio(this.scene, 'click', 1.0);
        } catch (e) {}

        this.disableClick();

        const curPX = this.pScaleX;
        const curPY = this.pScaleY;
        const curLX = this.lScaleX;
        const curLY = this.lScaleY;

        this.scene.tweens.add({
            targets: this,
            pScaleX: curPX * 0.92,
            pScaleY: curPY * 0.92,
            lScaleX: curLX * 0.92,
            lScaleY: curLY * 0.92,
            duration: 70,
            yoyo: true,
            ease: "Quad.easeInOut",
            onComplete: () => {
                this.enableClick();
                if (this.callback) {
                    this.callback();
                }
            }
        });
    }

    disableClick() {
        this.enabled = false;
    }

    enableClick() {
        this.enabled = true;
    }

    setText(text) {
        if (this.label) {
            this.label.setText(text);
        }
    }
}