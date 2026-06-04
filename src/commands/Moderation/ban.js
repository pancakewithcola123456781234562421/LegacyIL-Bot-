import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("חסום משתמש מהשרת")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("המשתמש לחסימה")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("סיבת החסימה"),
        )
.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            const user = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "לא סופקה סיבה";

            if (user.id === interaction.user.id) {
                throw new Error("אתה לא יכול לחסום את עצמך.");
            }
            if (user.id === client.user.id) {
                throw new Error("אתה לא יכול לחסום את הבוט.");
            }

            
            const result = await ModerationService.banUser({
                guild: interaction.guild,
                user,
                moderator: interaction.member,
                reason
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **חסום** ${user.tag}`,
                        `**סיבה:** ${reason}\n**מספר Case:** #${result.caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Ban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'ban_failed' });
        }
    },
};
