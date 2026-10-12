import UI_CONFIG from '../config/ui.json';
import LOCALIZATION from '../config/localization.json';
import Utils from '../../core/framework/Utils';

export default class ChoiceGroup extends Phaser.GameObjects.Container {
    constructor(scene, x, y, onChoiceCallback, balanceView = null) {
        const defPos = UI_CONFIG?.choice_group?.position;
        const posX = x !== undefined ? x : (defPos?.x ?? 300);
        const posY = y !== undefined ? y : (defPos?.y ?? 150);
        super(scene, posX, posY);
        this.scene = scene;
        this.onChoice = onChoiceCallback;
        this.balanceView = balanceView || scene?.balanceView || null;
        this.cards = [];
        this.isSelecting = false;
        this.choiceGroupContainer = this;
        const isPortrait = scene.scale ? (scene.scale.width < scene.scale.height) : true;
        this.uiScale = this.getScaleSetting(isPortrait);
        this.setScale(this.uiScale);
        this._customPosY = null;
        this._lastLayout = null;
        this.helperHand = null;
        this.helperHandTimer = null;
        this.helperHandSequenceTimer = null;
        this._onlyAffordable = false;
        this.setDepth(160);

        scene.add.existing(this);
    }

    getScaleSetting(isPortrait) {
        const groupScaleCfg = UI_CONFIG?.choice_group?.scale;
        if (typeof groupScaleCfg === 'object' && groupScaleCfg !== null) {
            return isPortrait ? (groupScaleCfg.portrait ?? 1.0) : (groupScaleCfg.landscape ?? 1.0);
        }
        if (typeof groupScaleCfg === 'number') {
            return groupScaleCfg;
        }
        return 1.0;
    }

    setBalanceView(balanceView) {
        this.balanceView = balanceView;
    }

    getBalanceView() {
        return this.balanceView || this.scene?.balanceView || null;
    }

