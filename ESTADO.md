# Estado del proyecto

Estado real de construcción contra el orden de fases del §9 de `APP-NUTRICION-SPEC_v3.md`.
El spec es el contrato de diseño y no se edita; este archivo es lo que va cambiando.

**En vivo:** https://appnutricion.mrhapps.mx
**Última actualización:** 2026-08-04 (ronda 3)

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
| 10 | Telegram: webhook, comandos, registro | ✅ activo (@appnutricion_bot) |
| 11 | Estimación por texto y foto (`lib/ai/`) | ✅ activo (grok-4.5) |
| 12 | Mensajes salientes de Telegram | ✅ resumen diario y revisión dominical |

Fuera de la tabla del §9, también construido: esqueleto de navegación por pestañas,
pantalla de editar/borrar comida, almacenamiento de fotos, y un programador en
proceso (no hay cron en el contenedor).

## Credenciales

Todas cargadas en Dokploy (2026-08-04): `XAI_API_KEY`, `XAI_MODEL`,
`XAI_VISION_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `JOBS_SECRET`,
`TELEGRAM_WEBHOOK_SECRET`, `APP_BASE_URL`, `SCHEDULER_ENABLED`, `XAI_BASE_URL`.

Bot: **@appnutricion_bot**. `chat_id` autorizado: `6647020281` (único; cualquier
otro chat se ignora en silencio, §6.3).

### Rendimiento medido (2026-08-04)

- **Camino local** (alias de platillo guardado): **3 ms**, sin llamada al
  modelo, confianza 1. Es el camino del caso común y es gratis.
- **Modelo, solo texto**: 12-17.5 s. `grok-4.5` razona antes de responder.
- Por eso el timeout está en **60 s** y no en 25: con 25 s se abortaban
  estimaciones que iban a llegar bien, y el registro caía a `pendiente` sin
  necesidad. La UI avisa que puede tardar.
- Telegram no sufre esta latencia: el webhook responde 200 de inmediato y
  procesa después, así que Telegram nunca reintenta por lentitud.
- Si algún día molesta la espera, `grok-4-fast` existe en la cuenta y sería
  bastante más rápido a cambio de algo de precisión. Decisión de Alejandro.

### Lo que se aprendió de la API de xAI

- **La API valida el nombre del modelo ANTES que los créditos.** Eso permite
  descubrir qué ids existen sin gastar: `permission-denied` = el modelo existe;
  `invalid-argument: Model not found` = no existe.
- Existen: `grok-4.5`, `grok-4`, `grok-4-latest`, `grok-4-0709`, `grok-4-fast`,
  `grok-3`. **No** existen: `grok-4-5`, `grok-4.1`, `grok-beta`,
  `grok-2-latest`, ni ningún `grok-*-vision-*`.
- **No hay modelo de visión aparte.** `grok-4.5` acepta el payload multimodal
  estilo OpenAI (`image_url` con data URL) directamente — verificado enviando
  un payload real con imagen y viendo que pasó la validación de forma antes de
  toparse con los créditos. Por eso `XAI_MODEL` y `XAI_VISION_MODEL` son el mismo.
- `/v1/models` devuelve 403 sin créditos, así que no sirve para descubrir ids
  en una cuenta nueva; hay que sondear con `chat/completions`.

Verificar con `GET /api/ai/health?probe=1` (header `x-jobs-secret`).
`aiConfig()` falla cerrado si `XAI_MODEL` no está definido, a propósito.

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
7. **Editar por alimento, no por grupo.** El §3.2-C piensa en grupos
   abstractos, pero "AOA muy bajo aporte de grasa: 3" no le dice nada a nadie.
   El editor muestra alimentos reales con su equivalencia (`cantidadPorcion`,
   poblado en los 152 ítems del catálogo) y las kcal derivadas. Los gramos
   solo aparecen cuando se conocen de verdad (22 de 152): el catálogo del SMAE
   habla en medidas caseras, y un gramaje inventado sería peor que ninguno.
8. **Gramos solo cuando se conocen.** 19 de 149 ítems tienen peso real; el
   resto del catálogo SMAE habla en medidas caseras ("3 tazas", "20 piezas").
   El editor muestra `cantidadPorcion` siempre y gramos solo cuando existen —
   un gramaje inventado sería peor que ninguno. `applyDataFixups` rellena los
   que el parser ampliado sabe leer, y corre fuera del early-return del seed
   porque ahí adentro nada vuelve a ejecutarse.
9. **La sesión de `/chat` vive bajo `${chatId}:chat`.** `TelegramSession.chatId`
   es clave primaria y solo cabe una fila por chat; sin el sufijo, empezar una
   conversación destruiría una estimación pendiente de confirmar.
10. **Una pregunta se contesta, no se registra.** Heurística de texto (termina
   en `?`, empieza con `¿`, o arranca con qué/cuánto/cómo/puedo…), sin gastar
   una llamada al modelo para adivinar la intención. Una foto siempre es
   comida. Ante duda se responde **y** se ofrece registrar, para no tragarse
   una intención de registro.

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

### El registro por IA que nunca llegó (4 de agosto de 2026)

Una comida registrada en la app con estimación de IA desapareció. No fue un
borrado: **nunca llegó al servidor**. `ConfirmarEstimacion` armaba las
porciones sin `foodItemId`; `JSON.stringify` elimina las claves `undefined`; y
el esquema del servidor la exigía presente, porque **`z.string().nullable()`
requiere que la clave venga, a diferencia de `.nullish()`**. Resultado: 422 →
`permanentError` → nunca reenviado. Telegram no lo sufría porque construye las
porciones del lado del servidor.

Lo que lo hizo posible: un `as RegisterPortionInput[]`. **El cast le ocultó a
TypeScript un campo faltante que habría atrapado en compilación.** Un cast en
la frontera entre lo que se construye y lo que se envía es exactamente donde
no debe haber uno.

Reglas:
- En un DTO de red, **`.nullish()` para todo campo opcional**, nunca
  `.nullable()`. Un campo omitido no debe costar un dato del atleta.
- **Ningún `as` entre la construcción de un payload y su envío.** Si los tipos
  no calzan, es que falta algo.
- **"Descartar" tiene que borrar el registro local también.** Quitar solo la
  fila del outbox dejaba una comida huérfana que la reconciliación podaba
  después, en silencio.


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
