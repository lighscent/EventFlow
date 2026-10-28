const { EmbedBuilder } = require('discord.js');

class WebhookEmbedBuilder {
    constructor(settings, payload, platform = 'github') {
        this.settings = settings;
        this.payload = payload;
        this.platform = platform;
    }

    build(title, description, url, timestamp, opts = {}) {
        const embed = new EmbedBuilder()
            .setColor(this.settings.getEmbedColor());

        if (!opts.hideFooter) {
            embed
                .setFooter({ text: this.settings.getEmbed('footer') })
                .setTimestamp(timestamp ? new Date(timestamp) : new Date());
        }

        if (title && !opts.hideTitle) {
            embed.setTitle(title);
        }

        if (description && description.length > 4096) {
            description = `${description.slice(0, 4093)}...`;
        }

        if (url) {
            embed.setURL(url);
        }

        const authorName = this.settings.getAuthor('usePusher')
            ? (this.payload.pusher?.name || this.payload.pusher?.username || this.payload.pusher?.login)
            : (this.payload.sender?.login || this.payload.pusher?.username || this.payload.pusher?.name);
        const authorUrl = this.settings.getAuthor('useUrl')
            ? (this.payload.sender?.html_url || this.payload.pusher?.html_url)
            : undefined;
        const authorIcon = this.settings.getAuthor('showIcon')
            ? (this.payload.sender?.avatar_url || this.payload.pusher?.avatar_url)
            : undefined;

        if (!opts.hideAuthor) {
            embed.setAuthor({
                name: authorName || (this.platform === 'forgejo' ? 'Forgejo' : 'GitHub'),
                iconURL: authorIcon,
                url: authorUrl
            });
        }

        if (description) {
            embed.setDescription(description);
        }

        return embed;
    }
}

module.exports = WebhookEmbedBuilder;
