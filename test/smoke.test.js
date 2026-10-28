const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DatabaseManager = require('../db/database');
const WebhookHandler = require('../utils/webhook/index');
const settings = require('../settings.json');

const fakePayload = () => ({
    ref: 'refs/heads/main',
    compare: 'https://github.com/lighscent/test/compare/a...b',
    repository: { full_name: 'lighscent/test', default_branch: 'main' },
    pusher: { name: 'tester' },
    sender: { login: 'tester' },
    commits: [{
        id: `abc1234${'0'.repeat(33)}`,
        message: 'test: fake push',
        url: 'https://github.com/lighscent/test/commit/abc1234',
        timestamp: new Date().toISOString(),
        added: ['index.js'],
        modified: [],
        removed: []
    }]
});

const fakeClient = (sent) => ({ channels: { cache: new Map([['chan1', { send: async (m) => { sent.push(m); } }]]) } });

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
        const handler = new WebhookHandler(db, fakeClient(sent), settings);
        const result = await handler.handlePush('uuid1', fakePayload(), 'github');
        assert.equal(result.status, 200);
        assert.equal(sent.length, 1);
        assert.match(sent[0].embeds[0].data.title, /lighscent\/test/);
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

    it('signature check passes without secret', () => {
        const handler = new WebhookHandler({}, {}, settings);
        assert.equal(handler.verifySignature({ headers: {} }, 'github'), true);
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
