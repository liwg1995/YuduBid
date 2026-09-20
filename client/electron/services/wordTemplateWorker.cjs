const fs = require('node:fs');
const { parentPort, workerData } = require('node:worker_threads');
const { extractWordTemplate } = require('./wordTemplateExtractor.cjs');

try {
  const result = extractWordTemplate(fs.readFileSync(workerData.filePath), workerData.fileName);
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
