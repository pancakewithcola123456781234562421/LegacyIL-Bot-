import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "פתח את הערוץ הנוכחי (מאפשר ל-@everyone לשלוח הודעות שוב).",
        )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unlock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "הרשאה נדחתה",
                        "אתה צריך הרשאת `ניהול ערוצים` כדי לפתוח ערוצים.",
                    ),
                ],
            });

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "הערוץ כבר פתוח",
                            `${channel} לא נעול בצורה מפורשת (כולם יכולים כבר לשלוח הודעות).`,
                        ),
                    ],
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `הערוץ נפתח על ידי ${interaction.user.tag}`,
},
            );

            const unlockEmbed = createEmbed(
                "🔓 ערוץ נפתח (יומן פעולות)",
                `${channel} נפתח על ידי ${interaction.user}.`,
            )
.setColor(getColor('success'))
                .addFields(
                    {
                        name: "ערוץ",
                        value: channel.toString(),
                        inline: true,
                    },
                    {
                        name: "מנהל",
                        value: `${interaction.user.tag} (${interaction.user.id})`,
                        inline: true,
                    },
                );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "ערוץ נפתח",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'None'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **ערוץ נפתח**`,
                        `${channel} כעת פתוח. אתה יכול לדבר עכשיו.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Unlock command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "שגיאה בלתי צפויה התרחשה בעת ניסיון פתיחת הערוץ. בדוק את ההרשאות שלי (אני צריך 'ניהול ערוצים').",
                    ),
                ],
            });
        }
    }
};
