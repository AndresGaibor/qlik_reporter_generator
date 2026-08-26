/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QLIK_WEB_INTEGRATION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
