#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDeckDocument } from '../renderer.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.dirname(dir);
const root = path.dirname(pagesDir);

const input = process.argv[2] || path.join(pagesDir, 'decks', 'example.deck.json');
const resolvedInput = path.resolve(process.cwd(), input);

if (!fs.existsSync(resolvedInput)) {
  console.error('Deck file not found: ' + resolvedInput);
  process.exit(1);
}

const deck = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(pagesDir, 'pages.json'), 'utf8'));
const baseUrl = pathToFileURL(pagesDir + '/').href;

const html = buildDeckDocument(deck, catalog, { baseUrl });
const outDir = path.join(dir, 'generated');
fs.mkdirSync(outDir, { recursive: true });

const deckName = path.basename(resolvedInput).replace(/\.deck\.json$|\.json$/, '');
const outFile = path.join(outDir, deckName + '.assembled.html');
fs.writeFileSync(outFile, html, 'utf8');

console.log('Assembled deck HTML: ' + outFile + ' (' + deck.pages.length + ' pages)');
