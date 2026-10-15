import rotki from '@rotki/eslint-config';

// vue-i18n require()s these while eslint composes configs; warming them avoids ERR_REQUIRE_ESM_RACE_CONDITION.
import 'jsonc-eslint-parser';
import 'yaml-eslint-parser';

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
  sonarjs: true,
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
  // Vite 8 loads configs natively and warns on extensionless relative imports.
  files: ['vite.config.ts'],
  rules: {
    '@rotki/no-dot-ts-imports': 'off',
  },
});
