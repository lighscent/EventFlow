const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-webhook')
        .setDescription('Deletes a webhook by name')
        .addStringOption(option =>
            option.setName('webhook_name')
                .setDescription('The exact name of the webhook to delete')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction, db) {
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
    },

    async execute(interaction, db) {
        const name = interaction.options.getString('webhook_name');

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
            if (i.customId === 'confirm_delete') {
                db.deleteWebhook(webhook.uuid);
                await i.update({ content: `Webhook **${webhook.name}** has been successfully deleted.`, components: [] });
            } else {
                await i.update({ content: 'Deletion cancelled.', components: [] });
            }
            collector.stop();
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await interaction.editReply({ content: 'Deletion timed out.', components: [] });
            }
        });
    }
};