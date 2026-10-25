import { createContext } from 'react'
import type { Engine } from './engine'

export const EngineContext = createContext<Engine | null>(null)
