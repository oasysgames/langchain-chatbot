import './common/env';
import logger from './common/log';
import fs from 'fs';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import {
  DirectoryLoader,
  LoadersMapping,
} from 'langchain/document_loaders/fs/directory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
// import { JSONLoader } from 'langchain/document_loaders/fs/json';
import {
  RecursiveCharacterTextSplitter,
  SupportedTextSplitterLanguage,
  SupportedTextSplitterLanguages,
} from '@langchain/textsplitters';
import { sleep, chunkArray } from './common/utils';

// Extend supported languages to include 'txt' and 'json'
export const SupportedLanguages = [
  ...SupportedTextSplitterLanguages,
  'txt',
  'json',
] as const;
export type SupportedLanguage = SupportedTextSplitterLanguage | 'txt' | 'json';

export class LangChainUtils {
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
    namespace: string,
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
    const ext = extension as (typeof SupportedTextSplitterLanguages)[number];
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
