// ESM runner for the transformer tests
// Allows running tests via `tsx` even when the project uses ESM.

import { runTransformerTests } from './transformers.test';

const success = runTransformerTests();
process.exit(success ? 0 : 1);
