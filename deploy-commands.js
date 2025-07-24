const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config({
  path: {
    blue: ".env.blue",
    development: ".env",
    staging: ".env.staging",
    production: ".env.production",
  }[process.env.NODE_ENV || "development"],
});

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

console.log(`token: ${token}`);
console.log(`clientId: ${clientId}`);
console.log(`guildId: ${guildId}`);

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
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the leaderboard of adventurers")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("leaderboard type")
        .setRequired(true)
        .addChoices(
          { name: "Material Points", value: "points" },
          { name: "Monster Kills", value: "monster_kills" }
        )
    ),
  new SlashCommandBuilder()
    .setName("droprate")
    .setDescription(
      "Shows the drop rates for materials in the current channel."
    ),
  new SlashCommandBuilder()
    .setName("monster-status")
    .setDescription("Shows the status of today's monster."),
  // new SlashCommandBuilder()
  //   .setName("game-spin")
  //   .setDescription("this feature is stil under development."),
  new SlashCommandBuilder()
    .setName("game-assemble-xx")
    .setDescription("this feature is stil under development.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Choose the player to challenge")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("game")
    .setDescription("this feature is stil under development.")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("choose you game")
        .setRequired(true)
        .addChoices(
          { name: "AssembleXX", value: "assemble" },
          { name: "Spyfall", value: "spyfall" },
        )
    )
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

// $env:NODE_ENV="blue"; node deploy-commands.js // run command
// $env:NODE_ENV="production"; node deploy-commands.js // run command
