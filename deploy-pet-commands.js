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

const petCommands = [
  new SlashCommandBuilder()
    .setName("pet")
    .setDescription("Pet farming commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rent")
        .setDescription("Rent a pet for farming")
        .addStringOption((option) =>
          option
            .setName("pet_type")
            .setDescription("Type of pet to rent")
            .setRequired(true)
            .addChoices(
              { name: "Cat", value: "cat" },
              { name: "Chicken", value: "chicken" },
              { name: "Bird", value: "bird" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Check your pet's status")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("recall")
        .setDescription("Recall your pet and collect rewards")
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: petCommands,
    });
    console.log("Pet commands registered successfully. 🐾 Your furry friends are ready for adventure!");
  } catch (error) {
    console.error("Error managing pet commands:", error);
  }
})();

// $env:NODE_ENV="development"; node deploy-pet-commands.js // run command
// $env:NODE_ENV="production"; node deploy-pet-commands.js // run command
