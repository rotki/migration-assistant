/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPOSITORY_URL: string;
  readonly VITE_COMMIT_SHA: string;
  readonly VITE_BUILD_RUN_URL: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_BUILD_YEAR: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
