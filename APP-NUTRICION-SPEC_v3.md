# SPEC — APP DE NUTRICIÓN (`appnutricion`)

> Documento de requerimientos para el agente de desarrollo.
> **Versión:** 3.0 — 2026-08-03 · sustituye a v1.0 y v1.1
> **Aplicación independiente de `appgym`.** Repositorio, base de datos y despliegue separados. Se comunican por API, no por base de datos compartida.
>
> **Este documento es autosuficiente.** No requiere consultar PDFs, otros specs ni documentos externos para completar ninguna fase. Si una instrucción parece incompleta, es un error del documento — no supongas ni inventes datos.

**Cambios sobre v1.1:**

- Nuevo **§6 — Canal Telegram**: registro por chat, el flujo de menor fricción del producto
- Nuevo **§5.4 — Reconciliación multi-escritor**: Telegram introduce un segundo escritor que la arquitectura anterior no contemplaba. Sin esto se pierden registros de forma intermitente
- **§3.2 D** mejorado: coincidencia contra el catálogo propio antes de estimar, manejo de confianza baja, reclasificación diferida, nota de privacidad
- **§10** restaurado: catálogo de intercambios y distribución por slots transcritos completos

---

## 0. Línea base de arquitectura — leer primero

Este spec **hereda las decisiones técnicas ya tomadas en `appgym`** (ver `arquitectura_appgym.md`). No se proponen alternativas. Si algo de este documento contradice esa arquitectura, gana la arquitectura existente y se anota la discrepancia.

**Stack, idéntico a `appgym`:**

- TypeScript · Next.js 16 (App Router) · React 19
- **Sin carpeta `src/`** — `app/`, `components/`, `lib/` en la raíz
- Tailwind CSS 4 · Radix UI · zod para validación
- PostgreSQL vía Prisma (`prisma/schema.prisma`)
- IndexedDB en cliente vía `idb`
- Docker multi-stage (`node:20-alpine`), build standalone, `prisma migrate deploy && node server.js` en el arranque
- Dokploy gestiona Project / Application / Postgres

**Convenciones heredadas, de cumplimiento obligatorio:**

1. **Sin auth de usuarios.** Replicar `lib/athlete.ts` → `getAthleteId()` resuelve el único `User` sembrado, cacheado en memoria del proceso. **No** implementar roles ni login. Un solo atleta.
2. **Único mecanismo de auth de la API pública: `lib/exportAuth.ts`** — Bearer `exportToken` de solo lectura. Token propio de esta app. (El webhook de Telegram usa su propio secreto — ver §6.3.)
3. **IDs de registros generados en el cliente (UUID v4).** Nunca `cuid()` para nada que se cree offline.
4. **Nada se crea con POST.** Los registros nacen con su UUID y se sincronizan con `PUT /api/<recurso>/[id]`, upsert idempotente. POST queda para operaciones que no son creación offline (duplicar, importar, estimar, webhook).
5. **Outbox en IndexedDB** replicando `appgym`: `lib/db/outbox.ts`, `lib/sync/drain.ts`, `lib/sync/flush.ts`, `lib/sync/client.ts`.
6. **`/api/sync/beacon`** como respaldo vía `navigator.sendBeacon` en `pagehide`.
7. **Columnas de guarda** al estilo de `appgym`: `archivadoEn` para visibilidad (ortogonal al estado) y campos de reclamo atómico de un solo uso donde compitan cómputos.

> **Reutilizar código de `appgym` copiándolo, no abstrayéndolo.** No crear paquete compartido ni monorepo.

---

## 1. Propósito y postura de diseño

Registrar la alimentación diaria contra un plan de porciones, con la fricción más baja posible.

**Decisión de diseño central:**

> **La app registra PORCIONES, no gramos.**

El plan usa el sistema de intercambios de la nutrióloga: 20 porciones de proteína, 7 de cereal, 4 de grasa. Ese sistema ya lo conoce el atleta y ya le funcionó. Registrar "1 porción de cereal" es un toque; buscar "tortilla de maíz" entre 40 resultados y teclear gramos son quince segundos y una decisión — cinco veces al día, es la fricción que hace que la gente abandone a las tres semanas.

**Consecuencias:**

- La pantalla principal no es un buscador: es una **cuadrícula de contadores** por grupo.
- Los gramos y macros se **calculan y muestran**, nunca se piden.
- Precisión objetivo **±10%**, no ±1%.
- La métrica de éxito es **días registrados por semana**, no exactitud del conteo.

**No construir un clon de MyFitnessPal.** Ya existe, es gratis y no se usó. Este producto gana por lo que omite.

---

## 2. Modelo de datos

### Catálogo

```prisma
FoodGroup
  id, clave            // verdura | fruta | cereal | leguminosa |
                       // aoa_muy_bajo | aoa_bajo | aoa_moderado |
                       // grasa_sin_proteina | grasa_con_proteina | leche | libre
  nombre, orden, color
  kcal, proteinaG, carbosG, grasaG    // por porción (SMAE)

FoodItem
  id, foodGroupId, nombre, alias[]
  cantidadPorcion      // "1/3 t", "40 g", "2 rebanadas"
  cantidadGramos       // opcional
  esFavorito, archivadoEn, creadoPorUsuario

Dish
  id, nombre, alias[], tipoComida[]   // desayuno | comida | cena | snack
  descripcion, instrucciones, tiempoPrepMin
  esFavorito, vecesUsado, archivadoEn

DishComponent
  id, dishId, foodItemId (nullable), foodGroupId, porciones, notaLibre
```

