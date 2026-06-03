import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getLevelingConfig, saveLevelingConfig } from '../../../services/leveling.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';

// ─── Embed & Menu Builders ────────────────────────────────────────────────────

function buildDashboardEmbed(cfg, guild) {
    const channel = cfg.levelUpChannel ? `<#${cfg.levelUpChannel}>` : '`לא הוגדר`';
    const xpMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const xpMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 25;
    const cooldown = cfg.xpCooldown ?? 60;
    const rawMsg = cfg.levelUpMessage || '{user} עלה לרמה {level}!';
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;

    return new EmbedBuilder()
        .setTitle('📊 לוח בקרה מערכת הדירוג')
        .setDescription(`ניהול הגדרות הדירוג עבור **${guild.name}**.\nבחר אפשרות למטה כדי לשנות הגדרה.`)
        .setColor(getColor('info'))
        .addFields(
            { name: '📢 ערוץ עלייה ברמה', value: channel, inline: true },
            { name: '⚙️ סטטוס מערכת', value: cfg.enabled ? '✅ **מופעל**' : '❌ **מכובה**', inline: true },
            { name: '📣 הודעות', value: cfg.announceLevelUp !== false ? '✅ **מופעל**' : '❌ **מכובה**', inline: true },
            { name: '🎲 XP לכל הודעה', value: `\`${xpMin} – ${xpMax}\``, inline: true },
            { name: '⏱️ זמן המתנה XP', value: `\`${cooldown}s\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '💬 הודעת עלייה ברמה', value: msgPreview, inline: false },
        )
        .setFooter({ text: 'לוח הבקרה ייסגר לאחר 10 דקות של חוסר פעילות' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`level_cfg_${guildId}`)
        .setPlaceholder('בחר הגדרה להגדרה...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('שנה ערוץ עלייה ברמה')
                .setDescription('הגדר את הערוץ שבו יישלחו הודעות עלייה ברמה')
                .setValue('channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('ערוך הודעת עלייה ברמה')
                .setDescription('התאם אישית את ההודעה המוצגת כאשר משתמש עולה ברמה')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדר טווח XP')
                .setDescription('הגדר את XP מינימלי ומקסימלי שמוענקים לכל הודעה')
                .setValue('xp_range')
                .setEmoji('🎲'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדר זמן המתנה XP')
                .setDescription('שניות בין הענקת XP לאותו משתמש')
                .setValue('xp_cooldown')
                .setEmoji('⏱️'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const announceOn = cfg.announceLevelUp !== false;
    const systemOn = cfg.enabled !== false;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_announce_${guildId}`)
            .setLabel('הודעות')
            .setStyle(announceOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('📣')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`level_cfg_toggle_system_${guildId}`)
            .setLabel('דירוג')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('⚡')
            .setDisabled(disabled),
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function refreshDashboard(rootInteraction, cfg, guildId) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
        components: [
            buildButtonRow(cfg, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default {
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getLevelingConfig(client, guildId);

            if (!cfg.configured) {
                throw new TitanBotError(
                    'Leveling system not configured',
                    ErrorTypes.CONFIGURATION,
                    'מערכת הדירוג עדיין לא הוגדרה. הרץ `/דירוג הגדרה` תחילה כדי להגדיר אותה.',
                );
            }

            const selectMenu = buildSelectMenu(guildId);
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(cfg, interaction.guild)],
                components: [buildButtonRow(cfg, guildId), selectRow],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `level_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'channel':
                            await handleChannel(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'xp_range':
                            await handleXpRange(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'xp_cooldown':
                            await handleXpCooldown(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Leveling config validation error: ${error.message}`);
                    } else {
                        logger.error('Unexpected leveling dashboard error:', error);
                    }

                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || 'אירעה שגיאה בעת עיבוד הבחירה שלך.'
                            : 'אירעה שגיאה בלתי צפויה בעת עדכון ההגדרה.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await selectInteraction
                        .followUp({
                            embeds: [errorEmbed('שגיאת הגדרה', errorMessage)],
                            flags: MessageFlags.Ephemeral,
                        })
                        .catch(() => {});
                }
            });

            // ── Button collector for the two toggle buttons ──────────────────
            const btnCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    (i.customId === `level_cfg_toggle_announce_${guildId}` ||
                        i.customId === `level_cfg_toggle_system_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    await btnInteraction.deferUpdate().catch(() => null);
                } catch (err) {
                    logger.debug('Button interaction already expired:', err.message);
                    return;
                }
                const isAnnounce = btnInteraction.customId === `level_cfg_toggle_announce_${guildId}`;

                if (isAnnounce) {
                    cfg.announceLevelUp = cfg.announceLevelUp === false;
                    await saveLevelingConfig(client, guildId, cfg);
                    await btnInteraction.followUp({
                        embeds: [
                            successEmbed(
                                '✅ הודעות עודכנו',
                                `הודעות עלייה ברמה כעת **${cfg.announceLevelUp ? 'מופעלות' : 'מכובות'}**.`,
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    const wasEnabled = cfg.enabled !== false;
                    cfg.enabled = !wasEnabled;
                    await saveLevelingConfig(client, guildId, cfg);
                    await btnInteraction.followUp({
                        embeds: [
                            successEmbed(
                                '✅ מערכת עודכנה',
                                `מערכת הדירוג כעת **${cfg.enabled ? 'מופעלת' : 'מכובה'}**.${!cfg.enabled ? '\nמשתמשים לא יהרוויחו XP עד שהמערכת תופעל מחדש.' : ''}`,
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                }

                await refreshDashboard(interaction, cfg, guildId);
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ לוח הבקרה פג')
                        .setDescription('לוח הבקרה זה נסגר בגלל חוסר פעילות. אנא הרץ את הפקודה שוב כדי להמשיך.')
                        .setColor(getColor('error'));
                    
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [timeoutEmbed],
                        components: [],
                    }).catch(() => {});
                }
            });

            btnCollector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ לוח הבקרה פג')
                        .setDescription('לוח הבקרה זה נסגר בגלל חוסר פעילות. אנא הרץ את הפקודה שוב כדי להמשיך.')
                        .setColor(getColor('error'));
                    
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [timeoutEmbed],
                        components: [],
                    }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in level_dashboard:', error);
            throw new TitanBotError(
                `Level dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'נכשל לפתוח את לוח בקרה הדירוג.',
            );
        }
    },
};

