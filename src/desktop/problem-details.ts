import type { AgentInfo, AppAbout } from './contract'

/** Returns the facts of an agent server problem as plain text, to copy into a bug report. */
export function problemDetails(info: AgentInfo, about: AppAbout | null): string {
  return [
    about ? `Diagrams ${about.version}, ${about.system}` : 'Diagrams desktop app',
    `Agent server: ${info.state} on port ${info.port}`,
    info.message ?? 'No message',
  ].join('\n')
}
