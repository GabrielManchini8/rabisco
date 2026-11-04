import Dexie, { Table } from 'dexie'

/**
 * Dexie guarda METADADOS e índices (lista de docs, busca, backlinks).
 * O conteúdo em si vive no Y.Doc (y-indexeddb). Separar evita carregar
 * todos os canvases na RAM só para listar a sidebar.
 */
export interface DocMeta { documentId: string; title: string; kind: 'note' | 'board'; updatedAt: number; tags: string[] }
/** Áudios das explicações gravadas (blob local; nuvem → Supabase Storage depois) */
export interface Media { id: string; blob: Blob; createdAt: number }
export interface Link { from: string; to: string } // [[wikilinks]] -> backlinks estilo Obsidian

class LocalDB extends Dexie {
  docs!: Table<DocMeta, string>
  links!: Table<Link, [string, string]>
  media!: Table<Media, string>
  constructor() {
    super('rabisco')
    this.version(1).stores({ docs: 'documentId, updatedAt, *tags', links: '[from+to], to' })
    this.version(2).stores({ media: 'id, createdAt' })
  }
}
export const db = new LocalDB()
