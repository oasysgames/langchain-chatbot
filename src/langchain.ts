import logger from './common/log';
import fs from 'fs';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  DirectoryLoader,
  LoadersMapping,
} from 'langchain/document_loaders/fs/directory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { type Runnable } from '@langchain/core/runnables';
// import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { DocumentInterface } from '@langchain/core/documents';
import {
  RecursiveCharacterTextSplitter,
  SupportedTextSplitterLanguage,
  SupportedTextSplitterLanguages,
} from '@langchain/textsplitters';
import { sleep, chunkArray } from './common/utils';

export type ReRank = (
  retrievedDocs: DocumentInterface<Record<string, any>>[],
) => DocumentInterface<Record<string, any>>[];

// Extend supported languages to include 'txt' and 'json'
export const SupportedLanguages = [
  ...SupportedTextSplitterLanguages,
  'txt',
  'json',
  'md',
  'ts',
] as const;
export type SupportedLanguage =
  | SupportedTextSplitterLanguage
  | 'txt'
  | 'json'
  | 'md'
  | 'ts';

export const DefaultSystemPrompt =
  'You are an assistant for question-answering tasks. ' +
  'Use the following pieces of retrieved context to answer ' +
  "the question. If you don't know the answer, say that you " +
  "don't know. Use three sentences maximum and keep the " +
  'answer concise.' +
  '\n\n' +
  '{context}';

export const DefaultContextualizeQSystemPrompt =
  'Given a chat history and the latest user question ' +
  'which might reference context in the chat history, ' +
  'formulate a standalone question which can be understood ' +
  'without the chat history. Do NOT answer the question, ' +
  'just reformulate it if needed and otherwise return it as is.';

export class LangChainUtils {
  /**
   * Converts a language to a splitter language.
   * @param language  - The language to convert to file extension.
   * @returns - The splitter language
   */
  static toSplitterLanguage = (
    language: SupportedLanguage,
  ): SupportedTextSplitterLanguage => {
    if (language === 'md') return 'markdown';
    if (language === 'ts') return 'js';
    return language as SupportedTextSplitterLanguage;
  };

  /**
   * Creates a chain of runnables for a question-answering system.
   * @param {PineconeStore} vectorStore - Pinecone vector store to use for retrieving documents.
   * @param {number} [topK=10] - Number of documents to retrieve from the vector store.
   * @param {string} openAIApiKey - The API key for OpenAI.
   * @param {string} [model='gpt-4o'] - The model to use for generating responses.
   * @param {number} [temperature=0.5] - The temperature to use for generating responses.
   * @param {string} [systemPrompt=DefaultSystemPrompt] - The prompt to use for generating responses.
   * @param {string} [contextualizeQSystemPrompt=DefaultContextualizeQSystemPrompt] - The prompt to use for contextualizing questions.
   * @returns {Promise<Runnable[]>} - The constructed chain of runnables.
   */
  static async makeChain(
    vectorStore: PineconeStore,
    topK: number = 10,
    openAIApiKey: string,
    model: string = 'gpt-4o',
    temperature: number = 0.5, // increase temepreature to get more creative answers
    systemPrompt: string = DefaultSystemPrompt,
    contextualizeQSystemPrompt: string = DefaultContextualizeQSystemPrompt,
  ): Promise<Runnable[]> {
    const result = [];
    const llm = new ChatOpenAI({ openAIApiKey, model, temperature });

    // create a history aware retriever, then push to the result as the first element
    const rephrasePrompt = ChatPromptTemplate.fromMessages([
      ['system', contextualizeQSystemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
    ]);
    const historyAwareRetriever = await createHistoryAwareRetriever({
      llm,
      retriever: vectorStore.asRetriever({ k: topK }),
      rephrasePrompt,
    });
    result.push(historyAwareRetriever);

    // create a question answer chain, then push to the result as the second element
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
    ]);
    const questionAnswerChain = await createStuffDocumentsChain({
      llm,
      prompt,
    });
    result.push(questionAnswerChain);

    // create a retrieval chain, then push to the result as the third element
    const chain = await createRetrievalChain({
      retriever: historyAwareRetriever,
      combineDocsChain: questionAnswerChain,
    });
    result.push(chain);

