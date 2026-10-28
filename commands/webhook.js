const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ComponentType, InteractionContextType, MessageFlags } = require('discord.js');
const { v6: uuidv6 } = require('uuid');
const log = require('../utils/logger');

const PAGE_SIZE = 10;
const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('webhook')
        .setDescription('Manage all webhooks for EventFlow')
        .setContexts(InteractionContextType.Guild)
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new webhook')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name for the webhook (used for identification)')
                        .setRequired(true)
                        .setMaxLength(100))
                .addStringOption(option =>
                    option.setName('platform')
                        .setDescription('Platform the webhook targets')
                        .setRequired(true)
                        .addChoices(
                            { name: 'GitHub', value: 'github' },
                            { name: 'Forgejo', value: 'forgejo' }
                        ))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel where to send notifications')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
                .addStringOption(option =>
                    option.setName('comment')
                        .setDescription('Optional comment for this webhook')
                        .setRequired(false)
                        .setMaxLength(200)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Lists active GitHub/Forgejo webhooks'))
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Deletes a webhook by name')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Select a webhook to delete')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async autocomplete(interaction, db) {
        if (interaction.options.getSubcommand() !== 'delete') return;
        try {
            const focused = interaction.options.getFocused().toLowerCase();
            const rows = db.getAllWebhooks()
                .filter(row => interaction.guild.channels.cache.has(row.channelId))
                .filter(row => row.name.toLowerCase().includes(focused));

            const choices = rows.slice(0, 25).map(row => {
                const platformLabel = row.platform === 'forgejo' ? 'Forgejo' : 'GitHub';
                const last = row.lastTriggered
                    ? new Date(row.lastTriggered).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'never';

                return {
                    name: `${row.name} | ${platformLabel} | last push: ${last}`.slice(0, 100),
                    value: row.name.slice(0, 100)
                };
            });

            await interaction.respond(choices);
        } catch (error) {
            log.error(error);
            await interaction.respond([]).catch(() => {});
        }
    },

    async execute(interaction, db, port) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') return createWebhook(interaction, db, port);
        if (subcommand === 'list') return listWebhooks(interaction, db);
        if (subcommand === 'delete') return deleteWebhook(interaction, db);
    }
};

async function createWebhook(interaction, db, port) {
    const webhookName = interaction.options.getString('name');
    const platform = interaction.options.getString('platform');
    const channel = interaction.options.getChannel('channel');
    const comment = interaction.options.getString('comment');
    const newUuid = uuidv6();

    try {
        const duplicate = db.getAllWebhooks()
            .filter(row => interaction.guild.channels.cache.has(row.channelId))
            .some(r => r.name.toLowerCase() === webhookName.toLowerCase());

        if (duplicate) {
            return await interaction.reply({ content: `A webhook named **${webhookName}** already exists.`, flags: MessageFlags.Ephemeral });
        }

        db.createWebhook(newUuid, channel.id, webhookName, platform, comment);

        const webhookUrl = `http://${process.env.DOMAIN || 'YOUR_IP'}:${port}/${platform}/${newUuid}`;
        const platformLabel = platform === 'forgejo' ? 'Forgejo' : 'GitHub';

        const embed = new EmbedBuilder()
            .setTitle('Webhook created')
            .setColor(0x7289DA)
            .addFields(
                { name: 'Name', value: webhookName, inline: true },
                { name: 'Platform', value: platformLabel, inline: true },
                { name: 'Channel', value: `<#${channel.id}>`, inline: true }
            );

        if (comment) {
            embed.addFields({ name: 'Comment', value: comment });
        }

        embed.addFields(
            { name: 'URL', value: `||${webhookUrl}||` },
            { name: 'Note', value: 'Keep this URL secret.' }
        );

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        log.error(error);
        await interaction.reply({ content: "Error while creating the webhook.", flags: MessageFlags.Ephemeral });
    }
}

