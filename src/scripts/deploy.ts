import { Client } from 'ssh2';
import * as dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

const conn = new Client();

// Retrieve variables from process.env
const remoteHost = process.env.REMOTE_HOST;
const username = process.env.REMOTE_USERNAME;
const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;
const scriptPath = process.env.DEPLOY_SCRIPT_PATH;

if (!remoteHost || !username || !privateKeyPath || !scriptPath) {
  console.error('Missing environment variables. Check your .env file.');
  process.exit(1);
}

// Load the private key
const privateKey = fs.readFileSync(privateKeyPath);

conn.on('ready', () => {
  console.log('Connected to remote host');
  conn.exec(`bash ${scriptPath}`, (err, stream) => {
    if (err) throw err;
    console.log(`Executing script: ${scriptPath}`);

    stream
      .on('close', (code: number, signal: string) => {
        if (code === 0) {
          console.log('Deployment successful!');
        } else {
          console.error(`Deployment failed with code ${code}, signal ${signal}`);
        }
        conn.end();
      })
      .on('data', (data: Buffer) => {
        console.log(`STDOUT: ${data.toString()}`);
      })
      .stderr.on('data', (data: Buffer) => {
        console.error(`STDERR: ${data.toString()}`);
      });
  });
}).connect({
  host: remoteHost,
  port: 22, // Default SSH port
  username: username,
  privateKey: privateKey
});
