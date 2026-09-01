# Estado del proyecto

Estado real de construcción contra el orden de fases del §9 de `APP-NUTRICION-SPEC_v3.md`.
El spec es el contrato de diseño y no se edita; este archivo es lo que va cambiando.

**En vivo:** https://appnutricion.mrhapps.mx
**Última actualización:** 2026-09-01 (ronda 7)

## Plan vigente: Bloque 2 (menú de Alma Lomeli)

Desde el 2026-08-11 la base sirve el **Bloque 2**, transcrito del PDF de la
nutrióloga y descrito en `03-PLAN-NUTRICION.md:221-307`. El Bloque 1 sigue en la
base con `activo: false` y `vigenteHasta: 2026-08-09`; sus 22 platillos quedaron
archivados (`archivadoEn`), no borrados: hay `MealEntry` que apuntan a ellos.

```
kcalObjetivo 2130 · P164 · C227 · G57 · fibra 29 · agua 3.0 L
5 tiempos: desayuno 09:30 · comida 13:30 · snack pre-gym 17:00 ·
           post-gym 19:30 (opcional, en cero) · cena 21:00
17 platillos: 5 desayunos, 4 comidas, 4 snacks (1 archivado), 4 cenas
```

**Por qué 2,130 y no las 1,890 que declara el documento.** El PDF no trae
desglose de macros. Sus recetas traducidas a porciones y valuadas con las tasas
del SMAE promedian **2,131 kcal/día** (desayuno 504 · comida 662 · snack 418 ·
cena 547, media de las opciones de cada tiempo). El propio
`03-PLAN-NUTRICION.md` ya lo había notado: ninguna combinación da 1,890.

Lo que sí coincide: **proteína (164 vs ~158) y grasa (57 vs ~54)**. Toda la
brecha está en carbohidratos (+34 g) y en el total. Decisión de Alejandro
(2026-08-11): se carga el promedio real. Un objetivo que el menú mismo no puede
alcanzar dejaría la app marcando exceso todos los días aun siguiendo el plan al
pie de la letra — exactamente lo que el §7.4 prohíbe. Las 1,890 quedan escritas
en `NutritionPlan.notas`. **Sigue pendiente pesar un día completo** para
verificar contra las etiquetas reales.

**Comprobación de consistencia** (hecha con las tasas del SMAE sobre los
platillos ya escritos, no a mano): la suma de los targets por slot es idéntica a
`DAILY_TARGETS`, y `DAILY_TARGETS` cae a menos de 0.2 porciones del promedio
real del menú en los cinco grupos. Un día seguido al pie de la letra lee
**79-91% de adherencia**, dentro de la banda de 85-90% que persigue el §7.2.

**Dos `FoodItem` nuevos**, ambos huecos reales del catálogo del §10.2: `Leche
deslactosada light` (el grupo `leche` estaba vacío y el Bloque 2 lo usa dos
veces) y `Jugo de naranja natural`. Tocino, aderezo ranch, miel y Protein
Premier van como componentes genéricos (`foodItemId: null` + `notaLibre`): son
marcas o cantidades que no existen en el SMAE, y meterlas como intercambio sería
inventar un dato.

**El snack de melón se siembra archivado.** Alejandro no come melón; mismo trato
que pescado y salmón en §10.2 — presente en la base, ausente de la interfaz.

**`/snack` en Telegram apuntaba a `snack_am`**, que el Bloque 2 quitó.
`registro.ts` resuelve el slot con `findFirst({ clave, plan: { activo: true } })`,
así que devolvía null: la entrada se guardaba sin `planMealSlotId` y con la
clave cruda de nombre. Ahora apunta a `snack_pm`, el único tiempo de snack del
plan. Si un bloque futuro vuelve a tener dos, hay que desambiguar por hora.

## Fases

| Fase | Entregable | Estado |
|---|---|---|
| 1 | Prisma schema + seed de catálogo, platillos y plan | ✅ Bloque 2 desde 2026-08-11 |
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

**La estimación por IA se reserva antes de llamarla y va en streaming**
(2026-09-01): el registro se guarda `pendiente` al pulsar Estimar y el
razonamiento del modelo se enseña mientras ocurre. Por qué, en "Historia que
conviene no repetir".

