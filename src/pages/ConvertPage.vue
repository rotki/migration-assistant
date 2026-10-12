<script setup lang="ts">
import { RuiAlert, RuiStepper } from '@rotki/ui-library';
import { useHead } from '@unhead/vue';

useHead({ title: 'Convert' });

const steps = [
  { title: 'Choose file', description: 'Detect encoding, delimiter and header row' },
  { title: 'Target format', description: 'rotki trades, events, or both' },
  { title: 'Map columns', description: 'Source column, constant or transform per field' },
  { title: 'Formats', description: 'Dates, time zone and number style' },
  { title: 'Preview', description: 'Check the first rows' },
  { title: 'Convert', description: 'Stream the whole file to disk' },
];
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold">
      Convert a CSV export
    </h1>
    <RuiStepper
      :steps="steps"
      :step="1"
      orientation="vertical"
    />
    <RuiAlert
      type="info"
      title="Work in progress"
      description="The conversion wizard is being built. The steps above show how it will work."
    />
  </div>
</template>
