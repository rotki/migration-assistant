import rotki from '@rotki/eslint-config';

export default rotki({
  vue: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  stylistic: true,
  rotki: true,
  vueI18n: {
    src: 'src',
    localesDirectory: 'locales',
    overrides: {
      '@intlify/vue-i18n/no-missing-keys': 'error',
    },
  },

  slop: true,
  sonarjs: { cognitiveComplexity: 15 },
  markdown: true,
  formatters: true,
}, {
  // The shared config wires no-unused-i18n-keys to .ts/.vue globs, where the rule bails: it acts only on locale files.
  files: ['**/locales/**/*.json'],
  rules: {
    '@rotki/no-unused-i18n-keys': ['error', {
      extensions: ['.ts', '.vue'],
      ignoreKeys: [],
      src: 'src',
    }],
    'jsonc/sort-keys': ['error', 'asc', {
      caseSensitive: true,
      natural: true,
    }],
  },
}, {
  files: ['src/**/*.ts'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'error',
  },
}, {
  // Iterator helpers are ES2025, newer than Vite's default browser target, and the build does not polyfill them.
  files: ['src/**/*.{ts,vue}'],
  rules: {
    'unicorn/prefer-iterator-helpers': 'off',
  },
}, {
  // Vite 8 loads configs natively and warns on extensionless relative imports.
  files: ['vite.config.ts'],
  rules: {
    '@rotki/no-dot-ts-imports': 'off',
  },
});
