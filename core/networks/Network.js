export default class Network {
    constructor(callback) {
        this.game = null;

        callback && window.addEventListener('load', callback);
    }

    addClickToStore(obj) {
        obj.setInteractive().on("pointerdown", this.ctaClick, this);
    }

    cta() {
        this.ctaClick();
    }

    ctaClick() {
        if (typeof window.trackAxonEvent === 'function') window.trackAxonEvent('CTA_CLICKED');
        this.openStore();
    }

    openStore() {
        const url = this.getUrl();
        if (window.top) {
            window.top.open(url);
        } else {
            window.open(url);
        }
    }

    getUrl() {
        const isAndroid = (this.game && this.game.device && this.game.device.os && this.game.device.os.android)
            || (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent));

        if (isAndroid) {
            return (typeof App !== 'undefined' && App.androidUrl) ? App.androidUrl : (window.App?.androidUrl || '');
        }

        return (typeof App !== 'undefined' && App.iosUrl) ? App.iosUrl : (window.App?.iosUrl || '');
    }

    complete() {}
}