import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: async () => import('./pages/IndexPage.vue'),
  },
  {
    path: '/convert',
    name: 'convert',
    component: async () => import('./pages/ConvertPage.vue'),
  },
];
