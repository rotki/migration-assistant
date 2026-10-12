import rotki from '@rotki/eslint-config';

export default rotki({
  vue: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  stylistic: true,
  rotki: true, // English only for now: add `vueI18n` when translations arrive

  slop: true,
  sonarjs: true,
  markdown: true,
  formatters: true,
}, {
  files: ['src/**/*.ts'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'error',
  },
}, {
  // Vite 8 loads configs natively and warns on extensionless relative imports.
  files: ['vite.config.ts'],
  rules: {
    '@rotki/no-dot-ts-imports': 'off',
  },
});
