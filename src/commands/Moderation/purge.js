import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("מחק כמות מסוימת של הודעות")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("מספר הודעות (1-100)")
        .setRequired(true),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`Purge interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'purge'
      });
      return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "הרשאה נדחתה",
            "אתה צריך הרשאת `ניהול הודעות` כדי למחוק הודעות.",
          ),
        ],
      });

    const amount = interaction.options.getInteger("amount");
    const channel = interaction.channel;

    if (amount < 1 || amount > 100)
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "כמות לא חוקית",
            "אנא ציין מספר בין 1 ל-100.",
          ),
        ],
      });

    try {
      
      const rateLimitKey = `purge_${interaction.user.id}`;
      const isAllowed = await checkRateLimit(rateLimitKey, 5, 60000);
      if (!isAllowed) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            warningEmbed(
              "אתה מוחק הודעות מהר מדי. אנא חכה דקה לפני שתנסה שוב.",
              "⏳ מוגבל בקצב"
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const fetched = await channel.messages.fetch({ limit: amount });
      const deleted = await channel.bulkDelete(fetched, true);
      const deletedCount = deleted.size;

      const purgeEmbed = createEmbed(
        "🗑️ הודעות נמחקו (יומן פעולות)",
        `${deletedCount} הודעות נמחקו על ידי ${interaction.user}.`,
      )
.setColor(getColor('moderation'))
        .addFields(
          { name: "ערוץ", value: channel.toString(), inline: true },
          {
            name: "מנהל",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true,
          },
          { name: "ספירה", value: `${deletedCount} הודעות`, inline: false },
        );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "הודעות נמחקו",
          target: `${channel} (${deletedCount} הודעות)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `נמחקו ${deletedCount} הודעות`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(`🗑️ נמחקו ${deletedCount} הודעות ב-${channel}.`),
        ],
flags: MessageFlags.Ephemeral,
      });

      setTimeout(() => {
        interaction.deleteReply().catch(err => 
          logger.debug('Failed to auto-delete purge response:', err)
        );
      }, 3000);
    } catch (error) {
      logger.error('Purge command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "אירעה שגיאה בלתי צפויה במהלך מחיקת הודעות. הערה: הודעות ישנות מ-14 ימים לא יכולות להיות מחוקות בצובר.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
};
