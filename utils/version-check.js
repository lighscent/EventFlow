const cron = require('node-cron');
const log = require('./logger');

const REPO = 'lighscent/githook';
const { version: current } = require('../package.json');

const normalize = v => String(v || '').trim().replace(/^v/i, '');

const compare = (a, b) => {
    const pa = normalize(a).split('.').map(Number);
    const pb = normalize(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
};

async function checkForUpdates() {
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'githook' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) {
            log.debug(`Version check skipped (GitHub API: ${res.status}).`);
            return;
        }
        const { tag_name: tag, html_url: url } = await res.json();
        if (!tag) return;
        const cmp = compare(current, tag);
        if (cmp < 0) {
            log.warn(`New version available: ${normalize(tag)} (current: ${current}). See ${url}`);
        } else {
            log.info(`Running latest version (v${normalize(current)}).`);
        }
    } catch {
        log.debug('Version check skipped (no network).');
    }
}

module.exports = { checkForUpdates, startDailyVersionCheck };

function startDailyVersionCheck() {
    cron.schedule('0 6 * * *', checkForUpdates);
    log.info('Daily version check scheduled (06:00).');
}
