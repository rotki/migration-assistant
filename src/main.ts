import { createRui, createRuiI8nPlugin } from '@rotki/ui-library';
import icons from 'virtual:rotki-icons';
import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import { createAppI18n } from './i18n';
import { watchForNewBuild } from './modules/stale-build';
import { routes } from './routes';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/geist-mono';
import './style.css';

export const createApp = ViteSSG(App, { routes, base: import.meta.env.BASE_URL }, ({ app, isClient, router }) => {
  if (isClient)
    watchForNewBuild(router);
  const i18n = createAppI18n();
  app.use(i18n);
  app.use(createRui({ theme: { icons } }));
  // ui-library strings fall back to English until a locale defines its `rui.*` keys.
  app.use(createRuiI8nPlugin(i18n));
});
