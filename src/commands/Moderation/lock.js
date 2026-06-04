import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription(
      "נעל את הערוץ הנוכחי (מונע מ-@everyone לשלוח הודעות).",
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  category: "moderation",

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`Lock interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'lock'
      });
      return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "הרשאה נדחתה",
            "אתה צריך הרשאת `ניהול ערוצים` כדי לנעול ערוצים.",
          ),
        ],
      });

    const channel = interaction.channel;
    const everyoneRole = interaction.guild.roles.everyone;

    try {
      const currentPermissions = channel.permissionsFor(everyoneRole);
      if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            errorEmbed(
              "הערוץ כבר נעול",
              `${channel} כבר נעול.`,
            ),
          ],
        });
      }

      await channel.permissionOverwrites.edit(
        everyoneRole,
        { SendMessages: false },
{ type: 0, reason: `הערוץ נעול על ידי ${interaction.user.tag}` },
      );

      const lockEmbed = createEmbed(
        "🔒 ערוץ נעול (יומן פעולות)",
        `${channel} נעול על ידי ${interaction.user}.`,
      )
.setColor(getColor('moderation'))
        .addFields(
          { name: "ערוץ", value: channel.toString(), inline: true },
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
          action: "ערוץ נעול",
          target: channel.toString(),
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          metadata: {
            channelId: channel.id,
            category: channel.parent?.name || 'None',
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            `🔒 **ערוץ נעול**`,
            `${channel} כעת נעול. אף אחד לא יכול לדבר כאן כעת.`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Lock command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "אירעה שגיאה בלתי צפויה בעת ניסיון נעילת הערוץ. בדוק את ההרשאות שלי (אני צריך 'ניהול ערוצים').",
          ),
        ],
      });
    }
  }
};
