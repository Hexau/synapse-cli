# @synapse/cli

Cliente de terminal para [Synapse](https://github.com/Hexau/team-agent-synapse) —
chat con el agente, edición de archivos y ejecución de código desde una
carpeta de proyecto, sin necesidad de VSCode ni la WebUI.

Para levantar el backend y el resto del ecosistema, ver
[docs/ECOSYSTEM-SETUP.md](https://github.com/Hexau/team-agent-synapse/blob/main/docs/ECOSYSTEM-SETUP.md)
en el repo principal.

## Instalación

```bash
npm install
npm run compile
```

`@synapse/protocol` y `@synapse/tokens` se consumen como paquetes
empaquetados en `vendor/*.tgz`, no desde npm — si los actualizás, hay que
repackearlos y reinstalar `synapse-cli` desde cero (ver la sección
"Paquetes compartidos" de la guía de ambientación).

## Configuración

```bash
node dist/cli.js login --token "<tu-api-token>" --server "http://localhost:50080"
```

El token sale de la sección de cuenta de la WebUI (`/api/my_account`)
después de loguearte ahí. La configuración queda en
`~/.synapse/config.json`; el `context_id` de cada proyecto se guarda
aparte, en `.synapse/` dentro de esa carpeta (no se commitea).

## Uso

Chat interactivo, dentro de la carpeta de tu proyecto:

```bash
node dist/cli.js
```

Slash commands dentro del chat: `/model`, `/skill`, `/agent`, `/clear`,
`/compact`, `/pause`, `/resume`, `/goal pause|resume`, `/trace`, `/help`.

Subcomandos fuera del chat:

| Comando | Qué hace |
|---|---|
| `synapse login` | Configurar servidor + token |
| `synapse model [use\|clear]` | Ver/cambiar el preset de modelo para esta carpeta |
| `synapse skill [activate\|delete]` | Listar/activar/borrar skills |
| `synapse agent [use]` | Listar/cambiar el perfil de agente |
| `synapse config [get\|set\|apikey]` | Ver/editar settings |
| `synapse chat [reset\|delete\|logs]` | Gestionar chats |
| `synapse diff <repo_slug> [ref]` | Recorrer el diff de un repo hunk por hunk |
| `synapse multirun start\|status\|pick` | Disparar N variantes de una tarea en paralelo y elegir la ganadora |
| `synapse policy list\|remember\|forget\|audit\|pending\|approve\|deny` | Gestionar el motor de políticas sobre tool calls |

Corré `node dist/cli.js --help` para ver la lista completa con ejemplos.

## `/trace`

Genera un Markdown de diagnóstico de la sesión actual (versión, servidor,
estado del modelo/token/meta, últimas líneas del log) en el directorio
temporal del sistema — pensado para pegar en un reporte de bug. El token
de API nunca aparece en el archivo, solo si está configurado o no.

## Desarrollo

```bash
npm run watch     # tsc en modo watch
npm run start     # correr desde src/ sin compilar (ts-node)
```

No hay suite de tests en este repo — la lógica pura (`src/lib/`) está
escrita para poder testearse sin mockear el sistema de archivos si hace
falta en el futuro.
