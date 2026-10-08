import UI_CONFIG from '../config/ui.json';
import LOCALIZATION from '../config/localization.json';
import Utils from '../../core/framework/Utils';

export default class BalanceView extends Phaser.GameObjects.Container {
    constructor(scene, x, y, initialBalance = 500000) {
        const defPos = UI_CONFIG?.balance?.position || { x: 400, y: 300 };
        const posX = x !== undefined ? x : defPos.x;
        const posY = y !== undefined ? y : defPos.y;
        super(scene, posX, posY);

        this.scene = scene;
        this.currentBalance = initialBalance;
        this.currentTween = null;

        this.ignoreResize = true;
        this.baseX = posX;
        this.setPosition(posX, posY);
        this.setDepth(150);

        this._buildUI();

        scene.add.existing(this);
    }

    _buildUI() {
        const balCfg = UI_CONFIG?.balance || {};
        const bgCfg = balCfg.background || {};
        const iconCfg = balCfg.icon || {};
        const labelCfg = balCfg.label || {};
        const textCfg = balCfg.text || {};

        const bgKey = (typeof bgCfg === 'string' ? bgCfg : bgCfg.texture) || 'bg_balance_plate';
        const bgX = bgCfg.x !== undefined ? bgCfg.x : 0;
        const bgY = bgCfg.y !== undefined ? bgCfg.y : 0;
        const bgScaleX = bgCfg.scale?.x !== undefined ? bgCfg.scale.x : (typeof bgCfg.scale === 'number' ? bgCfg.scale : 0.68);
        const bgScaleY = bgCfg.scale?.y !== undefined ? bgCfg.scale.y : (typeof bgCfg.scale === 'number' ? bgCfg.scale : 0.68);

        // 1. Plate background
        this.plateBg = this.scene.add.image(bgX, bgY, bgKey);
        this.plateBg.setScale(bgScaleX, bgScaleY);
        this.add(this.plateBg);

        // 2. Gold Coin Icon
        const iconKey = (typeof iconCfg === 'string' ? iconCfg : iconCfg.texture) || 'icon_coin_gold';
        const iconX = iconCfg.x !== undefined ? iconCfg.x : -90;
        const iconY = iconCfg.y !== undefined ? iconCfg.y : 0;
        const iconScaleX = iconCfg.scale?.x !== undefined ? iconCfg.scale.x : (typeof iconCfg.scale === 'number' ? iconCfg.scale : 0.44);
        const iconScaleY = iconCfg.scale?.y !== undefined ? iconCfg.scale.y : (typeof iconCfg.scale === 'number' ? iconCfg.scale : 0.44);

        this._coinIconScaleBase = iconScaleX;
        this.coinIcon = this.scene.add.image(iconX, iconY, iconKey);
        this.coinIcon.setScale(iconScaleX, iconScaleY);
        this.add(this.coinIcon);

        // 3. "CASH" Label
        const labelCash = LOCALIZATION?.en?.LABEL_CASH || 'CASH';
        const labelX = labelCfg.x !== undefined ? labelCfg.x : 18;
        const labelY = labelCfg.y !== undefined ? labelCfg.y : -25;
        const labelStyle = labelCfg.style || {
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#ffea00',
            stroke: '#291b00',
            strokeThickness: 3,
            align: 'center'
        };
        this.cashLabel = this.scene.add.text(labelX, labelY, labelCash, labelStyle).setOrigin(0.5, 0.5);
        this.add(this.cashLabel);

        // 4. Dynamic Cash Text
        const textX = textCfg.x !== undefined ? textCfg.x : 18;
        const textY = textCfg.y !== undefined ? textCfg.y : 1;
        const textStyle = textCfg.style || {
            fontFamily: 'Arial, sans-serif',
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#141414',
            strokeThickness: 4,
            align: 'center'
        };
        this.balanceText = this.scene.add.text(textX, textY, this.formatCash(this.currentBalance), textStyle).setOrigin(0.5, 0.5);
        this.add(this.balanceText);
    }

    updateLayout(isPortrait, screenWidth, screenHeight) {
        const balCfg = UI_CONFIG?.balance?.position || {};
        let targetX = 450;
        let targetY = 120;

        if (isPortrait) {
            targetX = balCfg.portrait?.x ?? balCfg.x ?? 440;
            targetY = balCfg.portrait?.y ?? balCfg.y ?? 120;
        } else {
            targetX = balCfg.landscape?.x ?? balCfg.x ?? 460;
            targetY = balCfg.landscape?.y ?? balCfg.y ?? 80;
        }

        this.baseX = targetX;
        this.setPosition(targetX, targetY);
    }

    formatCash(val) {
        const num = Math.max(0, Math.round(val));
        return '' + num.toLocaleString('en-US').replace(/,/g, ' ');
    }

    getValue() {
        return this.currentBalance;
    }

