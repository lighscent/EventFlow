# EventFlow

A lightweight, simple Discord bot to receive GitHub and Forgejo repository events via webhooks and post them in your Discord channels.

![Release](https://img.shields.io/github/v/release/lighscent/eventflow?label=Release&style=flat-square)
![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white&label=Platform&style=flat-square)
![Forgejo](https://img.shields.io/badge/Forgejo-FC660D?logo=forgejo&logoColor=white&label=Platform&style=flat-square)

## Features
- 🚀 **Fast & Lightweight:** Built with Node.js and Express.
- 🔗 **Multiple Webhooks:** Support for multiple repositories and channels (GitHub & Forgejo).
- 🔐 **Secure:** Verification of GitHub/Forgejo signatures and unique UUID-based endpoints.
- 💾 **SQLite Persistence:** Keeps track of your webhooks across restarts.
- 🛠️ **Slash Commands:** Manage everything directly from Discord.
- 🎨 **Customizable Embeds:** Fine-tune how GitHub events appear in Discord with detailed settings.

## Commands
All commands require the `AUTHORIZED_ID` permissions defined in your `.env` file.
- `/webhook create [name] [platform] [channel] [comment]`: Create a new webhook. `platform` (GitHub/Forgejo) and `channel` are required; `comment` is optional. The reply is an embed with the webhook URL hidden in a spoiler.
- `/webhook list`: Show all active webhooks (scoped to the current server) in a paginated embed, with delete buttons per webhook.
- `/webhook delete [name]`: Remove a webhook. The name field has autocomplete (scoped to the current server) showing each webhook's platform and last push date.

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lighscent/EventFlow.git
   cd EventFlow
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup environment variables:**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   DOMAIN=your_public_domain_or_ip
   DISCORD_TOKEN=your_discord_bot_token
   AUTHORIZED_ID=your_discord_user_id
   
   GITHUB_WEBHOOK_SECRET=your_secret_string
   FORGEJO_WEBHOOK_SECRET=your_secret_string
   ```
   Need strong random secrets? Generate them with [Env Key Generator](https://desktop.engineer/security/env-key-generator).

4. **Start the bot:**
   ```bash
   node main.js
   ```

## Configuration

The bot's behavior can be customized using the `settings.jsonc` file (JSON with comments). This file allows you to control how GitHub/Forgejo events are displayed in Discord embeds.

### Settings Overview

- **behavior**: Controls what information is shown and how pushes are handled.
  - `oneCommitPerMessage`: Send one embed per commit (true) or group commits (false).
  - `showFileNames`: Include file names in the embed.
  - `showCommitUrls`: Include links to commits.
  - `showCommitMessageBody`: Show full commit messages.
  - `showCompareLink`: Include compare links for pushes.
  - `showFilesRecap`: Replace per-commit file lists with one global recap (grouped mode + `showFileNames` only).
  - `onlyDefaultBranch`: Only process pushes to the default branch.

- **limits**: Set limits to prevent spam.
  - `maxCommitsPerEmbed`: Maximum commits per embed.
  - `maxEmbedsPerPush`: Maximum embeds per push event.
  - `maxFilesPerCommit`: Maximum files shown per commit.

- **display**: Customize embed appearance.
  - `showRepoNameInTitle`: Include repository name in embed title.
  - `showBranchInTitle`: Include branch name in title.
  - `showCommitCountInTitle`: Show commit count in title.
  - `separator`: Separator between commits in grouped mode.
  - `filePrefix`: Prefix for file lists (e.g. `Files:` renders as `**Files (N)**`).

- **embed**: Embed styling.
  - `color`: Hex color for embeds (default: Discord blue).
  - `footer`: Text in embed footer.

- **author**: Author display options.
  - `showIcon`: Show author avatar.
  - `useUrl`: Link to author's GitHub profile.
  - `usePusher`: Use pusher instead of sender for the author.

### Which settings work together

`oneCommitPerMessage` switches between two modes. Settings marked `—` are ignored in that mode (startup warns you).

| Setting | Single (`true`) | Grouped (`false`) | Needs |
|---|---|---|---|
| `showCompareLink` | — | ✅ | — |
| `showFilesRecap` | — | ✅ | `showFileNames:true` |
| `maxCommitsPerEmbed` | — | ✅ | — |
| `maxEmbedsPerPush` | ✅ (cap) | ✅ | — |
| `showCommitMessageBody` | ✅ | — (summary only) | — |
| `separator` | ✅ | ✅ | — |
| `showFileNames`, `maxFilesPerCommit`, `filePrefix` | ✅ | ✅ | `maxFilesPerCommit`/`filePrefix` need `showFileNames:true` |
| `showCommitUrls`, `onlyDefaultBranch`, title flags, `color`, `footer`, `author.*` | ✅ | ✅ | — |

## GitHub Setup
Once you've created a webhook via Discord using `/webhook create` (platform: **GitHub**), you'll receive an embed with a spoiler URL (`/github/<uuid>`).
1. Go to your GitHub repository -> Settings -> Webhooks.
2. Click "Add webhook".
3. **Payload URL:** Paste the URL provided by the bot.
4. **Content type:** `application/json`.
5. **Secret:** Match the `GITHUB_WEBHOOK_SECRET` in your `.env`. (Optional but recommended for security.)
6. **Events:** Select "Just the push event" (currently supported).

Opening a webhook URL in a browser shows a page with non-sensitive info (name, platform, comment, trigger count, last push).

## Forgejo Setup
Once you've created a webhook via Discord using `/webhook create` (platform: **Forgejo**), you'll receive an embed with a spoiler URL (`/forgejo/<uuid>`).
1. Go to your Forgejo repository -> Settings -> Webhooks.
2. Click "Add Webhook" and select "Forgejo".
3. **Target URL:** Paste the URL provided by the bot.
4. **HTTP Method:** `POST`.
5. **Content Type:** `application/json`.
6. **Secret:** Match the `FORGEJO_WEBHOOK_SECRET` in your `.env`. (Optional but recommended for security. If no secret is set, the webhook still works.)
7. **Trigger On:** Select "Push" (currently supported).

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
