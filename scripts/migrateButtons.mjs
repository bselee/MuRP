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

const files = tsxFiles.filter(f => f !== 'components/ui/Button.tsx');

console.log(`Scanning ${files.length} TSX files for Button usage.`);

const replaceButtons = (content) =>
  content.replaceAll('<button', '<Button').replaceAll('</button>', '</Button>');

const ensureImport = (content) => {
  const cleaned = content.replace(/import Button from ['"].*?\/ui\/Button['"];?\s*/g, '');

  const lines = cleaned.split('\n');

  // Determine insertion index
  let insertIndex = 0;
  if (lines[0]?.startsWith("'use client'") || lines[0]?.startsWith('"use client"')) {
    insertIndex = 1;
  }

  let foundTypeImport = false;
  for (let i = insertIndex; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('import type')) {
      foundTypeImport = true;
      insertIndex = i;
      break;
    }
    if (trimmed.startsWith('import ')) {
      insertIndex = i + 1;
      continue;
    }
    if (trimmed === '') {
      insertIndex = i + 1;
      continue;
    }
    break;
  }

  if (!foundTypeImport) {
    for (let i = insertIndex; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed.startsWith('import ')) {
        insertIndex = i;
        break;
      }
    }
  }

  lines.splice(insertIndex, 0, IMPORT_STATEMENT);
  return lines.join('\n');
};

files.forEach((file) => {
  const original = readFileSync(file, 'utf8');
  let updated = original;
  const needsButtonComponent =
    updated.includes('<button') || updated.includes('</button') || updated.includes('<Button');

  if (needsButtonComponent) {
    updated = replaceButtons(updated);
  }

  const usesButton = updated.includes('<Button');
  if (!usesButton) {
    if (updated !== original) {
      writeFileSync(file, updated, 'utf8');
      console.log(`Updated ${file}`);
    }
    return;
  }

  const withImport = ensureImport(updated);

  if (withImport !== original) {
    writeFileSync(file, withImport, 'utf8');
    console.log(`Updated ${file}`);
  }
});