    setValue(val, animate = false) {
        if (!animate) {
            this.setBalance(val);
        } else {
            const diff = val - this.currentBalance;
            if (diff >= 0) {
                this.addCash(diff);
            } else {
                this.subtract(-diff);
            }
        }
    }

    subtract(amount, duration = 650) {
        const startVal = this.currentBalance;
        const targetVal = Math.max(0, startVal - amount);
        this.currentBalance = targetVal;

        try {
            Utils.addAudio(this.scene, 'money_spend', 1.0);
        } catch (e) { }

        if (this.currentTween) {
            this.currentTween.stop();
        }

        // Plate bounce animation
        this.scene.tweens.killTweensOf(this);
        this.setScale(1);
        this.scene.tweens.add({
            targets: this,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 120,
            yoyo: true,
            ease: 'Sine.easeOut',
            onComplete: () => {
                this.setScale(1);
            }
        });

        // Visible falling coin particles on spend
        this._spawnCoinDrop();

        const counterObj = { val: startVal };
        this.currentTween = this.scene.tweens.add({
            targets: counterObj,
            val: targetVal,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => {
                if (this.balanceText) {
                    this.balanceText.setText(this.formatCash(counterObj.val));
                }
            },
            onComplete: () => {
                if (this.balanceText) {
                    this.balanceText.setText(this.formatCash(targetVal));
                }
            }
        });
    }

    addCash(amount, duration = 1200) {
        if (!amount) return;
        const startVal = this.currentBalance;
        const targetVal = startVal + amount;
        this.currentBalance = targetVal;

        if (this.currentTween) {
            this.currentTween.stop();
        }

        this._pulseCoinIcon();

        const counterObj = { val: startVal };
        this.currentTween = this.scene.tweens.add({
            targets: counterObj,
            val: targetVal,
            duration: duration,
            ease: 'Power2.easeOut',
            onUpdate: () => {
                if (this.balanceText) {
                    this.balanceText.setText(this.formatCash(counterObj.val));
                }
            },
            onComplete: () => {
                if (this.balanceText) {
                    this.balanceText.setText(this.formatCash(targetVal));
                }
            }
        });
    }

    _pulseCoinIcon() {
        if (!this.coinIcon) return;
        this.scene.tweens.killTweensOf(this.coinIcon);
        const base = this._coinIconScaleBase || 0.44;
        this.coinIcon.setScale(base);
        if (typeof this.coinIcon.setTint === 'function') {
            this.coinIcon.setTint(0xaaff66);
        }

        this.scene.tweens.add({
            targets: this.coinIcon,
            scaleX: base * 1.35,
            scaleY: base * 1.35,
            duration: 160,
            yoyo: true,
            ease: 'Back.easeOut',
            onComplete: () => {
                if (this.coinIcon) {
                    this.coinIcon.setScale(base);
                    if (typeof this.coinIcon.clearTint === 'function') {
                        this.coinIcon.clearTint();
                    }
                }
            }
        });
    }

    setBalance(value) {
        this.currentBalance = Math.max(0, Math.round(value));
        if (this.balanceText) {
            this.balanceText.setText(this.formatCash(this.currentBalance));
        }
    }

