const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DatabaseManager = require('../db/database');
const WebhookHandler = require('../utils/webhook/index');
const settings = require('../utils/settings');

const fakePayload = () => ({
    ref: 'refs/heads/main',
    compare: 'https://github.com/lighscent/test/compare/a...b',
    repository: { full_name: 'lighscent/test', default_branch: 'main' },
    pusher: { name: 'tester' },
    sender: { login: 'tester' },
    commits: [{
        id: `abc1234${'0'.repeat(33)}`,
        message: 'test: fake push',
        author: { name: 'tester' },
        url: 'https://github.com/lighscent/test/commit/abc1234',
        timestamp: new Date().toISOString(),
        added: ['index.js'],
        modified: [],
        removed: []
    }]
});

const fakeClient = (sent) => ({ channels: { cache: new Map([['chan1', { send: async (m) => { sent.push(m); } }]]) } });

const testSettings = (behavior = {}, display = {}) => ({
    ...settings,
    display: { ...settings.display, ...display },
    behavior: {
        oneCommitPerMessage: true,
        showFileNames: false,
        showCommitUrls: true,
        showCommitMessageBody: false,
        showCompareLink: true,
        onlyDefaultBranch: false,
        ...behavior
    }
});

describe('database', () => {
    it('create / get / trigger / delete roundtrip', () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        assert.equal(db.getWebhook('uuid1').name, 'demo');
        db.updateWebhookTrigger('uuid1');
        assert.equal(db.getWebhookInfo('uuid1').triggerCount, 1);
        db.deleteWebhook('uuid1');
        assert.equal(db.getWebhook('uuid1'), undefined);
        db.close();
    });
});

