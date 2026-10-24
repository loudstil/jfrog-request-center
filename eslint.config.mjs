import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', '*.vsix', 'vs_code_extension_prototype.html'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