    flashInsufficientFunds() {
        // Stop any active tweens on BalanceView container
        this.scene.tweens.killTweensOf(this);
        if (this._flashResetTimer) {
            this._flashResetTimer.remove();
            this._flashResetTimer = null;
        }

        // Strictly restore resting base coordinates & scale immediately
        const restingX = this.baseX !== undefined ? this.baseX : this.x;
        this.x = restingX;
        this.setScale(1);

        // 1. Red Flash on plate, coin, and texts
        if (this.plateBg && typeof this.plateBg.setTint === 'function') {
            this.plateBg.setTint(0xff3333);
        }
        if (this.coinIcon && typeof this.coinIcon.setTint === 'function') {
            this.coinIcon.setTint(0xff3333);
        }
        if (this.balanceText && typeof this.balanceText.setColor === 'function') {
            this.balanceText.setColor('#ff3333');
        }
        if (this.cashLabel && typeof this.cashLabel.setColor === 'function') {
            this.cashLabel.setColor('#ff3333');
        }

        // Return to original colors over ~300ms
        this._flashResetTimer = this.scene.time.delayedCall(300, () => {
            if (this.plateBg && typeof this.plateBg.clearTint === 'function') {
                this.plateBg.clearTint();
            }
            if (this.coinIcon && typeof this.coinIcon.clearTint === 'function') {
                this.coinIcon.clearTint();
            }
            if (this.balanceText && typeof this.balanceText.setColor === 'function') {
                this.balanceText.setColor('#ffffff');
            }
            if (this.cashLabel && typeof this.cashLabel.setColor === 'function') {
                this.cashLabel.setColor('#ffea00');
            }
            this.x = restingX;
            this._flashResetTimer = null;
        });

        // 2. Horizontal Shake (Wobble) using standard Phaser 3.50 tweens.add
        const shakeOffset = 7;
        this.x = restingX - shakeOffset;

        this.scene.tweens.add({
            targets: this,
            x: restingX + shakeOffset,
            duration: 40,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.x = restingX;
            }
        });
    }

    /**
     * Spawn noticeable coin images that scatter and drop from the coin icon when money is spent.
     * Tuned to be clearly visible and not disappear too quickly.
     */
    _spawnCoinDrop() {
        const iconCfg = UI_CONFIG?.balance?.icon || {};
        const localIconX = iconCfg.x !== undefined ? iconCfg.x : -90;
        const localIconY = iconCfg.y !== undefined ? iconCfg.y : 0;

        const originX = this.x + localIconX;
        const originY = this.y + localIconY;

        const parent = this.parentContainer || this.scene;
        const count = 6;

        for (let i = 0; i < count; i++) {
            const coin = this.scene.add.image(originX, originY, 'icon_coin_gold');
            coin.setScale(0.38 + Math.random() * 0.12);
            coin.setDepth(300);
            if (parent !== this.scene && typeof parent.add === 'function') {
                parent.add(coin);
            }

            const angle = -60 + (120 / (count - 1)) * i + (Math.random() - 0.5) * 20;
            const rad = (angle * Math.PI) / 180;
            const dist = 70 + Math.random() * 50;
            const tx = originX + Math.cos(rad) * dist * 0.5;
            const ty = originY + Math.sin(rad) * dist + 120;

            this.scene.tweens.add({
                targets: coin,
                x: tx,
                y: ty,
                angle: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
                scaleX: 0.18,
                scaleY: 0.18,
                alpha: { from: 1, to: 0 },
                duration: 950 + Math.random() * 300,
                ease: 'Quad.easeIn',
                delay: i * 45,
                onComplete: () => {
                    coin.destroy();
                }
            });
        }
    }

    /**
     * Animate spinning coins flying from a position in mainContainer coordinates
     * to the balance coin icon, then award the given amount.
     */
    spawnCoinFlyIn(fromX, fromY, amount, coinCount = 8) {
        const iconCfg = UI_CONFIG?.balance?.icon || {};
        const localIconX = iconCfg.x !== undefined ? iconCfg.x : -90;
        const localIconY = iconCfg.y !== undefined ? iconCfg.y : 0;
        const targetX = this.x + localIconX;
        const targetY = this.y + localIconY;

        const parent = this.parentContainer || this.scene;
        let arrivalsLeft = coinCount;

        for (let i = 0; i < coinCount; i++) {
            const delay = i * 80 + Math.random() * 50;
            const spreadX = (Math.random() - 0.5) * 50;
            const spreadY = (Math.random() - 0.5) * 40;

            const coin = this.scene.add.image(fromX + spreadX, fromY + spreadY, 'icon_coin_gold');
            coin.setScale(0.18);
            coin.setDepth(300);
            coin.setAlpha(0);
            if (parent !== this.scene && typeof parent.add === 'function') {
                parent.add(coin);
            }

            // Pop in
            this.scene.tweens.add({
                targets: coin,
                alpha: 1,
                scaleX: 0.32,
                scaleY: 0.32,
                duration: 120,
                delay: delay,
                ease: 'Back.easeOut',
                onStart: () => {
                    try {
                        Utils.addAudio(this.scene, 'coins_reward', 0.65);
                    } catch (e) { }
                }
            });

            // Spin continuously
            this.scene.tweens.add({
                targets: coin,
                angle: 360,
                duration: 300,
                repeat: -1,
                ease: 'Linear',
                delay: delay
            });

            // Arc toward the coin icon
            const flyDuration = 520 + Math.random() * 160;
            this.scene.time.delayedCall(delay + 120, () => {
                if (!coin || !coin.active) return;

                const midX = (fromX + targetX) / 2 + (Math.random() - 0.5) * 60;
                const midY = Math.min(fromY, targetY) - 80 - Math.random() * 60;

                this.scene.tweens.add({
                    targets: coin,
                    x: midX,
                    y: midY,
                    scaleX: 0.26,
                    scaleY: 0.26,
                    duration: flyDuration * 0.45,
                    ease: 'Power1.easeOut',
                    onComplete: () => {
                        if (!coin || !coin.active) return;
                        this.scene.tweens.add({
                            targets: coin,
                            x: targetX,
                            y: targetY,
                            scaleX: 0.12,
                            scaleY: 0.12,
                            alpha: 0.6,
                            duration: flyDuration * 0.55,
                            ease: 'Power2.easeIn',
                            onComplete: () => {
                                coin.destroy();
                                arrivalsLeft--;
                                this._pulseCoinIcon();
                                if (arrivalsLeft === 0) {
                                    if (amount > 0) {
                                        this.addCash(amount, 1200);
                                    }
                                }
                            }
                        });
                    }
                });
            });
        }
    }
}
