import { type Runnable } from '@langchain/core/runnables';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { LangChainUtils, ReRank } from './langchain';
import { Store } from './store';
import { MutexManager, MutexLockedError } from './common/mutex';

export const DefaultStorePrefix = 'history_';

export class QA extends MutexManager {
  private historyAwareRetriever: Runnable | undefined;
  private questionAnswerChain: Runnable | undefined;
  private chain: Runnable | undefined;
  private store: Store<BaseMessage> | undefined;
  private rerank: ReRank | undefined;

  constructor() {
    super();
  }

  async init(
    storagePath: string | undefined,
    pineconeApiKey: string,
    index: string,
    openAIApiKey: string,
    namespace?: string,
    embeddingModel?: string,
    topK?: number,
    qaModel?: string,
    temperature?: number,
    systemPrompt?: string,
    contextualizeQSystemPrompt?: string,
  ): Promise<QA> {
    if (storagePath) {
      this.store = new Store<BaseMessage>(
        storagePath,
        DefaultStorePrefix,
        (data: BaseMessage) => this.storeMarshal(data),
        (data: string) => this.storeUnmarshal(data),
      );
    }

    const vectorStore = await LangChainUtils.createVectorStoreOfPinOpAI(
      pineconeApiKey,
      index,
      openAIApiKey,
      namespace,
      embeddingModel,
    );
    const runnables = await LangChainUtils.makeChain(
      vectorStore,
      topK,
      openAIApiKey,
      qaModel,
      temperature,
      systemPrompt,
      contextualizeQSystemPrompt,
    );

    this.historyAwareRetriever = runnables[0];
    this.questionAnswerChain = runnables[1];
    this.chain = runnables[2];
    return this;
  }

  public async historyAwareAnswer(
    storeKey: string,
    question: string,
  ): Promise<string> {
    if (!this.store) {
      throw new Error('Store not initialized');
    }

    const mutex = this.getMutex(storeKey);
    if (mutex.isLocked()) {
      throw new MutexLockedError('answer is already in progress');
    }

    const release = await mutex.acquire();
    let answer = '';
    try {
      const chatHistory = await this.store.getChatHistory(storeKey);
      answer = await this.answer(question, chatHistory);

      await this.store.recordChat(storeKey, new HumanMessage(question));
      await this.store.recordChat(storeKey, new AIMessage(answer)); // Replace all newlines with a space (or any other delimiter of your choice)
    } finally {
      release();
    }

    return answer;
  }

  public async answer(
    question: string,
    chatHistory: BaseMessage[] = [],
  ): Promise<string> {
    if (!this.questionAnswerChain) {
      throw new Error('Question answer chain not initialized');
    }

    const sanitizedQuestion = question.trim().replaceAll('\n', ' ');

    // 1st: retrieve documents
    let retrievedDocs = await this.historyAwareRetriever?.invoke({
      input: sanitizedQuestion,
      chat_history: chatHistory,
    });

    // 2nd: rerank the retrieved documents if a rerank function is provided
    if (this.rerank) retrievedDocs = this.rerank(retrievedDocs);

    // 3rd: answer the question
    const response = await this.questionAnswerChain?.invoke({
      input: sanitizedQuestion,
      context: retrievedDocs,
      chat_history: chatHistory,
    });

    return response;
  }

  public async close(): Promise<void> {
    if (this.store) {
      await this.store.close();
    }
  }

  private storeMarshal(msg: BaseMessage): string {
    const oneLineContent = (msg.content as string).replace(
      /(\r\n|\n|\r)/g,
      ' ',
    );
    if (msg.getType() === 'human') {
      return `h:${oneLineContent}`;
    } else if (msg.getType() === 'ai') {
      return `a:${oneLineContent}`;
    }
    throw new Error(`Unknown message type: ${msg.getType()}`);
  }

  private storeUnmarshal(data: string): BaseMessage {
    if (data[0] === 'h') {
      return new HumanMessage(data.substring(2));
    } else if (data[0] === 'a') {
      return new AIMessage(data.substring(2));
    }
    throw new Error(`Unknown message type: ${data[0]}`);
  }
}
