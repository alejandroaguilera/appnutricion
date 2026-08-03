# Estado del proyecto

Estado real de construcción contra el orden de fases del §9 de `APP-NUTRICION-SPEC_v3.md`.
El spec es el contrato de diseño y no se edita; este archivo es lo que va cambiando.

**En vivo:** https://appnutricion.mrhapps.mx
**Última actualización:** 2026-08-04

## Fases

| Fase | Entregable | Estado |
|---|---|---|
| 1 | Prisma schema + seed de catálogo, platillos y plan | ✅ |
| 2 | Pantalla "Hoy" + registro por platillo guardado | ✅ |
| 3 | Durabilidad: IndexedDB, outbox, PUT idempotentes, beacon | ✅ |
| 4 | PWA + offline total | ✅ |
| 5 | Reconciliación multi-escritor (§5.4) | ✅ |
| 6 | Historial, gráficas, adherencia | ✅ |
| 7 | Revisión semanal + lógica de sugerencia | ✅ |
| 8 | Sincronización con `appgym` | ⬜ pendiente |
| 9 | API de export + markdown | ⬜ pendiente |
| 10 | Telegram: webhook, comandos, registro | ✅ código listo, falta credencial |
| 11 | Estimación por texto y foto (`lib/ai/`) | ✅ código listo, falta credencial |
| 12 | Mensajes salientes de Telegram | ✅ resumen diario y revisión dominical |

Fuera de la tabla del §9, también construido: esqueleto de navegación por pestañas,
pantalla de editar/borrar comida, almacenamiento de fotos, y un programador en
proceso (no hay cron en el contenedor).

## Bloqueado por credenciales

Todo el código de IA y Telegram está desplegado pero inerte. La app compila y
corre en verde con las variables vacías: `/api/estimate` responde **503** (no 500)
y el registro se guarda con `estadoClasificacion = pendiente`, con texto y foto
intactos, para reclasificarse solo cuando haya llave. **Nunca se descarta el registro.**

Falta poner en Dokploy:

- `XAI_API_KEY`, `XAI_MODEL`, `XAI_VISION_MODEL` — proveedor decidido: **Grok (xAI)**
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — de @BotFather

Ya puestos: `JOBS_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `APP_BASE_URL`, `SCHEDULER_ENABLED`, `XAI_BASE_URL`.

> **No hardcodear el id del modelo de xAI.** Consultar los vigentes con
> `curl -H "Authorization: Bearer $XAI_API_KEY" https://api.x.ai/v1/models` y
> verificar con `GET /api/ai/health?probe=1` (header `x-jobs-secret`) antes de
> darlo por bueno. `aiConfig()` falla cerrado si `XAI_MODEL` no está definido,
> a propósito: apuntar a un modelo que ya no existe falla con un 404 opaco.

Registrar el webhook una vez que exista el token:
`POST /api/telegram/setup` con el header `x-jobs-secret`.

## Decisiones que se apartan del spec

Están aquí porque no se deducen del código y sin registrarlas la siguiente
sesión las "arreglaría" de vuelta.

1. **Modelo visual híbrido.** El §3.1 exige "porciones grandes, macros chicos"
   como regla no negociable. Alejandro pidió copiar el estilo de caltrack
   (renglones por comida con kcal y proteína). Se resolvió con las dos cosas:
   los renglones son la superficie principal de lectura y la cuadrícula de
   porciones queda debajo como verificación del plan. No se abandonó el modelo
   de porciones.
2. **Porciones sueltas ya no son un camino de registro.** "No sirven para
   nada" (Alejandro, 2026-08-03). El §3.2-C las define como camino C, pero se
   degradaron a un enlace discreto "Ajustar porciones a mano". El componente
   se conserva y se reutiliza como el editor de la confirmación de la IA, que
   es literalmente lo que pide el §3.2-D ("la cuadrícula ya rellenada y editable").
3. **Navegación por pestañas.** El spec define seis pantallas pero nunca una
   estructura de navegación. Se eligió Hoy / Historial / Plan / Ajustes, con
   Registrar como flujo a pantalla completa lanzado desde Hoy, y la revisión
   semanal colgando de Historial.
4. **Los macros nunca los aporta el modelo.** La IA devuelve nombre, cantidad,
   grupo y porciones; las calorías y macros siempre salen de SMAE × porciones
   y se congelan (§7.1). Si el modelo pudiera aportar kcal, la adherencia y el
   histórico dejarían de ser comparables entre registros.
5. **Fotos en Postgres, no en disco.** La app en Dokploy no tiene volumen
   persistente: un archivo en el contenedor se pierde en cada redespliegue.
   Se reducen a ~1024 px en el cliente (`createImageBitmap` + canvas, cero
   dependencias nuevas — nada de `sharp`, que obligaría a tocar el layout de
   `node_modules` del Dockerfile).
6. **Programador en proceso.** No hay cron en el contenedor ni forma de
   instalarlo. `instrumentation.ts` arranca un `setInterval`, pero el estado
   vive en la tabla `ScheduledJob` con reclamo atómico, así que un reinicio no
   pierde ni duplica trabajos. `POST /api/jobs/tick` lo corre a mano.

## Restricciones del entorno

- **No hay `docker exec` ni shell en el contenedor desplegado**, ni Postgres ni
  Docker en local. Toda operación puntual debe ser idempotente y engancharse al
  arranque, o exponerse por HTTP.
- Las migraciones se generan sin base de datos:
  ```
  git show HEAD:prisma/schema.prisma > /tmp/prev.prisma
  npx prisma migrate diff --from-schema-datamodel /tmp/prev.prisma \
    --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_x/migration.sql
  ```
  Revisar el SQL a mano: solo `ADD COLUMN` nulable o con default, `CREATE TABLE`,
  `CREATE INDEX`. Si falla, el contenedor no levanta y no hay shell para arreglarlo.
- La verificación real es `curl` contra la URL en vivo. No hay runtime local.

## Historia que conviene no repetir

Los registros del 3 de agosto de 2026 nunca llegaron a Postgres y nadie se
enteró durante días. Prisma serializa una columna `@db.Date` como ISO completo
(`"2026-08-03T00:00:00.000Z"`), pero el cliente esperaba `"YYYY-MM-DD"` — y esa
cadena era la clave del índice `by-fecha` de IndexedDB. `hydrateDay` esparcía
el objeto del servidor sobre la fila local, envenenaba el índice, y cada
registro nuevo acuñaba otro `DayLog` para la misma fecha que chocaba contra la
restricción única, salía 500, y el drenado del outbox congelaba la cola entera.

Reglas que salieron de ahí:

- **Nunca esparcir un objeto de red hacia un store persistente.** Elegir campos
  uno por uno (`lib/db/mappers.ts`).
- **Resolver por clave natural** cuando exista una columna `@unique` que
  represente la identidad real. Un upsert por `id` con otra restricción única
  no es idempotente.
- **4xx contra 5xx no es cosmético**: decide si el cliente reintenta para
  siempre o se rinde y avisa.
- **Una cola de sync no se frena entera por un ítem roto**, y sus fallos
  necesitan superficie visible. Sin eso la pérdida de datos es indetectable.