    return result;
  }

  /**
   * Creates a vector store using Pinecone and OpenAI embeddings.
   * @param {string} pineconeApiKey - The API key for Pinecone.
   * @param {string} index - The name of the Pinecone index.
   * @param {string} openAIApiKey - The API key for OpenAI.
   * @param {string} namespace - The namespace to use for the Pinecone vector store.
   * @param {string} [model='text-embedding-3-large'] - The model to use for generating embeddings.
   * @returns {Promise<PineconeStore>} - The constructed Pinecone vector store.
   */
  static async createVectorStoreOfPinOpAI(
    pineconeApiKey: string,
    index: string,
    openAIApiKey: string,
    namespace?: string,
    model: string = 'text-embedding-3-large',
  ): Promise<PineconeStore> {
    // Initialize Pinecone client
    const pc = new Pinecone({ apiKey: pineconeApiKey });
    const pineconeIndex = pc.index(index);

    // Create OpenAI embeddings
    const embeddings = new OpenAIEmbeddings({
      apiKey: openAIApiKey,
      model,
    });

    // Create and return the Pinecone store
    return PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      namespace,
    });
  }

  /**
   * Ingests documents into Pinecone by splitting them into smaller chunks and adding them to the vector store.
   * @param {PineconeStore} vectorStore - Pinecone vector store to use for adding documents.
   * @param {string} directoryPath - Path to the directory containing documents to ingest.
   * @param {number} chunkSize - Size of each chunk for splitting documents.
   * @param {SupportedLanguage} extension - File extension of documents to process.
   * @param {string[]} ignorePaths - List of file extensions to ignore.
   * @param {boolean} [simulate=false] - Whether to run the program in simulation mode.
   */
  static async ingestDocumentsToPinecone(
    vectorStore: PineconeStore,
    directoryPath: string,
    chunkSize: number,
    extension: SupportedLanguage,
    ignorePaths: string[],
    simulate: boolean = false,
  ): Promise<void> {
    // Validate directory path
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Directory not found: ${directoryPath}`);
    }
    // Validate file extension
    if (!SupportedLanguages.includes(extension)) {
      throw new Error(
        `Unsupported file extension. Supported extensions: ${SupportedLanguages.join(', ')}`,
      );
    }

    const loaders: LoadersMapping = {
      [`.${extension}`]: (path: string) => new TextLoader(path),
      // '.json': (path: string) => new JSONLoader(path),
    };
    const loader = new DirectoryLoader(
      directoryPath,
      loaders,
      true, // recursive
      'ignore', // unknown
    );

    let splitter: RecursiveCharacterTextSplitter;
    const ext = LangChainUtils.toSplitterLanguage(extension);
    if (SupportedTextSplitterLanguages.includes(ext)) {
      splitter = RecursiveCharacterTextSplitter.fromLanguage(ext, {
        chunkSize,
      });
    } else {
      splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap: 0,
      });
    }

    // Load documents from the directory
    const docs = await loader.load();

    const ignores = (filePath: string): boolean => {
      // ignore if the file does not match the target extension
      if (!filePath.endsWith(`.${extension}`)) {
        logger.debug(`ignoring file: ${filePath}`);
        return true;
      }
      // ignore if the file matches the ignorePaths
      for (const path of ignorePaths) {
        if (filePath.includes(path)) {
          return true;
        }
      }
      return false;
    };

    // Process each document
    for (const doc of docs) {
      const filePath = doc.metadata.source;
      if (ignores(filePath)) {
        logger.debug(`ignoring file: ${filePath}`);
        continue;
      }

      logger.info(`Processing file: ${filePath}`);

      // Split the document into smaller parts
      const splictedDocs = await splitter.splitDocuments([doc]);
      logger.info(`Split into parts: ${splictedDocs.length}`);

      // To avoid adding too many documents at once, we split the splictedDocs into smaller chunks
      const maxSize = 10;
      const chunkeds = chunkArray(splictedDocs, maxSize);

      let i = 1;
      for (const chunk of chunkeds) {
        if (!simulate) await vectorStore.addDocuments(chunk);
        logger.info(`${i} of ${chunkeds.length} chunks added`);
        i++;
        // Sleep for a second to avoid rate limiting
        if (!simulate) await sleep(1000);
      }
    }
  }
}
