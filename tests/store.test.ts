import * as fs from 'fs/promises';
import * as path from 'path';
import { expect } from 'chai';
import Store from '../src/store';
import { describe, it, before, after } from 'mocha';

interface ChatHistory {
  content: string;
  name?: string;
  response_metadata?: Record<string, any>;
  id?: string;
}

const marshal = (data: ChatHistory): string => JSON.stringify(data);
const unmarshal = (data: string): ChatHistory => JSON.parse(data);

describe('Store Class Tests', function () {
  const storagePath = './test_chat_data';
  const filePrefix = '_chats.txt';
  const fileCloseDelay = 500;
  const userID = 'testUser';
  let store: Store<ChatHistory>;

  before(async function () {
    store = new Store<ChatHistory>(storagePath, filePrefix, marshal, unmarshal, fileCloseDelay);
  });

  after(async function () {
    // Clean up after tests
    await fs.rm(storagePath, { recursive: true, force: true });
  });

  it('should record 3 chat histories and read them back before fileCloseDelay', async function () {
    const chatHistories: ChatHistory[] = [
      { content: 'Hello, how are you?' },
      { content: 'What is your name?', name: 'testName' },
      { content: 'This is a response.', response_metadata: { source: 'bot' } }
    ];

    // Record chat histories
    for (const chat of chatHistories) {
      await store.recordChat(userID, chat);
    }

    // Read chat histories before fileCloseDelay and compare
    const cachedHistories = await store.getChatHistory(userID);
    expect(cachedHistories).to.deep.equal(chatHistories);
  });

  it('should ensure the file is not created before fileCloseDelay', async function () {
    const fileName = path.join(storagePath, `${userID}${filePrefix}`);
    try {
      await fs.access(fileName);
      throw new Error('File should not have been created yet');
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it('should create the file and save contents after fileCloseDelay', async function () {
    // Wait until fileCloseDelay passes
    await new Promise((resolve) => setTimeout(resolve, fileCloseDelay + 100));

    const fileName = path.join(storagePath, `${userID}${filePrefix}`);
    const fileContent = await fs.readFile(fileName, 'utf8');
    const savedHistories = fileContent.trim().split('\n').map(unmarshal);

    const expectedHistories: ChatHistory[] = [
      { content: 'Hello, how are you?' },
      { content: 'What is your name?', name: 'testName' },
      { content: 'This is a response.', response_metadata: { source: 'bot' } }
    ];

    expect(savedHistories).to.deep.equal(expectedHistories);
  });
});
