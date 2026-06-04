import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import setchannel from './modules/logging_setchannel.js';
import filter from './modules/logging_filter.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('ניהול רישום ביקורת לשרת זה.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('פתח את לוח הבקרה האינטראקטיבי לרישום — צפה בסטטוס וכיבוי/הפעלת קטגוריות אירועים.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setchannel')
                .setDescription('הגדר את ערוץ רישום הביקורת לשרת זה.')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('ערוץ הטקסט לרישום הביקורת.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('הגדר ל-True כדי להשבית את רישום הביקורת לחלוטין.')
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('filter')
                .setDescription('ניהול רשימת התעלמות הרישום (משתמשים וערוצים לדילוג).')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('add')
                        .setDescription('הוסף משתמש או ערוץ לרשימת התעלמות הרישום.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('האם להתעלם ממשתמש או ערוץ.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'משתמש', value: 'user' },
                                    { name: 'ערוץ', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ה-ID של המשתמש או הערוץ להתעלמות.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('remove')
                        .setDescription('הסר משתמש או ערוץ מרשימת התעלמות הרישום.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('האם זה משתמש או ערוץ.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'משתמש', value: 'user' },
                                    { name: 'ערוץ', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ה-ID של המשתמש או הערוץ להסרה מרשימת ההתעלמות.')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            // setchannel and filter both need a reply deferred before their logic runs
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            await InteractionHelper.safeDefer(interaction);

            if (subcommand === 'setchannel') {
                return await setchannel.execute(interaction, config, client);
            }

            if (subcommandGroup === 'filter') {
                return await filter.execute(interaction, config, client);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Subcommand לא ידוע', 'ה-Subcommand הזה לא מזוהה.')],
            });
        } catch (error) {
            logger.error('logging command error:', error);
            await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('שגיאה', 'אירעה שגיאה בלתי צפויה.')],
                ephemeral: true,
            }).catch(() => {});
        }
    },
};
