/** An error that the agent can act on. Its message goes back to the agent as the tool result. */
export class ToolError extends Error {
  override name = 'ToolError'
}
