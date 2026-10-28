import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { z } from 'zod'
import { LibraryPage } from './library/LibraryPage'
import { RootLayout } from './RootLayout'
import { RouteError, RouteNotFound } from './RouteError'

const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
})

const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: LibraryPage })

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/d/$diagramId',
  component: lazyRouteComponent(() => import('./editor/EditorPage'), 'EditorPage'),
})

const playerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$diagramId',
  validateSearch: z.object({ flow: z.string().optional(), from: z.string().optional() }),
  component: lazyRouteComponent(() => import('./player/PlayerPage'), 'PlayerPage'),
})

const templateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/$templateId',
  component: lazyRouteComponent(() => import('./library/TemplatePreview'), 'TemplatePreviewPage'),
})

const releasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/releases',
  component: lazyRouteComponent(() => import('./releases/ReleasesPage'), 'ReleasesPage'),
})

const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/s/$data',
  component: lazyRouteComponent(() => import('./share/SharePage'), 'SharePage'),
})

const renderRoute = createRoute({ getParentRoute: () => rootRoute, path: '/render', component: () => null })

const routeTree = rootRoute.addChildren([
  libraryRoute,
  editorRoute,
  playerRoute,
  templateRoute,
  releasesRoute,
  shareRoute,
  renderRoute,
])

export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
