import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { setUserLevel, getLevelingConfig } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
  data: new SlashCommandBuilder()
    .setName('הגדר_רמה')
    .setDescription("הגדר את הרמה של משתמש לערך מסוים")
    .addUserOption((option) =>
      option
        .setName('משתמש')
        .setDescription('המשתמש להגדרת הרמה שלו')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('רמה')
        .setDescription('הרמה להגדרה')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const hasPermission = await checkUserPermissions(
        interaction,
        PermissionFlagsBits.ManageGuild,
        'אתה צריך הרשאת ניהול שרת כדי להשתמש בפקודה זו.'
      );
      if (!hasPermission) return;

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

      const targetUser = interaction.options.getUser('משתמש');
      const newLevel = interaction.options.getInteger('רמה');

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        throw new TitanBotError(
          `User ${targetUser.id} not found in this guild`,
          ErrorTypes.USER_INPUT,
          'המשתמש המצוין לא בשרת זה.'
        );
      }

      const userData = await setUserLevel(client, interaction.guildId, targetUser.id, newLevel);

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          createEmbed({
            title: '✅ הרמה הוגדרה',
            description: `הגדרת בהצלחה את הרמה של ${targetUser.tag} ל-**${newLevel}**.\n**סה"כ XP:** ${userData.totalXp}`,
            color: 'success'
          })
        ]
      });

      logger.info(
        `[ADMIN] User ${interaction.user.tag} set ${targetUser.tag}'s level to ${newLevel} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('LevelSet command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'levelset'
      });
    }
  }
};
