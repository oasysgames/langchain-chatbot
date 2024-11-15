import logger from '../common/log';
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  DMChannel,
  Message,
} from 'discord.js';
import { MutexLockedError } from '../common/mutex';
import { QA } from '../qa';

export class DiscordChatBot {
  private client: Client;
  private readyClient?: Client<true>;
  private qa?: QA;
  private closing = false;

  constructor(qa?: QA) {
    this.qa = qa;

    // Initialize Discord client with necessary intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds, // Required for handling interactions within guilds
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages, // Required to receive DMs
        GatewayIntentBits.MessageContent, // Required to access the content of messages
      ],
      partials: [Partials.Channel], // Required for receiving DMs
    });
  }

  login(token: string) {
    if (!token) throw new Error('Discord token is required');

    // Event handler for when the bot is ready
    this.client.once(Events.ClientReady, (readyClient: Client<true>) => {
      this.readyClient = readyClient;
      logger.info(`Ready! Logged in as ${this.readyClient.user.tag}`);
    });

    // Event handler for message creation
    this.client.on(Events.MessageCreate, (message: Message) => {
      // Ignore messages from the bot itself
      if (message.author.bot) {
        return;
      }

      // Notify if message is not a DM
      if (!(message.channel instanceof DMChannel)) {
        message.reply('Send me a DM instead!');
        return;
      }

      // Notify if QA model is not loaded
      if (!this.qa) {
        message.reply('No QA model loaded!');
        return;
      }

      // const userID = message.author.id;
      // message.reply(
      //   `Hello, ${userID}! I'm here to help you with your questions. Please ask me anything!, channel: ${chanelID}`,
      // );

      const chanelID = message.channel.id;
      this.qa
        .historyAwareAnswer(chanelID, message.content)
        .then((response: string) => {
          message.reply(response);
        })
        .catch((err: Error) => {
          // Prompt user to try again if the system is busy
          if (err instanceof MutexLockedError) {
            message.reply(
              'The system is currently busy, please try again in a moment.',
            );
            return;
          }
          // Log and notify user of unexpected errors
          message.reply(
            `An unexpected error occurred. Please try again later. Error: ${err.message}`,
          );
          logger.error(err, 'An unexpected error occurred');
        });
    });

    // Log in to Discord
    this.client.login(token).catch((error) => {
      logger.error(error, 'Failed to log in to Discord');
      process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async shutdown() {
    if (this.closing) return;
    this.closing = true;

    logger.info('Received shutdown signal, logging out...');
    await this.client.destroy();
    logger.info('Closing QA model...');
    await this.qa?.close();
    logger.info('Shutdown complete');
  }
}
