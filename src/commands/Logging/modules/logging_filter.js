import { PermissionsBitField } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { logEvent } from '../../../utils/moderation.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('הרשאה נדחתה', 'אתה צריך הרשאות **Administrator** כדי לנהל מסננים רישום.')],
            });
        }

        if (!client.db) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('שגיאת בסיס נתונים', 'בסיס הנתונים לא אותחל.')],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const type = interaction.options.getString('type');
        const entityId = interaction.options.getString('id');
        const guildId = interaction.guildId;

        const currentConfig = await getGuildConfig(client, guildId);
        if (!currentConfig.logIgnore) {
            currentConfig.logIgnore = { users: [], channels: [] };
        }

        let targetArray;
        let entityType;
        let entityName;

        if (type === 'user') {
            targetArray = currentConfig.logIgnore.users;
            entityType = 'משתמש';
            const member = await interaction.guild.members.fetch(entityId).catch(() => null);
            entityName = member ? member.user.tag : `ID: ${entityId}`;
        } else if (type === 'channel') {
            targetArray = currentConfig.logIgnore.channels;
            entityType = 'ערוץ';
            const channel = interaction.guild.channels.cache.get(entityId);
            entityName = channel ? `#${channel.name}` : `ID: ${entityId}`;
        } else {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('סוג לא חוקי', "בחר `user` או `channel`.")],
            });
        }

        let successMessage;

        if (subcommand === 'add') {
            if (targetArray.includes(entityId)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('כבר מסונן', `${entityType} **${entityName}** כבר ברשימת ההתעלמות.`)],
                });
            }
            targetArray.push(entityId);
            successMessage = `${entityType} **${entityName}** נוסף לרשימת ההתעלמות מרישום. אירועים מהם לא יירשמו.`;
        } else if (subcommand === 'remove') {
            const index = targetArray.indexOf(entityId);
            if (index === -1) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('לא מסונן', `${entityType} **${entityName}** לא היה ברשימת ההתעלמות.`)],
                });
            }
            targetArray.splice(index, 1);
            successMessage = `${entityType} **${entityName}** הוסר מרשימת ההתעלמות מרישום. אירועים יירשמו כעת.`;
        } else {
            return;
        }

        try {
            await setGuildConfig(client, guildId, currentConfig);

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: 'מסנן רישום עודכן',
                    target: `מסנן ${subcommand}`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: { entityType, loggingEnabled: currentConfig.enableLogging },
                },
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('מסנן עודכן', successMessage)],
            });
        } catch (error) {
            logger.error('logging filter error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('שגיאת בסיס נתונים', 'נכשל לשמור את שינוי המסנן.')],
            });
        }
    },
};