async function listWebhooks(interaction, db) {
    try {
        const rows = db.getAllWebhooks()
            .filter(row => interaction.guild.channels.cache.has(row.channelId));

        if (rows.length === 0) {
            return await interaction.reply({ content: 'No active webhooks.', flags: MessageFlags.Ephemeral });
        }

        let page = 0;
        let pendingDelete = null;
        const totalPages = () => Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        const pageRows = () => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

        const buildEmbed = () => {
            const embed = new EmbedBuilder()
                .setTitle(`Active webhooks (${rows.length})`)
                .setDescription('Use the buttons below to delete a webhook or navigate pages.')
                .setColor(0x7289DA)
                .setFooter({ text: `Page ${page + 1}/${totalPages()}` })
                .setTimestamp();

            for (const row of pageRows()) {
                const partial = row.uuid.substring(0, 8);
                const last = row.lastTriggered
                    ? `<t:${Math.floor(new Date(row.lastTriggered).getTime() / 1000)}:R>`
                    : 'Never';
                const comment = row.comment ? `\n> *${row.comment}*` : '';
                const platformLabel = row.platform === 'forgejo' ? 'Forgejo' : 'GitHub';

                embed.addFields({
                    name: `${row.name} — ${platformLabel}`,
                    value: `<#${row.channelId}> | \`${partial}...\`\nTriggers: ${row.triggerCount} | Last: ${last}${comment}`
                });
            }

            return embed;
        };

        const buildComponents = () => {
            const pageWebhooks = pageRows();
            const deleteRows = [];

            for (let i = 0; i < pageWebhooks.length; i += 5) {
                const deleteRow = new ActionRowBuilder();
                for (const row of pageWebhooks.slice(i, i + 5)) {
                    const isPending = pendingDelete === row.uuid;
                    deleteRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`delete_${row.uuid}`)
                            .setLabel(isPending ? `Confirm delete ${row.name}?`.slice(0, 80) : `Delete ${row.name}`.slice(0, 80))
                            .setStyle(isPending ? ButtonStyle.Danger : ButtonStyle.Secondary)
                    );
                }
                deleteRows.push(deleteRow);
            }

            const navRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('page_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('page_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page >= totalPages() - 1),
                    new ButtonBuilder()
                        .setCustomId('close_list')
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Secondary)
                );

            return [...deleteRows, navRow];
        };

        const response = await interaction.reply({
            embeds: [buildEmbed()],
            components: buildComponents(),
            flags: MessageFlags.Ephemeral,
            withResponse: true
        });

        const message = response.resource.message;

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: COLLECTOR_TIMEOUT
        });

        collector.on('collect', async i => {
            try {
                const customId = i.customId;

                if (customId === 'page_prev') {
                    page = Math.max(0, page - 1);
                    pendingDelete = null;
                    return await i.update({ embeds: [buildEmbed()], components: buildComponents() });
                }

                if (customId === 'page_next') {
                    page = Math.min(totalPages() - 1, page + 1);
                    pendingDelete = null;
                    return await i.update({ embeds: [buildEmbed()], components: buildComponents() });
                }

                if (customId === 'close_list') {
                    await i.update({ components: [] });
                    return collector.stop();
                }

                if (customId.startsWith('delete_')) {
                    const uuid = customId.slice('delete_'.length);
                    const target = rows.find(row => row.uuid === uuid);
                    if (!target) return;

                    if (pendingDelete !== uuid) {
                        pendingDelete = uuid;
                        return await i.update({ embeds: [buildEmbed()], components: buildComponents() });
                    }
                    pendingDelete = null;
                    db.deleteWebhook(uuid);

                    const index = rows.findIndex(row => row.uuid === uuid);
                    if (index !== -1) rows.splice(index, 1);

                    if (rows.length === 0) {
                        await i.update({ content: 'No active webhooks.', embeds: [], components: [] });
                        return collector.stop();
                    }

                    page = Math.min(page, totalPages() - 1);
                    await i.update({ embeds: [buildEmbed()], components: buildComponents() });
                }
            } catch (error) {
                log.error(error);
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await interaction.editReply({ components: [] }).catch(() => {});
            }
        });
    } catch (error) {
        log.error(error);
        const payload = { content: 'Error while listing webhooks.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}

async function deleteWebhook(interaction, db) {
    try {
        const name = interaction.options.getString('name');

        const rows = db.getAllWebhooks()
            .filter(row => interaction.guild.channels.cache.has(row.channelId));
        const webhook = rows.find(r => r.name.toLowerCase() === name.toLowerCase());

        if (!webhook) {
            return await interaction.reply({ content: `No webhook found with the name: **${name}**`, flags: MessageFlags.Ephemeral });
        }

        const confirm = new ButtonBuilder()
            .setCustomId('confirm_delete')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Danger);

        const cancel = new ButtonBuilder()
            .setCustomId('cancel_delete')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirm, cancel);

        const response = await interaction.reply({
            content: `Are you sure you want to delete the webhook **${webhook.name}**? This action is **not reversible**.`,
            components: [row],
            flags: MessageFlags.Ephemeral,
            withResponse: true
        });

        const collector = response.resource.message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on('collect', async i => {
            try {
                if (i.customId === 'confirm_delete') {
                    db.deleteWebhook(webhook.uuid);
                    await i.update({ content: `Webhook **${webhook.name}** has been successfully deleted.`, components: [] });
                } else {
                    await i.update({ content: 'Deletion cancelled.', components: [] });
                }
            } catch (error) {
                log.error(error);
            }
            collector.stop();
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await interaction.editReply({ content: 'Deletion timed out.', components: [] }).catch(() => {});
            }
        });
    } catch (error) {
        log.error(error);
        const payload = { content: 'Error while deleting the webhook.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}
