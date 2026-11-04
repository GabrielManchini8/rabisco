import { Board } from './canvas/Board'

// MVP: um único documento. Próximo passo: sidebar com lista vinda do Dexie.
export function App() {
  return <Board documentId="default" />
}
