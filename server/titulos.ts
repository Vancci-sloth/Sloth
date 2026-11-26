/** Título provisional limpio; el agente lo afina en el mismo turno del trabajo. */
export function pedidoParaTitulo(texto: string): string {
  return texto
    .replace(/^(?:Formato|Voz|Imágenes|Imagenes|Carpeta|Subagentes|Marca):.*$/gmi, '')
    .replace(/"[A-Za-z]:[\\/][^"\r\n]*"|'[A-Za-z]:[\\/][^'\r\n]*'/g, '')
    .replace(/(?:[A-Za-z]:[\\/]|file:\/\/\/)[^\r\n]*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*(?:#.*|Image attachment:.*|Image:\s*.*)$/gmi, '')
    .replace(/\s+/g, ' ').trim()
}

export function tituloInicial(texto: string, defecto: string): string {
  const limpio = pedidoParaTitulo(texto).replace(/^["'«“]+|["'»”]+$/g, '')
  if (!limpio) return defecto
  if (limpio.length <= 65) return limpio
  return limpio.slice(0, 66).replace(/\s+\S*$/, '').trim() + '…'
}

export function tituloGenerado(texto: string): string | undefined {
  const limpio = texto.trim().replace(/^["'«“]+|["'»”]+$/g, '')
  if (!limpio || limpio.length > 80 || /[\r\n\uFFFD\u0000]|[A-Za-z]:[\\/]|https?:\/\/|[/\\]/.test(limpio)) return
  return limpio.replace(/\s+/g, ' ')
}

/** Los agentes de Windows pueden escribir títulos en UTF-16 o Windows-1252. */
export function decodificarTitulo(bytes: Uint8Array): string {
  if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder('utf-16be').decode(bytes)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return new TextDecoder('windows-1252').decode(bytes) }
}
