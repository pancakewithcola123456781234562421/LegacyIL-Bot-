import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('ערוץ_טריגר');
        const guildId = interaction.guild.id;

        const currentConfig = await getJoinToCreateConfig(client, guildId);

        if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
            throw new TitanBotError(
                `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                ErrorTypes.VALIDATION,
                `${triggerChannel} לא מוגדר כערוץ טריגר של הצטרף כדי ליצור.`
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('⚙️ הגדרת הצטרף כדי ליצור')
            .setDescription(`הגדר הגדרות עבור ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: '📝 תבנית שם ערוץ נוכחית',
                    value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                    inline: false
                },
                {
                    name: '👥 מגבלת משתמשים נוכחית',
                    value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'ללא מגבלה' : currentConfig.userLimit + ' משתמשים'}`,
                    inline: true
                },
                {
                    name: '🎵 Bitrate נוכחי',
                    value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'בחר אפשרות להגדרה למטה' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointocreate_config_${triggerChannel.id}`)
            .setPlaceholder('בחר אפשרות הגדרה')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('שנה תבנית שם ערוץ')
                    .setDescription('שנה את התבנית לשמות ערוצים זמניים')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('שנה מגבלת משתמשים')
                    .setDescription('קבע מספר משתמשים מקסימלי לערוץ זמני')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('שנה Bitrate')
                    .setDescription('התאם את איכות האודיו לערוצים הזמניים')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('הסר ערוץ טריגר זה')
                    .setDescription('הסר ערוץ זה ממערכת הצטרף כדי ליצור')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('הצג הגדרות נוכחיות')
                    .setDescription('הצג את כל פרטי ההגדרה הנוכחיים')
                    .setValue('view_settings')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [row],
        }).catch(error => {
            logger.error('Failed to edit reply in config_setup:', error);
        });

        const collector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
