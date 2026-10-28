const log = require('../logger');

const DEFAULTS = {
    behavior: {
        oneCommitPerMessage: false,
        showFileNames: false,
        showCommitUrls: true,
        showCommitMessageBody: false,
        showCompareLink: true,
        showFilesRecap: false,
        onlyDefaultBranch: false
    },
    limits: {
        maxCommitsPerEmbed: 5,
        maxEmbedsPerPush: 20,
        maxFilesPerCommit: 10
    },
    display: {
        showRepoNameInTitle: true,
        showBranchInTitle: true,
        showCommitCountInTitle: true,
        separator: '\n\n',
        filePrefix: 'Files:'
    },
    embed: {
        color: '7289DA',
        footer: 'Open-Source Project | github.com/lighscent/EventFlow'
    },
    author: {
        showIcon: true,
        useUrl: true,
        usePusher: true
    }
};

const isValidColor = (value) =>
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xFFFFFF) ||
    (typeof value === 'string' && /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value));

const isValid = (section, key, value) => {
    const def = DEFAULTS[section][key];
    if (typeof def === 'boolean') return typeof value === 'boolean';
    if (typeof def === 'number') {
        const n = Math.floor(Number(value));
        return Number.isFinite(n) && n >= 1;
    }
    if (section === 'embed' && key === 'color') return isValidColor(value);
    return typeof value === 'string';
};

class WebhookSettings {
    constructor(settings = {}) {
        this.settings = settings;
        this.validate(settings);
    }

    validate(settings) {
        if (!settings || typeof settings !== 'object') return;
        for (const [section, values] of Object.entries(settings)) {
            const defaults = DEFAULTS[section];
            if (!defaults || !values || typeof values !== 'object') {
                log.warn(`Unknown settings section "${section}", ignored.`);
                continue;
            }
            for (const [key, value] of Object.entries(values)) {
                if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
                    log.warn(`Unknown setting "${section}.${key}", ignored.`);
                } else if (!isValid(section, key, value)) {
                    log.warn(`Invalid value for "${section}.${key}", using default.`);
                }
            }
        }
        this.validateCombinations();
    }

    validateCombinations() {
        const single = this.getBehavior('oneCommitPerMessage') === true;
        const files = this.getBehavior('showFileNames') === true;

        if (single) {
            if (this.getBehavior('showCompareLink') === false) {
                log.warn('"behavior.showCompareLink" has no effect with "oneCommitPerMessage:true".');
            }
            if (this.getBehavior('showFilesRecap') === true) {
                log.warn('"behavior.showFilesRecap" has no effect with "oneCommitPerMessage:true".');
            }
            if (this.getLimit('maxCommitsPerEmbed') !== DEFAULTS.limits.maxCommitsPerEmbed) {
                log.warn('"limits.maxCommitsPerEmbed" has no effect with "oneCommitPerMessage:true".');
            }
        } else if (this.getBehavior('showCommitMessageBody') === true) {
            log.warn('"behavior.showCommitMessageBody" has no effect with "oneCommitPerMessage:false" (grouped lines show the summary only).');
        }

        if (!files) {
            if (this.getBehavior('showFilesRecap') === true) {
                log.warn('"behavior.showFilesRecap" needs "showFileNames:true".');
            }
            if (this.getDisplay('filePrefix') !== DEFAULTS.display.filePrefix) {
                log.warn('"display.filePrefix" has no effect with "showFileNames:false".');
            }
            if (this.getLimit('maxFilesPerCommit') !== DEFAULTS.limits.maxFilesPerCommit) {
                log.warn('"limits.maxFilesPerCommit" has no effect with "showFileNames:false".');
            }
        }
    }

    getValue(section, key) {
        const raw = this.settings[section]?.[key];
        if (raw === undefined) return DEFAULTS[section][key];
        return isValid(section, key, raw)
            ? (section === 'limits' ? Math.floor(Number(raw)) : raw)
            : DEFAULTS[section][key];
    }

    getBehavior(key) {
        return this.getValue('behavior', key);
    }

    getLimit(key) {
        return this.getValue('limits', key);
    }

    getDisplay(key) {
        return this.getValue('display', key);
    }

    getEmbed(key) {
        return this.getValue('embed', key);
    }

    getAuthor(key) {
        return this.getValue('author', key);
    }

    getEmbedColor() {
        const rawColor = this.getEmbed('color');
        if (typeof rawColor === 'number') {
            return rawColor;
        }
        if (typeof rawColor === 'string') {
            return parseInt(rawColor.replace(/^#/, ''), 16);
        }
        return 0x7289DA;
    }
}

module.exports = WebhookSettings;
