"use client";

import { useEffect, useState } from "react";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { getCachedDishes } from "@/lib/db/catalogSync";
import { bucketNombreForClave } from "@/lib/nutrition/groups";
import { Screen } from "@/components/shell/Screen";
import { Card } from "@/components/ui/card";
import type { DishRecord } from "@/lib/db/types";

// §3.3: vista de solo lectura del plan vigente + catálogo de platillos. El
// editor de platillos y el historial de planes son de una ronda posterior.
export default function PlanPage() {
  const { loading, plan } = useHoyData();
  const [dishes, setDishes] = useState<DishRecord[]>([]);

  useEffect(() => {
    void getCachedDishes().then(setDishes);
  }, []);

  if (loading || !plan) {
    return (
      <Screen>
        <p className="text-sm text-muted">Cargando…</p>
      </Screen>
    );
  }

  return (
    <Screen>
      <header>
        <h1 className="text-lg font-semibold text-foreground">Plan</h1>
        <p className="text-xs text-muted">{plan.nombre}</p>
      </header>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Objetivo diario</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          {[
            ["Calorías", `${plan.kcalObjetivo} kcal`],
            ["Proteína", `${plan.proteinaG} g`],
            ["Carbohidratos", `${plan.carbosG} g`],
            ["Grasa", `${plan.grasaG} g`],
            ["Fibra", `${plan.fibraG} g`],
            ["Agua", `${plan.aguaL} L`],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right tabular-nums text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Porciones por grupo</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {plan.targets.map((t) => (
            <li key={t.id} className="flex justify-between gap-2">
              <span className="text-foreground">{t.foodGroup.nombre}</span>
              <span className="tabular-nums text-muted">{t.porcionesDia}</span>
            </li>
          ))}
        </ul>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Comidas del día</h2>
        <div className="flex flex-col gap-2">
          {plan.slots.map((slot) => (
            <Card key={slot.id} className="p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{slot.nombre}</p>
                <p className="text-xs text-muted">
                  {slot.horaSugerida}
                  {slot.esOpcional ? " · opcional" : ""}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">
                {slot.targets
                  .filter((t) => t.porciones > 0)
                  .map((t) => `${t.porciones} ${bucketNombreForClave(t.foodGroup.clave)}`)
                  .join(" · ") || "Sin porciones asignadas"}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">
          Platillos guardados <span className="font-normal">({dishes.length})</span>
        </h2>
        <ul className="flex flex-col gap-1">
          {dishes.map((d) => (
            <li key={d.id} className="flex justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate text-foreground">{d.nombre}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {d.vecesUsado > 0 ? `${d.vecesUsado}×` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Screen>
  );
}
