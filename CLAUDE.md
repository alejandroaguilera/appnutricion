# appnutricion

App de registro de alimentación de un solo atleta. Next.js 16 (App Router),
React 19, Prisma + Postgres, Tailwind 4, IndexedDB vía `idb`. Sin `src/`:
`app/`, `components/`, `lib/` en la raíz. Desplegada en Dokploy.

## Antes de empezar cualquier ronda

1. **Lee `ESTADO.md`** — qué fases están construidas, qué falta, qué decisiones
   se apartaron del spec y por qué. No asumas que algo existe porque el spec lo
   describe: el spec es el diseño, `ESTADO.md` es la realidad.
2. `APP-NUTRICION-SPEC_v3.md` es el contrato de diseño. **No se edita**; los
   cambios de estado van en `ESTADO.md`.
3. Al terminar una ronda, **actualiza `ESTADO.md`** en el mismo commit.

## Reglas del dominio que no son negociables

- **Los macros se congelan al registrar** (§7.1): SMAE × porciones, guardado en
  `MealEntryPortion`. Nunca se recalculan retroactivamente ni los aporta la IA.
  Un log es un hecho histórico, no una vista calculada.
- **Confirmación obligatoria** de cualquier estimación, en la app y en Telegram
  por igual (§3.2). Nunca se guarda una estimación sin que el atleta la vea.
- **Nunca se descarta un registro** (§3.2-D): si la IA falla, se guarda con
  `estadoClasificacion = pendiente` y se reclasifica después.
- **Lenguaje sin culpa** (§7.4): sin rojo de castigo, sin ✗, sin rachas rotas,
  sin caritas tristes. Un día fuera de objetivo es un dato neutro. El objetivo
  de adherencia es 85-90%, no 100%. Aplica a toda la interfaz, no solo a comida.
- **Los borrados son lógicos** (`archivadoEn`), nunca físicos (§5.4.4).
- **Nada se crea con POST**: los registros nacen con UUID y se sincronizan con
  `PUT /api/<recurso>/[id]` idempotente.

## Trampas conocidas

- **Nunca `{...objetoDeLaRed}` hacia IndexedDB.** Pasa por `lib/db/mappers.ts`,
  eligiendo campos uno por uno. Un `@db.Date` serializado como ISO completo ya
  envenenó el índice `by-fecha` una vez y perdió días de registros en silencio.
- Toda ruta que muta va envuelta en `withRoute` (`lib/http/route.ts`): un throw
  sin capturar sale como 500, y el cliente trata los 5xx como transitorios y
  reintenta para siempre.
- No hay `docker exec`, ni shell en el contenedor, ni Postgres/Docker local.
  Las migraciones se generan con `prisma migrate diff` (receta en `ESTADO.md`)
  y se verifican con `curl` contra la URL en vivo.

## Verificación antes de desplegar

```
npx tsc --noEmit && npx eslint && npm run build && npx prisma validate
```
