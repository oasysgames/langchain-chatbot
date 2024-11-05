import '../common/env';
import logger from '../common/log';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Mutex } from 'async-mutex';

type Marshal<T> = (data: T) => string;
type Unmarshal<T> = (data: string) => T;

/**
 * A generic store to manage chat history for users.
 * @template T - The type of the chat history.
 */
class Store<T> {
  private storagePath: string;
  private filePrefix: string;
  private openFiles: Map<string, fs.FileHandle>;
  private fileTimers: Map<string, NodeJS.Timeout>;
  private chatCache: Map<string, T[]>;
  private chatUpdates: Map<string, T[]>;
  private mutexes: Map<string, Mutex>;
  private marshal: Marshal<T>;
  private unmarshal: Unmarshal<T>;
  private fileCloseDelay: number;

  /**
   * Creates an instance of Store.
   * @param storagePath - The directory path where chat histories are stored.
   * @param filePrefix - The prefix for user-specific chat history files.
   * @param marshal - Function to convert chat data to string for storage.
   * @param unmarshal - Function to convert stored string back to chat data.
   * @param fileCloseDelay - The delay (in milliseconds) before closing a file handle after the last operation.
   */
  constructor(
    storagePath: string,
    filePrefix: string,
    marshal: Marshal<T>,
    unmarshal: Unmarshal<T>,
    fileCloseDelay: number = 60000,
  ) {
    this.storagePath = storagePath;
    this.filePrefix = filePrefix;
    this.openFiles = new Map<string, fs.FileHandle>();
    this.fileTimers = new Map<string, NodeJS.Timeout>();
    this.chatCache = new Map<string, T[]>();
    this.chatUpdates = new Map<string, T[]>();
    this.mutexes = new Map<string, Mutex>();
    this.marshal = marshal;
    this.unmarshal = unmarshal;
    this.fileCloseDelay = fileCloseDelay;

    // Create the storage directory if it does not exist
    fs.mkdir(this.storagePath, { recursive: true }).catch((err) => {
      logger.error('Error creating storage directory:', err);
    });
  }

  /**
   * Gets the file name for a user's chat history.
   * @param userID - The ID of the user.
   * @returns The full file path for the user's chat history.
   */
  private getFileName(userID: string): string {
    return path.join(this.storagePath, `${userID}${this.filePrefix}`);
  }

  /**
   * Gets or creates a mutex for a specific user.
   * @param userID - The ID of the user.
   * @returns The mutex for the user's operations.
   */
  private getMutex(userID: string): Mutex {
    if (!this.mutexes.has(userID)) {
      this.mutexes.set(userID, new Mutex());
    }
    return this.mutexes.get(userID)!;
  }

  /**
   * Gets or opens the file handle for a user's chat history.
   * @param userID - The ID of the user.
   * @returns A promise that resolves with the file handle.
   */
  private async getFileHandle(userID: string): Promise<fs.FileHandle> {
    const fileName = this.getFileName(userID);
    if (this.openFiles.has(fileName)) {
      return this.openFiles.get(fileName)!;
    }

    // The file is not yet open, so open it and cache the chat history
    const fileHandle = await fs.open(fileName, 'a+');
    this.openFiles.set(fileName, fileHandle);
    if (!this.chatCache.has(userID)) {
      const data = await fileHandle.readFile({ encoding: 'utf8' });
      const histories = data.trim()
        ? data.trim().split('\n').map(this.unmarshal)
        : [];
      this.chatCache.set(userID, histories);
    }
    return fileHandle;
  }

  /**
   * Resets the timer for closing a user's file handle.
   * @param fileName - The file name to reset the timer for.
   */
  private resetFileTimer(fileName: string): void {
    // Clear the existing timer and set a new one
    if (this.fileTimers.has(fileName)) {
      clearTimeout(this.fileTimers.get(fileName));
    }
    const timer = setTimeout(() => {
      this.flushAndCloseFile(fileName);
    }, this.fileCloseDelay);
    this.fileTimers.set(fileName, timer);
  }

