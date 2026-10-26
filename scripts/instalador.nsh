; Lo propio del instalador de Sloth, que arma electron-builder (scripts/compilar.mjs) con NSIS. Instala para tu usuario,
; sin permisos de administrador, en %LOCALAPPDATA%\Programs\Sloth, donde estaba la 0.2: tus videos (app\trabajo), tus
; hilos (app\data) y tus skills (app\skills) viven ahí y ninguna versión nueva los toca.

; Después de poner los archivos: lo que dejaba el instalador de antes de Electron (hasta la 0.2), su desinstalador, su
; entrada en «Aplicaciones instaladas» y la ventana WebView2. Anclar Sloth a la barra de tareas no se ofrece aquí: Windows
; solo deja pedirlo a la app que está al frente, y lo ofrece la bienvenida de Sloth.
!macro customInstall
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Sloth"
  Delete "$INSTDIR\Desinstalar.exe"
  Delete "$INSTDIR\LEEME.txt"
  Delete "$INSTDIR\Microsoft.Web.WebView2.Core.dll"
  Delete "$INSTDIR\Microsoft.Web.WebView2.WinForms.dll"
  Delete "$INSTDIR\WebView2Loader.dll"
!macroend

; Al desinstalar de verdad (no para poner otra versión), el ancla se va con Sloth: si no, quedaría rota.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    ExecWait '"$INSTDIR\resources\ayudante.exe" --desanclar "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${EndIf}
!macroend

; Quitar la versión instalada. Al actualizar (`--updated`) se va todo menos app\data, app\trabajo y app\skills; al
; desinstalar también se van las skills y los node_modules que comparten los videos (se rehacen solos), tus videos y tus
; hilos solo si dices que sí, y la IA local que bajó Sloth (el Python con torch y Whisper, 5 a 10 GB) si dices que sí.
!macro customRemoveFiles
  SetOutPath $TEMP
  FindFirst $0 $1 "$INSTDIR\*.*"
  ${DoWhile} $1 != ""
    ${If} $1 != "."
    ${AndIf} $1 != ".."
    ${AndIf} $1 != "app"
      RMDir /r "$INSTDIR\$1"
      Delete "$INSTDIR\$1"
    ${EndIf}
    FindNext $0 $1
  ${Loop}
  FindClose $0
  FindFirst $0 $1 "$INSTDIR\app\*.*"
  ${DoWhile} $1 != ""
    ${If} $1 != "."
    ${AndIf} $1 != ".."
    ${AndIf} $1 != "data"
    ${AndIf} $1 != "trabajo"
    ${AndIf} $1 != "skills"
      RMDir /r "$INSTDIR\app\$1"
      Delete "$INSTDIR\app\$1"
    ${EndIf}
    FindNext $0 $1
  ${Loop}
  FindClose $0
  ${IfNot} ${isUpdated}
    RMDir /r "$INSTDIR\app\skills"
    ; Los node_modules compartidos de los videos (skills/video-base/scripts/espacio.py y comun.py de El Diff).
    RMDir /r "$LOCALAPPDATA\sloth-modulos"
    RMDir /r "$LOCALAPPDATA\video-el-diff\modulos"
    ; En silencio (/S) no se pregunta, y se quedan.
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/S" $R1
    ${If} ${Errors}
      MessageBox MB_YESNO|MB_ICONQUESTION "¿Borrar también tus videos y tus hilos?$\n$\nSi dices que no, se quedan en $INSTDIR\app (carpetas «trabajo» y «data»)." IDNO quedan
        RMDir /r "$INSTDIR\app\trabajo"
        RMDir /r "$INSTDIR\app\data"
      quedan:
      ; La IA local: el Python que instaló Sloth (`*-sloth`, server/requisitos.ts) y sus modelos. Se vuelve a bajar.
      IfFileExists "$APPDATA\youtube\piezas\python\*.*" 0 sinIA
      MessageBox MB_YESNO|MB_ICONQUESTION "¿Borrar también la IA local que bajó Sloth (unos 5 a 10 GB)?$\n$\nSi vuelves a instalar Sloth, se baja otra vez." IDNO sinIA
        FindFirst $0 $1 "$APPDATA\youtube\piezas\python\*-sloth"
        ${DoWhile} $1 != ""
          RMDir /r "$APPDATA\youtube\piezas\python\$1"
          FindNext $0 $1
        ${Loop}
        FindClose $0
        RMDir /r "$APPDATA\youtube\modelos"
      sinIA:
    ${EndIf}
    RMDir "$INSTDIR\app"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