**La foto de la entrada libre tiene dos botones** (2026-09-01): cámara y galería.
El input llevaba `capture="environment"`, que abre la cámara directo y no deja
llegar al carrete — no había forma de subir una foto ya tomada. Un solo input sin
`capture` no sirve: iOS muestra un menú con las dos opciones pero Android suele ir
directo a la galería. Dos inputs ocultos y un botón para cada intención es lo
único que se comporta igual en los dos. Los dos se limpian (`value = ""`) después
de elegir, o volver a escoger el mismo archivo no dispara `change`.

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
4. **Los macros no los aporta el modelo, salvo en `libre`.** La IA devuelve
   nombre, cantidad, grupo y porciones; las calorías y macros salen de
   SMAE × porciones y se congelan (§7.1). Si el modelo pudiera aportar kcal para
   los grupos del SMAE, la adherencia y el histórico dejarían de ser comparables
   entre registros.

   **La excepción, desde el 2026-08-12: el grupo `libre`.** El SMAE no tiene
   grupo para el alcohol, los refrescos, los dulces ni los productos de marca.
   Todo eso caía en `libre`, cuya tasa es 0, y una Michelob Ultra de 95 kcal se
   registraba como 95 kcal de nada; forzarla a `cereal` habría dado la energía
   casi bien a cambio de 20 g de carbohidratos inventados y de ensuciar la barra
   de cereales. Ahora el modelo puede devolver `kcal/proteinaG/carbosG/grasaG`
   **por porción** para `libre` y solo para `libre`:

   - La tasa de `libre` ya era cero, así que no se pisa ningún número del SMAE:
     se rellena un hueco.
   - `libre` no está en `DISPLAY_GROUPS`, así que barras y adherencia no cambian.
     Solo suma a kcal y macros del día.
   - La regla se aplica **en código**, no solo en el prompt: `parseEstimacion`
     tira las macros que vengan en cualquier otro grupo, y `macrosDePorcion`
     (`lib/nutrition/groups.ts`) es el único lugar donde vive la excepción. Los
     seis sitios que congelaban macros pasan por ahí.
   - **Sin migración ni columna nueva.** `MealEntryPortion` ya tenía las cuatro
     columnas y el DTO de red ya las mandaba. La tasa unitaria se recupera al
     editar dividiendo lo guardado entre las porciones (`macrosPropiasGuardadas`):
     el congelado fue lineal, así que dividir es exacto. Sin eso, abrir una
     comida con cerveza en el editor y volver a guardarla la dejaba en 0 kcal,
     porque `app/comida/[mealId]/page.tsx` recalcula.

   **El prompt de estimación ahora incluye la tabla de tasas del SMAE** y qué es
   una porción de cada grupo. No estaba: el modelo tenía que deducir de su
   preentrenamiento cuánto vale una porción y qué distingue `aoa_muy_bajo` de
   `aoa_bajo` de `aoa_moderado` (40 / 55 / 75 kcal), y toda la conversión
   depende de ese dato.
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

12. **La adherencia se calcula por barra, no por `FoodGroup`.** El §7.2 dice
    "por grupo" y `computeAdherencia` lo tomaba literal: clave contra clave.
    Pero el target agregado de proteína se siembra completo contra
    `aoa_muy_bajo` y el de grasa contra `grasa_sin_proteina`
    (`REPRESENTATIVE_CLAVE`), así que un desayuno de huevo y panela —`aoa_bajo`—
    no contaba contra ningún target y salía como desviación pura. Con el Bloque 2
    un día perfecto leía **63-84%**; con el rollup a `DISPLAY_GROUPS` lee
    **79-91%**. `computeBarras` ya sumaba así lo que se muestra: las dos mitades
    de la pantalla estaban midiendo cosas distintas.

    Un intercambio equivalente no es una desviación. Castigarlo es justo el
    mecanismo por el que se abandona un plan (§7.4).

13. **`applyDataFixups` es el canal de migración de datos, no solo de
    correcciones.** No hay ruta HTTP que escriba catálogo ni plan, ni
    `docker exec`, ni shell: es el único código que corre contra la base de
    producción. `ensureBloque2` vive ahí, es idempotente (consulta antes de
    insertar, porque ni `Dish.nombre` ni `FoodItem.nombre` tienen `@unique`) y
    **no relanza**: `prisma/seed.ts` corre encadenado con `&&` antes de
    `node server.js`, así que un throw dejaría la app sin arrancar y sin forma de
    entrar a repararla. Se registra el error en los logs del deploy y se sigue.
    El cambio de plan activo va en un `$transaction`: `NutritionPlan.activo` no es
    único y `/api/plan` resuelve con `findFirst` sin `orderBy`, así que dos planes
    activos harían que cuál gana fuera cuestión de suerte.

