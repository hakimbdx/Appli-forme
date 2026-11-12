// Extraction des lignes de texte d'un PDF avec pdf.js (même méthode que l'application)
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const BP = require('../bloodparser.js');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function pdfLines(file, password) {
  // pdf.js signale (via console.log) l'absence de modules de rendu graphique, inutiles pour lire le texte
  const log = console.log; console.log = (...a) => { if (!/^Warning:/.test(String(a[0]))) log(...a); };
  try { return await extract(file, password); } finally { console.log = log; }
}

async function extract(file, password) {
  const pdfjs = await import(pathToFileURL(path.join(root, 'lib/pdfjs/pdf.min.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, 'lib/pdfjs/pdf.worker.min.mjs')).href;
  const data = new Uint8Array(await readFile(file instanceof URL ? file : String(file)));
  const doc = await pdfjs.getDocument({ data, password, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items);
  await doc.destroy();
  return BP.itemsToLines(pages);
}