> `foodItemId` nullable a propósito: un componente puede ser genérico ("1 porción de grasa") o específico ("1/3 de aguacate"). El plan real usa las dos formas.
> `Dish.alias[]` es nuevo en v3 y **lo usa el canal de Telegram** para reconocer "lo de siempre", "hotcakes", "mi licuado".

### Plan

```prisma
NutritionPlan
  id, nombre, kcalObjetivo, proteinaG, carbosG, grasaG,
  fibraG, aguaL, vigenteDesde, vigenteHasta, notas, activo

PlanTargetByGroup
  id, nutritionPlanId, foodGroupId, porcionesDia

PlanMealSlot
  id, nutritionPlanId, clave, nombre, orden, horaSugerida, esOpcional
  // desayuno | snack_am | comida | snack_pm | post_gym | cena

PlanMealSlotTarget
  id, planMealSlotId, foodGroupId, porciones
```

### Registro

```prisma
DayLog
  id (UUID cliente), fecha (date, único),
  pesoCorporalKg, aguaMl, notas, animo1a5, hambre1a5,
  adherenciaPct, cerradoEn, sincronizadoEn, archivadoEn,
  revision (int)                    // ← v3: se incrementa en cada cambio del día

MealEntry
  id (UUID cliente o servidor), dayLogId, planMealSlotId (nullable),
  clave, horaRegistro, dishId (nullable),
  textoLibre, fueraDeCasa (bool), notas, version (int),
  origen (app | telegram | import),  // ← v3
  estimacionIa (jsonb, nullable),    // respuesta cruda del modelo, para auditoría
  estadoClasificacion (clasificado | pendiente | fallido),  // ← v3
  actualizadoEn (timestamp)          // ← v3: base de la reconciliación

MealEntryPortion
  id (UUID), mealEntryId,
  foodGroupId, foodItemId (nullable),
  porciones (decimal, permite 0.5),
  kcal, proteinaG, carbosG, grasaG   // congelados al registrar
```

> **Congelar los macros en el registro.** Si mañana se corrige el valor de una porción de cereal, los días pasados no cambian. Un log es un hecho histórico, no una vista calculada.

### Telegram (nuevo en v3)

```prisma
TelegramUpdate                      // deduplicación de webhooks
  updateId (bigint, PK)             // el update_id de Telegram
  chatId, recibidoEn, procesadoEn,
  tipo (texto | foto | comando | callback),
  payloadCrudo (jsonb),
  mealEntryId (nullable)            // qué registro produjo, si produjo alguno

TelegramSession                     // conversación en curso
  chatId (PK), estado (jsonb), expiraEn
  // guarda la estimación pendiente de confirmar entre mensajes
```

### Espejo y análisis

```prisma
WeightEntry
  id, fecha, pesoKg, fuente (appgym|manual|telegram),
  sincronizadoDesdeAppgymEn

WeeklyReview
  id, semanaInicio, kcalPromedio, proteinaPromedioG,
  diasRegistrados, adherenciaPct,
  pesoPromedioMovil7d, deltaPesoSemana, ajusteAplicado, notas
```

**Propiedad del dato:** el peso corporal es **canónico en `appgym`** (modelo `BodyMetric`). `appnutricion` lo lee y cachea. Nunca escribe peso hacia `appgym`. Un dato con dos dueños es un dato que se contradice.

> Excepción: si el peso se captura por Telegram, `appnutricion` lo guarda con `fuente = telegram` y lo marca para que el atleta lo replique en `appgym`. **No** se implementa escritura cruzada.

---

## 3. Pantallas

### 3.1 Hoy — pantalla principal

Abre aquí siempre. Responde de un vistazo: **¿cuánto me falta y de qué?**

```
Proteína  ●●●●●●●●●●●●○○○○○○○○   12 / 20
Cereales  ●●●●●○○                 5 / 7
Grasas    ●●●○                    3 / 4
Frutas    ●●○                     2 / 3
Verduras  ●●●●●                   5 / libre ✓
```

Debajo, en tipografía secundaria y más pequeña: `1,340 / 2,070 kcal · P 118 · C 121 · G 41`.

> **Jerarquía deliberada: porciones grandes, macros chicos.** El plan se ejecuta en porciones; los macros son verificación, no instrumento. Invertir esta jerarquía convierte la app en una calculadora y reintroduce la fricción que se busca evitar.

**Bloque medio:** cada slot (Desayuno, Snack AM, Comida, Snack PM, Post-gym, Cena) como tarjeta con estado: registrado (con resumen), pendiente (botón `+`), u omitido. **Las entradas creadas por Telegram se muestran con un ícono discreto de origen.**

**Bloque inferior:** contador de agua con `+250 ml` · peso de hoy (traído de `appgym`) · nota del día.

### 3.2 Registrar una comida — el flujo crítico

Debe completarse en **menos de 10 segundos** en el caso común. Cuatro caminos, en orden de prioridad:

