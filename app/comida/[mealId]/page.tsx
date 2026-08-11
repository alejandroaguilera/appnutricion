"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { getMealEntry, getPortionsForMeal, updateMealEntry, deleteMealEntry } from "@/lib/db/mealEntries";
import { getDayLog } from "@/lib/db/dayLogs";
import { macrosDePorcion, macrosPropiasGuardadas } from "@/lib/nutrition/groups";
import { triggerFlush } from "@/lib/sync/flush";
import { Screen } from "@/components/shell/Screen";
import { Button } from "@/components/ui/button";
import { EditorPorciones, type PorcionEditable } from "@/components/registrar/EditorPorciones";
import type { MealEntryRecord, MealEntryPortionRecord } from "@/lib/db/types";

export default function EditarComidaPage() {
  const { mealId } = useParams<{ mealId: string }>();
  const router = useRouter();
  const { plan, foodGroups, foodItems } = useHoyData();

  const [entry, setEntry] = useState<MealEntryRecord | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [porciones, setPorciones] = useState<PorcionEditable[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void (async () => {
      const e = await getMealEntry(mealId);
      if (!e) return;
      const dia = await getDayLog(e.dayLogId);
      const previas = await getPortionsForMeal(mealId);
      setEntry(e);
      setTitulo(e.titulo ?? "");
      setFecha(dia?.fecha ?? null);
      // Cada porción guardada se vuelve un renglón editable independiente: así
      // dos alimentos del mismo grupo dejan de pisarse entre sí, que es lo que
      // pasaba al editar por grupo agregado.
      setPorciones(
        previas.map((p) => ({
          id: p.id,
          foodGroupId: p.foodGroupId,
          foodItemId: p.foodItemId,
          nombre: p.nombre,
          cantidad: p.cantidad,
          porciones: p.porciones,
          // Una porción `libre` lleva macros propias que ninguna tasa puede
          // reproducir. Se recuperan de lo guardado; sin esto, abrir una comida
          // con cerveza y volver a guardarla la dejaría en 0 kcal.
          ...(macrosPropiasGuardadas(p) ?? {}),
        }))
      );
    })();
  }, [mealId]);

  const guardar = useCallback(async () => {
    if (!entry || !fecha) return;
    setGuardando(true);
    try {
      const groupById = new Map(foodGroups.map((g) => [g.id, g]));
      const nuevas: MealEntryPortionRecord[] = [];
      let orden = 0;
      for (const p of porciones) {
        if (p.porciones <= 0) continue;
        const grupo = groupById.get(p.foodGroupId);
        if (!grupo) continue;
        nuevas.push({
          id: p.id,
          mealEntryId: entry.id,
          foodGroupId: p.foodGroupId,
          foodGroupClave: grupo.clave,
          foodItemId: p.foodItemId,
          nombre: p.nombre,
          cantidad: p.cantidad,
          orden: orden++,
          porciones: p.porciones,
          ...macrosDePorcion(grupo, p.porciones, p),
        });
      }
      await updateMealEntry({ ...entry, titulo: titulo.trim() || null }, nuevas, fecha);
      void triggerFlush("visible");
      router.push("/hoy");
    } finally {
      setGuardando(false);
    }
  }, [entry, fecha, foodGroups, porciones, titulo, router]);

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
        <h2 className="mb-2 text-sm font-medium text-muted">Alimentos</h2>
        <EditorPorciones
          porciones={porciones}
          foodGroups={foodGroups}
          foodItems={foodItems}
          onChange={setPorciones}
        />
      </section>

      <Button size="lg" disabled={guardando} onClick={() => void guardar()}>
        {guardando ? "Guardando…" : "Guardar cambios"}
      </Button>

      <Button variant="ghost" disabled={guardando} onClick={() => void eliminar()} className="text-danger">
        <Trash2 />
        Eliminar registro
      </Button>
    </Screen>
  );
}
