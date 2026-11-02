import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron'

/**
 * El menú del clic derecho de la ventana: Electron, a diferencia de un navegador, no trae ninguno. En un campo, cortar,
 * copiar, pegar y seleccionar todo; sobre texto seleccionado, copiar; en lo demás, nada. Lo que la interfaz atiende por su
 * cuenta (las filas de los hilos) ni llega aquí.
 */
export function opcionesClicDerecho(wc: Pick<WebContents, 'cut' | 'copy' | 'paste' | 'selectAll'>, p: Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>): MenuItemConstructorOptions[] {
  const copiar = { label: 'Copiar', enabled: p.editFlags.canCopy, click: () => wc.copy() }
  if (p.isEditable) {
    return [
      { label: 'Cortar', enabled: p.editFlags.canCut, click: () => wc.cut() },
      copiar,
      { label: 'Pegar', enabled: p.editFlags.canPaste, click: () => wc.paste() },
      { type: 'separator' },
      { label: 'Seleccionar todo', enabled: p.editFlags.canSelectAll, click: () => wc.selectAll() }
    ]
  }
  return p.selectionText.trim() ? [copiar] : []
}
