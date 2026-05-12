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
    console.log('Fetching current commands...');
    const commands = await rest.get(Routes.applicationGuildCommands(clientId, guildId)) as any[];
    console.log('Current commands:');
    commands.forEach((cmd: any) => {
      console.log(`- ${cmd.name}: ${cmd.description}`);
      if (cmd.options) {
        cmd.options.forEach((option: any) => {
          if (option.options) {
            console.log(`  - Subcommand: ${option.name}`);
            if (option.options) {
              option.options.forEach((subOption: any) => {
                console.log(`    - Option: ${subOption.name} (${subOption.type})`);
              });
            }
          }
        });
      }
    });
  } catch (error) {
    console.error('Error fetching commands:', error);
  }
})();
