interface ImportMetaEnv {
  /** `preview` on the preview website, which deploys `main` and also lists the newest pre-releases. */
  readonly VITE_RELEASE_CHANNEL?: string
}

declare module 'virtual:release-notes' {
  /** The GitHub releases at build time, or `null` on the dev server and after the build could not load them. */
  const releases: unknown[] | null
  export default releases
}