**A · Platillo guardado (el camino del 80%)**
Al tocar `+` en un slot aparecen primero los platillos de ese tipo, ordenados por frecuencia. Un toque en "Huevo revuelto con jamón y espinaca" registra sus 4 de proteína, 2 de cereal y 1 de grasa. Hecho.

**B · Repetir**
Botones fijos: "Igual que ayer" · "Igual que la última vez". La repetición es la norma en la alimentación real, no la excepción.

**C · Porciones sueltas**
Cuadrícula de grupos con `+`/`−`, permite medias porciones.

**D · Texto libre o foto, con estimación asistida**

Flujo de ejecución:

1. El usuario escribe texto o sube una foto.
2. **Primero se intenta coincidencia local contra `Dish.nombre` y `Dish.alias[]`.** Si hay coincidencia clara ("hotcakes fit", "mi licuado", "lo de siempre"), se usa el platillo guardado y **no se llama al modelo**. Es más rápido, gratis, más preciso y funciona sin conexión.
3. Solo si no hay coincidencia se llama al modelo de estimación.
4. **Al modelo se le pasan como contexto los 20 platillos más usados del atleta**, para que prefiera identificar uno existente antes que estimar desde cero.
5. Se muestra pantalla de confirmación con la cuadrícula ya rellenada y editable.
6. El usuario confirma → se crean los `MealEntryPortion` con macros congelados y se guarda la respuesta cruda en `estimacionIa`.

**Prompt del sistema** (`lib/ai/estimatePortions.ts`):

```ts
const SYSTEM = `Eres un experto en el Sistema Mexicano de Alimentos Equivalentes (SMAE).
Tu única tarea es convertir una descripción o foto de comida en porciones de los grupos:
verdura, fruta, cereal, leguminosa, aoa_muy_bajo, aoa_bajo, aoa_moderado,
grasa_sin_proteina, grasa_con_proteina, leche, libre.

Se te dará una lista de platillos frecuentes del usuario. Si la descripción
corresponde a uno de ellos, devuélvelo en "platilloCoincidente" en lugar de estimar.

Responde ÚNICAMENTE con un JSON válido:
{
  "platilloCoincidente": null,
  "porciones": [
    { "grupo": "aoa_muy_bajo", "porciones": 3.0, "detalle": "bistec ~90g" },
    { "grupo": "cereal", "porciones": 2.0, "detalle": "2 tortillas de maíz" },
    { "grupo": "grasa_sin_proteina", "porciones": 1.0, "detalle": "aceite" }
  ],
  "confianza": 0.85,
  "notas": "estimado visual"
}

Reglas: no inventes grupos. Si no sabes, pon 0. Nunca uses gramos como unidad final.
No emitas juicios sobre la comida ni comentarios sobre si es saludable.
Describe, no evalúes.`
```

**Manejo de la confianza:**

| Confianza | Comportamiento |
|---|---|
| ≥ 0.8 | Confirmación normal, un toque para aceptar |
| 0.5 – 0.8 | Igual, pero con el aviso "estimación aproximada, revisa las cantidades" |
| < 0.5 | Se abre directo en modo edición con los campos enfocados. **No** se ofrece aceptar de un toque |

**Sin conexión o si la API falla:** la entrada se guarda con `estadoClasificacion = pendiente` y el texto o la foto intactos. Un **trabajo en segundo plano reintenta la clasificación** cuando vuelve la conexión y notifica al atleta para que confirme. **Nunca se descarta el registro** — un dato sin clasificar vale mucho más que ningún dato.

**Privacidad:** las fotos de comida salen hacia un tercero. Debe decirse en Ajustes, en una línea, y el uso de foto debe poder desactivarse. El texto libre y las fotos **nunca** incluyen peso corporal ni métricas.

**Siempre disponible:** marcar la comida como **"fuera de casa"**. Alimenta un análisis específico — con 4-5 comidas semanales fuera, ese patrón importa.

### 3.3 Plan

Vista de solo lectura del plan vigente · catálogo de platillos por tipo de comida · editor de platillos (crear, duplicar, editar, **gestionar alias**) · historial de planes con sus vigencias.

### 3.4 Historial

Calendario mensual con semáforo de adherencia · detalle editable de cualquier día · gráficas de kcal y proteína con promedio móvil de 7 días · **días registrados por semana**, el indicador que más importa.

### 3.5 Revisión semanal

Generada cada domingo: promedios contra objetivo · días registrados y adherencia · peso con promedio móvil y delta · **una sola** desviación dominante · patrón detectado · sugerencia de ajuste (§7.3).

### 3.6 Ajustes

Objetivo calórico y macros · porciones por grupo · slots y horarios · token de exportación · conexión con `appgym` · **conexión con Telegram** · privacidad de fotos · importar y exportar.

---

## 4. Durabilidad y offline

Mismos requisitos e implementación que `appgym`:

- Escritura local en IndexedDB **antes** de tocar la red. No existe botón de guardar.
- UUID v4 en cliente para `DayLog`, `MealEntry` y `MealEntryPortion`.
- Outbox con reintentos y retroceso exponencial; ingesta idempotente por ID.
- `PUT /api/days/[id]` y `PUT /api/days/[id]/meals/[mealId]` — upsert, nunca POST.
- `/api/sync/beacon` como respaldo en `pagehide`.
- PWA instalable, offline total. Catálogo, platillos y plan vigente se sincronizan por adelantado.
- Indicador de sync discreto, nunca alarmista.

