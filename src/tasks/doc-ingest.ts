import '../common/env';
import logger from '../common/log';
import { Command } from 'commander';
import { assertIsNumber } from '../common/utils';
import { LangChainUtils } from '../langchain';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate environment variables
if (!PINECONE_API_KEY || !PINECONE_INDEX || !OPENAI_API_KEY) {
  logger.error(
    'Missing environment variables. Please check PINECONE_API_KEY, PINECONE_INDEX, and OPENAI_API_KEY',
  );
  process.exit(1);
}

/**
 * CLI program for adding documents to Pinecone.
 * Provides options to specify directory path, chunk size, file extensions, ignored suffixes, and namespace.
 */
const program = new Command();
program
  .version('1.0.0')
  .description('CLI to add documents to Pinecone')
  .argument('<directoryPath>', 'Path to the directory containing documents')
  .requiredOption('-n, --namespace <namespace>', 'Pinecone namespace to use')
  .requiredOption(
    '-e, --extension <ExtendedSupportedTextSplitterLanguage>',
    'File extension to load (e.g., txt, json, markdown, html, js, sol, go)',
  )
  .option(
    '-c, --chunkSize <number>',
    'Chunk size for document splitting',
    '2048',
  )
  .option('-i, --ignorePaths <path...>', 'File name sufix to ignore', [])
  .option('-s, --simulate', 'Run the program in simulation mode')
  .action(async (directoryPath, options) => {
    try {
      // Validate chunk size
      const chunkSize = assertIsNumber(options.chunkSize);

      // Create Pinecone vector store
      const vectorStore = await LangChainUtils.createVectorStoreOfPinOpAI(
        PINECONE_API_KEY,
        PINECONE_INDEX,
        OPENAI_API_KEY,
        options.namespace,
      );

      // Ingest documents to Pinecone
      await LangChainUtils.ingestDocumentsToPinecone(
        vectorStore,
        directoryPath,
        chunkSize,
        options.extension,
        options.ignorePaths,
        options.simulate,
      );
    } catch (err) {
      logger.error(err, 'failed to ingest documents to Pinecone');
      process.exit(1);
    }
  });

program.parse(process.argv);
