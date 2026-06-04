import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';


import { InteractionHelper } from '../../utils/interactionHelper.js';
const durationChoices = [
    { name: "5 דקות", value: 5 },
    { name: "10 דקות", value: 10 },
    { name: "30 דקות", value: 30 },
    { name: "שעה אחת", value: 60 },
    { name: "6 שעות", value: 360 },
    { name: "יום אחד", value: 1440 },
    { name: "שבוע אחד", value: 10080 },
];
export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("הנח משתמש ל-Timeout למשך זמן מסוים.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("משתמש ל-Timeout")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("משך Timeout")
                    .setRequired(true)
.addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("סיבת Timeout"),
        )
.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Timeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout'
            });
            return;
        }

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                throw new TitanBotError(
                    "User lacks permission",
                    ErrorTypes.PERMISSION,
                    "אתה צריך הרשאת `ניהול חברים` כדי להגדיר Timeout."
                );
            }

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const durationMinutes = interaction.options.getInteger("duration");
            const reason = interaction.options.getString("reason") || "לא סופקה סיבה";

            if (targetUser.id === interaction.user.id) {
                throw new TitanBotError(
                    "Cannot timeout self",
                    ErrorTypes.VALIDATION,
                    "אתה לא יכול להגדיר Timeout לעצמך."
                );
            }
            if (targetUser.id === client.user.id) {
                throw new TitanBotError(
                    "Cannot timeout bot",
                    ErrorTypes.VALIDATION,
                    "אתה לא יכול להגדיר Timeout לבוט."
                );
            }
            if (!member) {
                throw new TitanBotError(
                    "Target not found",
                    ErrorTypes.USER_INPUT,
                    "משתמש היעד לא נמצא כרגע בשרת זה."
                );
            }

            if (!member.moderatable) {
                throw new TitanBotError(
                    "Cannot timeout member",
                    ErrorTypes.PERMISSION,
                    "אני לא יכול להגדיר Timeout למשתמש זה. ייתכן שיש להם תפקיד גבוה יותר ממני או ממך."
                );
            }

            const durationMs = durationMinutes * 60 * 1000;
            await member.timeout(durationMs, reason);

            const durationDisplay =
                durationChoices.find((c) => c.value === durationMinutes)
                    ?.name || `${durationMinutes} דקות`;

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "חבר הוגדר ל-Timeout",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `${reason}\nמשך: ${durationDisplay}`,
                    duration: durationDisplay,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        durationMinutes,
                        timeoutEnds: new Date(Date.now() + durationMs).toISOString()
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `⏳ **הוגדר Timeout** עבור ${targetUser.tag} ל-${durationDisplay}.`,
                        `**סיבה:** ${reason}\n**מספר Case:** #${caseId}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Timeout command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        error.userMessage || "אירעה שגיאה בלתי צפויה בעת פעולת Timeout. אנא בדוק את הרשאות התפקיד שלי.",
                    ),
                ],
            });
        }
    }
};
