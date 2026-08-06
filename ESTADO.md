# Estado del proyecto

Estado real de construcción contra el orden de fases del §9 de `APP-NUTRICION-SPEC_v3.md`.
El spec es el contrato de diseño y no se edita; este archivo es lo que va cambiando.

**En vivo:** https://appnutricion.mrhapps.mx
**Última actualización:** 2026-08-06 (ronda 4)

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
| — | Notas de voz en Telegram (fuera del §9) | ✅ activo (xAI `/v1/stt`) |

Fuera de la tabla del §9, también construido: esqueleto de navegación por pestañas,
pantalla de editar/borrar comida, almacenamiento de fotos, y un programador en
proceso (no hay cron en el contenedor).

## Credenciales

Todas cargadas en Dokploy (2026-08-04): `XAI_API_KEY`, `XAI_MODEL`,
`XAI_VISION_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `JOBS_SECRET`,
`TELEGRAM_WEBHOOK_SECRET`, `APP_BASE_URL`, `SCHEDULER_ENABLED`, `XAI_BASE_URL`.

Bot: **@appnutricion_bot**. `chat_id` autorizado: `6647020281` (único; cualquier
otro chat se ignora en silencio, §6.3).

Las notas de voz **no añadieron ninguna credencial**: van con `XAI_API_KEY`
contra `/v1/stt`.

Si algún día hay que tocar el bloque `env` en Dokploy, **hay que releerlo
entero con `application.one` y reenviarlo completo**: `saveEnvironment`
reemplaza, no fusiona, y mandar solo la variable nueva borra las otras trece.

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

### xAI SÍ transcribe audio, pero no por la ruta de OpenAI

`POST /v1/stt`, multipart, con la **misma `XAI_API_KEY`**. No hace falta
ninguna credencial extra. Documentado en
`docs.x.ai/developers/model-capabilities/audio/speech-to-text`.

Tres señales hacen creer que xAI no transcribe, y las tres son falsas pistas:

- `POST /v1/audio/transcriptions` (la ruta compatible con OpenAI) → **404**.
- `GET /v1/language-models` declara `input_modalities: ["text","image"]`: eso
  describe los modelos de **chat**, no el servicio de STT, que no recibe
  nombre de modelo.
- Un bloque `{"type":"input_audio"}` en el chat → `400 Empty content block`.

**Un 404 en la ruta compatible no es una respuesta sobre la capacidad, solo
sobre la ruta.** Antes de concluir que un proveedor no hace algo, hay que leer
su documentación, no sondear el dialecto de otro.

Forma real (verificada de punta a punta el 2026-08-06 generando audio con
`POST /v1/tts` `{text, language}` y transcribiéndolo de vuelta):

- Campos: `file`, `language`, `format` (normalización inversa de texto),
  `keyterm` (repetible, sesga el vocabulario), `diarize`, `vad_threshold`…
- Respuesta: `{ text, language, duration, words[] }`.
- Contenedores autodetectados, incluido **OGG/Opus** — el formato exacto en el
  que Telegram manda las notas de voz. Hasta 500 MB.
- **`format=true` ya hace el trabajo de números dictados**: «agua quinientos» →
  `Agua 500.`, «peso ochenta y cuatro punto tres» → `Peso 84.3.`. Efecto
  lateral: también convierte el artículo «un/una» en «1».

Con créditos activos **`/v1/models` ya funciona** (antes daba 403), así que
descubrir ids vigentes ya no necesita el truco de sondear `chat/completions`.
Modelos que existen hoy y no existían en la ronda 3: `grok-4.3` y la familia
`grok-4.20` (`-reasoning`, `-non-reasoning`, `-multi-agent`, 1M de contexto).
La variante `non-reasoning` bajaría bastante la latencia; sigue sin decidirse.

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
   poblado en **149 de 149** ítems no archivados) y las kcal derivadas.

   **Los gramos solo aparecen cuando se conocen de verdad: 19 de 149.** El
   catálogo del SMAE habla en medidas caseras ("3 tazas", "20 piezas"), y un
   gramaje inventado sería peor que ninguno. `applyDataFixups` rellena los que
   el parser ampliado sabe leer, y corre **fuera** del early-return de
   `seedDatabase` — ahí adentro nada vuelve a ejecutarse una vez sembrado, así
   que mejorar el parser no habría tenido ningún efecto en producción.
8. **Una foto con pregunta se contesta, no se registra** (cambiado el
   2026-08-06; antes decía «una foto SIEMPRE es comida»). Si el pie de foto
   pasa la heurística de consulta, la foto va al chat **con la imagen** y se
   responde, con la coletilla de «si querías registrarlo, mándala con /snack».
   Sin pie, o con descripción normal, la foto sigue siendo comida.

   Lo que forzó el cambio: `/chat` + foto contestaba «no veo ningún producto»
   porque `responderChat()` solo pasaba texto. El soporte multimodal existía
   pero estaba reservado al camino de estimación. **El historial de `/chat` que
   se persiste guarda la foto como el marcador `[foto]`**, nunca el base64: son
   ~500 KB por imagen en la columna `Json` de `TelegramSession`, y a la tercera
   repregunta la fila pesaría megabytes.

9. **La sesión de `/chat` vive bajo `${chatId}:chat`.** `TelegramSession.chatId`
   es clave primaria y solo cabe una fila por chat; sin el sufijo, empezar una
   conversación destruiría una estimación pendiente de confirmar.
10. **Una pregunta se contesta, no se registra.** Heurística de texto (termina
    en `?`, empieza con `¿`, o arranca con qué/cuánto/cómo/puedo…), sin gastar
    una llamada al modelo para adivinar la intención. Ante duda se responde
    **y** se ofrece registrar, para no tragarse una intención de registro.

11. **Los comandos dictados exigen un separador, no una palabra suelta**
    (`normalizarComandoHablado`, `lib/telegram/router.ts`). Whisper nunca
    escribe la diagonal, así que hay que reconstruirla — pero mapear la palabra
    a secas secuestraría registros reales: «comida corrida con agua de jamaica»
    se convertiría en `/comida corrida…` y perdería la palabra. Las reglas son
    estrechas a propósito:
    - slots (`desayuno|comida|cena|snack|post gym`) solo con `:` o `,` detrás
      («cena: pollo con arroz»);
    - `agua`/`peso` solo si después hay un número;
    - `hoy|ayer|semana|platillos|ayuda|deshacer` solo si son el mensaje entero.

    **La conversión de números dictados se aplica solo dentro de `agua`/`peso`**,
    nunca al texto completo: «un poco de arroz» se volvería «1 poco de arroz».
    Es una red de seguridad — `format=true` en `/v1/stt` ya devuelve los
    números en dígitos.

12. **Sin migración para la voz.** Una nota de voz se guarda en
    `TelegramUpdate.tipo` como `texto`. Agregar un valor `voz` al enum obligaría
    a un `ALTER TYPE`, y sin shell en el contenedor una migración que falla deja
    la app sin arrancar. Ese campo es solo diagnóstico del deduplicador.

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

### Los fallos que se disfrazaban de otra cosa (6 de agosto de 2026)

Tres reportes de Alejandro probando el bot, y ninguno era el bug que parecía.

**«No pude estimar las porciones».** Se investigó como si la visión estuviera
rota. No lo estaba: replicando el payload exacto de estimación contra la API en
vivo —mismo system, `response_format: json_object`, imagen `detail: high`—
`grok-4.5` devolvió JSON válido y bien estimado en **6.8 s**. Lo que sí había
eran dos caminos que fallaban **sin fallar**:

- `descargarFoto()` devuelve `null` y el flujo **seguía como si no hubiera
  foto**. El modelo, preguntado a ciegas, no se queja: devuelve
  `{"items": [], "porciones": [], "confianza": 0.1}`, que es JSON perfectamente
  válido. Resultado: una tarjeta vacía que al confirmar creaba un registro de
  0 kcal. Comprobado mandando ese prompt sin texto ni imagen.
- Lo mismo con `/snack` a secas: sin texto y sin foto se gastaba una llamada al
  modelo para producir esa misma tarjeta vacía.

Regla: **un JSON válido no es una estimación válida.** Si no hay entrada, no
hay llamada; y si la entrada se perdió en el camino, se dice — no se sigue con
lo que quedó.

**La causa del fallo no estaba en ningún lado.** El mensaje era
«no pude estimar» a secas para las cinco causas de `AiUnavailableError`, y
diagnosticarlo desde fuera resultó imposible: sin `docker exec`, sin socket de
Docker (`permission denied`) y con Postgres sin puerto publicado al host, **los
logs de producción no son consultables**. Ahora la causa va en el mensaje al
atleta (`MOTIVO_LEGIBLE`) y en `logEvent("tg_estimacion_fallida")`.

Se agregó también la causa **`truncado`**: `grok-4.5` razona antes de responder
y sus tokens de razonamiento salen del **mismo** `max_tokens` que la respuesta.
Cuando se agota, la API devuelve un JSON cortado con `finish_reason: "length"`
— que llegaba disfrazado de error de *parseo* y mandaba a buscar el problema al
prompt en vez de al presupuesto de tokens. El viaje de reparación, además,
reenviaba la imagen entera (~2 400 tokens) para volver a truncarse igual.

**La nota de voz que no hacía nada.** No había ningún `if` que la mirara:
`voice` ni siquiera estaba en la interfaz `TelegramUpdate`, así que caía en el
`if (!texto && !msg.photo) return null`. Un `return null` silencioso en un
router de mensajes es indistinguible de un bot caído.

Y al arreglarlo se cometió el error contrario: se concluyó que **xAI no
transcribía audio** a partir de tres sondeos (`/v1/audio/transcriptions` → 404,
`input_modalities` sin audio, `input_audio` → 400) y se metió un segundo
proveedor con credencial nueva. Existía `/v1/stt` todo el tiempo, documentado.
Alejandro lo encontró leyendo los docs. **Sondear el dialecto de otro proveedor
no responde qué sabe hacer este; para eso está su documentación.**

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
