import { readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const IMPORT_STATEMENT = "import Button from '@/components/ui/Button';";

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'supabase',
  'scripts',
  'public',
  'api',
  'docs',
  'e2e',
  'test-results',
]);

const tsxFiles = [];

const walk = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT, entryPath);

    if (entry.isDirectory()) {
      const [top] = relativePath.split(path.sep);
      if (IGNORED_DIRS.has(top)) continue;
      walk(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      tsxFiles.push(relativePath);
    }
  }
};

walk(ROOT);

const files = tsxFiles
  .filter(f => f !== 'components/ui/Button.tsx')
  .filter(f => {
    const content = readFileSync(f, 'utf8');
    return content.includes('<button') || content.includes('</button>');
  });

console.log(`Discovered ${files.length} TSX files with <button> references.`);

const replaceButtons = (content) =>
  content.replaceAll('<button', '<Button').replaceAll('</button>', '</Button>');

const ensureImport = (content) => {
  if (content.includes(IMPORT_STATEMENT)) return content;

  let updated = content.replace(/import Button from ['"].*?\/ui\/Button['"];?\s*/g, '');

  const lines = updated.split('\n');
  let insertIndex = 0;

  if (lines[0]?.startsWith("'use client'") || lines[0]?.startsWith('"use client"')) {
    insertIndex = 1;
  }

  for (let i = insertIndex; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      insertIndex = i + 1;
      continue;
    }
    if (lines[i].trim() === '') {
      insertIndex = i + 1;
      continue;
    }
    break;
  }

  lines.splice(insertIndex, 0, IMPORT_STATEMENT);
  return lines.join('\n');
};

files.forEach((file) => {
  const original = readFileSync(file, 'utf8');
  const withButtons = replaceButtons(original);
  const withImport = ensureImport(withButtons);

  if (withImport !== original) {
    writeFileSync(file, withImport, 'utf8');
    console.log(`Updated ${file}`);
  }
});