La carga es mucho menor que en `appgym`: ~5 registros diarios contra ~30 series por sesión, y sin temporizadores en segundo plano. La complejidad real está en el modelo de datos y en la fricción de registro.

---

## 5. Integración con `appgym` y reconciliación

### 5.1 Lo que `appnutricion` consume

| Dato | Endpoint origen | Uso |
|---|---|---|
| Peso y métricas | `GET /api/v1/export/metrics` | `WeightEntry`; promedio móvil de 7 días |
| Sesiones de la semana | `GET /api/v1/export/summary` | Detectar días de gym → sugerir snack pre-gym y post-gym |

Sincronización al abrir y una vez al día en segundo plano. **Degradación limpia:** si `appgym` no responde, `appnutricion` funciona completa; solo pierde el peso automático. Nunca bloquear el registro por una dependencia externa.

Variables de entorno: `APPGYM_BASE_URL`, `APPGYM_EXPORT_TOKEN`.

### 5.2 Lo que `appnutricion` expone

API de solo lectura con su propio `exportToken`, bajo `/api/v1/export/`:

```
GET /api/v1/export/summary?semana=       ← el más importante
GET /api/v1/export/days?desde=&hasta=
GET /api/v1/export/plan
GET /api/v1/export/adherence?desde=&hasta=
GET /api/v1/export/markdown?tipo=&semana=
```

`summary` debe bastar, en una sola petición, para un check-in semanal completo: kcal y proteína promedio, días registrados, adherencia, desglose por grupo, patrón de comidas fuera, peso con promedio móvil y desviación dominante.

`markdown` genera el bloque para `04-LOG-NUTRICION.md`:

```markdown
## 2026-08-03
Desayuno: 3 huevos, 2 reb pavo, espinaca, 6 delgaditas  → 520 kcal | P42 C48 G18
Comida:   180 g pollo, 2/3t arroz, ensalada, aguacate   → 640 kcal | P52 C58 G20
...
TOTAL: 2,040 kcal | P171 C186 G66  (objetivo 2,070 | P175 C190 G68)
Δ: −30 kcal, −4 g proteína
Agua: 2.8 L | Adherencia: 96%
```

### 5.3 Consumo desde fuera

Un script externo (cron en la máquina del atleta) descarga estos endpoints periódicamente a una carpeta de archivos. **Consecuencia de diseño: los endpoints deben ser estables y versionados.** Cambiar la forma de `summary` rompe consumidores que no controlas.

### 5.4 Reconciliación multi-escritor ← **crítico**

**El problema.** Hasta v1.1 había un solo escritor: el cliente PWA, que escribía local y sincronizaba hacia arriba. Telegram introduce un **segundo escritor que escribe directo en el servidor**, sin pasar por IndexedDB. Si el atleta registra la comida por Telegram y después abre la app, el cliente tiene un estado del día que no incluye esa entrada — y al sincronizar puede sobrescribirla o mostrar el día incompleto.

**Este es el riesgo técnico principal de la v3.** Sin resolverlo, se pierden registros de forma intermitente y muy difícil de diagnosticar.

**La solución:**

1. **El servidor es autoritativo para el conjunto de entradas de un día.** El cliente nunca envía "el día completo": envía **entradas individuales** por su UUID. No existe ninguna operación que reemplace la lista de entradas de un día de una sola vez.
2. **`DayLog.revision`** se incrementa en el servidor con cada cambio del día, venga de donde venga.
3. **Al abrir la app, al recuperar el foco y al reconectar**, el cliente hace `GET /api/days/[fecha]?desde_revision=N` y fusiona las entradas nuevas o modificadas en IndexedDB. La fusión es por UUID: las entradas que el cliente no conoce simplemente se agregan.
4. **Los borrados son lógicos** (`archivadoEn`), nunca físicos. Un borrado físico es indistinguible de "aún no lo conozco" y produce resurrecciones.
5. **Ante conflicto real** sobre la misma entrada, gana `actualizadoEn` más reciente y la versión anterior queda en bitácora de auditoría.
6. **La entrada creada en Telegram nace con UUID generado en el servidor.** Es válido: solo los registros creados offline necesitan UUID de cliente.

**Prueba de aceptación obligatoria:** registrar el desayuno por Telegram → abrir la PWA sin haberla tenido abierta → el desayuno aparece → agregar la comida desde la PWA → ambos registros conviven → recargar → siguen los dos.

---

## 6. Canal Telegram ← **nuevo en v3**

### 6.1 Por qué existe

El registro por chat elimina el paso más caro del flujo: **abrir la app**. Escribir "3 huevos y 2 tortillas" en una conversación que ya está abierta son tres segundos. Además, el cliente de Telegram encola los mensajes cuando no hay señal y los entrega al reconectar — resuelve el offline mejor que la PWA, sin código propio.

**No sustituye a la app.** Telegram es para registrar rápido; la app es para ver el estado, editar y analizar.

### 6.2 Alcance

**Sí hace:** registrar comidas por texto, foto o platillo guardado · registrar agua y peso · consultar el estado del día · confirmar estimaciones · enviar el resumen diario y la revisión semanal.

**No hace:** editar registros pasados · gestionar el plan · gráficas · administrar el catálogo. Todo eso vive en la app.

