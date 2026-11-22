/** Solo la página visible puede sonar. Ocultarla conserva la preferencia manual para cuando vuelva. */
export function audioNavegador(aplicar: (silenciado: boolean) => void, siempreSilenciado = false) {
  let visible = false
  let manual = siempreSilenciado
  let ultimo: boolean | undefined
  function sincronizar() {
    const silenciado = siempreSilenciado || manual || !visible
    if (silenciado === ultimo) return
    ultimo = silenciado
    aplicar(silenciado)
  }
  sincronizar()
  return {
    ver(si: boolean) { visible = si; sincronizar() },
    alternar() { if (!siempreSilenciado) manual = !manual; sincronizar() },
    get silenciado() { return manual },
  }
}
