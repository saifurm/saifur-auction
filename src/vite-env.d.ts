/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YT_PLAYLIST_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
