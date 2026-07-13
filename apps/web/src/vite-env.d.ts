/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEMO_RECEIPT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
