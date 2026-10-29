import type { ToolName } from './tool-definitions'
import type { ToolHandler } from './handlers/common'
import {
  createDiagramHandler,
  deleteDiagramHandler,
  importMermaid,
  importTrace,
  openDiagramHandler,
  updateDiagram,
} from './handlers/diagrams'
import { addElements, deleteElementsHandler, layoutDiagramHandler, updateElements } from './handlers/elements'
import { addFlowHandler, deleteFlowHandler, updateFlowHandler } from './handlers/flows'
import {
  getDiagram,
  getEditorState,
  lintDiagramHandler,
  listBoundaryKinds,
  listDiagrams,
  queryGraphHandler,
  searchIconsHandler,
} from './handlers/read'
import { renderImage } from './handlers/render'

export const HANDLERS = {
  list_diagrams: listDiagrams,
  get_editor_state: getEditorState,
  get_diagram: getDiagram,
  query_graph: queryGraphHandler,
  lint_diagram: lintDiagramHandler,
  search_icons: searchIconsHandler,
  list_boundary_kinds: listBoundaryKinds,
  create_diagram: createDiagramHandler,
  open_diagram: openDiagramHandler,
  update_diagram: updateDiagram,
  delete_diagram: deleteDiagramHandler,
  import_mermaid: importMermaid,
  import_trace: importTrace,
  add_elements: addElements,
  update_elements: updateElements,
  delete_elements: deleteElementsHandler,
  layout_diagram: layoutDiagramHandler,
  add_flow: addFlowHandler,
  update_flow: updateFlowHandler,
  delete_flow: deleteFlowHandler,
  render_image: renderImage,
} satisfies { [N in ToolName]: ToolHandler<N> }
