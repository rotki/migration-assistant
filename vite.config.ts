/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { ruiIconsPlugin } from '@rotki/ui-library/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';

const REPOSITORY_URL = 'https://github.com/rotki/migration-assistant';

/**
 * The page may not talk to any server: `connect-src 'none'` makes the "nothing leaves your
 * browser" claim something a user can check in devtools. Applied to builds only, since the
 * dev server needs a websocket for hot reload.
 */
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `script-src 'self'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  `worker-src 'self' blob:`,
  `connect-src 'none'`,
  `object-src 'none'`,
  `base-uri 'none'`,
  `form-action 'none'`,
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'migration-assistant:csp',
    apply: 'build',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', 'content': CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    }],
  };
}

function commitSha(): string {
  if (process.env.GITHUB_SHA)
    return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  }
  catch {
    return '';
  }
}

function buildRunUrl(): string {
  const { GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_RUN_ID || !GITHUB_SERVER_URL)
    return '';
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

export default defineConfig({
  base: '/migration-assistant/',
  define: {
    'import.meta.env.VITE_REPOSITORY_URL': JSON.stringify(REPOSITORY_URL),
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha()),
    'import.meta.env.VITE_BUILD_RUN_URL': JSON.stringify(buildRunUrl()),
    // The copyright year comes from the build, so the prerendered page and the app agree.
    'import.meta.env.VITE_BUILD_YEAR': JSON.stringify(String(new Date().getUTCFullYear())),
    // Set by the release workflow, as v0.2.0; empty for any other build.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.APP_VERSION ?? ''),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  // Shipped on purpose: anyone can read the deployed code as the source it was built from.
  build: {
    sourcemap: true,
  },
  plugins: [
    vue(),
    tailwindcss(),
    ruiIconsPlugin(),
    // Messages compile at build time, so the bundle ships vue-i18n without its message compiler.
    VueI18nPlugin({
      include: [fileURLToPath(new URL('src/locales/**', import.meta.url))],
    }),
    contentSecurityPolicy(),
  ],
  ssgOptions: {
    script: 'async',
    formatting: 'minify',
    dirStyle: 'nested',
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.spec.ts', 'src/env.d.ts', 'src/test-utils/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
