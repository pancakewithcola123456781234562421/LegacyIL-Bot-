import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/warningService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("הזהר משתמש")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("משתמש להזהרה"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("סיבת ההתראה"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn'
            });
            return;
        }

        try {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                    throw new Error("אתה צריך הרשאת `ניהול חברים` כדי להנפיק התראות.");
                }

                const target = interaction.options.getUser("target");
                const member = interaction.options.getMember("target");
                const reason = interaction.options.getString("reason");
                const moderator = interaction.user;
                const guildId = interaction.guildId;

                if (!member) {
                    throw new Error("משתמש היעד לא נמצא כרגע בשרת זה.");
                }

                
                const result = await WarningService.addWarning({
                    guildId,
                    userId: target.id,
                    moderatorId: moderator.id,
                    reason,
                    timestamp: Date.now()
                });

                if (!result.success) {
                    throw new Error("נכשל לשמור התראה בבסיס הנתונים");
                }

                const totalWarns = result.totalCount;

                await logModerationAction({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: "משתמש הוזהר",
                        target: `${target.tag} (${target.id})`,
                        executor: `${moderator.tag} (${moderator.id})`,
                        reason,
                        metadata: {
                            userId: target.id,
                            moderatorId: moderator.id,
                            totalWarns,
                            warningNumber: totalWarns,
                            warningId: result.id
                        }
                    }
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            `⚠️ **הוזהר** ${target.tag}`,
                            `**סיבה:** ${reason}\n**סה"כ התראות:** ${totalWarns}`,
                        ),
                    ],
                });
        } catch (error) {
            logger.error('Warn command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'warn_failed' });
        }
    }
};
