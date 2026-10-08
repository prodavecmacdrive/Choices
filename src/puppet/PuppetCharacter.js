export default class PuppetCharacter extends Phaser.GameObjects.Container {
    constructor(scene, x, y, skeletonConfig, characterConfig) {
        super(scene, x, y);
        this.scene = scene;
        this.skeleton = skeletonConfig;
        this.skin = characterConfig;
        this.bones = {};
        this.faceSprite = null;
        this.currentFace = this.skin?.defaultFace || 'idle';

        // Apply character root container scale from JSON configuration (defaults to 1:1 if omitted)
        const rootScale = this.skin?.rootScale || { x: 1, y: 1 };
        this.setScale(
            rootScale.x !== undefined ? rootScale.x : 1,
            rootScale.y !== undefined ? rootScale.y : 1
        );

        if (typeof this.skin?.zIndex === 'number') {
            this.setDepth(this.skin.zIndex);
        } else if (typeof this.skin?.boneOverrides?.zIndex === 'number') {
            this.setDepth(this.skin.boneOverrides.zIndex);
        }

        this.buildRig();

        scene.add.existing(this);
    }

    buildRig() {
        if (!this.skeleton || !this.skeleton.bones) return;

        const baseDefs = this.skeleton.bones;
        const overrides = this.skin?.boneOverrides || {};
        const effectiveBones = {};

        // 1. Merge each bone's base definition with character-specific overrides (zIndex and parent override default, transforms deviate)
        for (const [boneName, baseDef] of Object.entries(baseDefs)) {
            const override = overrides[boneName] || {};

            let zIndexOverride = undefined;
            if (override.zIndex !== undefined) {
                zIndexOverride = override.zIndex;
            } else if (override.z_index !== undefined) {
                zIndexOverride = override.z_index;
            } else if (overrides.zIndex && typeof overrides.zIndex === 'object' && overrides.zIndex[boneName] !== undefined) {
                zIndexOverride = overrides.zIndex[boneName];
            } else if (this.skin?.zIndex && typeof this.skin.zIndex === 'object' && this.skin.zIndex[boneName] !== undefined) {
                zIndexOverride = this.skin.zIndex[boneName];
            }

            effectiveBones[boneName] = {
                parent: override.parent !== undefined ? override.parent : baseDef.parent,
                zIndex: zIndexOverride !== undefined ? zIndexOverride : (baseDef.zIndex || 0),
                offset: {
                    x: (baseDef.offset?.x || 0) + (override.offset?.x || 0),
                    y: (baseDef.offset?.y || 0) + (override.offset?.y || 0)
                },
                pivot: {
                    x: (baseDef.pivot?.x ?? 0.5) + (override.pivot?.x || 0),
                    y: (baseDef.pivot?.y ?? 0.5) + (override.pivot?.y || 0)
                },
                scale: {
                    x: (baseDef.scale?.x !== undefined ? baseDef.scale.x : 1) + (override.scale?.x || 0),
                    y: (baseDef.scale?.y !== undefined ? baseDef.scale.y : 1) + (override.scale?.y || 0)
                },
                angle: (baseDef.angle || 0) + (override.angle || 0)
            };
        }
        this.effectiveBones = effectiveBones;

        // 2. Create container for each bone and assign initial properties
        for (const [boneName, boneDef] of Object.entries(effectiveBones)) {
            const boneContainer = this.scene.add.container(boneDef.offset.x, boneDef.offset.y);
            boneContainer.setScale(boneDef.scale.x, boneDef.scale.y);
            boneContainer.setDepth(boneDef.zIndex || 0);
            if (boneDef.angle) boneContainer.setAngle(boneDef.angle);
            boneContainer.initial = {
                x: boneDef.offset.x,
                y: boneDef.offset.y,
                angle: boneDef.angle || 0,
                scaleX: boneDef.scale.x,
                scaleY: boneDef.scale.y
            };
            this.bones[boneName] = boneContainer;
        }

        // 3. Build bone hierarchy (attach child bone containers to parent containers or to this)
        for (const [boneName, boneDef] of Object.entries(effectiveBones)) {
            const boneContainer = this.bones[boneName];
            if (boneDef.parent && this.bones[boneDef.parent]) {
                this.bones[boneDef.parent].add(boneContainer);
            } else {
                this.add(boneContainer);
            }
        }

        // 4. Attach sprites to their respective bone containers
        for (const [boneName, boneDef] of Object.entries(effectiveBones)) {
            const boneContainer = this.bones[boneName];
            let partTextureName = null;

            if (boneName === 'face') {
                partTextureName = this.skin.faces?.[this.currentFace] || this.skin.faces?.[this.skin.defaultFace || 'idle'];
            } else {
                partTextureName = this.skin.parts?.[boneName];
            }

            if (partTextureName) {
                const { textureKey, frameKey } = this._resolveTexture(partTextureName);
                const sprite = this.scene.add.sprite(0, 0, textureKey, frameKey);
                sprite.setOrigin(boneDef.pivot.x, boneDef.pivot.y);
                sprite.setDepth(boneDef.zIndex || 0);
                boneContainer.add(sprite);

                if (boneName === 'face') {
                    this.faceSprite = sprite;
                }
            }
        }

        // Sort depth in root and bone containers
        if (typeof this.sort === 'function') this.sort('depth');
        for (const boneContainer of Object.values(this.bones)) {
            if (typeof boneContainer.sort === 'function') {
                boneContainer.sort('depth');
            }
        }
    }

    _resolveTexture(name) {
        if (this.skin.atlas && this.scene.textures.exists(this.skin.atlas)) {
            const atlas = this.scene.textures.get(this.skin.atlas);
            if (atlas && typeof atlas.has === 'function' && atlas.has(name)) {
                return { textureKey: this.skin.atlas, frameKey: name };
            }
        }
        return { textureKey: name, frameKey: undefined };
    }

    setFace(faceKey) {
        if (!this.faceSprite) return;
        const faceTexName = this.skin?.faces?.[faceKey] || this.skin?.faces?.[this.skin?.defaultFace];
        if (!faceTexName) return;

        const { textureKey, frameKey } = this._resolveTexture(faceTexName);
        this.faceSprite.setTexture(textureKey, frameKey);
        this.currentFace = faceKey;
    }

    resetPose() {
        for (const bone of Object.values(this.bones)) {
            if (bone && bone.initial) {
                bone.x = bone.initial.x;
                bone.y = bone.initial.y;
                bone.angle = bone.initial.angle;
                bone.scaleX = bone.initial.scaleX;
                bone.scaleY = bone.initial.scaleY;
            }
        }
    }

    setBoneDepth(boneName, depth) {
        const boneContainer = this.bones[boneName];
        if (!boneContainer) return;
        boneContainer.setDepth(depth);
        const parentContainer = boneContainer.parentContainer;
        if (parentContainer && typeof parentContainer.sort === 'function') {
            parentContainer.sort('depth');
        }
    }
}