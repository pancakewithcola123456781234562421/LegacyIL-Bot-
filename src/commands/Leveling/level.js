import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('ניהול מערכת הדירוג')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('הגדר את מערכת הדירוג — זה גם מפעיל אותה')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('ערוץ לשליחת הודעות עלייה ברמה')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('XP מינימלי להעניק לכל הודעה (ברירת מחדל: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('XP מקסימלי להעניק לכל הודעה (ברירת מחדל: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'הודעת עלייה ברמה. השתמש ב-{user} ו-{level} כמחזיקי מקום (ברירת מחדל מסופקת)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('שניות בין הענקת XP לכל משתמש (ברירת מחדל: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('פתח את לוח הבקרה האינטראקטיבי להגדרת הדירוג'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral,
            });
            if (!deferred) return;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            'הרשאות חסרות',
                            'אתה צריך את ההרשאה **ניהול שרת** כדי להשתמש בפקודה זו.',
                        ),
                    ],
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return levelDashboard.execute(interaction, config, client);
            }

            if (subcommand === 'setup') {
                const channel = interaction.options.getChannel('channel');
                const xpMin = interaction.options.getInteger('xp_min') ?? 15;
                const xpMax = interaction.options.getInteger('xp_max') ?? 25;
                const message =
                    interaction.options.getString('message') ??
                    '{user} עלה לרמה {level}!';
                const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

                if (xpMin > xpMax) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            errorEmbed(
                                'טווח XP לא חוקי',
                                `XP מינימלי (**${xpMin}**) לא יכול להיות גדול מ-XP מקסימלי (**${xpMax}**).`,
                            ),
                        ],
                    });
                }

                if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                    throw new TitanBotError(
                        'Bot missing permissions in the specified channel',
                        ErrorTypes.PERMISSION,
                        `אני צריך את ההרשאות **שליחת הודעות** ו**הטמעת קישורים** ב-${channel} כדי לשלוח הודעות עלייה ברמה.`,
                    );
                }

                const existingConfig = await getLevelingConfig(client, interaction.guildId);

                if (existingConfig.configured) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            errorEmbed(
                                'מערכת הדירוג כבר פעילה',
                                `מערכת הדירוג כבר מוגדרת בשרת זה (הודעות עלייה ברמה נשלחות ל-<#${existingConfig.levelUpChannel}>).\n\nהשתמש ב-\`/level dashboard\` כדי לשנות הגדרות כלשהן.`,
                            ),
                        ],
                    });
                }

                const newConfig = {
                    ...existingConfig,
                    configured: true,
                    enabled: true,
                    levelUpChannel: channel.id,
                    xpRange: { min: xpMin, max: xpMax },
                    xpCooldown: xpCooldown,
                    levelUpMessage: message,
                    announceLevelUp: true,
                };

                await saveLevelingConfig(client, interaction.guildId, newConfig);

                logger.info(`Leveling system set up in guild ${interaction.guildId}`, {
                    channelId: channel.id,
                    xpMin,
                    xpMax,
                    xpCooldown,
                    userId: interaction.user.id,
                });

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '✅ מערכת הדירוג הוגדרה',
                            description:
                                `מערכת הדירוג כעת **מופעלת** וממשיכה להעבוד.\n\n` +
                                `**ערוץ עלייה ברמה:** ${channel}\n` +
                                `**XP לכל הודעה:** ${xpMin} – ${xpMax}\n` +
                                `**זמן המתנה XP:** ${xpCooldown}s\n` +
                                `**הודעת עלייה ברמה:** \`${message}\`\n\n` +
                                `השתמש ב-\`/level dashboard\` כדי לשנות כל הגדרה בכל עת.`,
                            color: 'success',
                        }),
                    ],
                });
            }
        } catch (error) {
            logger.error('Level command error:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'level',
            });
        }
    },
};
