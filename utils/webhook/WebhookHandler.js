const crypto = require('crypto');
const WebhookSettings = require('./WebhookSettings');
const WebhookFormatter = require('./WebhookFormatter');
const WebhookEmbedBuilder = require('./WebhookEmbedBuilder');

class WebhookHandler {
    constructor(db, client, settings = {}) {
        this.db = db;
        this.client = client;
        this.settings = new WebhookSettings(settings);
    }

    verifySignature(req, platform = 'github') {
        if (platform === 'forgejo') {
            const signature = req.headers['x-forgejo-signature']
                || req.headers['x-gitea-signature']
                || req.headers['x-hub-signature-256'];
            const secret = process.env.FORGEJO_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET;

            if (secret && signature) {
                const raw = signature.startsWith('sha256=') ? signature.slice(7) : signature;
                if (!raw) return true;

                const hmac = crypto.createHmac('sha256', secret);
                const digest = Buffer.from(hmac.update(JSON.stringify(req.body)).digest('hex'), 'utf8');
                const checksum = Buffer.from(raw, 'utf8');

                if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
                    return false;
                }
            }
            return true;
        }

        const signature = req.headers['x-hub-signature-256'];
        if (process.env.GITHUB_WEBHOOK_SECRET && signature) {
            const raw = signature.startsWith('sha256=') ? signature.slice(7) : signature;
            if (!raw) return true;

            const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
            const digest = Buffer.from('sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex'), 'utf8');
            const checksum = Buffer.from(signature, 'utf8');

            if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
                return false;
            }
        }
        return true;
    }

    async handlePush(uuid, payload, platform = 'github') {
        const row = this.db.getWebhook(uuid);
        if (!row) {
            return { status: 404, message: 'Webhook not found' };
        }

        const { channelId } = row;
        this.db.updateWebhookTrigger(uuid);

        const repoName = payload.repository.full_name;
        const branch = payload.ref.split('/').pop();
        const commits = payload.commits || [];

        if (commits.length === 0) return { status: 200 };

        if (this.settings.getBehavior('onlyDefaultBranch') && branch !== payload.repository.default_branch) {
            return { status: 200 };
        }

        const channel = this.client.channels.cache.get(channelId);
        if (!channel) {
            return { status: 200 };
        }

        const formatter = new WebhookFormatter(this.settings, payload, repoName, branch, platform);
        const embedBuilder = new WebhookEmbedBuilder(this.settings, payload, platform);

        const commitLimit = this.settings.getLimit('maxCommitsPerEmbed');
        const embedLimit = this.settings.getLimit('maxEmbedsPerPush');
        const oneCommitPerMessage = this.settings.getBehavior('oneCommitPerMessage') === true;
        const showCommitUrls = this.settings.getBehavior('showCommitUrls') !== false;
        const compareUrl = this.settings.getBehavior('showCompareLink') !== false ? payload.compare : undefined;

        if (oneCommitPerMessage) {
            for (const commit of commits.slice(0, embedLimit)) {
                const commitId = commit.id.substring(0, 7);
                const title = formatter.buildTitle(1, commitId);
                const description = formatter.buildDescription(commit, this.settings.getLimit('maxFilesPerCommit'));
                const embed = embedBuilder.build(title, description, showCommitUrls ? commit.url : undefined, commit.timestamp);
                await channel.send({ embeds: [embed] });
            }
            return { status: 200 };
        }

        const DESCRIPTION_LIMIT = 4096;
        const maxFiles = this.settings.getLimit('maxFilesPerCommit');
        const recapMode = formatter.showFileNames && formatter.showFilesRecap;
        const visible = commits.slice(0, commitLimit * embedLimit);
        const sep = formatter.descriptionSeparator;

        let i = 0;
        for (let e = 0; e < embedLimit && i < visible.length; e++) {
            const chunk = visible.slice(i, i + commitLimit);
            const sections = chunk.map(commit => {
                const line = formatter.buildSummaryLine(commit);
                return (!recapMode && formatter.showFileNames)
                    ? `${line}\n${formatter.formatFileList(commit, maxFiles)}`
                    : line;
            });

            const isLast = i + chunk.length >= visible.length || e === embedLimit - 1;
            let description = '';
            let shown = 0;
            let truncated = false;
            for (const section of sections) {
                const next = shown === 0 ? section : description + sep + section;
                if (isLast) {
                    const left = commits.length - (i + shown) - 1;
                    const suffix = left > 0 ? `${sep}*…and ${left} more commits*` : '';
                    if (next.length + suffix.length > DESCRIPTION_LIMIT) {
                        description += `${shown === 0 ? '' : sep}*…and ${commits.length - (i + shown)} more commits*`;
                        truncated = true;
                        shown = sections.length;
                        break;
                    }
                } else if (next.length > DESCRIPTION_LIMIT) {
                    break;
                }
                description = next;
                shown++;
            }
            if (isLast && !truncated) {
                const undisplayed = commits.length - (i + shown);
                if (undisplayed > 0) description += `${sep}*…and ${undisplayed} more commits*`;
            }
            if (!isLast && shown === 0) {
                description = sections[0];
                shown = 1;
            }

            // Files recap goes in its own embed: raw ESC chars in ```ansi blocks
            // break Discord's link parsing for the whole description.
            let recap = '';
            if (isLast && recapMode) {
                recap = formatter.buildFilesRecap(visible, maxFiles);
            }

            // Only the very last embed of the push keeps footer + timestamp.
            const embedOpts = e === 0 ? {} : { hideTitle: true, hideAuthor: true };
            if (!isLast || recap) embedOpts.hideFooter = true;

            const embed = embedBuilder.build(
                formatter.buildTitle(commits.length),
                description || 'No description',
                compareUrl,
                chunk[0]?.timestamp,
                embedOpts
            );

            const embeds = [embed];
            if (recap) {
                embeds.push(embedBuilder.build('', recap, undefined, chunk[0]?.timestamp, { hideAuthor: true }));
            }

            await channel.send({ embeds });
            i += Math.max(shown, 1);
        }
        return { status: 200 };
    }

    async handlePing(uuid, payload, platform = 'github') {
        const row = this.db.getWebhook(uuid);
        if (!row) {
            return { status: 404, message: 'Webhook not found' };
        }

        const channel = this.client.channels.cache.get(row.channelId);
        if (!channel) {
            return { status: 200 };
        }

        const repoName = payload.repository?.full_name || 'unknown repo';
        const embed = new WebhookEmbedBuilder(this.settings, payload, platform).build(
            `Webhook connected: ${repoName}`,
            payload.zen || 'Ping received — webhook is working.',
            payload.repository?.html_url
        );

        await channel.send({ embeds: [embed] });
        return { status: 200 };
    }
}

module.exports = WebhookHandler;
