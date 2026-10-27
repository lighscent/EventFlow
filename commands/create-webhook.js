const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const log = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-webhook')
        .setDescription('Create a new webhook')
        .addStringOption(option =>
            option.setName('wh_name')
                .setDescription('Name displayed at the top of the embed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('Platform the webhook targets')
                .setRequired(true)
                .addChoices(
                    { name: 'GitHub', value: 'github' },
                    { name: 'Forgejo', value: 'forgejo' }
                ))
        .addChannelOption(option =>
            option.setName('channel_id')
                .setDescription('Channel where to send notifications')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('comment')
                .setDescription('Optional comment for this webhook')
                .setRequired(false)),

    async execute(interaction, db, port) {
        const whName = interaction.options.getString('wh_name');
        const platform = interaction.options.getString('platform');
        const channel = interaction.options.getChannel('channel_id');
        const comment = interaction.options.getString('comment');
        const newUuid = require('uuid').v6();

        try {
            db.createWebhook(newUuid, channel.id, whName, platform, comment);

            const webhookUrl = `http://${process.env.DOMAIN || 'YOUR_IP'}:${port}/${platform}/${newUuid}`;
            const platformLabel = platform === 'forgejo' ? 'Forgejo' : 'GitHub';

            const embed = new EmbedBuilder()
                .setTitle('Webhook created')
                .setColor(0x7289DA)
                .addFields(
                    { name: 'Name', value: whName, inline: true },
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
};
