import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
function getUserNotesKey(guildId, userId) {
    return `moderation_user_notes_${guildId}_${userId}`;
}

function getGuildNotesListKey(guildId) {
    return `moderation_user_notes_list_${guildId}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("ניהול הערות משתמש לצורכי ניהול")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("הוסף הערה למשתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש להוספת הערה עבורו")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("ההערה להוספה")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("סוג הערה")
                        .addChoices(
                            { name: "התראה", value: "warning" },
                            { name: "חיובי", value: "positive" },
                            { name: "ניטרלי", value: "neutral" },
                            { name: "התنבהות", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("צפה בהערות על משתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש לצפייה בהערות שלו")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("הסר הערה ספציפית ממשתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש להסרת הערה ממנו")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("אינדקס ההערה להסרה")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("מחק את כל ההערות על משתמש")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("המשתמש למחיקת ההערות שלו")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "הרשאה נדחתה",
                        "אין לך הרשאה לנהל הערות משתמש."
                    ),
                ],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (subcommand !== "view" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Sub-command לא חוקי",
                        "אנא בחר sub-command חוקי."
                    ),
                ],
            });
        }

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return InteractionHelper.safeReply(interaction, {
                        embeds: [
                            errorEmbed(
                                "Sub-command לא חוקי",
                                "אנא בחר sub-command חוקי."
                            ),
                        ],
                    });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "שגיאת מערכת",
                        "אירעה שגיאה בעת עיבוד בקשתך. אנא נסה שוב מאוחר יותר."
                    ),
                ],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "הערה ארוכה מדי",
                    "הערות חייבות להיות 1000 תווים או פחות."
                ),
            ],
        });
    }

    if (note.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "הערה ריקה",
                    "הערה לא יכולה להיות ריקה."
                ),
            ],
        });
    }

    
    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} הערה התווספה`,
                `התווספה הערה **${type}** עבור **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**מנהל:** ${interaction.user.tag}\n` +
                `**סה"כ הערות:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 אין הערות",
                    `אין הערות עבור **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**הערות עבור ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **הערה #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*הוסף על ידי ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(חתוך)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 הערות משתמש (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "אינדקס לא חוקי",
                    `אנא ספק אינדקס הערה חוקי (1-${notes.length}).`
                ),
            ],
        });
    }

    const removedNote = notes[index];
    notes.splice(index, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} הערה הוסרה`,
                `הסרה של הערה #${index + 1} מ-**${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**הערות נותרות:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "אין הערות למחיקה",
                    `אין הערות עבור **${targetUser.tag}** למחיקה.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ הערות נמחקו",
                `נמחקו **${noteCount}** הערות מ-**${targetUser.tag}**.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}
