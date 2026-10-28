require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const DatabaseManager = require('./db/database');
const WebhookHandler = require('./utils/webhook/index');
const { createDiscordBot } = require('./utils/discord');
const { checkForUpdates, startDailyVersionCheck } = require('./utils/version-check');
const settings = require('./utils/settings');

const app = express();
const port = process.env.PORT || 3000;

const db = new DatabaseManager();
const discordBot = createDiscordBot(db, port, app);
const webhookHandler = new WebhookHandler(db, discordBot.client, settings);

app.use(bodyParser.json());

const handleWebhook = platform => async (req, res) => {
    const { uuid } = req.params;

    if (!webhookHandler.verifySignature(req, platform)) {
        return res.status(401).send('Invalid signature');
    }

    const event = req.headers['x-forgejo-event'] || req.headers['x-gitea-event'] || req.headers['x-github-event'];

    if (event === 'push') {
        const result = await webhookHandler.handlePush(uuid, req.body, platform);
        res.sendStatus(result.status);
    } else if (event === 'ping') {
        const result = await webhookHandler.handlePing(uuid, req.body, platform);
        res.sendStatus(result.status);
    } else {
        res.sendStatus(200);
    }
};

app.post('/github/:uuid', handleWebhook('github'));
app.post('/forgejo/:uuid', handleWebhook('forgejo'));

const escapeHtml = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const showWebhookInfo = (req, res) => {
    const { uuid } = req.params;
    const row = db.getWebhookInfo(uuid);

    if (!row) {
        return res.status(404).send('<!DOCTYPE html><html><body><h1>404 - Webhook not found</h1></body></html>');
    }

    const platformLabel = row.platform === 'forgejo' ? 'Forgejo' : 'GitHub';
    const last = row.lastTriggered
        ? new Date(row.lastTriggered).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Never';

    res.set('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Webhook - ${escapeHtml(row.name)}</title>
    <style>
        body { font-family: sans-serif; background: #1e1f22; color: #f2f3f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #2b2d31; border-radius: 12px; padding: 32px 40px; max-width: 420px; width: 100%; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        h1 { margin: 0 0 4px; font-size: 22px; }
        .sub { color: #949ba4; margin: 0 0 20px; font-size: 14px; }
        .info { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid #3f4147; font-size: 14px; }
        .info span:first-child { color: #949ba4; }
        .note { color: #949ba4; font-size: 12px; margin-top: 20px; }
        .badge { background: #5865f2; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>${escapeHtml(row.name)}</h1>
        <p class="sub">Webhook details <span class="badge">${platformLabel}</span></p>
        <div class="info"><span>Platform</span><span>${platformLabel}</span></div>
        ${row.comment ? `<div class="info"><span>Comment</span><span>${escapeHtml(row.comment)}</span></div>` : ''}
        <div class="info"><span>Triggers</span><span>${row.triggerCount}</span></div>
        <div class="info"><span>Last push</span><span>${last}</span></div>
        <p class="note">This page only shows non-sensitive information. Keep the webhook URL private.</p>
    </div>
</body>
</html>`);
};

app.get('/github/:uuid', showWebhookInfo);
app.get('/forgejo/:uuid', showWebhookInfo);

discordBot.start(process.env.DISCORD_TOKEN);

void checkForUpdates();
startDailyVersionCheck();

process.on('SIGINT', () => {
    require('./utils/logger').close();
    db.close();
    discordBot.client.destroy();
    process.exit(0);
});