describe('webhook handler', () => {
    it('push sends an embed and returns 200', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings());
        const result = await handler.handlePush('uuid1', fakePayload(), 'github');
        assert.equal(result.status, 200);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].embeds[0].data.title, '[lighscent/test:main] 1 new commit');
        assert.equal(sent[0].embeds[0].data.description, '`abc1234` tester - test: fake push');
        db.close();
    });

    it('unknown uuid returns 404', async () => {
        const db = new DatabaseManager(':memory:');
        const handler = new WebhookHandler(db, fakeClient([]), settings);
        assert.equal((await handler.handlePush('nope', fakePayload(), 'github')).status, 404);
        db.close();
    });

    it('empty commits sends nothing', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), settings);
        const payload = { ...fakePayload(), commits: [] };
        assert.equal((await handler.handlePush('uuid1', payload, 'github')).status, 200);
        assert.equal(sent.length, 0);
        db.close();
    });

    it('grouped push matches Discord style', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const grouped = testSettings({ oneCommitPerMessage: false });
        const handler = new WebhookHandler(db, fakeClient(sent), grouped);
        const result = await handler.handlePush('uuid1', fakePayload(), 'github');
        assert.equal(result.status, 200);
        assert.equal(sent[0].embeds[0].data.title, '[lighscent/test:main] 1 new commits');
        assert.match(sent[0].embeds[0].data.description, /tester - test: fake push/);
        assert.match(sent[0].embeds[0].data.description, /^\[`abc1234`\]\(https:\/\/github\.com\/lighscent\/test\/commit\/abc1234\) /);
        db.close();
    });

    it('showFileNames renders a diff block with count', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const files = testSettings({ showFileNames: true });
        const handler = new WebhookHandler(db, fakeClient(sent), files);
        const payload = fakePayload();
        payload.commits[0].modified = ['old.js'];
        payload.commits[0].removed = ['dead.js'];
        await handler.handlePush('uuid1', payload, 'github');
        const desc = sent[0].embeds[0].data.description;
        assert.match(desc, /\*\*Files \(3\)\*\*/);
        assert.match(desc, /```ansi\n\x1b\[0;32m\+index\.js\n\x1b\[0;33m~old\.js\n\x1b\[0;31m-dead\.js\x1b\[0m\n```/);
        db.close();
    });

    it('grouped push caps description at Discord limit', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ oneCommitPerMessage: false, showFileNames: true }));
        const payload = fakePayload();
        payload.commits = Array.from({ length: 5 }, (_, i) => ({
            id: `abc${i}000${'0'.repeat(30)}`,
            message: `commit number ${i} ${'x'.repeat(900)}`,
            author: { name: 'tester' },
            url: 'https://github.com/lighscent/test/commit/abc',
            timestamp: new Date().toISOString(),
            added: ['a.js', 'b.js', 'c.js'],
            modified: [],
            removed: []
        }));
        await handler.handlePush('uuid1', payload, 'github');
        const desc = sent[0].embeds[0].data.description;
        assert.ok(desc.length <= 4096);
        assert.match(desc, /more commits/);
        db.close();
    });

    it('grouped push never overflows with recap on 17 commits', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ oneCommitPerMessage: false, showFileNames: true, showFilesRecap: true }));
        const payload = fakePayload();
        payload.commits = Array.from({ length: 17 }, (_, i) => ({
            id: `c${i}00000${'0'.repeat(30)}`,
            message: `commit number ${i}`,
            author: { name: 'tester' },
            url: `https://github.com/lighscent/test/commit/c${i}`,
            timestamp: new Date().toISOString(),
            added: [`f${i}a.md`, `f${i}b.md`],
            modified: [],
            removed: []
        }));
        await handler.handlePush('uuid1', payload, 'github');
        assert.equal(sent.length, 4);
        for (const m of sent) {
            for (const e of m.embeds) {
                assert.ok(e.data.description.length <= 4096);
            }
            assert.doesNotMatch(m.embeds[0].data.description, /more commits/);
            assert.doesNotMatch(m.embeds[0].data.description, /```/);
        }
        assert.equal(sent[3].embeds.length, 2);
        assert.match(sent[3].embeds[1].data.description, /\*\*Files \(34\)\*\*/);
        assert.equal(sent[3].embeds[1].data.title, undefined);
        assert.equal(sent[3].embeds[1].data.author, undefined);
        assert.equal(sent[3].embeds[0].data.footer, undefined);
        assert.ok(sent[3].embeds[1].data.footer);
        assert.ok(sent[3].embeds[1].data.timestamp);
        db.close();
    });

    it('grouped push carries overflowed commits to the next embed', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ oneCommitPerMessage: false, showFileNames: true }));
        const payload = fakePayload();
        payload.commits = Array.from({ length: 6 }, (_, i) => ({
            id: `c${i}00000${'0'.repeat(30)}`,
            message: `commit number ${i} ${'x'.repeat(900)}`,
            author: { name: 'tester' },
            url: `https://github.com/lighscent/test/commit/c${i}`,
            timestamp: new Date().toISOString(),
            added: ['a.js', 'b.js', 'c.js'],
            modified: [],
            removed: []
        }));
        await handler.handlePush('uuid1', payload, 'github');
        assert.equal(sent.length, 2);
        const all = sent.map(m => m.embeds[0].data.description).join('\n');
        for (let k = 0; k < 6; k++) {
            assert.match(all, new RegExp(`commit number ${k} `));
        }
        assert.doesNotMatch(all, /more commits/);
        db.close();
    });
    it('grouped push spans multiple embeds', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ oneCommitPerMessage: false }));
        const payload = fakePayload();
        payload.commits = Array.from({ length: 15 }, (_, i) => ({
            id: `c${i}00000${'0'.repeat(30)}`,
            message: `commit ${i}`,
            author: { name: 'tester' },
            url: `https://github.com/lighscent/test/commit/c${i}`,
            timestamp: new Date().toISOString(),
            added: [],
            modified: [],
            removed: []
        }));
        const result = await handler.handlePush('uuid1', payload, 'github');
        assert.equal(result.status, 200);
        assert.equal(sent.length, 3);
        assert.equal(sent[0].embeds[0].data.title, '[lighscent/test:main] 15 new commits');
        for (const m of sent) {
            assert.doesNotMatch(m.embeds[0].data.description, /more commits/);
        }
        assert.equal(sent[1].embeds[0].data.title, undefined);
        assert.equal(sent[1].embeds[0].data.author, undefined);
        assert.ok(sent[0].embeds[0].data.author);
        for (const m of [sent[0], sent[1]]) {
            assert.equal(m.embeds[0].data.footer, undefined);
            assert.equal(m.embeds[0].data.timestamp, undefined);
        }
        assert.ok(sent[2].embeds[0].data.footer);
        assert.ok(sent[2].embeds[0].data.timestamp);
        db.close();
    });

    it('grouped push notes commits beyond the embed limit', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const limited = { ...testSettings({ oneCommitPerMessage: false }), limits: { maxCommitsPerEmbed: 2, maxEmbedsPerPush: 2, maxFilesPerCommit: 10 } };
        const handler = new WebhookHandler(db, fakeClient(sent), limited);
        const payload = fakePayload();
        payload.commits = Array.from({ length: 5 }, (_, i) => ({
            id: `c${i}00000${'0'.repeat(30)}`,
            message: `commit ${i}`,
            author: { name: 'tester' },
            url: `https://github.com/lighscent/test/commit/c${i}`,
            timestamp: new Date().toISOString(),
            added: [],
            modified: [],
            removed: []
        }));
        await handler.handlePush('uuid1', payload, 'github');
        assert.equal(sent.length, 2);
        assert.match(sent[1].embeds[0].data.description, /…and 1 more commits/);
        db.close();
    });

    it('missing commit url falls back to plain sha', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ oneCommitPerMessage: false }));
        const payload = fakePayload();
        delete payload.commits[0].url;
        await handler.handlePush('uuid1', payload, 'github');
        const desc = sent[0].embeds[0].data.description;
        assert.match(desc, /`abc1234` tester - test: fake push/);
        assert.doesNotMatch(desc, /undefined/);
        db.close();
    });

    it('files recap aggregates without duplicates', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ oneCommitPerMessage: false, showFileNames: true, showFilesRecap: true }));
        const payload = fakePayload();
        payload.commits = [
            { id: `aaa1111${'0'.repeat(33)}`, message: 'one', author: { name: 't' }, url: 'https://x/1', timestamp: new Date().toISOString(), added: ['new.md', 'gone.md'], modified: ['edit.md'], removed: [] },
            { id: `bbb2222${'0'.repeat(33)}`, message: 'two', author: { name: 't' }, url: 'https://x/2', timestamp: new Date().toISOString(), added: [], modified: ['new.md'], removed: ['gone.md', 'old.md'] }
        ];
        await handler.handlePush('uuid1', payload, 'github');
        assert.equal(sent.length, 1);
        assert.equal(sent[0].embeds.length, 2);
        const lines = sent[0].embeds[0].data.description;
        assert.doesNotMatch(lines, /```/);
        const desc = sent[0].embeds[1].data.description;
        assert.match(desc, /\*\*Files \(3\)\*\*/);
        assert.match(desc, /\+new\.md/);
        assert.match(desc, /~edit\.md/);
        assert.match(desc, /-old\.md/);
        assert.doesNotMatch(desc, /gone\.md/);
        assert.doesNotMatch(desc, /~new\.md/);
        db.close();
    });

    it('files overflow says more files', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ showFileNames: true }));
        const payload = fakePayload();
        payload.commits[0].added = Array.from({ length: 12 }, (_, i) => `f${i}.js`);
        await handler.handlePush('uuid1', payload, 'github');
        assert.match(sent[0].embeds[0].data.description, /…and 2 more files/);
        db.close();
    });
    it('single push truncates oversized descriptions', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings());
        const payload = fakePayload();
        payload.commits[0].message = 'm'.repeat(5000);
        await handler.handlePush('uuid1', payload, 'github');
        const desc = sent[0].embeds[0].data.description;
        assert.ok(desc.length <= 4096);
        db.close();
    });

    it('grouped push shows files when showFileNames is true', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ oneCommitPerMessage: false, showFileNames: true }));
        await handler.handlePush('uuid1', fakePayload(), 'github');
        const desc = sent[0].embeds[0].data.description;
        assert.match(desc, /\*\*Files \(1\)\*\*/);
        assert.match(desc, /```ansi\n\x1b\[0;32m\+index\.js\x1b\[0m\n```/);
        db.close();
    });

    it('ping sends a confirmation embed and returns 200', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings());
        const result = await handler.handlePing('uuid1', {
            zen: 'Keep it logically awesome.',
            repository: { full_name: 'lighscent/test', html_url: 'https://github.com/lighscent/test' }
        }, 'github');
        assert.equal(result.status, 200);
        assert.equal(sent.length, 1);
        assert.match(sent[0].embeds[0].data.title, /lighscent\/test/);
        db.close();
    });

    it('signature check passes without secret', () => {
        const handler = new WebhookHandler({}, {}, settings);
        assert.equal(handler.verifySignature({ headers: {} }, 'github'), true);
    });
});

describe('settings', () => {
    const WebhookSettings = require('../utils/webhook/WebhookSettings');

    it('falls back to defaults when empty', () => {
        const s = new WebhookSettings({});
        assert.equal(s.getLimit('maxCommitsPerEmbed'), 5);
        assert.equal(s.getBehavior('showCommitUrls'), true);
        assert.equal(s.getDisplay('separator'), '\n\n');
        assert.equal(s.getEmbed('color'), '7289DA');
        assert.equal(s.getAuthor('usePusher'), true);
    });

    it('coerces numeric limits and rejects invalid values', () => {
        const s = new WebhookSettings({ limits: { maxCommitsPerEmbed: '3', maxEmbedsPerPush: 0, maxFilesPerCommit: 'abc' } });
        assert.equal(s.getLimit('maxCommitsPerEmbed'), 3);
        assert.equal(s.getLimit('maxEmbedsPerPush'), 20);
        assert.equal(s.getLimit('maxFilesPerCommit'), 10);
    });

    it('rejects bad colors and non-boolean flags', () => {
        const s = new WebhookSettings({ embed: { color: 'zzz' }, behavior: { showCommitUrls: 'yes' } });
        assert.equal(s.getEmbed('color'), '7289DA');
        assert.equal(s.getBehavior('showCommitUrls'), true);
    });

    it('settings.jsonc uses the new key names', () => {
        const raw = fs.readFileSync(path.join(__dirname, '..', 'settings.jsonc'), 'utf8');
        for (const legacy of ['embedColor', 'footerText', 'fileListPrefix', 'embedDescriptionSeparator', 'authorUsePusher', 'useAuthorUrl', 'showAuthorIcon']) {
            assert.doesNotMatch(raw, new RegExp(legacy));
        }
    });

    it('warns on ineffective setting combinations', () => {
        const log = require('../utils/logger');
        const original = log.warn;
        const warnings = [];
        log.warn = (msg) => warnings.push(msg);
        try {
            new WebhookSettings(testSettings({ showFilesRecap: true }));
            assert.ok(warnings.some(m => m.includes('showFilesRecap') && m.includes('oneCommitPerMessage')));

            warnings.length = 0;
            new WebhookSettings(testSettings({ oneCommitPerMessage: false, showCommitMessageBody: true }));
            assert.ok(warnings.some(m => m.includes('showCommitMessageBody')));

            warnings.length = 0;
            new WebhookSettings(testSettings());
            assert.equal(warnings.length, 0);
        } finally {
            log.warn = original;
        }
    });

    it('single mode honors the custom separator', async () => {
        const db = new DatabaseManager(':memory:');
        db.createWebhook('uuid1', 'chan1', 'demo', 'github', null);
        const sent = [];
        const handler = new WebhookHandler(db, fakeClient(sent), testSettings({ showCommitMessageBody: true }, { separator: '\n---\n' }));
        const payload = fakePayload();
        payload.commits[0].message = 'summary\nbody line';
        await handler.handlePush('uuid1', payload, 'github');
        assert.match(sent[0].embeds[0].data.description, /summary\n---\nbody line/);
        db.close();
    });
});

describe('commands', () => {
    it('/webhook has create/list/delete, legacy list-webhooks is gone', () => {
        const webhook = require('../commands/webhook');
        const subs = webhook.data.options.map(o => o.name).sort();
        assert.deepEqual(subs, ['create', 'delete', 'list']);
        assert.equal(fs.existsSync(path.join(__dirname, 'demo-repo')), true);
        assert.equal(fs.existsSync(path.join(__dirname, '..', 'commands', 'list-webhooks.js')), false);
    });
});