    showChoices(choicesArray, options = {}) {
        this.clearCards();
        this.isSelecting = false;
        this._customPosY = (typeof options.y === 'number') ? options.y : null;
        this._clearHelperHand();
        this._onlyAffordable = false;

        if (options.balanceView) {
            this.balanceView = options.balanceView;
        }

        if (!choicesArray || choicesArray.length === 0) return;

        // Prompt user with helper hand if no selection made within 4 seconds
        this.helperHandTimer = this.scene.time.delayedCall(4000, () => {
            if (!this.isSelecting && this.cards.length > 0) {
                this._startHelperHand();
            }
        });

        try {
            Utils.addAudio(this.scene, 'ui_popup', 0.9);
        } catch (e) { }

        const groupCfg = UI_CONFIG?.choice_group || {};
        const cardCfg = UI_CONFIG?.choice_card || {};

        const isPortrait = this.scene.scale.width < this.scene.scale.height;

        const count = choicesArray.length;
        const defaultY = count === 1
            ? (typeof groupCfg.positions_y?.single === 'number' ? groupCfg.positions_y.single : -145)
            : (typeof groupCfg.positions_y?.multiple === 'number' ? groupCfg.positions_y.multiple : (isPortrait ? 190 : 205));
        const posY = (typeof options.y === 'number') ? options.y : defaultY;

        let spacing = 260;
        if (typeof groupCfg.spacing === 'number') {
            spacing = groupCfg.spacing;
        } else if (typeof groupCfg.spacing === 'object' && groupCfg.spacing !== null) {
            spacing = isPortrait ? (groupCfg.spacing.portrait ?? 240) : (groupCfg.spacing.landscape ?? 260);
        } else if (groupCfg.spacing_responsive) {
            spacing = isPortrait ? (groupCfg.spacing_responsive.portrait ?? 240) : (groupCfg.spacing_responsive.landscape ?? 260);
        }

        const startX = -((count - 1) * spacing) / 2;

        choicesArray.forEach((choice, index) => {
            const cardX = startX + index * spacing;
            const card = this.scene.add.container(cardX, posY);
            card.baseX = cardX;
            card.choiceData = choice;
            card._isShaking = false;
            const cardBaseScale = (typeof cardCfg.scale === 'number') ? cardCfg.scale : 1.0;
            card.cardBaseScale = cardBaseScale;
            card.setScale(0);

            // 1. Choice card frame
            const frameCfg = cardCfg.background || {};
            const frameTex = (typeof frameCfg === 'string' ? frameCfg : frameCfg.texture) || 'card_choice_frame';
            const frameX = frameCfg.x !== undefined ? frameCfg.x : 0;
            const frameY = frameCfg.y !== undefined ? frameCfg.y : 0;
            const frameScale = frameCfg.scale !== undefined ? frameCfg.scale : 0.48;

            const frame = this.scene.add.image(frameX, frameY, frameTex);
            frame.setScale(frameScale);
            frame.setInteractive({ useHandCursor: true });
            card.add(frame);
            card.frame = frame;

            // 2. Choice icon
            if (choice.icon) {
                const iconCfg = cardCfg.icon || {};
                const iconX = iconCfg.x !== undefined ? iconCfg.x : -60;
                const iconY = iconCfg.y !== undefined ? iconCfg.y : 0;

                const icon = this.scene.add.image(iconX, iconY, choice.icon);

                let scaleX = 0.6;
                let scaleY = 0.6;

                if (iconCfg.scale !== undefined && iconCfg.scale !== null) {
                    if (typeof iconCfg.scale === 'number') {
                        scaleX = iconCfg.scale;
                        scaleY = iconCfg.scale;
                    } else if (typeof iconCfg.scale === 'object') {
                        scaleX = iconCfg.scale.x !== undefined ? iconCfg.scale.x : 0.6;
                        scaleY = iconCfg.scale.y !== undefined ? iconCfg.scale.y : 0.6;
                    }
                } else if (typeof iconCfg.maxDimension === 'number') {
                    const maxDim = Math.max(icon.width || 1, icon.height || 1);
                    const s = iconCfg.maxDimension / maxDim;
                    scaleX = s;
                    scaleY = s;
                }

                // Per-choice override if defined (e.g. choice.scale or choice.iconScale)
                if (choice.scale !== undefined) {
                    scaleX = typeof choice.scale === 'number' ? choice.scale : (choice.scale.x ?? scaleX);
                    scaleY = typeof choice.scale === 'number' ? choice.scale : (choice.scale.y ?? scaleY);
                } else if (choice.iconScale !== undefined) {
                    scaleX = typeof choice.iconScale === 'number' ? choice.iconScale : (choice.iconScale.x ?? scaleX);
                    scaleY = typeof choice.iconScale === 'number' ? choice.iconScale : (choice.iconScale.y ?? scaleY);
                }

                icon.setScale(scaleX, scaleY);
                card.add(icon);
                card.icon = icon;
            }

            // 3. Localized Title
            const titleCfg = cardCfg.title || {};
            const titleX = titleCfg.x !== undefined ? titleCfg.x : 32;
            const titleY = titleCfg.y !== undefined ? titleCfg.y : -14;
            const titleKey = choice.title;
            const titleStr = LOCALIZATION?.en?.[titleKey]
                || (choice.id && LOCALIZATION?.en?.[choice.id])
                || (typeof titleKey === 'string' && LOCALIZATION?.en?.[titleKey.toUpperCase()])
                || titleKey;
            const titleStyle = titleCfg.style || {
                fontFamily: 'Arial, sans-serif',
                fontSize: '13px',
                fontStyle: 'bold',
                color: '#163b1a',
                align: 'center'
            };
            const titleText = this.scene.add.text(titleX, titleY, titleStr, titleStyle).setOrigin(0.5, 0.5);
            card.add(titleText);

            // 4. Numeric Price
            const priceCfg = cardCfg.price || {};
            const priceX = priceCfg.x !== undefined ? priceCfg.x : 32;
            const priceY = priceCfg.y !== undefined ? priceCfg.y : 16;
            const priceStr = '' + Number(choice.price || 0).toLocaleString('en-US').replace(/,/g, ' ');
            const priceStyle = priceCfg.style || {
                fontFamily: 'Arial, sans-serif',
                fontSize: '18px',
                fontStyle: 'bold',
                color: '#09250b',
                align: 'center'
            };
            const priceText = this.scene.add.text(priceX, priceY, priceStr, priceStyle).setOrigin(0.5, 0.5);
            card.add(priceText);
            card.priceText = priceText;

            // Click handling
            frame.on('pointerdown', () => {
                if (this.isSelecting) return;
                card.setScale((card.cardBaseScale || 1) * 0.94);
            });

            frame.on('pointerout', () => {
                if (!this.isSelecting) {
                    card.setScale(card.cardBaseScale || 1);
                }
            });

            frame.on('pointerup', () => {
                if (this.isSelecting) return;

                const balanceView = this.getBalanceView();
                const currentBalance = balanceView ? balanceView.getValue() : Infinity;
                const itemCost = Number(choice.price || 0);

                // Insufficient funds handling: no interactive locks, repeatable on every click
                if (itemCost > 0 && currentBalance < itemCost) {
                    card.setScale(card.cardBaseScale || 1);

                    try {
                        Utils.addAudio(this.scene, 'error', 1.0);
                    } catch (e) { }

                    this._playCardInsufficientFunds(card);

                    if (balanceView && typeof balanceView.flashInsufficientFunds === 'function') {
                        balanceView.flashInsufficientFunds();
                    }

                    // User clicked unaffordable button: helper hand appears immediately and shows only affordable choice
                    this._onlyAffordable = true;
                    this._startHelperHand();
                    return;
                }

                // Normal purchase flow on sufficient funds
                this.isSelecting = true;
                this._clearHelperHand();
                this.disableAllInteractivity();

                try {
                    Utils.addAudio(this.scene, 'ui_click', 1.0);
                } catch (e) { }

                this.scene.tweens.add({
                    targets: card,
                    scaleX: (card.cardBaseScale || 1) * 1.08,
                    scaleY: (card.cardBaseScale || 1) * 1.08,
                    duration: 120,
                    yoyo: true,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        this.hide(180, () => {
                            if (this.onChoice) {
                                this.onChoice(choice);
                            }
                        });
                    }
                });
            });

            this.add(card);
            this.cards.push(card);

            // Animate card entrance
            this.scene.tweens.add({
                targets: card,
                scaleX: card.cardBaseScale || 1,
                scaleY: card.cardBaseScale || 1,
                duration: 350,
                delay: index * 90,
                ease: 'Back.easeOut'
            });
        });

