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
        class="flex items-center gap-3 text-rui-text no-underline"
      >
        <RuiLogo
          size="2"
          unique-key="header"
        />
        <span class="font-semibold">migration assistant</span>
      </RouterLink>

      <div class="flex items-center gap-2">
        <span
          class="hidden sm:flex items-center gap-1.5 text-sm text-rui-text-secondary"
          data-testid="offline-badge"
        >
          <RuiIcon
            name="lu-shield-check"
            size="16"
            color="success"
          />
          Runs locally in your browser
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
