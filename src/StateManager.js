/**
 * StateManager
 * ------------
 * Tracks the user's progress through the level flow injected by the builder.
 *
 * window.App.flow  – array of scene-ids in this build, e.g. ['scene-1', 'scene-2']
 *
 * Usage:
 *   window.App.stateManager = new StateManager(window.App.flow);
 *   window.App.stateManager.markCompleted('scene-1');
 *   window.App.stateManager.getAvailableScenes(); // => ['scene-2']
 *   window.App.stateManager.isFlowComplete();     // => false
 */
export default class StateManager {
    constructor(flow) {
        this.flow       = Array.isArray(flow) ? flow : [];
        this._completed = [];
    }

    /** Record a level as finished. Safe to call multiple times. */
    markCompleted(sceneId) {
        if (!this._completed.includes(sceneId)) {
            this._completed.push(sceneId);
        }
    }

    /**
     * Returns the current stage index of the flow.
     */
    _getStageIndex() {
        let index = 0;
        while (index < this.flow.length) {
            const item = this.flow[index];
            if (typeof item === 'string') {
                if (this._completed.includes(item)) {
                    index++;
                    continue;
                }
                break;
            }
            if (Array.isArray(item)) {
                if (item.some((id) => this._completed.includes(id))) {
                    index++;
                    continue;
                }
                break;
            }
            index++;
        }
        return index;
    }

    /**
     * Returns scene ids available at the current stage.
     */
    getAvailableScenes() {
        const index = this._getStageIndex();
        if (index >= this.flow.length) return [];

        const item = this.flow[index];
        if (typeof item === 'string') {
            return [item];
        }
        if (Array.isArray(item)) {
            return item.filter((id) => !this._completed.includes(id));
        }
        return [];
    }

    /**
     * Returns the next scene to load when starting or continuing the game.
     */
    getNextScene() {
        const available = this.getAvailableScenes();
        return available.length > 0 ? available[0] : null;
    }

    /** True when every stage of the flow has been completed. */
    isFlowComplete() {
        return this._getStageIndex() >= this.flow.length;
    }
}
