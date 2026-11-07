/**
 * Windows: ZIP evita Nsis7z, que al no cargarse deja su argumento en la pila y hace que NSIS intente escribir
 * app-64.7z\Uninstall Sloth.exe. Con electron-builder 26.15, useZip requiere desactivar differentialPackage:
 * si no, comprime en 7z pero intenta extraer un ZIP. La actualización descarga el instalador completo.
 */
export const compresionInstalador = { useZip: true, differentialPackage: false }
