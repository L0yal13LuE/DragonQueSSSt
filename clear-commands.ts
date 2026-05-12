import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config({
  path: {
    blue: '.env.blue',
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
  }[process.env.NODE_ENV || 'development'],
});

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;

const rest: REST = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
      .then(() => console.log('Successfully deleted all guild commands.'))
      .catch(console.error);

    rest.put(Routes.applicationCommands(clientId), { body: [] })
      .then(() => console.log('Successfully deleted all application commands.'))
      .catch(console.error);
  } catch (error) {
    console.error('Error removing commands:', error);
  }
})();