### 6.3 Seguridad

- **Un solo `chat_id` autorizado**, en la variable `TELEGRAM_CHAT_ID`. Cualquier mensaje de otro chat se ignora en silencio, sin responder. No responder es deliberado: confirmar la existencia del bot a un desconocido no aporta nada.
- Webhook con `secret_token` de Telegram, validado contra el header `X-Telegram-Bot-Api-Secret-Token` en cada petición. Rechazar con 401 si no coincide.
- El endpoint del webhook es el **único POST público** de la app. No comparte el `exportToken`.
- Variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`.

### 6.4 Idempotencia

**Telegram reintenta los webhooks si no responden 200 rápido.** Sin deduplicación se registran comidas por duplicado.

- Cada `update_id` se guarda en `TelegramUpdate` **antes** de procesarse. Si ya existe, se responde 200 y se descarta.
- **Responder 200 de inmediato** y procesar en segundo plano. Un procesamiento lento provoca reintentos, y los reintentos provocan duplicados.
- El resultado de cada update se anota en `TelegramUpdate.mealEntryId` para trazabilidad.

### 6.5 Comandos

| Comando | Efecto |
|---|---|
| *(texto suelto)* | Registra en el slot que corresponde a la hora actual |
| `/desayuno`, `/comida`, `/cena`, `/snack` + texto | Registra en ese slot explícitamente |
| `/agua 500` | Suma 500 ml |
| `/peso 84.3` | Registra peso del día |
| `/hoy` | Estado del día: porciones por grupo, kcal, qué falta |
| `/ayer` | Resumen del día anterior |
| `/semana` | Adherencia, días registrados, promedios |
| `/platillos` | Lista los platillos guardados con sus alias |
| `/deshacer` | Elimina el último registro (lógicamente) |
| `/ayuda` | Comandos disponibles |

**Sin comando, la hora decide el slot:** antes de 11:00 → desayuno · 11:00-13:00 → snack AM · 13:00-16:30 → comida · 16:30-19:00 → snack PM · después de 19:00 → cena. Siempre modificable en la confirmación.

### 6.6 Flujo de registro por chat

```
Alejandro → "3 huevos, 2 reb de pavo, espinaca y 6 delgaditas"

Bot → 🍳 Desayuno
      Proteína  4.0   (3 huevos + 2 reb pavo)
      Cereal    2.0   (6 delgaditas)
      Verdura   libre (espinaca)
      ≈ 520 kcal · P42 C48 G18

      [ ✓ Confirmar ]  [ ✏️ Ajustar ]  [ ✗ Cancelar ]

Alejandro → toca Confirmar

Bot → Registrado. Hoy llevas 4/20 proteína, 2/7 cereal.
```

- **La confirmación es obligatoria**, igual que en la app. Nunca se guarda una estimación sin que el atleta la vea. Es la misma regla del §3.2, sin excepciones por canal.
- **"Ajustar"** abre botones inline `+`/`−` por grupo. Editar en el chat debe ser posible sin abrir la app.
- Si el texto coincide con un platillo guardado o su alias, se salta el modelo y se responde al instante.
- El estado entre mensajes vive en `TelegramSession`, con expiración de 30 minutos. Si expira, el bot lo dice y pide reenviar.
- **Fotos:** misma lógica, con visión. Aplica la nota de privacidad del §3.2.

### 6.7 Mensajes salientes

| Momento | Contenido |
|---|---|
| 21:30 diario | Resumen del día y qué faltó. **Solo si el día tiene al menos un registro** |
| Domingo 09:00 | Revisión semanal (§3.5) |
| Tras confirmar | Acuse corto con el acumulado del día |

**Reglas de tono, heredadas del §7.4 y de cumplimiento estricto en este canal:**

- **Nunca reclamar.** Nada de "llevas 3 días sin registrar". Si un día no tuvo registros, **el bot no escribe**. Un bot que regaña se silencia, y un bot silenciado no sirve.
- Sin culpa, sin rachas rotas, sin ✗ rojos, sin caritas tristes.
- Un día fuera de objetivo se reporta como dato neutro.
- Máximo **dos mensajes no solicitados al día**. La notificación que sobra es la que hace que se apaguen todas.

### 6.8 Endpoint

```
POST /api/telegram/webhook
```

Único POST público. Valida el secreto, deduplica por `update_id`, responde 200 de inmediato, procesa en segundo plano. **Registro estructurado de cada update recibido** — cuando algo falle, ese log es lo único que va a explicar qué pasó.

---

## 7. Lógica automática

### 7.1 Cálculo de macros

Por porción registrada se toman los valores del `FoodGroup` (o del `FoodItem` si tiene propios) y **se congelan** en `MealEntryPortion`. Valores base del Sistema Mexicano de Alimentos Equivalentes:

| Grupo | kcal | P (g) | C (g) | G (g) |
|---|---|---|---|---|
| Verdura | 25 | 2 | 4 | 0 |
| Fruta | 60 | 0 | 15 | 0 |
| Cereal sin grasa | 70 | 2 | 15 | 0 |
| Leguminosa | 120 | 8 | 20 | 1 |
| AOA muy bajo aporte de grasa | 40 | 7 | 0 | 1 |
| AOA bajo aporte de grasa | 55 | 7 | 0 | 3 |
| AOA moderado aporte de grasa | 75 | 7 | 0 | 5 |
| Grasa sin proteína | 45 | 0 | 0 | 5 |
| Grasa con proteína | 70 | 3 | 3 | 5 |
| Leche descremada | 95 | 9 | 12 | 2 |

### 7.2 Adherencia

```
adherencia_dia = 100 − (Σ |porciones_reales − porciones_objetivo| por grupo
                        / Σ porciones_objetivo) × 100