14. **Las entradas de un slot que el plan vigente ya no tiene se muestran
    aparte.** `app/hoy/page.tsx` recorre `plan.slots` y agrupa por
    `entry.clave`: al quitar `snack_am`, los registros viejos de ese tiempo
    desaparecían de la lista mientras seguían sumando en las barras y en los
    macros. Una comida que cuenta pero no se ve es indistinguible de un dato
    perdido — el mismo patrón que ya costó los registros del 3 de agosto.

15. **Sin migración para el Bloque 2.** Todo es INSERT/UPDATE sobre tablas
    existentes: los 5 tiempos caben en el enum `PlanMealSlotClave` tal cual, sin
    `ALTER TYPE`. `snack_am` se queda en el enum aunque el plan ya no lo use,
    justamente porque hay `MealEntry` que lo referencian.

16. **Sin migración para la voz.** Una nota de voz se guarda en
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

### La comida que se perdía mientras el modelo pensaba (1 de septiembre de 2026)

Síntoma: subir foto, describirla, pulsar Estimar, ver "puede tardar unos
segundos… la foto ya está guardada" y al rato "como si se refrescara la
página". Ni estimación, ni registro, ni aviso. Nada.

**El backend estaba sano.** Reproducido contra la URL en vivo con la misma
foto reducida: `POST /api/estimate` devuelve 200 en 22.4 s, con la imagen
efectivamente enviada (`image_tokens: 898`). El fallo era del cliente.

**Todo el registro vivía en el estado de React hasta que volvía la
estimación.** La foto sí se subía —por eso el mensaje decía la verdad— pero
el texto, el slot y la intención de registrar solo existían en memoria. Si
la pantalla moría durante los 20-60 s de espera, moría con ella la petición
en vuelo; y como el contexto de JS desaparece, **ni siquiera corría el
`catch` que guarda el registro como `pendiente`**. El §3.2-D estaba
implementado solo para el fallo que devuelve 503, que es el único que deja
vivo a quien tiene que reaccionar.

Qué mata una pestaña móvil a media espera: el sistema descartándola en
segundo plano, la presión de memoria (la vista previa retenía el archivo
ORIGINAL, y una foto de 12 MP son decenas de MB descodificados), o un
despliegue nuevo — el contenedor se había reemplazado nueve minutos antes.

Tres arreglos, y el primero es el que importa:

1. **Se reserva el registro antes de llamar al modelo.** Al pulsar Estimar
   se guarda ya la comida como `pendiente` con su texto y su foto.
   Confirmar la completa (`registerMeal({existente})`, que sube `version` y
   respeta la resolución de conflictos del §5.4.5) en vez de crear otra.
   Ahora la única forma de perder un registro es pedirlo: "Cancelar" lo
   archiva (borrado lógico), nada más lo borra.
2. **La estimación va en streaming** (`POST /api/estimate/stream`, SSE). El
   razonamiento del modelo se enseña según se produce. Además de quitar el
   silencio, quita el silencio *de la conexión*: medio minuto sin un byte es
   indistinguible de una petición colgada para el proxy y para el navegador.
   El plazo de xAI pasó a ser de INACTIVIDAD (se rearma con cada trozo), así
   que un modelo que sigue escribiendo ya no se aborta por tardar.
3. **La vista previa usa la imagen reducida**, no el archivo original.


### El respaldo que existía tres veces y faltaba en la cuarta (12 de agosto de 2026)

«Subo una foto con descripción, guarda la foto pero la estimación siempre sale
en 0 calorías.» No era el transporte: la foto se sube aparte
(`PUT /api/photos/:id`), `/api/estimate` la relee de Postgres y llega al modelo.

`parseEstimacion` rellenaba `porciones` desde `items`, pero **nunca al revés**, y
`ConfirmarEstimacion` armaba la tarjeta **solo desde `items`**. Una respuesta que
traía únicamente el agregado `porciones` —lo que el modelo devuelve con bastante
frecuencia al mirar una foto— parseaba como válida con `items: []`: tarjeta
vacía, total 0 kcal, botón Confirmar apagado.

Con texto solo no se notaba porque el atajo de catálogo
(`estimatePortions.ts`, coincidencia local) sintetiza **las dos** listas. Con
foto ese atajo se salta a propósito, así que siempre se llega al modelo.

