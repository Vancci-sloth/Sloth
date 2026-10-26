import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * La base del radar (`data/radar/radar.db`, SQLite): un documento por URL, con su texto, y un índice de texto completo
 * (FTS5, con BM25) sobre el título, el texto y la fuente («Claude Code» encuentra lo de su feed
 * aunque el texto no lo diga). La escribe `rastrear.ts`, en otro proceso, y la lee el servidor al buscar;
 * con WAL, buscar no espera a que termine de escribir.
 */

export interface Doc {
  url: string
  /** De dónde salió: `x:@OpenAI`, `rss:TechCrunch`, `hn`… */
  fuente: string
  titulo: string | null
  /** Cuándo se publicó (ms), si la página lo dice. */
  fecha: number | null
  /** Cuándo lo vio el radar (ms). */
  visto: number
  /** El texto es la página entera; si no, es lo que traía el feed o el post, y la página se lee al usarla. */
  completo: boolean
  /** Lo que no es del texto: los puntos en Hacker News, las estrellas del día en GitHub. */
  extra: string | null
  texto: string
}

export function abrirBase(archivo: string): DatabaseSync {
  mkdirSync(dirname(archivo), { recursive: true })
  const db = new DatabaseSync(archivo)
  db.exec(`
    pragma journal_mode = wal;
    pragma busy_timeout = 10000;
    create table if not exists docs (
      id integer primary key, url text not null unique, fuente text not null, titulo text, fecha integer,
      visto integer not null, completo integer not null default 0, extra text, texto text not null
    );
    create index if not exists docs_cuando on docs (coalesce(fecha, visto));
    create virtual table if not exists docs_fts using fts5 (
      titulo, texto, fuente, content = 'docs', content_rowid = 'id', tokenize = 'porter unicode61 remove_diacritics 2'
    );
    create trigger if not exists docs_ai after insert on docs begin
      insert into docs_fts (rowid, titulo, texto, fuente) values (new.id, new.titulo, new.texto, new.fuente);
    end;
    create trigger if not exists docs_ad after delete on docs begin
      insert into docs_fts (docs_fts, rowid, titulo, texto, fuente) values ('delete', old.id, old.titulo, old.texto, old.fuente);
    end;
    create trigger if not exists docs_au after update on docs begin
      insert into docs_fts (docs_fts, rowid, titulo, texto, fuente) values ('delete', old.id, old.titulo, old.texto, old.fuente);
      insert into docs_fts (rowid, titulo, texto, fuente) values (new.id, new.titulo, new.texto, new.fuente);
    end;
    create table if not exists fuentes (nombre text primary key, ultima integer not null, error text, nuevos integer not null default 0);
  `)
  return db
}

const VACIAS = new Set(`a al como con de del el en es la las lo los o para por que se su un una y the and for of to in on
with is are was be by an at as from that this it its how what why who new vs`.split(/\s+/))

/**
 * Una consulta en palabras («OpenAI GPT-6 launch pricing») como términos de FTS5: cada palabra, y lo que vaya entre
 * comillas, como frase.
 */
export function terminos(consulta: string): string[] {
  const frases = [...consulta.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  const palabras = consulta.replace(/"[^"]*"/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}._+#'-]*/gu) ?? []
  const todos = [...frases, ...palabras.filter((p) => !VACIAS.has(p.toLowerCase()) && (p.length > 1 || /\d/.test(p)))]
  return [...new Set(todos.map((t) => t.toLowerCase()))].map((t) => `"${t.replace(/"/g, '""')}"`)
}

export interface Hallado extends Omit<Doc, 'texto'> {
  fragmento: string
  texto?: string
}

/**
 * Lo más pertinente para una consulta: primero lo que trae todas sus palabras y, si no llega a `n`, lo que trae algunas.
 * Dentro de cada grupo, BM25 (el título pesa seis veces el texto y la fuente, tres), bajado según la edad (a los 10 días
 * vale la mitad). `horas`: solo lo publicado en ese tiempo. `textos`: con el texto entero de las páginas completas.
 */
export function buscarEn(db: DatabaseSync, consulta: string, { n = 5, horas, textos = false }: { n?: number; horas?: number; textos?: boolean } = {}): Hallado[] {
  const ts = terminos(consulta)
  if (!ts.length) return []
  const ahora = Date.now()
  const consultar = db.prepare(`
    select d.url, d.fuente, d.titulo, d.fecha, d.visto, d.completo, d.extra, ${textos ? 'd.texto' : "'' as texto"},
      snippet(docs_fts, 1, '', '', ' … ', 40) as fragmento,
      bm25(docs_fts, 6.0, 1.0, 3.0) / (1 + ((? - coalesce(d.fecha, d.visto)) / 864e5) / 10.0) as puntos
    from docs_fts join docs d on d.id = docs_fts.rowid
    where docs_fts match ? and coalesce(d.fecha, d.visto) >= ?
    order by puntos limit ?`)
  const filas: Array<Record<string, string | number | null>> = []
  for (const q of ts.length > 1 ? [ts.join(' AND '), ts.join(' OR ')] : [ts[0]]) {
    for (const f of consultar.all(ahora, q, horas ? ahora - horas * 3600e3 : 0, n) as Array<Record<string, string | number | null>>)
      if (filas.length < n && !filas.some((g) => g.url === f.url)) filas.push(f)
    if (filas.length >= n) break
  }
  return filas.map((f) => ({
    url: String(f.url), fuente: String(f.fuente), titulo: f.titulo as string | null, fecha: f.fecha as number | null,
    visto: Number(f.visto), completo: Boolean(f.completo), extra: f.extra as string | null,
    fragmento: String(f.fragmento).replace(/\s+/g, ' ').trim(),
    ...(textos && f.completo ? { texto: String(f.texto) } : {})
  }))
}
