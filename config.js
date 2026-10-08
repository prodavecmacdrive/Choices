module.exports = {
    'name': 'MyAd',
    // 'networks': ['Applovin', 'Facebook', 'Google', 'IronSource', 'Liftoff', 'TikTok', 'UnityAds', 'Vungle'],
    'networks': ['Applovin', 'Facebook', 'Google', 'Mintegral', 'Moloco', 'UnityAds'],
    'mirrors': {
        'Applovin': 'al',
        'Facebook': 'fb',
        'Google': 'gg',
        'Mintegral': 'mtg',
        'Moloco': 'mo',
        'UnityAds': 'un'
    },
    'customPhaser': true,
    'compressAtlas': true,
    'compressTexture': true,
    'compressAudio': true,
    'ios': 'https://apps.apple.com/ua/app/merge-sticker-playbook-2d/id6505066374',
    'android': 'https://play.google.com/store/apps/details?id=com.game.goolny.stickers&hl=en',

    // Dev mode previews scene-1 only; override to test other flows.
    'currentVersion': 'full',

    // ── 3 build variants ─────────────────────────────────────
    'versions': {
        // Version 1 (Time Limit 60s): Full gameplay with a hard timer 60s
        'full': { flow: ['scene-1'], audio: [], fonts: [], sheets: [], textures: [] },

        // Version 2 (Click Limit 10): Interaction limit after 10th click/tap
        'clicks10': { flow: ['scene-2'], audio: [], fonts: [], sheets: [], textures: [] },

        // Version 3 (Click Limit 5): Hard interaction limit after 5th click/tap
        'clicks5': { flow: ['scene-3'], audio: [], fonts: [], sheets: [], textures: [] }
    }
};