Lo que lo hace vale la pena recordar: **Telegram, la reclasificación diferida y
el ajuste por grupo del chat tenían cada uno su propio
`items.length ? items : porciones`.** Tres implementaciones del mismo respaldo,
copiado a mano, y el cuarto consumidor sin él. Ahora el relleno es bidireccional
y vive en `parseEstimacion`, que es por donde pasan los cuatro.

De la misma tanda: `estimatePortions` ahora **falla** si no queda ninguna porción
mayor que cero, en vez de devolver una estimación válida y hueca — es la regla de
«un JSON válido no es una estimación válida» aplicada también a este caso, no
solo al de la foto perdida. Y el 503 ya no se traga el motivo: `/api/estimate`
devuelve `motivo` (resuelto en el servidor, porque `MOTIVO_LEGIBLE` vive junto a
`aiConfig`, que lee `process.env`) y se guarda en `MealEntry.notas` para que
`MealRow` lo enseñe. Un renglón de 0 kcal sin explicación es indistinguible de un
bug — que es exactamente cómo se reportó éste.

### El atajo local que inventaba comida (12 de agosto de 2026)

Probando las estimaciones ya arregladas, «pechuga a la plancha con arroz y una
michelada» se registró como pechuga, arroz, **frijoles y brócoli** — y la
michelada desapareció.

No fue el modelo: ni siquiera se le llamó. `matchDishLocal` pegó con el alias
«pechuga con arroz» del platillo «Pechuga a la plancha con arroz y frijoles»
(cobertura de tokens 3/3 = 1.0) y el atajo **sustituye la descripción completa**
por los componentes del platillo guardado.

La cobertura se medía solo en una dirección: qué proporción de las palabras del
*platillo* aparece en lo que escribió el atleta. Nunca al revés. Así que un
platillo de nombre corto se traga cualquier descripción que lo contenga, por
larga que sea, y todo lo demás que se haya comido se pierde en silencio.

Ahora el atajo exige además que **no sobre ninguna palabra que pueda ser
comida**: lo que sobra se mide contra el nombre y todos los alias juntos (para
que «plancha» no cuente como alimento suelto) descontando relleno y números. Si
sobra algo, decide el modelo — que igual recibe la lista de platillos y puede
devolver `platilloCoincidente`, así que el resultado «es su platillo guardado»
sigue siendo alcanzable, solo que pagando la llamada.

La asimetría justifica el cambio: equivocarse hacia el modelo cuesta 15 segundos;
equivocarse hacia el atajo inventa alimentos que el atleta no comió y borra los
que sí.

### El bot que no conocía las recetas del plan (12 de agosto de 2026)

«¿Cuál es la receta de pasta con carne molida?» contestaba con una receta
genérica de internet —1 taza de pasta, 100 g de carne— en vez de la suya: 138 g
de pasta cocida (2.5 cereal), 180 g de carne molida (6.0 aoa_bajo), ½ aguacate.

El dato estaba en la base y **ya venía cargado en memoria**: `loadDishContext`
hace el `include` de los `DishComponent` completos, y `chat.ts` los tiraba
quedándose con `nombre`; `contextoComoTexto` tiraba además los alias y cortaba a
15 platillos. El `include` se pagaba y no se usaba. `PlanMealSlot` y sus targets
nunca se consultaban en el camino de `/chat`.

Peor: el prompt prometía «tienes su lista de platillos frecuentes» y «aterriza en
porciones y alimentos concretos» con datos que no existían, mientras otra regla
del mismo prompt prohibía inventar cifras. Puesto a elegir entre dos
instrucciones contradictorias, el modelo inventó.

Detalle que costaba los gramos: `DishComponent.notaLibre` («138 g cocida»,
«180 g») solo se leía **como respaldo del nombre** cuando el componente no tenía
`FoodItem`. En cuanto lo tenía —que es el caso normal— la cantidad real se
perdía. Ahora viaja en su propio campo.

`/chat` recibe hoy cuatro bloques: plan vigente con los cinco tiempos y su target
por tiempo, el día de hoy comida por comida (con los objetivos también cuando no
hay nada registrado, que es justo cuando se pregunta «¿qué desayuno?»), las
recetas guardadas con cantidades y kcal, y la tabla de tasas del SMAE para que
sus equivalencias coincidan con las que la app enseña en pantalla.

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