```

Verduras excluidas (son libres). **Objetivo: 85-90%, no 100%.** La app debe comunicar el 88% como éxito. Un umbral de perfección es el mecanismo por el cual se abandona un plan.

### 7.3 Sugerencia de ajuste

Con promedio móvil de 7 días de peso, **nunca** con un dato aislado:

| Situación | Sugerencia |
|---|---|
| Pérdida < 0.4 kg/sem durante 2 semanas | Bajar 150 kcal (de carbos) o subir pasos |
| Pérdida > 0.8 kg/sem | Subir 150 kcal |
| Peso estable + fuerza subiendo (dato de `appgym`) | **No cambiar nada.** Es recomposición funcionando |
| Menos de 4 días registrados | **No sugerir ningún ajuste.** Sin datos no hay decisión |

La app **sugiere y explica**; el atleta aplica. Nunca cambia el objetivo por su cuenta.

### 7.4 Lenguaje — regla de producto no negociable

- **Sin lenguaje de culpa.** Ni "te pasaste", ni "mal día", ni ✗ rojos, ni caritas tristes, ni rachas rotas con penalización visual.
- Sin alimentos "buenos" ni "malos" en ninguna etiqueta ni color.
- Sin "quemar" ni "compensar" comidas con ejercicio.
- Un día fuera de objetivo se muestra como **dato neutro**.
- Sin notificaciones que reclamen.

> No es decoración: la evidencia sobre adherencia y conducta alimentaria es clara en que la culpa predice abandono. Si algún día se vende a entrenadores, además es un requisito de responsabilidad.

**Señales de alerta:** si aparecen patrones de restricción marcada (varios días consecutivos por debajo del 60% del objetivo calórico) o de conteo obsesivo, mostrar un mensaje sobrio sugiriendo hablar con un profesional. Sin dramatizar y sin bloquear nada.

---

## 8. Fuera de alcance (v1)

- Escaneo de código de barras
- Base de datos masiva de alimentos comerciales
- Multiusuario, roles, vista de nutriólogo
- Lista del súper y planeación de compras *(candidato fuerte para v2)*
- Recetas con pasos detallados
- Integración con wearables
- Pagos

> El **reconocimiento por foto sí está incluido**, como entrada opcional del flujo de texto libre (§3.2 D). No es un escáner de calorías independiente.

---

## 9. Orden de construcción

| Fase | Entregable |
|---|---|
| **1** | Prisma schema + seed del catálogo (§10.2), platillos (§10.3) y plan vigente (§10.1) |
| **2** | Pantalla "Hoy" + registro por platillo guardado y por porciones sueltas |
| **3** | Durabilidad: IndexedDB, outbox, PUT idempotentes, beacon |
| **4** | PWA + offline total |
| **5** | **Reconciliación multi-escritor (§5.4)** — antes de Telegram, no después |
| **6** | Historial, gráficas, adherencia |
| **7** | Revisión semanal + lógica de sugerencia |
| **8** | Sincronización con `appgym` |
| **9** | API de export + markdown |
| **10** | **Telegram**: webhook, comandos, registro por platillo y porciones, `/hoy`, `/agua`, `/peso` |
| **11** | Estimación por texto y foto — en la app y en Telegram, compartiendo `lib/ai/` |
| **12** | Mensajes salientes de Telegram (resumen diario, revisión semanal) |

**Las fases 1-2 son el producto.** Si registrar el desayuno no toma menos de 10 segundos, nada de lo demás se llega a usar.

**La fase 5 va antes que la 10 a propósito.** Construir Telegram sin reconciliación produce pérdida de datos intermitente que se manifiesta semanas después y es carísima de diagnosticar.

**La fase 10 no depende de la 11.** Telegram con platillos guardados y porciones sueltas ya es enormemente útil sin ninguna estimación por IA. Conviene tenerlo funcionando antes de agregar el modelo.

---

## 10. Datos de siembra

> Todo lo necesario está transcrito aquí. **No se requiere ningún PDF ni documento externo.**

### 10.1 Plan vigente

```
NutritionPlan: "Bloque 1 — Déficit moderado"
vigenteDesde: 2026-07-31 · activo: true
kcalObjetivo: 2070 · proteinaG: 175 · carbosG: 190 · grasaG: 68
fibraG: 29 · aguaL: 3.0
```

**Porciones diarias por grupo (`PlanTargetByGroup`):**

| Grupo | Porciones |
|---|---|
| AOA (proteína) | 20 |
| Cereales | 7 |
| Frutas | 3 |
| Verduras | libre (mínimo 5) |
| Leguminosas | 1 |
| Grasas | 4 |

**Distribución por slot (`PlanMealSlot` + `PlanMealSlotTarget`):**

| clave | nombre | hora | proteína | cereal | grasa | fruta | verdura |
|---|---|---|---|---|---|---|---|
| `desayuno` | Desayuno | 08:30 | 4 | 2 | 1 | 0 | libre |
| `snack_am` | Snack AM | 11:00 | 2 | 0 | 0 | 1 | 0 |
| `comida` | Comida | 14:30 | 6 | 2 | 1 | 0 | 2 |
| `snack_pm` | Snack PM (pre-gym) | 17:30 | 1 | 1 | 1 | 1 | 0 |
| `post_gym` | Post-gym | 19:30 | 3 | 0 | 0 | 0 | 0 |
| `cena` | Cena | 20:30 | 4 | 2 | 1 | 0 | 2 |

`post_gym` lleva `esOpcional = true` — solo aplica en días de entrenamiento.

### 10.2 Catálogo de intercambios

Sembrar como `FoodItem`, asignados a su `FoodGroup`. Abreviaturas: `t` taza · `p` pieza · `r` rebanada · `cda` cucharada · `cdita` cucharadita · `pqt` paquete.

**Verduras** (1 porción): ½t acelga cocida · 2t acelga cruda · 1p alcachofa cocida · 1½t apio crudo · ¾t berenjena · ¼p betabel cocido · ½t brócoli · 1p calabacita · ¼t cebolla cocida · ½t champiñón cocido · 1t champiñón crudo · ½p chayote · 1p chile poblano · 1½t col cruda picada · 1t coliflor · ½t ejotes · 6p espárragos · ½t espinaca cocida · 2t espinaca cruda · 1p hongo portobello · ½t jícama · 1p jitomate bola · 2t kale crudo · 3t lechuga · 1t nopal cocido · 1t pepino rebanado · ½t pimiento cocido · 1¼t rábano · 5p tomate verde · 5p tomate cherry · ½t zanahoria · 1t pico de gallo

**Frutas** (1 porción): 20p cereza · 7p ciruela pasa · 2p durazno chico · 2p dátiles · 1t frambuesa · 1t fresa rebanada · 1p granada roja · 3p guayaba · 2p higo · 1-2p kiwi · 2p mandarina · ½p mango · 1p manzana chica · 1t melón · ¾t moras · 2p naranja · 1t papaya · ½p pera · ½p plátano · 1t piña · 18p uva · 1p toronja · 2p tuna · 1t sandía · 1t zarzamora

**Cereales** (1 porción): ¼t amaranto tostado · ⅓t arroz blanco o integral · ⅓t quinoa cocida · ⅓t avena en hojuelas · ⅓t camote cocido · ⅓t couscous · ⅓t pasta integral cocida · ½t elote desgranado · 3 cdas granola sin azúcar · ½p papa cocida · ¼t puré de camote · ½p bísquet integral De La Fuente · ½p pan pita integral Libanus · 1r pan integral · 2r pan de 45 kcal · 2p galletas de arroz inflado · 1p tortilla de maíz · 2p tortillas susalia · 3p tortillas delgaditas · 2p tostada de maíz deshidratada · 2p tostada de nopal deshidratada · 1pqt Salmas · 4-5p tortillas Fibrelas o Toscanas · 2t palomitas naturales · 1pqt choco-obleas mini · 1 brownie Fiber One · 1pqt palomitas 4Buddies · 1pqt susalitas enchiladas · 1pqt BerryNuts · 1 Granvita 0% · 1t leche de avena

**AOA — alimentos de origen animal** (1 porción). Asignar subgrupo según aporte de grasa:

*muy bajo:* 30g atún · 30g medallón de atún · 40g pechuga de pavo Kirkland · 40g pavo molido · 30g pollo · 30g pechuga de pollo · 40g pescado · 30g surimi · 2 claras de huevo (¼t) · 2r pechuga de pavo · 3 cdas queso cottage · ⅓t yogurt griego (80g) · ½p atún en bolsa · ⅓p atún de lata · ¼t pollo desmenuzado · ½p surimi · ⅓ scoop de proteína en polvo (7g proteína) · 5p camarón cocido · 2p camarón gigante cocido

*bajo:* 30g carne de res · 30g carne molida · 30g salmón · 30g salmón ahumado · 15g carne seca · 1p huevo entero · 40g queso panela · 3 cdas requesón

*moderado:* 30g queso Oaxaca · 3 cdas queso feta

**Proteína vegetal** (1 porción): 80-90g tofu · 40g tempeh · 35g seitán

**Leguminosas** (1 porción): ½t chícharos cocidos · ½t edamames · ⅓t frijoles molidos · ½t garbanzo cocido · ½t habas cocidas · 4 cdas harina de soya · 3-5 cdas hummus de garbanzo · ½t lentejas cocidas · ⅓t soya cocida · 30g soya texturizada · 40g germen de soya

**Grasas sin proteína** (1 porción): 1 cdita aceite de aguacate · 1 cdita aceite de oliva · ⅓p aguacate · 2 cdas coco rallado · 1 cdita ghee · 2 cdas guacamole · 1t leche de almendra o coco · 1 cdita mayonesa light

**Grasas con proteína** (1 porción): 10p almendra · 10p nuez de la india · 7p nuez en mitades · 14p cacahuates sin sal · 18p pistaches sin sal · 11g harina de almendras · 1 cdita crema de almendra · 1 cdita crema de cacahuate · 1½ cda semillas de girasol · 1½ cda semillas de calabaza · 1½ cda semillas de hemp · 2 cdas semillas de chía · 1 cuadrito de chocolate amargo 80%+

> **Restricción del atleta: no come pescado, con excepción del atún.** Sembrar los ítems de pescado y salmón con `archivadoEn` poblado — presentes en la base para consulta, ausentes de la interfaz. El atún es fuente frecuente y se mantiene activo.

### 10.3 Platillos

Sembrar como `Dish` + `DishComponent`. Estructura ejemplo:

```
Dish: "Huevo revuelto con jamón y espinaca"
alias: ["huevo revuelto", "huevos con jamón", "lo de siempre"]
tipoComida: [desayuno] · tiempoPrepMin: 10
componentes:
  aoa_muy_bajo   "Huevo entero"              3.0
  aoa_muy_bajo   "Pechuga de pavo (2 reb)"   1.0
  verdura        "Espinaca cruda"            libre
  verdura        "Jitomate"                  libre
  grasa_sin_proteina  "Aceite de oliva"      1.0
  cereal         "Tortillas delgaditas (6)"  2.0
