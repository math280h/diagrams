import type { Configuration } from 'electron-builder'
import { windowsSigner } from './scripts/windows-signing.ts'

const env = process.env
const hasMacCertificate = Boolean(env.CSC_LINK || env.CSC_NAME)
const windowsSigning = windowsSigner(env)

const config: Configuration = {
  appId: 'dev.thias.diagrams',
  productName: 'Diagrams',
  copyright: 'Copyright © 2026 Mathias V. Nielsen',
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  directories: { output: 'release', buildResources: 'build' },
  files: [
    'dist/**/*',
    'dist-electron/main.js',
    'dist-electron/preload.cjs',
    'dist-electron/third-party-licenses.main.txt',
    '!node_modules/**',
  ],
  extraMetadata: { macSigned: hasMacCertificate },
  npmRebuild: false,
  toolsets: { nsis: '1.2.1', appimage: '1.0.3' },
  protocols: [{ name: 'Diagrams link', schemes: ['diagrams'] }],
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  publish: { provider: 'github', owner: 'math280h', repo: 'diagrams', releaseType: 'draft' },
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    category: 'public.app-category.developer-tools',
    ...(hasMacCertificate ? { hardenedRuntime: true } : { identity: '-', hardenedRuntime: false, notarize: false }),
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    ...(windowsSigning && {
      signtoolOptions: {
        sign: windowsSigning.sign,
        signingHashAlgorithms: ['sha256'],
        publisherName: windowsSigning.publisherName,
      },
    }),
  },
  nsis: { oneClick: true, perMachine: false, deleteAppDataOnUninstall: false },
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    category: 'Development',
    executableName: 'diagrams',
    maintainer: 'Mathias V. Nielsen <1547127+math280h@users.noreply.github.com>',
    synopsis: 'Animated architecture diagrams and user flows',
    syncDesktopName: true,
  },
}

export default config
