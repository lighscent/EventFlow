const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, REST, Routes, Events, MessageFlags } = require('discord.js');
const log = require('./logger');

class DiscordBot {
    constructor(db, port, app) {
        this.db = db;
        this.port = port;
        this.app = app;
        this.commands = new Map();

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });

        this.loadCommands();
        this.registerEvents();
    }

    loadCommands() {
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            this.commands.set(command.data.name, command);
        }
    }

    registerEvents() {
        this.client.on(Events.InteractionCreate, async interaction => {
            if (interaction.isAutocomplete()) {
                const command = this.commands.get(interaction.commandName);
                if (!command || !command.autocomplete) return;

                try {
                    await command.autocomplete(interaction, this.db);
                } catch (error) {
                    log.error(error);
                }
                return;
            }

            if (!interaction.isChatInputCommand()) return;

            if (process.env.AUTHORIZED_ID && interaction.user.id !== process.env.AUTHORIZED_ID) {
                return await interaction.reply({
                    content: "You don't have permission to use this command.",
                    flags: MessageFlags.Ephemeral
                });
            }

            const command = this.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction, this.db, this.port);
            } catch (error) {
                log.error(error);
                await interaction.reply({ content: 'Error executing the command.', flags: MessageFlags.Ephemeral });
            }
        });

        this.client.once(Events.ClientReady, async () => {
            log.info(`Bot ready: ${this.client.user.tag}`);

            const commandData = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

            try {
                await rest.put(Routes.applicationCommands(this.client.user.id), { body: commandData });
                log.info('Slash commands deployed.');
            } catch (error) {
                log.error(error);
            }

            this.app.listen(this.port, () => {
                log.info(`Server ready on port ${this.port}`);
            });
        });
    }

    async start(token) {
        await this.client.login(token);
    }
}

module.exports = {
    createDiscordBot: (db, port, app) => new DiscordBot(db, port, app)
};
