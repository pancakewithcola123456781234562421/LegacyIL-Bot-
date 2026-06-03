import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel } from '../../services/leveling.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("מציג את לוח הדירוג של הרמות בשרת")
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);

      if (!levelingConfig?.enabled) {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor('#f1c40f')
              .setDescription('מערכת הדירוג כרגע מכובה בשרת זה.')
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const leaderboard = await getLeaderboard(client, interaction.guildId, 10);

      if (leaderboard.length === 0) {
        throw new TitanBotError(
          'No leaderboard data found',
          ErrorTypes.DATABASE,
          'לא נמצאו נתוני רמה עדיין. התחל לדבר כדי להרוויח XP!'
        );
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 לוח דירוג הרמות')
        .setColor('#2ecc71')
        .setDescription("10 החברים הפעילים ביותר בשרת זה:")
        .setTimestamp();

      const leaderboardText = await Promise.all(
        leaderboard.map(async (user, index) => {
          try {
            const member = await interaction.guild.members.fetch(user.userId).catch(() => null);
            const userMention = member?.user.toString() || `<@${user.userId}>`;
            const xpForNextLevel = getXpForLevel(user.level + 1);

            let rankPrefix = `${index + 1}.`;
            if (index === 0) rankPrefix = '🥇';
            else if (index === 1) rankPrefix = '🥈';
            else if (index === 2) rankPrefix = '🥉';
            else rankPrefix = `**${index + 1}.**`;

            return `${rankPrefix} ${userMention} - רמה ${user.level} (${user.xp}/${xpForNextLevel} XP)`;
          } catch {
            return `**${index + 1}.** שגיאה בטעינת משתמש ${user.userId}`;
          }
        })
      );

      embed.addFields({
        name: 'דירוגים',
        value: leaderboardText.join('\n')
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Leaderboard command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'leaderboard'
      });
    }
  }
};
