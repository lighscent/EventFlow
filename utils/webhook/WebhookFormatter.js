class WebhookFormatter {
    constructor(settings, payload, repoName, branch, platform = 'github') {
        this.settings = settings;
        this.payload = payload;
        this.repoName = repoName;
        this.branch = branch;
        this.platform = platform;

        this.oneCommitPerMessage = this.settings.getBehavior('oneCommitPerMessage') === true;
        this.showFileNames = this.settings.getBehavior('showFileNames') === true;
        this.showFilesRecap = this.settings.getBehavior('showFilesRecap') === true;
        this.showCommitUrls = this.settings.getBehavior('showCommitUrls') !== false;
        this.showCommitBody = this.settings.getBehavior('showCommitMessageBody') === true;
        this.showRepoNameInTitle = this.settings.getDisplay('showRepoNameInTitle') !== false;
        this.showBranchInTitle = this.settings.getDisplay('showBranchInTitle') !== false;
        this.showCommitCountInTitle = this.settings.getDisplay('showCommitCountInTitle') !== false;
        this.filePrefix = this.settings.getDisplay('fileListPrefix') || 'Files:';
        this.descriptionSeparator = this.settings.getDisplay('embedDescriptionSeparator') || '\n\n';
    }

    buildTitle(commitCount, commitId) {
        const parts = [];
        if (this.showRepoNameInTitle && this.repoName) {
            parts.push(this.repoName);
        }
        if (this.showBranchInTitle && this.branch) {
            parts.push(this.branch);
        }

        const prefix = parts.length ? `[${parts.join(':')}] ` : '';
        if (this.oneCommitPerMessage && commitId) {
            return `${prefix}1 new commit`;
        }
        if (this.showCommitCountInTitle) {
            return `${prefix}${commitCount} new commits`;
        }
        return prefix.trim() || `${this.platform === 'forgejo' ? 'Forgejo' : 'GitHub'} push`;
    }

    commitAuthor(commit) {
        return commit.author?.name || commit.author?.username
            || this.payload.pusher?.name || this.payload.sender?.login || 'unknown';
    }

    formatFileList(commit, maxFiles) {
        const files = [
            ...(commit.added || []).map(name => `+${name}`),
            ...(commit.modified || []).map(name => `~${name}`),
            ...(commit.removed || []).map(name => `-${name}`)
        ];
        const label = this.filePrefix.replace(/:\s*$/, '');
        const header = `**${label} (${files.length})**`;

        if (files.length === 0) {
            return `${header}\n*No changed files*`;
        }

        const shown = files.slice(0, maxFiles);
        const color = { '+': '32', '~': '33', '-': '31' };
        const lines = shown.map(f => `[0;${color[f[0]]}m${f}`).join('\n') + '[0m';
        const more = files.length > maxFiles ? `\n*…and ${files.length - maxFiles} more files*` : '';
        return `${header}\n\`\`\`ansi\n${lines}\n\`\`\`${more}`;
    }

    buildDescription(commit, maxFiles) {
        const summary = commit.message.split('\n')[0];
        const commitId = commit.id.substring(0, 7);
        let description = `\`${commitId}\` ${this.commitAuthor(commit)} - ${summary}`;

        if (this.showCommitBody) {
            const body = commit.message.split('\n').slice(1).join('\n').trim();
            if (body) {
                description += `\n\n${body}`;
            }
        }

        if (this.showFileNames) {
            description += `\n\n${this.formatFileList(commit, maxFiles)}`;
        }

        return description;
    }

    buildSummaryLine(commit) {
        const summary = commit.message.split('\n')[0];
        const commitId = commit.id.substring(0, 7);
        const sha = (commit.url && this.showCommitUrls) ? `[\`${commitId}\`](${commit.url})` : `\`${commitId}\``;
        return `${sha} ${this.commitAuthor(commit)} - ${summary}`;
    }

    buildFilesRecap(commits, maxFiles) {
        const status = new Map();
        for (const commit of commits) {
            for (const f of commit.added || []) status.set(f, '+');
            for (const f of commit.modified || []) {
                if (status.get(f) !== '+') status.set(f, '~');
            }
            for (const f of commit.removed || []) {
                if (status.get(f) === '+') status.delete(f);
                else status.set(f, '-');
            }
        }
        if (status.size === 0) return '';
        const recap = { added: [], modified: [], removed: [] };
        for (const [file, mark] of status) {
            if (mark === '+') recap.added.push(file);
            else if (mark === '~') recap.modified.push(file);
            else recap.removed.push(file);
        }
        return this.formatFileList(recap, maxFiles);
    }
}

module.exports = WebhookFormatter;
