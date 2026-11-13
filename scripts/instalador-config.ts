/**
 * Windows: ZIP evita Nsis7z, que al no cargarse deja su argumento en la pila y hace que NSIS intente escribir
 * app-64.7z\Uninstall Sloth.exe. Con electron-builder 26.15, useZip requiere desactivar differentialPackage:
 * si no, comprime en 7z pero intenta extraer un ZIP. La actualización descarga el instalador completo.
 * Sin separar videos: el builder los excluye del ZIP, pero solo los recupera desde resources, no desde app/web.
 */
export const compresionInstalador = { useZip: true, differentialPackage: false, preCompressedFileExtensions: [] }