// ─── Change Level-up Channel ──────────────────────────────────────────────────

async function handleChannel(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('level_cfg_channel')
        .setPlaceholder('בחר ערוץ טקסט...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📢 שנה ערוץ עלייה ברמה')
                .setDescription(
                    `**נוכחי:** ${cfg.levelUpChannel ? `<#${cfg.levelUpChannel}>` : '`לא הוגדר`'}\n\nבחר את הערוץ שבו יישלחו הודעות עלייה ברמה.`,
                )
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'level_cfg_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        await chanInteraction.deferUpdate();
        const channel = chanInteraction.channels.first();

        if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
            await chanInteraction.followUp({
                embeds: [
                    errorEmbed(
                        'הרשאות חסרות',
                        `אני צריך את ההרשאות **שליחת הודעות** ו**הטמעת קישורים** ב-${channel} כדי לשלוח הודעות עלייה ברמה.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        cfg.levelUpChannel = channel.id;
        await saveLevelingConfig(client, guildId, cfg);

        await chanInteraction.followUp({
            embeds: [
                successEmbed(
                    '✅ הערוץ עודכן',
                    `הודעות עלייה ברמה כעת ישלחו ב-${channel}.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction
                .followUp({
                    embeds: [
                        errorEmbed('תם הזמן', 'לא נבחר ערוץ. ההגדרה לא שונתה.'),
                    ],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });
}

// ─── Edit Level-up Message ────────────────────────────────────────────────────

async function handleMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_message')
        .setTitle('ערוך הודעת עלייה ברמה')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('הודעה ({user} ו-{level} זמינים)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.levelUpMessage || '{user} עלה לרמה {level}!')
                    .setMaxLength(500)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('{user} עלה לרמה {level}!'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields.getTextInputValue('message_input').trim();

    if (!newMessage.includes('{user}') && !newMessage.includes('{level}')) {
        logger.warn(
            `Level-up message set without {user} or {level} placeholders in guild ${guildId}`,
        );
    }

    cfg.levelUpMessage = newMessage;
    await saveLevelingConfig(client, guildId, cfg);

    const preview = newMessage.replace('{user}', '@User').replace('{level}', '5');

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ ההודעה עודכנה',
                `הודעת עלייה ברמה נשמרה.\n**תצוגה:** ${preview}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

// ─── Set XP Range ─────────────────────────────────────────────────────────────

async function handleXpRange(selectInteraction, rootInteraction, cfg, guildId, client) {
    const currentMin = cfg.xpRange?.min ?? cfg.xpPerMessage?.min ?? 15;
    const currentMax = cfg.xpRange?.max ?? cfg.xpPerMessage?.max ?? 25;

    const modal = new ModalBuilder()
        .setCustomId('level_cfg_xp_range')
        .setTitle('הגדר טווח XP לכל הודעה')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_min_input')
                    .setLabel('XP מינימלי (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMin))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('15'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('xp_max_input')
                    .setLabel('XP מקסימלי (1–500)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(currentMax))
                    .setMaxLength(3)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('25'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_xp_range' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const rawMin = submitted.fields.getTextInputValue('xp_min_input').trim();
    const rawMax = submitted.fields.getTextInputValue('xp_max_input').trim();
    const newMin = parseInt(rawMin, 10);
    const newMax = parseInt(rawMax, 10);

    if (isNaN(newMin) || isNaN(newMax) || newMin < 1 || newMax < 1 || newMin > 500 || newMax > 500) {
        await submitted.reply({
            embeds: [
                errorEmbed('ערכים לא חוקיים', 'שני ערכי ה-XP חייבים להיות מספרים שלמים בין **1** ל-**500**.'),
            ],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (newMin > newMax) {
        await submitted.reply({
            embeds: [
                errorEmbed('טווח לא חוקי', 'XP מינימלי לא יכול להיות גדול מ-XP מקסימלי.'),
            ],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    cfg.xpRange = { min: newMin, max: newMax };
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ טווח XP עודכן',
                `משתמשים כעת יהרוויחו בין **${newMin}** ל-**${newMax}** XP לכל הודעה.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

// ─── Set XP Cooldown ──────────────────────────────────────────────────────────

async function handleXpCooldown(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('level_cfg_cooldown')
        .setTitle('הגדר זמן המתנה XP')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('cooldown_input')
                    .setLabel('זמן המתנה בשניות (0–3600)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(cfg.xpCooldown ?? 60))
                    .setMaxLength(4)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('60'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'level_cfg_cooldown' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields.getTextInputValue('cooldown_input').trim();
    const newCooldown = parseInt(raw, 10);

    if (isNaN(newCooldown) || newCooldown < 0 || newCooldown > 3600) {
        await submitted.reply({
            embeds: [
                errorEmbed(
                    'ערך לא חוקי',
                    'זמן ההמתנה חייב להיות מספר שלם בין **0** ל-**3600** שניות.',
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    cfg.xpCooldown = newCooldown;
    await saveLevelingConfig(client, guildId, cfg);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ זמן ההמתנה עודכן',
                `זמן המתנה XP הוגדר ל-**${newCooldown} שנייה${newCooldown !== 1 ? 'ות' : ''}**.${newCooldown === 0 ? '\n> ⚠️ זמן המתנה של 0 פירושו שXP מוענק בכל הודעה.' : ''}`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}
