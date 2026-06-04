import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("הסר חסימה של משתמש מהשרת")
        .addUserOption(option =>
            option
                .setName("target")
                .setDescription("המשתמש להסרת חסימה (יכול להיות ID או התייחסות)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("סיבת הסרת החסימה")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unban'
            });
            return;
        }

        try {
                const targetUser = interaction.options.getUser("target");
                const reason = interaction.options.getString("reason") || "לא סופקה סיבה";

                
                const result = await ModerationService.unbanUser({
                    guild: interaction.guild,
                    user: targetUser,
                    moderator: interaction.member,
                    reason
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "✅ משתמש הוסר מחסימה",
                            `הסרת חסימה בהצלחה של **${targetUser.tag}** מהשרת.\n\n**סיבה:** ${reason}\n**מספר Case:** #${result.caseId}`
                        )
                    ]
                });
        } catch (error) {
            logger.error('Unban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'unban_failed' });
        }
    }
};