        // Adapt layout and scale immediately to active camera framing and viewport dimensions
        const appScale = Math.min(this.scene.scale.width / 600, this.scene.scale.height / 900) || 1;
        const screenWidth = this.scene.scale.width / appScale;
        const screenHeight = this.scene.scale.height / appScale;
        const camZoom = this.scene?.cameras?.main?.zoom || 1.0;
        const camOffsetY = this.scene?.cameras?.main?.scrollY || 0;
        this.updateLayout(isPortrait, screenWidth, screenHeight, { zoom: camZoom, offsetY: camOffsetY, appScale });
    }

    _playCardInsufficientFunds(card) {
        if (!card) return;

        // Stop any running tweens/timers on this card
        this.scene.tweens.killTweensOf(card);
        if (card._resetTimer) {
            card._resetTimer.remove();
            card._resetTimer = null;
        }

        const baseX = card.baseX !== undefined ? card.baseX : card.x;
        card.x = baseX;
        const baseScale = card.cardBaseScale || 1;
        card.setScale(baseScale);

        // 1. Red Flash on card frame & price text
        if (card.frame && typeof card.frame.setTint === 'function') {
            card.frame.setTint(0xff4444);
        }
        if (card.priceText && typeof card.priceText.setColor === 'function') {
            card.priceText.setColor('#ff3333');
        }

        // Return to normal color after ~280ms
        card._resetTimer = this.scene.time.delayedCall(280, () => {
            if (card.frame && typeof card.frame.clearTint === 'function') {
                card.frame.clearTint();
            }
            if (card.priceText && typeof card.priceText.setColor === 'function') {
                card.priceText.setColor('#09250b');
            }
            card._resetTimer = null;
        });

        // 2. Horizontal Shake (Wobble) using standard Phaser 3.50 tweens.add
        const shakeOffset = 8;
        card.x = baseX - shakeOffset;

        this.scene.tweens.add({
            targets: card,
            x: baseX + shakeOffset,
            duration: 40,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                card.x = baseX;
            }
        });
    }

    disableAllInteractivity() {
        this.cards.forEach((card) => {
            if (card.frame && typeof card.frame.disableInteractive === 'function') {
                card.frame.disableInteractive();
            }
        });
    }

    clearCards() {
        this._clearHelperHand();
        this.cards.forEach((card) => {
            if (card._resetTimer) {
                card._resetTimer.remove();
                card._resetTimer = null;
            }
            this.scene.tweens.killTweensOf(card);
            card.destroy();
        });
        this.cards = [];
    }

    updateLayout(isPortrait, screenWidth, screenHeight, cameraContext = null) {
        this._lastLayout = { isPortrait, screenWidth, screenHeight, cameraContext };

        const groupCfg = UI_CONFIG?.choice_group || {};
        const posCfg = groupCfg.position || {};
        const basePosX = isPortrait ? (posCfg.portrait?.x ?? posCfg.x ?? 300) : (posCfg.landscape?.x ?? posCfg.x ?? 300);
        const basePosY = isPortrait ? (posCfg.portrait?.y ?? posCfg.y ?? 150) : (posCfg.landscape?.y ?? posCfg.y ?? 140);

        const camZoom = (cameraContext && typeof cameraContext.zoom === 'number') ? cameraContext.zoom : (this.scene?.cameras?.main?.zoom || 1.0);
        const camOffsetY = (cameraContext && typeof cameraContext.offsetY === 'number') ? cameraContext.offsetY : (this.scene?.cameras?.main?.scrollY || 0);
        const appScale = (cameraContext && typeof cameraContext.appScale === 'number') ? cameraContext.appScale : (this.scene?.mainContainer?.scaleX || 1.0);

        const count = (this.cards && this.cards.length > 0) ? this.cards.length : 2;
        const spacingCfg = groupCfg.spacing;
        const baseSpacing = typeof spacingCfg === 'object'
            ? (isPortrait ? (spacingCfg.portrait ?? 240) : (spacingCfg.landscape ?? 260))
            : (isPortrait ? Math.min(spacingCfg ?? 260, 240) : (spacingCfg ?? 260));

        // Available width in camera visible logical space with safe margins
        const visibleWidth = screenWidth / camZoom;
        const safePadding = 48;
        const maxAvailableWidth = Math.max(200, visibleWidth - safePadding);

        // Approximate total width of choice cards at scale 1.0
        const cardFrameWidth = 226;
        const totalBaseWidth = (count > 1 ? (count - 1) * baseSpacing : 0) + cardFrameWidth;

        const configScale = this.getScaleSetting(isPortrait);
        // Base proportionate visual scale linked to camera framing
        const baseVisualScale = Math.max(0.75, Math.min(1.2, 1.0 + (camZoom - 1.0) * 0.25));
        // Multiply by configuration scale (identical to balance container behavior)
        const desiredVisualScale = baseVisualScale * configScale;
        const uiScale = desiredVisualScale / camZoom;

        this.uiScale = uiScale;
        this.setScale(uiScale);
        if (this.choiceGroupContainer && this.choiceGroupContainer !== this) {
            this.choiceGroupContainer.setScale(uiScale);
        }

        // Relative anchoring: Centered horizontally and anchored in the upper-middle of visible camera frame
        const logicalOffsetY = appScale > 0 ? (camOffsetY / appScale) : camOffsetY;
        const centerY = 450 + logicalOffsetY;
        const adaptedY = centerY + ((basePosY - 450) * uiScale) / camZoom;
        const adaptedX = basePosX;

        this.setPosition(adaptedX, adaptedY);

        if (this.cards && this.cards.length > 0) {
            const startX = -((count - 1) * baseSpacing) / 2;
            const defaultY = count === 1
                ? (groupCfg.positions_y?.single ?? -145)
                : (this._customPosY ?? (groupCfg.positions_y?.multiple ?? (isPortrait ? 190 : 205)));

            this.cards.forEach((card, index) => {
                const cardX = startX + index * baseSpacing;
                card.baseX = cardX;
                if (!card._isShaking) {
                    card.x = cardX;
                }
                card.y = defaultY;
            });
        }
    }

    hide(duration = 200, onComplete = null) {
        this._clearHelperHand();
        if (this.cards.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        this.disableAllInteractivity();

        this.scene.tweens.add({
            targets: this.cards,
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: duration,
            ease: 'Back.easeIn',
            onComplete: () => {
                this.clearCards();
                if (onComplete) onComplete();
            }
        });
    }

    _startHelperHand() {
        if (this.isSelecting || !this.cards || this.cards.length === 0) return;
        if (!this.scene || !this.scene.textures.exists('helper_hand')) return;

        if (this.helperHandSequenceTimer) {
            this.helperHandSequenceTimer.remove();
            this.helperHandSequenceTimer = null;
        }
        if (this.helperHand) {
            this.scene.tweens.killTweensOf(this.helperHand);
        }

        const balanceView = this.getBalanceView();
        const currentBalance = balanceView ? balanceView.getValue() : Infinity;

        let targetCards = [];
        if (this._onlyAffordable) {
            targetCards = this.cards.filter(c => {
                const cost = Number(c.choiceData?.price || 0);
                return cost <= currentBalance;
            });
        }

        if (targetCards.length === 0) {
            targetCards = this.cards.slice();
        }

        if (targetCards.length === 0) return;

        // Create or reuse helper hand sprite
        if (!this.helperHand || !this.helperHand.active) {
            this.helperHand = this.scene.add.image(0, 0, 'helper_hand');
            // Index finger points at top-left
            this.helperHand.setOrigin(0.12, 0.05);
            const handScale = 0.44;
            this.helperHand.handBaseScale = handScale;
            this.helperHand.setScale(handScale);
            this.helperHand.setDepth(200);
            this.add(this.helperHand);

            const firstCard = targetCards[0];
            this.helperHand.setPosition(firstCard.x + 35, firstCard.y + 60);
            this.helperHand.setAlpha(0);
        }

        this._runHelperHandLoop(targetCards, 0);
    }

    _runHelperHandLoop(targetCards, index = 0) {
        if (this.isSelecting || !this.helperHand || !this.helperHand.active) return;
        if (!targetCards || targetCards.length === 0) return;

        const card = targetCards[index % targetCards.length];
        if (!card || !card.active) return;

        const targetX = card.x + 20;
        const targetY = card.y + 25;
        const baseScale = this.helperHand.handBaseScale || 0.44;

        // 1. Move hand to button
        this.scene.tweens.add({
            targets: this.helperHand,
            x: targetX,
            y: targetY,
            alpha: 1,
            duration: 380,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (this.isSelecting || !this.helperHand || !this.helperHand.active) return;

                // 2. Simulate click: press hand down and button down
                this.scene.tweens.add({
                    targets: this.helperHand,
                    scaleX: baseScale * 0.86,
                    scaleY: baseScale * 0.86,
                    y: targetY + 10,
                    duration: 130,
                    ease: 'Quad.easeInOut'
                });

                this.scene.tweens.add({
                    targets: card,
                    scaleX: (card.cardBaseScale || 1) * 0.94,
                    scaleY: (card.cardBaseScale || 1) * 0.94,
                    duration: 130,
                    ease: 'Quad.easeInOut',
                    onComplete: () => {
                        if (this.isSelecting || !this.helperHand || !this.helperHand.active) return;

                        // Release simulated click
                        this.scene.tweens.add({
                            targets: this.helperHand,
                            scaleX: baseScale,
                            scaleY: baseScale,
                            y: targetY,
                            duration: 150,
                            ease: 'Quad.easeInOut'
                        });

                        this.scene.tweens.add({
                            targets: card,
                            scaleX: card.cardBaseScale || 1,
                            scaleY: card.cardBaseScale || 1,
                            duration: 150,
                            ease: 'Quad.easeInOut',
                            onComplete: () => {
                                if (this.isSelecting || !this.helperHand || !this.helperHand.active) return;

                                // Pause before moving to next target
                                this.helperHandSequenceTimer = this.scene.time.delayedCall(450, () => {
                                    if (this.isSelecting || !this.helperHand || !this.helperHand.active) return;

                                    let currentTargets = targetCards;
                                    if (this._onlyAffordable) {
                                        const balanceView = this.getBalanceView();
                                        const curBal = balanceView ? balanceView.getValue() : Infinity;
                                        currentTargets = this.cards.filter(c => {
                                            const cost = Number(c.choiceData?.price || 0);
                                            return cost <= curBal;
                                        });
                                        if (currentTargets.length === 0) currentTargets = this.cards.slice();
                                    }

                                    this._runHelperHandLoop(currentTargets, index + 1);
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    _clearHelperHand() {
        if (this.helperHandTimer) {
            this.helperHandTimer.remove();
            this.helperHandTimer = null;
        }
        if (this.helperHandSequenceTimer) {
            this.helperHandSequenceTimer.remove();
            this.helperHandSequenceTimer = null;
        }
        if (this.helperHand) {
            this.scene.tweens.killTweensOf(this.helperHand);
            this.helperHand.destroy();
            this.helperHand = null;
        }
        if (this.cards) {
            this.cards.forEach(card => {
                if (card && !card._isShaking && !this.isSelecting) {
                    card.setScale(card.cardBaseScale || 1);
                }
            });
        }
    }
}