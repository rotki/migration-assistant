<script setup lang="ts">
import { RuiButton, RuiIcon, RuiLogo, ThemeMode, useRotkiTheme } from '@rotki/ui-library';

const { isDark, switchThemeScheme } = useRotkiTheme();

function toggleDark(): void {
  switchThemeScheme(isDark.value ? ThemeMode.light : ThemeMode.dark);
}
</script>

<template>
  <header class="border-b border-rui-divider bg-rui-surface">
    <div class="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
      <RouterLink
        to="/"
        class="flex items-center gap-3 no-underline"
        aria-label="rotki migration assistant, home"
      >
        <RuiLogo
          size="2.25"
          unique-key="header"
        />
        <span
          class="flex flex-col leading-none"
          aria-hidden="true"
        >
          <span class="text-xl font-bold tracking-tight text-rui-primary dark:text-rui-text">rotki</span>
          <span class="mt-1 text-xs font-medium uppercase tracking-wider text-rui-text-secondary">migration assistant</span>
        </span>
      </RouterLink>

      <div class="flex items-center gap-2">
        <span
          class="flex items-center gap-1.5 text-sm text-rui-text-secondary"
          data-testid="offline-badge"
          title="Runs locally in your browser"
        >
          <RuiIcon
            name="lu-shield-check"
            size="16"
            color="success"
          />
          <span class="sr-only sm:not-sr-only">Runs locally in your browser</span>
        </span>
        <RuiButton
          variant="text"
          icon
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleDark()"
        >
          <RuiIcon :name="isDark ? 'lu-sun' : 'lu-moon'" />
        </RuiButton>
      </div>
    </div>
  </header>
</template>
