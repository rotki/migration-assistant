<script setup lang="ts">
import { RuiButton, RuiCard, RuiIcon, type RuiIcons } from '@rotki/ui-library';
import { useHead } from '@unhead/vue';

interface Feature {
  icon: RuiIcons;
  title: string;
  description: string;
}

useHead({ title: 'Convert exchange history for rotki' });

const features: Feature[] = [
  {
    icon: 'lu-lock',
    title: 'Stays on your device',
    description: 'Files are read and converted inside this tab. Nothing is uploaded, and the page is not allowed to make network requests.',
  },
  {
    icon: 'lu-file-spreadsheet',
    title: 'Any exchange export',
    description: 'Pick which column holds what, step by step. Save the mapping and reuse it when the exchange moves its columns around.',
  },
  {
    icon: 'lu-hard-drive',
    title: 'Large files welcome',
    description: 'Rows stream from your disk and the result goes back to it, so memory does not grow with the file. A 1 GB export converts in under a minute and a half.',
  },
];
</script>

<template>
  <div class="flex flex-col gap-10">
    <section class="flex flex-col gap-4 pt-4">
      <h1 class="text-3xl sm:text-4xl font-semibold">
        Bring your exchange history into rotki
      </h1>
      <p class="text-lg text-rui-text-secondary max-w-3xl">
        Turn a CSV export from any exchange into rotki's generic trades or events format,
        ready for <span class="font-medium text-rui-text">Import Data → Custom Import</span> in rotki.
      </p>
      <div class="w-fit">
        <RouterLink
          #default="{ href, navigate }"
          to="/convert"
          custom
        >
          <RuiButton
            tag="a"
            :href="href"
            color="primary"
            @click="navigate($event)"
          >
            Start converting
            <template #append>
              <RuiIcon
                name="lu-arrow-right"
                size="18"
              />
            </template>
          </RuiButton>
        </RouterLink>
      </div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <RuiCard
        v-for="feature in features"
        :key="feature.title"
      >
        <div class="flex flex-col gap-2">
          <RuiIcon
            :name="feature.icon"
            color="primary"
          />
          <h2 class="font-semibold">
            {{ feature.title }}
          </h2>
          <p class="text-sm text-rui-text-secondary">
            {{ feature.description }}
          </p>
        </div>
      </RuiCard>
    </section>

    <section class="flex flex-col gap-2 max-w-3xl">
      <h2 class="text-xl font-semibold">
        Check it yourself
      </h2>
      <p class="text-rui-text-secondary">
        Open your browser's developer tools on the Network tab while you convert a file:
        no request goes out. The page ships a content security policy with
        <code class="font-mono text-sm">connect-src 'none'</code>, so the browser would block one
        even if the code tried. The footer links the release, the exact commit and the build
        that produced this deployment, and each release carries a copy of the site with a build
        attestation you can verify.
      </p>
    </section>
  </div>
</template>
