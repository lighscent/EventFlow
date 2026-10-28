class WebhookSettings {
    constructor(settings = {}) {
        this.settings = settings;
    }

    getValue(section, key, defaultValue) {
        const sectionValue = this.settings[section];
        if (sectionValue && Object.prototype.hasOwnProperty.call(sectionValue, key)) {
            return sectionValue[key];
        }

        switch (section) {
            case 'behavior':
                return {
                    oneCommitPerMessage: false,
                    showFileNames: false,
                    showCommitUrls: true,
                    showCommitMessageBody: false,
                    showCompareLink: true,
                    showFilesRecap: false,
                    onlyDefaultBranch: false
                }[key];
            case 'limits':
                return {
                    maxCommitsPerEmbed: 5,
                    maxEmbedsPerPush: 20,
                    maxFilesPerCommit: 10
                }[key];
            case 'display':
                return {
                    showRepoNameInTitle: true,
                    showBranchInTitle: true,
                    showCommitCountInTitle: true,
                    embedDescriptionSeparator: '\n\n',
                    fileListPrefix: 'Files:'
                }[key];
            case 'embed':
                return {
                    embedColor: '7289DA',
                    footerText: 'Open-Source Project | github.com/lighscent/EventFlow'
                }[key];
            case 'author':
                return {
                    showAuthorIcon: true,
                    useAuthorUrl: true,
                    authorUsePusher: true
                }[key];
            default:
                return defaultValue;
        }
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
        const rawColor = this.getEmbed('embedColor');
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
