const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require('dotenv').config({
    path: {
        blue: '.env.blue',
        development: '.env',
        staging: '.env.staging',
        production: '.env.production'
    }[process.env.NODE_ENV || 'development']
});

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUID_ID;

const commands = [
  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send an item to a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to send the item to")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription("Item to send")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount to send")
        .setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log("Commands registered.");
  } catch (error) {
    console.error(error);
  }
})();
