<script setup lang="ts">
import { buildLinks } from '@/modules/build-info';

const { attestationsUrl, buildRunUrl, commitUrl, releaseUrl, repositoryUrl, shortSha, version } = buildLinks;

const FIRST_YEAR = 2026;
const buildYear = Number(import.meta.env.VITE_BUILD_YEAR);
const years = buildYear > FIRST_YEAR ? `${FIRST_YEAR}-${buildYear}` : String(FIRST_YEAR);
</script>

<template>
  <footer class="border-t border-rui-divider bg-rui-surface text-sm text-rui-text-secondary">
    <div class="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-col gap-1">
        <p>
          Your files never leave this page. It has no server to send them to, and its
          content security policy blocks every network request.
        </p>
        <p data-testid="copyright">
          © Rotki Solutions GmbH {{ years }}.
        </p>
      </div>
      <nav
        class="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0 whitespace-nowrap"
        aria-label="Source and deployment"
      >
        <a
          :href="repositoryUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-rui-link"
        >
          Source code (AGPL-3.0)
        </a>
        <a
          v-if="releaseUrl"
          :href="releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-rui-link font-mono"
          data-testid="build-version"
        >
          {{ version }}
        </a>
        <a
          v-if="commitUrl"
          :href="commitUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-rui-link font-mono"
          data-testid="build-commit"
        >
          {{ shortSha }}
        </a>
        <a
          v-if="buildRunUrl"
          :href="buildRunUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-rui-link"
          data-testid="build-run"
        >
          Deployment build
        </a>
        <a
          v-if="buildRunUrl"
          :href="attestationsUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-rui-link"
          data-testid="build-attestations"
        >
          Provenance
        </a>
      </nav>
    </div>
  </footer>
</template>
