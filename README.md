<img src="assets/icon.svg" width="64" height="64" alt="">

# Sloth

Una app de escritorio donde cada estilo de video es una card: le das un tema o un enlace, y un agente de Claude
investiga, escribe el guion y edita el video en tu computadora, a la vista y paso a paso. Para Windows, Mac (Apple
Silicon) y Linux.

**¿Solo quieres usarla?** Descárgala gratis en [sloth.vancci.org](https://sloth.vancci.org). Necesitas tu propia
cuenta de Claude Pro o Max.

## Licencia: código abierto para uso libre, sin reventa

Puedes usar Sloth para lo que quieras (también para trabajos de paga), modificarla y compartirla. **Lo que no puedes es
venderla**, ni una versión modificada, ni un servicio cuyo valor venga de ella. Los videos que hagas son tuyos y los
puedes vender. Es la [Apache 2.0 con Commons Clause](LICENSE), a nombre de [Vancci](https://vancci.org): por esa
condición no es «open source» según la definición de la OSI.

Remotion, que arma los videos, tiene su [propia licencia](https://www.remotion.dev/license): gratis para personas y
equipos pequeños; las empresas más grandes pagan la suya.

## Correrla desde el código

Necesitas Node 24 y tu cuenta de Claude (Pro o Max): si no hay sesión, la app la pide.

```
npm ci
npm start
```

`npm start` levanta el servidor en `http://localhost:4848` y abre la ventana de Sloth. FFmpeg, Python y lo que pide
cada estilo los instala la propia app.

Los agentes cargan las skills desde `~/.claude/skills`. Enlaza una vez esa carpeta a `skills/` de este repo:

```
# Windows (cmd)
mklink /J "%USERPROFILE%\.claude\skills" "<carpeta del repo>\skills"

# Mac y Linux
ln -s "<carpeta del repo>/skills" ~/.claude/skills
```

Antes de dar algo por hecho: `npm run typecheck`, `npm test` y, si tocaste `skills/`, `npm run comprobar-skills`.

## Más

- Cómo está hecha y sus reglas: [`AGENTS.md`](AGENTS.md); el mapa del código: [`docs/agents/mapa.md`](docs/agents/mapa.md).
- Para aportar: [`CONTRIBUTING.md`](CONTRIBUTING.md). Para reportar un problema de seguridad: [`SECURITY.md`](SECURITY.md).
- Si Sloth te sirve, puedes [apoyarla](https://sloth.vancci.org/#apoyar): con ese apoyo salen las metas del roadmap.
