import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.expo/**', '**/.turbo/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{js,cjs,mjs,ts,tsx}'], languageOptions: { globals: globals.node } },
  { files: ['apps/web/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  {
    files: ['apps/{web,mobile}/**/*.tsx'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  prettier,
);