  /**
   * Flushes any pending chat updates to the file and closes the file handle.
   * @param fileName - The file name to flush and close.
   */
  private async flushAndCloseFile(fileName: string): Promise<void> {
    const userID = path.basename(fileName, this.filePrefix);
    const mutex = this.getMutex(userID);

    // Wait for any read/wirte operation to finish
    const release = await mutex.acquire();
    try {
      // Flush any pending chat updates to the file
      if (this.chatUpdates.has(userID)) {
        const updates = this.chatUpdates.get(userID) || [];
        if (updates.length > 0) {
          try {
            const fileHandle = await this.getFileHandle(userID);
            await fileHandle.write(updates.map(this.marshal).join('\n') + '\n');
            this.chatUpdates.delete(userID);
          } catch (err) {
            logger.error('Error flushing chat updates:', err);
          }
        }
      }

      // Close the file handle
      if (this.openFiles.has(fileName)) {
        try {
          await this.openFiles.get(fileName)!.close();
        } catch (err) {
          logger.error('Error closing file:', err);
        } finally {
          this.openFiles.delete(fileName);
          clearTimeout(this.fileTimers.get(fileName));
          this.fileTimers.delete(fileName);
          this.chatCache.delete(userID);
        }
      }
    } finally {
      release();
      this.mutexes.delete(userID);
    }
  }

  /**
   * Records a new chat message for a user.
   * @param userID - The ID of the user.
   * @param chatHistory - The chat message to record.
   * @returns A promise that resolves when the chat message is recorded.
   *
   * This function first acquires a lock for the specified user to prevent concurrent
   * modifications. If the user's file is not yet open or their chat history is not
   * yet cached, it will initialize them. The chat message is then appended to both
   * the in-memory cache (`chatCache`) and the update list (`chatUpdates`). The cache
   * ensures that subsequent reads are up-to-date, while the update list keeps track
   * of changes that need to be written to the file later.
   */
  public async recordChat(userID: string, chatHistory: T): Promise<void> {
    // Reset timer first
    this.resetFileTimer(this.getFileName(userID));

    // during writting other read and write is blocked
    const mutex = this.getMutex(userID);
    const release = await mutex.acquire();

    try {
      if (!this.chatCache.has(userID)) {
        await this.getFileHandle(userID);
      }
      if (!this.chatUpdates.has(userID)) {
        this.chatUpdates.set(userID, []);
      }
      // Append the new chat message to the update list
      this.chatUpdates.get(userID)!.push(chatHistory);
      // Also append the new chat message to the cached histories for immediate reads
      const cachedHistories = this.chatCache.get(userID) || [];
      this.chatCache.set(userID, [...cachedHistories, chatHistory]);
    } finally {
      // Release the lock after updating
      release();
    }
  }

  /**
   * Retrieves the complete chat history for a user.
   * @param userID - The ID of the user.
   * @returns A promise that resolves with the user's chat history.
   *
   * This function reads the cached chat history directly. Since all chat entries
   * are appended to the cache during recording, it provides the most recent view
   * of the user's chat history.
   */
  public async getChatHistory(userID: string): Promise<T[]> {
    // Reset timer first
    this.resetFileTimer(this.getFileName(userID));

    // during reading other read and write is blocked
    const mutex = this.getMutex(userID);
    const release = await mutex.acquire();

    let histories: T[] = [];
    try {
      if (!this.chatCache.has(userID)) {
        await this.getFileHandle(userID);
      }
      histories = this.chatCache.get(userID) || [];
    } finally {
      release();
    }
    return histories;
  }
}

export default Store;

// Example usage:
// const marshal = (data: string) => data;
// const unmarshal = (data: string) => data;
// const store = new Store<string>('./chat_data', '_chats.txt', marshal, unmarshal, 120000);
// store.recordChat('user1', 'Hello, how are you?');
// store.recordChat('user1', 'What's up?');
// store.getChatHistory('user1').then(console.log).catch(console.error);
