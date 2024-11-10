import logger from '../common/log'; // Load environment variables from .env file
import { Command } from 'commander';
import { QA } from '../qa';
import { DiscordChatBot } from '../discordbot';

const MaxTopK = 100;

// Retrieve environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHATHISTORY_STORAGE_PATH =
  process.env.DISCORD_CHATHISTORY_STORAGE_PATH;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate environment variables
if (
  !DISCORD_TOKEN ||
  !DISCORD_CHATHISTORY_STORAGE_PATH ||
  !PINECONE_API_KEY ||
  !PINECONE_INDEX ||
  !OPENAI_API_KEY
) {
  logger.error(
    'Missing environment variables. Please check DISCORD_TOKEN, DISCORD_CHATHISTORY_STORAGE_PATH, PINECONE_API_KEY, PINECONE_INDEX, and OPENAI_API_KEY',
  );
  process.exit(1);
}

// Initialize command line program
const program = new Command();
program
  .version('1.0.0')
  .description('Discord bot to answer questions from user via DM')
  .option(
    '-n, --namespace <namespace>',
    'Namespace to use for Pinecone vector store',
    undefined,
  )
  .option('-t, --topK <number>', 'Number of top results to return', '12')
  .option(
    '-T, --temperature <number>',
    'Temperature value for model response (0.0 - 2.0)',
    '0.6',
  )
  .action(async (options) => {
    // Validate temperature
    const temperature = parseFloat(options.temperature);
    if (isNaN(temperature) || temperature < 0 || temperature > 2) {
      logger.error('Invalid temperature value. Must be between 0 and 2.');
      process.exit(1);
    }
    // Validate topK
    const topK = parseInt(options.topK);
    if (isNaN(topK) || topK < 1 || topK > MaxTopK) {
      logger.error(`Invalid topK value. Must be between 1 and ${MaxTopK}.`);
      process.exit(1);
    }

    try {
      // create a new QA instance
      const qa = await new QA().init(
        DISCORD_CHATHISTORY_STORAGE_PATH,
        PINECONE_API_KEY!,
        PINECONE_INDEX!,
        OPENAI_API_KEY!,
        options.namespace,
        undefined, // embeddingModel
        topK,
        undefined, // qaModel
        temperature,
        undefined, // systemPrompt
        undefined, // contextualizeQSystemPrompt
      );

      // Initialize Discord bot and login
      const bot = new DiscordChatBot(qa);

      // Log in to Discord
      // Bot kept running until it receives a shutdown signal
      bot.login(DISCORD_TOKEN);
    } catch (error) {
      logger.error(error, 'Failed to start Discord bot');
      process.exit(1);
    }
  });

program.parse(process.argv);
