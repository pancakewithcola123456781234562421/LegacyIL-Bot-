import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('קטגוריה');
        const nameTemplate = interaction.options.getString('שם_ערוץ') || "חדר של {username}";
        const userLimit = interaction.options.getInteger('מגבלת_משתמשים') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerChannel = await interaction.guild.channels.create({
                name: 'הצטרף כדי ליצור',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                `ערוץ הטריגר נוצר: ${triggerChannel}\n\n` +
                `**הגדרות:**\n` +
                `• תבנית שם ערוץ זמני: \`${nameTemplate}\`\n` +
                `• מגבלת משתמשים: ${userLimit === 0 ? 'ללא מגבלה' : userLimit + ' משתמשים'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ? `• קטגוריה: ${category.name}` : '• קטגוריה: ללא (בשורה הראשית)'}\n\n` +
                `כאשר משתמשים יצטרפו לערוץ זה, ערוץ קול זמני יווצר בשבילם.`,
                '✅ הגדרת הצטרף כדי ליצור הושלמה'
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Error responding to interaction:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('All response attempts failed:', e);
                }
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error in JoinToCreate setup:', error);
            throw new TitanBotError(
                `ההגדרה נכשלה: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'נכשל לעמד את מערכת הצטרף כדי ליצור.'
            );
        }
    }
};