time: 60000
        });

        collector.on('collect', async (selectInteraction) => {
            await selectInteraction.deferUpdate();

            const selectedOption = selectInteraction.values[0];

            try {
                switch (selectedOption) {
                    case 'name_template':
                        await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'user_limit':
                        await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'bitrate':
                        await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'remove_trigger':
                        await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'view_settings':
                        await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Configuration validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected configuration menu error:', error);
                }
                
                const errorMessage = error instanceof TitanBotError 
                    ? error.userMessage || 'אירעה שגיאה בעת עיבוד הבחירה שלך.'
                    : 'אירעה שגיאה בעת עיבוד הבחירה שלך.';
                    
                await selectInteraction.followUp({
                    embeds: [errorEmbed('שגיאת הגדרה', errorMessage)],
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    selectMenu.setDisabled(true)
                );
                
                await InteractionHelper.safeEditReply(interaction, {
                    components: [disabledRow],
                }).catch(() => {});
            }
        });
            } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Unexpected error in config_setup:', error);
            throw new TitanBotError(
                `Config setup failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'נכשל לעמד את מערכת הצטרף כדי ליצור.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('📝 הגדרת תבנית שם ערוץ')
        .setDescription('אנא הזן את תבנית שם הערוץ החדשה.')
        .addFields(
            {
                name: 'משתנים זמינים',
                value: '• `{username}` - שם המשתמש\n• `{display_name}` - שם תצוגה של המשתמש\n• `{user_tag}` - תג המשתמש (User#1234)\n• `{guild_name}` - שם השרת',
                inline: false
            },
            {
                name: 'תבנית נוכחית',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'הקלד את התבנית החדשה בצ\'אט למטה' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await interaction.followUp({
                    embeds: [errorEmbed('תבנית לא תקינה', 'התבנית חייבת להיות בין 1 ל-100 תווים.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ התבנית עודכנה', `תבנית שם הערוץ שונתה ל-\`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Template validation error: ${error.message}`);
            } else {
                logger.error('Template update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'לא ניתן לעדכן את תבנית שם הערוץ.'
                : 'לא ניתן לעדכן את תבנית שם הערוץ.';
                
            await interaction.followUp({
                embeds: [errorEmbed('העדכון נכשל', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('תם הזמן', 'לא התקבלה תגובה. עדכון התבנית בוטל.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('👥 הגדרת מגבלת משתמשים')
        .setDescription('אנא הזן את מגבלת המשתמשים החדשה (0-99, כאשר 0 = ללא מגבלה).')
        .addFields(
            {
                name: 'מגבלה נוכחית',
                value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'ללא מגבלה' : currentConfig.userLimit + ' משתמשים'}`,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'הקלד את המגבלה החדשה בצ\'אט למטה' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await interaction.followUp({
                    embeds: [errorEmbed('מגבלה לא תקינה', 'מגבלת משתמשים חייבת להיות בין 0 ל-99.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ המגבלה עודכנה', `מגבלת משתמשים שונתה ל-${newLimit === 0 ? 'ללא מגבלה' : newLimit + ' משתמשים'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`User limit validation error: ${error.message}`);
            } else {
                logger.error('User limit update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'לא ניתן לעדכן את מגבלת המשתמשים.'
                : 'לא ניתן לעדכן את מגבלת המשתמשים.';
                
            await interaction.followUp({
                embeds: [errorEmbed('העדכון נכשל', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('תם הזמן', 'לא התקבלה תגובה תקינה. העדכון בוטל.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('🎵 הגדרת Bitrate')
        .setDescription('אנא הזן את ה-Bitrate החדש בקילוביטים (8-384).')
        .addFields(
            {
                name: 'Bitrate נוכחי',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'ערכים נפוצים',
                value: '• 64 kbps - איכות רגילה\n• 96 kbps - איכות טובה\n• 128 kbps - איכות גבוהה\n• 256 kbps - איכות גבוהה מאוד',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'הקלד את ה-Bitrate החדש בצ\'אט למטה' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await interaction.followUp({
                    embeds: [errorEmbed('Bitrate לא תקין', 'Bitrate חייב להיות בין 8 ל-384 kbps.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ Bitrate עודכן', `Bitrate שונה ל-${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Bitrate validation error: ${error.message}`);
            } else {
                logger.error('Bitrate update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'לא ניתן לעדכן את ה-Bitrate.'
                : 'לא ניתן לעדכן את ה-Bitrate.';
                
            await interaction.followUp({
                embeds: [errorEmbed('העדכון נכשל', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('תם הזמן', 'לא התקבלה תגובה תקינה. העדכון בוטל.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('⚠️ הסר ערוץ טריגר')
        .setDescription(`האם אתה בטוח שברצונך להסיר את ${triggerChannel} ממערכת הצטרף כדי ליצור?`)
        .setColor('#ff6600')
        .setFooter({ text: 'לא ניתן לבטל פעולה זו' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('הסר ערוץ')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('בטל')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);
                
                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [successEmbed('✅ הערוץ הוסר', `${triggerChannel} הוסר ממערכת הצטרף כדי ליצור.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await buttonInteraction.followUp({
                        embeds: [errorEmbed('הסרה נכשלה', 'לא ניתן להסיר את ערוץ הטריגר.')],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Trigger removal validation error: ${error.message}`);
                } else {
                    logger.error('Remove trigger error:', error);
                }
                
                const errorMessage = error instanceof TitanBotError
                    ? error.userMessage || 'אירעה שגיאה בעת הסרת ערוץ הטריגר.'
                    : 'אירעה שגיאה בעת הסרת ערוץ הטריגר.';
                    
                await buttonInteraction.followUp({
                    embeds: [errorEmbed('הסרה נכשלה', errorMessage)],
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [successEmbed('✅ בוטל', 'הסרת הערוץ בוטלה.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('תם הזמן', 'לא התקבלה תגובה. הסרה בוטלה.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('📋 הגדרות נוכחיות')
        .setDescription(`הגדרה עבור ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            {
                name: '🎯 ערוץ טריגר',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: '📝 תבנית שם ערוץ',
                value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            },
            {
                name: '👥 מגבלת משתמשים',
                value: `${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'ללא מגבלה' : (channelConfig.userLimit || currentConfig.userLimit) + ' משתמשים'}`,
                inline: true
            },
            {
                name: '🎵 Bitrate',
                value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: '📁 קטגוריה',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'לא הוגדרה',
                inline: true
            },
            {
                name: '📊 סטטוס מערכת',
                value: currentConfig.enabled ? '✅ מופעל' : '❌ מכובה',
                inline: true
            },
            {
                name: '🔢 ערוצים זמניים פעילים',
                value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}
