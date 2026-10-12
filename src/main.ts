import { createRui } from '@rotki/ui-library';
import icons from 'virtual:rotki-icons';
import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import { routes } from './routes';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/geist-mono';
import './style.css';

export const createApp = ViteSSG(App, { routes, base: import.meta.env.BASE_URL }, ({ app }) => {
  app.use(createRui({ theme: { icons } }));
});
