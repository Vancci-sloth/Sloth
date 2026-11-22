/**
 * Lo que es igual para todos y sale de recorrer tablas enteras: se calcula una vez cada `vale` y se guarda en la tabla
 * `guardado`, de donde lo lee cualquier copia del Worker con una sola fila. D1 cobra por fila leída, y guardarlo solo en
 * memoria no alcanza: cada copia vive poco y hay muchas. El 16 de noviembre de 2026, los miembros y activos de la
 * comunidad, los conteos de `/precio`, los votos del roadmap y los créditos se llevaron tres de cada cuatro filas
 * leídas, y D1 llegó a su tope del día.
 */
import type { Env } from './index.ts'

/** Cuánto vale lo guardado. */
export const GUARDADO = 10 * 60_000

/** Lo guardado con ese nombre si aún vale; si no (o con `recontar`), lo que dé `calcular`, que queda guardado. */
export async function guardado<T>(env: Pick<Env, 'DB'>, nombre: string, calcular: () => Promise<T>, recontar = false): Promise<T> {
  const ahora = Date.now()
  if (!recontar) {
    const f = await env.DB.prepare('SELECT valor, hasta FROM guardado WHERE nombre = ?').bind(nombre).first<{ valor: string; hasta: number }>()
    if (f && f.hasta > ahora) return JSON.parse(f.valor) as T
  }
  const valor = await calcular()
  // Si no se pudo guardar, la respuesta sale igual: la siguiente visita lo vuelve a calcular.
  await env.DB.prepare('INSERT INTO guardado (nombre, valor, hasta) VALUES (?, ?, ?) ON CONFLICT (nombre) DO UPDATE SET valor = excluded.valor, hasta = excluded.hasta')
    .bind(nombre, JSON.stringify(valor), ahora + GUARDADO)
    .run()
    .catch((e) => console.error('Guardado', nombre, e instanceof Error ? e.message : e))
  return valor
}
