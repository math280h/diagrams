/**
 * The major version of the next release. Raise it before the first release of a new major version. Only then can
 * {@link OLDEST_FORMAT} go above the formats of earlier major versions.
 */
export const RELEASE_MAJOR = 0

/** The oldest diagram format that the app opens without loss. Each release of {@link RELEASE_MAJOR} wrote it or a newer one. */
export const OLDEST_FORMAT = 6

/** The diagram formats that only builds of `main` wrote. No release wrote them, so they need no field sample. */
export const PREVIEW_FORMATS: readonly number[] = [9, 10, 11, 12, 13, 14, 15]