```

**Desayunos** (4 proteína · 2 cereal · 1 grasa · verdura libre):

1. **Huevo revuelto con jamón y espinaca** — 3 huevos + 2r pavo + espinaca + tomate + 1 cdita aceite + 6 delgaditas
2. **Avo Egg Toast** — 2r pan integral + ⅓ aguacate + 2 huevos + 40g panela + espinaca + tomate cherry
3. **Protein Pancakes / Hulk Pancakes** — ⅓t avena + ½ plátano + 1 huevo + 2 claras + ⅓ scoop proteína + (1t espinaca en la versión Hulk) + topping 2 cdas yogurt griego y miel KARO light
4. **French Toast Fit** — 2r pan integral + 2 huevos + canela + topping 1t yogurt griego + ½ plátano
5. **Licuado de proteína completo** — 1t leche de almendra + 1 scoop proteína + ½ plátano + ⅓t avena + espinaca + 1 cda chía + 2 huevos cocidos aparte
6. **Peanutbutter Oatmeal** — ⅓t avena + ⅓t leche de almendra + 1 cdita crema de cacahuate + ½ plátano + 1t yogurt griego + 1 scoop proteína
7. **Ricotta Toast** — 2r pan integral + ⅓ aguacate + 6 cdas requesón + 2r pavo + tomate + espinaca

**Cenas** (4 proteína · 2 cereal · 1 grasa · 2 verduras):

1. **Pavo-Panela Sándwich** — 2r pan integral + ⅓ aguacate + mostaza + 4r pavo + 80g panela + espinaca + tomate
2. **Miguitas con Huevo** — 5-6 delgaditas + 3 huevos + 40g panela + champiñones o espinaca + 1 cdita aceite
3. **Chilaquiles Fit** — 15 totopos Susalia + salsa casera + 3 huevos o 90g pollo + 40g panela + nopalitos + ⅓ aguacate
4. **Sincronizadas o Crepa Salada** — 6 delgaditas o 2 crepas CAREM + 80g panela o 60g Oaxaca + 4r pavo + tomate + espinaca + ⅓ aguacate
5. **Tostadas con Frijoles y Pollo** — 3-4 tostadas susalia + ⅓t frijoles molidos + 120g pollo + verduras + ⅓ aguacate
6. **Rainbow Bowl** — ⅔t arroz o quinoa + lechugas + 120g pollo, atún o pavo + tomate + pepino + zanahoria + ⅓ aguacate
7. **Nutrified Burger** — 2r pan thin rounds + 1 cdita mayo light + 90g carne o pollo + 40g Oaxaca o panela + tomate + lechuga
8. **Taquitos de Huevo o Pollo** — 6 delgaditas + 120g pollo o 3 huevos + 2r pavo + espinaca + tomate guisado + 1 cdita aceite
9. **Tostadas de Atún** — 3-4 tostadas + 120g atún + limón + zanahoria rallada + pepino + tomate + ⅓ aguacate

**Snacks AM** (2 proteína · 1 fruta):

1. 1 yogurt griego individual + 1 fruta + chía opcional
2. ½ barrita de proteína Kirkland o Quest + 1 fruta
3. 2 rollitos de pechuga de pavo o 40g panela + 1 fruta
4. 2 rice cakes + 1 cdita crema de cacahuate + 1 yogurt griego individual

**Snack PM (pre-gym)** (1 proteína · 1 cereal · 1 grasa · 1 fruta):

1. 2 rice cakes o 1r pan integral + 1-2 cditas crema de cacahuate + ½ plátano o 2 dátiles

**Post-gym** (3 proteína): 1 scoop de proteína en 250-300 ml de agua

### 10.4 Histórico de peso

Sembrar las 75 mediciones de peso de enero a julio de 2026 (CSV de báscula Omron, columnas `Fecha de la medición, Huso horario, Peso(kg), Grasa corporal(%), Grasa visceral, Metabolismo en reposo(Kcal), Músculo esquelético(%), IMC`) en `WeightEntry` con `fuente = manual`, para que las gráficas tengan contexto desde el primer arranque. A partir de ahí, `appgym` es la fuente.

---

**Fin de la spec v3.0**
