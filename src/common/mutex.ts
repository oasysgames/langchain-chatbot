import { Mutex } from 'async-mutex';

/**
 * A simple Mutex manager to handle user-specific locks.
 */
export class MutexManager {
  private mutexes: Map<string, Mutex>;

  constructor() {
    this.mutexes = new Map<string, Mutex>();
  }

  /**
   * Gets or creates a mutex for a specific user.
   * @param key - The key to identify the mutex (e.g., userID).
   * @returns The mutex for the provided key.
   */
  public getMutex(key: string): Mutex {
    if (!this.mutexes.has(key)) {
      this.mutexes.set(key, new Mutex());
    }
    return this.mutexes.get(key)!;
  }

  /**
   * Releases and deletes the mutex for a specific key if no longer needed.
   * @param key - The key to identify the mutex.
   */
  public deleteMutex(key: string): void {
    if (this.mutexes.has(key)) {
      this.mutexes.delete(key);
    }
  }
}

export default MutexManager;
