import '../common/env';
import logger from '../common/log';
import { Client } from 'ssh2';
import fs from 'fs';

const conn = new Client();

// Retrieve variables from process.env
const remoteHost = process.env.REMOTE_HOST;
const username = process.env.REMOTE_USERNAME;
const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;
const scriptPath = process.env.DEPLOY_SCRIPT_PATH;

if (!remoteHost || !username || !privateKeyPath || !scriptPath) {
  logger.error('Missing environment variables. Check your .env file.');
  process.exit(1);
}

// Load the private key
const privateKey = fs.readFileSync(privateKeyPath);

conn.on('ready', () => {
  logger.info('Connected to remote host');
  conn.exec(`bash ${scriptPath}`, (err, stream) => {
    if (err) throw err;

    stream
      .on('close', (code: number, signal: string) => {
        if (code === 0) {
          logger.info('Connection closed with success');
        } else {
          logger.error(`Connection closed with error: ${code}, signal: ${signal}`);
        }
        conn.end();
      })
      .on('data', (data: Buffer) => {
        logger.info(`STDOUT: ${data.toString()}`);
      })
      .stderr.on('data', (data: Buffer) => {
        logger.error(`STDERR: ${data.toString()}`);
      });
  });
}).connect({
  host: remoteHost,
  port: 22, // Default SSH port
  username: username,
  privateKey: privateKey
});
