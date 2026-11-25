export default {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,yml,yaml,md,css,html}': 'prettier --write',
};
