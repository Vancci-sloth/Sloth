/** La conexión CDP no es actividad: conserva la página despierta solo mientras una operación la necesita. */
export function actividadNavegador(cambiar: (ahorro: boolean) => void | Promise<void>, gracia = 5000) {
  let usos = 0
  let visible = false
  let cerrado = false
  let reloj: ReturnType<typeof setTimeout> | undefined
  let ahorro: boolean | undefined
  let cambio = Promise.resolve()
  const aplicar = (si: boolean) => {
    if (cerrado || ahorro === si) return cambio
    ahorro = si
    // Un relevo que acaba justo al empezar otro no debe dejar un cambio de foco atrasado.
    cambio = cambio.then(() => cerrado ? undefined : cambiar(si)).catch(() => {})
    return cambio
  }
  const soltar = () => {
    clearTimeout(reloj)
    if (!usos && !visible) reloj = setTimeout(() => void aplicar(true), gracia)
    reloj?.unref()
  }
  void aplicar(true)
  return {
    ocupada: () => usos > 0,
    refrescar() {
      const anterior = ahorro ?? true
      ahorro = undefined
      void aplicar(anterior)
    },
    ver(si: boolean) {
      if (visible === si) return
      visible = si
      if (si) { clearTimeout(reloj); void aplicar(false) }
      else soltar()
    },
    async usar<T>(operacion: () => Promise<T>): Promise<T> {
      usos++
      clearTimeout(reloj)
      await aplicar(false)
      try { return await operacion() }
      finally { usos--; soltar() }
    },
    cerrar() { cerrado = true; clearTimeout(reloj) }
  }
}
