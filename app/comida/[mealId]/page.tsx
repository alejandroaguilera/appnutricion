"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { getMealEntry, getPortionsForMeal, updateMealEntry, deleteMealEntry } from "@/lib/db/mealEntries";
import { getDayLog } from "@/lib/db/dayLogs";
import { computePortionMacros } from "@/lib/nutrition/groups";
import { triggerFlush } from "@/lib/sync/flush";
import { Screen } from "@/components/shell/Screen";
import { Button } from "@/components/ui/button";
import { PorcionesSueltasGrid } from "@/components/registrar/PorcionesSueltasGrid";
import type { MealEntryRecord, MealEntryPortionRecord } from "@/lib/db/types";

// Editar y borrar: hasta ahora no existía ninguna de las dos cosas. Un
// registro equivocado no se podía corregir ni quitar desde la app.
export default function EditarComidaPage() {
  const { mealId } = useParams<{ mealId: string }>();
  const router = useRouter();
  const { plan, foodGroups } = useHoyData();

  const [entry, setEntry] = useState<MealEntryRecord | null>(null);
  const [portions, setPortions] = useState<MealEntryPortionRecord[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void (async () => {
      const e = await getMealEntry(mealId);
      if (!e) return;
      const dia = await getDayLog(e.dayLogId);
      setEntry(e);
      setTitulo(e.titulo ?? "");
      setPortions(await getPortionsForMeal(mealId));
      setFecha(dia?.fecha ?? null);
    })();
  }, [mealId]);

  const valoresIniciales = new Map(portions.map((p) => [p.foodGroupId, p.porciones]));

  const guardar = useCallback(
    async (porcionesPorGrupo: Map<string, number>) => {
      if (!entry || !fecha) return;
      setGuardando(true);
      try {
        const groupById = new Map(foodGroups.map((g) => [g.id, g]));
        const nuevas: MealEntryPortionRecord[] = [];
        let orden = 0;
        for (const [foodGroupId, valor] of porcionesPorGrupo) {
          if (valor <= 0) continue;
          const grupo = groupById.get(foodGroupId);
          if (!grupo) continue;
          const previa = portions.find((p) => p.foodGroupId === foodGroupId);
          nuevas.push({
            id: previa?.id ?? crypto.randomUUID(),
            mealEntryId: entry.id,
            foodGroupId,
            foodGroupClave: grupo.clave,
            foodItemId: previa?.foodItemId ?? null,
            nombre: previa?.nombre ?? null,
            cantidad: previa?.cantidad ?? null,
            orden: orden++,
            porciones: valor,
            ...computePortionMacros(grupo, valor),
          });
        }
        await updateMealEntry({ ...entry, titulo: titulo.trim() || null }, nuevas, fecha);
        void triggerFlush("visible");
        router.push("/hoy");
      } finally {
        setGuardando(false);
      }
    },
    [entry, fecha, foodGroups, portions, titulo, router]
  );

  const eliminar = useCallback(async () => {
    if (!entry || !fecha) return;
    setGuardando(true);
    await deleteMealEntry(entry, fecha);
    void triggerFlush("visible");
    router.push("/hoy");
  }, [entry, fecha, router]);

  if (!entry || !plan) {
    return (
      <Screen sinTabs>
        <p className="text-sm text-muted">Cargando…</p>
      </Screen>
    );
  }

  const slot = plan.slots.find((s) => s.clave === entry.clave);

  return (
    <Screen sinTabs>
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Editar</h1>
          <p className="text-xs text-muted">{slot?.nombre ?? entry.clave}</p>
        </div>
        <Link href="/hoy" className="text-sm text-muted underline underline-offset-4">
          Cancelar
        </Link>
      </header>

      {entry.fotoPrincipalId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photos/${entry.fotoPrincipalId}`}
          alt="Foto de la comida"
          className="max-h-56 w-full rounded-xl object-cover"
        />
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Nombre</span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Bistec con nopales"
          className="h-11 rounded-xl border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>

      {entry.textoLibre && (
        <p className="rounded-xl border border-border bg-surface-raised p-3 text-sm text-muted">
          {entry.textoLibre}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Porciones</h2>
        <PorcionesSueltasGrid
          foodGroups={foodGroups}
          valoresIniciales={valoresIniciales}
          textoBoton="Guardar cambios"
          onSubmit={guardar}
        />
      </section>

      <Button variant="ghost" disabled={guardando} onClick={() => void eliminar()} className="text-danger">
        <Trash2 />
        Eliminar registro
      </Button>
    </Screen>
  );
}
