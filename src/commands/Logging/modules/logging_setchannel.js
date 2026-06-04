import { PermissionsBitField, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { logEvent } from '../../../utils/moderation.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('הרשאה נדחתה', 'אתה צריך הרשאות **Administrator** כדי לשנות ערוצי רישום.')],
            });
        }

        if (!client.db) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('שגיאת בסיס נתונים', 'בסיס הנתונים לא אותחל.')],
            });
        }

        const guildId = interaction.guildId;
        const currentConfig = await getGuildConfig(client, guildId);

        const logChannel = interaction.options.getChannel('channel');
        const disableLogging = interaction.options.getBoolean('disable');

        try {
            if (disableLogging) {
                currentConfig.logChannelId = null;
                currentConfig.enableLogging = false;
                currentConfig.logging = {
                    ...(currentConfig.logging || {}),
                    enabled: false,
                    channelId: null,
                };
                await setGuildConfig(client, guildId, currentConfig);
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('רישום מושבת 🚫', 'רישום הביקורת הושבת לשרת זה.')],
                });
            }

            if (logChannel) {
                const perms = logChannel.permissionsFor(interaction.guild.members.me);
                if (!perms.has(PermissionsBitField.Flags.SendMessages) || !perms.has(PermissionsBitField.Flags.EmbedLinks)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('שגיאת הרשאת בוט', `אני צריך הרשאות **שליחת הודעות** ו**הטמעת קישורים** ב-${logChannel}.`)],
                    });
                }

                currentConfig.logChannelId = logChannel.id;
                currentConfig.enableLogging = true;
                currentConfig.logging = {
                    ...(currentConfig.logging || {}),
                    enabled: true,
                    channelId: logChannel.id,
                };
                await setGuildConfig(client, guildId, currentConfig);

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('ערוץ רישום הוגדר 📝', `רישום ביקורת ישלח ל-${logChannel}.`)],
                });

                await logEvent({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: 'ערוץ רישום הופעל',
                        target: logChannel.toString(),
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        reason: `ערוץ רישום הגדר על ידי ${interaction.user}`,
                        metadata: { channelId: logChannel.id, moderatorId: interaction.user.id, loggingEnabled: true },
                    },
                });
                return;
            }

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('לא סופקה אפשרות', 'ספק אחת מהבאות: `channel` או `disable: True`.\n\n> תמלול כרטיסים וערוצי רישום מנוהלים דרך `/ticket setup` או `/ticket dashboard`.')],
            });
        } catch (error) {
            logger.error('logging setchannel error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('שגיאת הגדרה', 'לא ניתן לשמור את ההגדרה.')],
            });
        }
    },
};
