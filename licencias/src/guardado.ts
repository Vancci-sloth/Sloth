/**
 * Lo que es igual para todos y sale de recorrer tablas enteras: se calcula una vez cada `vale` y se guarda en la tabla
 * `guardado`, de donde lo lee cualquier copia del Worker con una sola fila. D1 cobra por fila leída, y guardarlo solo en
 * memoria no alcanza: cada copia vive poco y hay muchas. El 16 de noviembre de 2026, los miembros y activos de la
 * comunidad, los conteos de `/precio`, los votos del roadmap y los créditos se llevaron tres de cada cuatro filas
 * leídas, y D1 llegó a su tope del día.
 *
 * Nada queda en la memoria del Worker: la fila manda. Al vencer, la primera petición toma el turno de recontar (corre
 * `hasta` un poco, con un UPDATE condicional) y las que llegan mientras siguen con lo de antes; así, cien a la vez no
 * recorren la tabla cien veces. Si recontar falla, sale lo de antes.
 */
import type { Env } from './index.ts'

/** Cuánto vale lo guardado. */
export const GUARDADO = 10 * 60_000
/** Lo que tiene quien recuenta para terminar antes de que otro tome el turno. */
const TURNO = 30_000

/** Lo guardado con ese nombre si aún vale; si no (o con `recontar`), lo que dé `calcular`, que queda guardado `vale`. */
export async function guardado<T>(env: Pick<Env, 'DB'>, nombre: string, calcular: () => Promise<T>, recontar = false, vale = GUARDADO): Promise<T> {
  const ahora = Date.now()
  const f = recontar ? null : await env.DB.prepare('SELECT valor, hasta FROM guardado WHERE nombre = ?').bind(nombre).first<{ valor: string; hasta: number }>()
  if (f && f.hasta > ahora) return JSON.parse(f.valor) as T
  // Vencido: recuenta solo quien mueve `hasta`; los demás, lo de antes.
  if (f && !(await env.DB.prepare('UPDATE guardado SET hasta = ? WHERE nombre = ? AND hasta = ?').bind(ahora + TURNO, nombre, f.hasta).run()).meta.changes)
    return JSON.parse(f.valor) as T
  let valor: T
  try {
    valor = await calcular()
  } catch (e) {
    if (!f) throw e
    console.error('Guardado sin recontar', nombre, e instanceof Error ? e.message : e)
    return JSON.parse(f.valor) as T
  }
  // Si no se pudo guardar, la respuesta sale igual: la siguiente visita lo vuelve a calcular.
  await env.DB.prepare('INSERT INTO guardado (nombre, valor, hasta) VALUES (?, ?, ?) ON CONFLICT (nombre) DO UPDATE SET valor = excluded.valor, hasta = excluded.hasta')
    .bind(nombre, JSON.stringify(valor), ahora + vale)
    .run()
    .catch((e) => console.error('Guardado', nombre, e instanceof Error ? e.message : e))
  return valor
}

/** Que lo guardado que empieza con `prefijo` se vuelva a calcular en la siguiente visita, en todas las copias. */
export async function olvidar(env: Pick<Env, 'DB'>, prefijo: string): Promise<void> {
  await env.DB.prepare("DELETE FROM guardado WHERE nombre LIKE ? || '%'").bind(prefijo).run()
}
