import { Client } from 'ssh2';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const conn = new Client();

// Retrieve variables from process.env
const remoteHost = process.env.REMOTE_HOST;
const username = process.env.USERNAME;
const password = process.env.PASSWORD;
const scriptPath = process.env.SCRIPT_PATH;

if (!remoteHost || !username || !password || !scriptPath) {
  console.error('Missing environment variables. Check your .env file.');
  process.exit(1);
}

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(`bash ${scriptPath}`, (err, stream) => {
    if (err) throw err;

    stream
      .on('close', (code: number, signal: string) => {
        console.log(`Stream :: close :: code: ${code}, signal: ${signal}`);
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
  password: password,
  // Alternatively, use privateKey for key-based authentication:
  // privateKey: require('fs').readFileSync('/path/to/private/key')
});

