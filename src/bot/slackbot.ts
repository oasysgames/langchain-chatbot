import 'dotenv/config';
import logger from '../common/log';
import bolt  from '@slack/bolt';

// Slack configuration
const slackToken = process.env.SLACK_BOT_TOKEN;
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
if (!slackToken || !slackSigningSecret) {
  throw new Error('Slack bot token and signing secret are required. Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in environment variables.');
}

const app = new bolt.App({
  token: slackToken,
  signingSecret: slackSigningSecret,
});

// Handle direct messages
app.message(async ({ message, say }) => {
  logger.info(message, 'Received message');
  if (message.channel_type === 'im' && !message.subtype) {
    await say(`You said: ${(message as any).text}`);
  }
});

(async () => {
  // Start the app
  await app.start(process.env.PORT || 3000);
  logger.info('Slack bot is running');
})();

// Ensure you have set up the appropriate Slack events subscription in your Slack app configuration:
// 1. Go to https://api.slack.com/apps and select your app.
// 2. Under 'Event Subscriptions', enable and set the Request URL to your public endpoint (e.g., using ngrok).
// 3. Subscribe to 'message.im' event to get direct messages from users.
