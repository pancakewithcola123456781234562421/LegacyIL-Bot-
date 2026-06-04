import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getLoggingStatus, EVENT_TYPES } from '../../../services/loggingService.js';
import { createLoggingDashboardComponents } from '../../../utils/loggingUi.js';
import { errorEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((acc, eventType) => {
    const [category] = eventType.split('.');
    if (!acc[category]) acc[category] = [];
    acc[category].push(eventType);
    return acc;
}, {});

const CATEGORY_MAP = [
    ['moderation',   '🔨 ניהול'],
    ['ticket',       '🎫 אירועי כרטיסים'],
    ['message',      '✉️ אירועי הודעות'],
    ['role',         '🏷️ אירועי תפקידים'],
    ['member',       '👥 אירועי חברים'],
    ['leveling',     '📈 אירועי דירוג'],
    ['reactionrole', '🎭 אירועי תפקיד תגובה'],
    ['giveaway',     '🎁 אירועי מתנות'],
    ['counter',      '📊 אירועי מונה'],
];

function getCategoryStatus(enabledEvents, category, auditEnabled) {
    if (!auditEnabled) return false;
    const events = enabledEvents || {};
    if (events[`${category}.*`] === false) return false;
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    if (categoryEvents.length === 0) return true;
    return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
    if (!id) return '`לא מוגדר`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ חסר (${id})`;
}

export async function buildLoggingDashboardView(interaction, client) {
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const loggingStatus = await getLoggingStatus(client, interaction.guildId);

    const auditEnabled = Boolean(loggingStatus.enabled);
    const auditChannel = await formatChannelMention(
        interaction.guild,
        loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId,
    );
    const lifecycleChannel = await formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId);
    const transcriptChannel = await formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId);

    const ignoredUsers = guildConfig.logIgnore?.users || [];
    const ignoredChannels = guildConfig.logIgnore?.channels || [];

    const categoryLines = CATEGORY_MAP.map(([key, label]) => {
        const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
        return `${on ? '✅' : '❌'} ${label}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('📋 לוח בקרה הרישום')
        .setDescription(`ניהול רישום ביקורת עבור **${interaction.guild.name}**. כפתורי קטגוריה משנים את הרישום באופן מידי.`)
        .setColor(auditEnabled ? getColor('success') : getColor('warning'))
        .addFields(
            {
                name: '🧾 רישום ביקורת',
                value: auditEnabled ? '✅ מופעל' : '❌ מכובה',
                inline: true,
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true,
            },
            {
                name: '\u200B',
                value: '\u200B',
                inline: true,
            },
            {
                name: '📡 ערוצי רישום',
                value: [
                    `**ביקורת:** ${auditChannel}`,
                    `**רישום כרטיסים:** ${lifecycleChannel}`,
                    `**תמלול כרטיסים:** ${transcriptChannel}`,
                ].join('\n'),
                inline: false,
            },
            {
                name: '📋 קטגוריות אירועים',
                value: categoryLines,
                inline: false,
            },
            {
                name: '🧹 מסננים התעלמות',
                value: `משתמשים: **${ignoredUsers.length}**\nערוצים: **${ignoredChannels.length}**`,
                inline: true,
            },
            {
                name: '🕒 רענון אחרון',
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true,
            },
        )
        .setFooter({ text: 'השתמש ב-/logging setchannel כדי להגדיר את ערוץ הביקורת  •  /ticket setup או /ticket dashboard כדי להגדיר ערוצי כרטיסים' })
        .setTimestamp();

    const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
    return { embed, components };
}

export default {
    async execute(interaction, config, client) {
        try {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('הרשאה נדחתה', 'אתה צריך הרשאות **ניהול שרת** כדי לצפות בלוח בקרה הרישום.')],
                });
            }

            await InteractionHelper.safeDefer(interaction);
            const { embed, components } = await buildLoggingDashboardView(interaction, client);
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });
        } catch (error) {
            logger.error('logging_dashboard error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('שגיאת לוח בקרה', 'נכשל לטעון את לוח בקרה הרישום.')],
            });
        }
    },
};
