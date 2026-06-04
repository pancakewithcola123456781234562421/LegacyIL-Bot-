import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("להקיק משתמש מהשרת")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("המשתמש לקיק")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("סיבת הקיק"),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  category: "moderation",

  async execute(interaction, config, client) {
    try {
      
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        throw new TitanBotError(
          "User lacks permission",
          ErrorTypes.PERMISSION,
          "אין לך הרשאה להקיק חברים."
        );
      }

      const targetUser = interaction.options.getUser("target");
      const member = interaction.options.getMember("target");
      const reason = interaction.options.getString("reason") || "לא סופקה סיבה";

      
      if (targetUser.id === interaction.user.id) {
        throw new TitanBotError(
          "Cannot kick self",
          ErrorTypes.VALIDATION,
          "אתה לא יכול להקיק את עצמך."
        );
      }

      
      if (targetUser.id === client.user.id) {
        throw new TitanBotError(
          "Cannot kick bot",
          ErrorTypes.VALIDATION,
          "אתה לא יכול להקיק את הבוט."
        );
      }

      
      if (!member) {
        throw new TitanBotError(
          "Target not found",
          ErrorTypes.USER_INPUT,
          "משתמש היעד לא נמצא כרגע בשרת זה.",
          { subtype: 'user_not_found' }
        );
      }

      
      if (interaction.member.roles.highest.position <= member.roles.highest.position) {
        throw new TitanBotError(
          "Cannot kick user",
          ErrorTypes.PERMISSION,
          "אתה לא יכול להקיק משתמש עם תפקיד שווה או גבוה יותר ממך."
        );
      }

      
      if (!member.kickable) {
        throw new TitanBotError(
          "Bot cannot kick",
          ErrorTypes.PERMISSION,
          "אני לא יכול להקיק משתמש זה. אנא בדוק את מיקום התפקיד שלי ביחס למשתמש היעד."
        );
      }

      
      await member.kick(reason);

      
      const caseId = await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: "חבר הוקק",
          target: `${targetUser.tag} (${targetUser.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason,
          metadata: {
            userId: targetUser.id,
            moderatorId: interaction.user.id
          }
        }
      });

      
      await InteractionHelper.universalReply(interaction, {
        embeds: [
          successEmbed(
            `👢 **הקק** ${targetUser.tag}`,
            `**סיבה:** ${reason}\n**מספר Case:** #${caseId}`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Kick command error:', error);
      const errorEmbed_default = errorEmbed(
        "אירעה שגיאה בלתי צפויה בעת ניסיון בעיטת המשתמש.",
        error.message || "לא ניתן להקיק במשתמש"
      );
      await InteractionHelper.universalReply(interaction, { embeds: [errorEmbed_default] });
    }
  }
};
