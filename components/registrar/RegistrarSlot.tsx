"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { registerMeal } from "@/lib/logic/registerMeal";
import { deleteMealEntry } from "@/lib/db/mealEntries";
import { getCachedDishes } from "@/lib/db/catalogSync";
import { archiveUserDish, porcionesDesdePlatillo, saveUserDish } from "@/lib/db/dishes";
import { SLOT_TO_TIPO_COMIDA } from "@/lib/data/plan";
import { macrosPropiasGuardadas } from "@/lib/nutrition/groups";
import { fechaDeRegistro, localDayString } from "@/lib/date";
import { triggerFlush } from "@/lib/sync/flush";
import { cn } from "@/lib/utils";
import { Screen } from "@/components/shell/Screen";
import { PlatilloList } from "@/components/registrar/PlatilloList";
import { RepeatButtons } from "@/components/registrar/RepeatButtons";
import { PorcionesSueltasGrid } from "@/components/registrar/PorcionesSueltasGrid";
import { EntradaLibre, type ResultadoEstimacion } from "@/components/registrar/EntradaLibre";
import { ConfirmarEstimacion, type PorcionConfirmada } from "@/components/registrar/ConfirmarEstimacion";
import type { FoundMeal } from "@/lib/logic/repeatMeal";
import type { DishRecord, MealEntryRecord } from "@/lib/db/types";

function destinoDe(fecha: string): string {
  return fecha === localDayString() ? "/hoy" : `/historial/${fecha}`;
}

export function RegistrarSlot() {
  const params = useParams<{ slotClave: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const fecha = fechaDeRegistro(search.get("fecha"));
  const { loading, plan, foodGroups, foodItems } = useHoyData(fecha);
  const [dishes, setDishes] = useState<DishRecord[]>([]);
  const [estimacion, setEstimacion] = useState<ResultadoEstimacion | null>(null);
  const [manual, setManual] = useState(false);
  const [reserva, setReserva] = useState<MealEntryRecord | null>(null);
  const [tab, setTab] = useState<"plan" | "guardadas">("plan");

  useEffect(() => {
    void getCachedDishes().then(setDishes);
  }, []);

  if (loading) {
    return (
      <Screen sinTabs>
        <p className="text-sm text-muted">Cargando…</p>
      </Screen>
    );
  }

  const slot = plan?.slots.find((s) => s.clave === params.slotClave);
  if (!slot) {
    return (
      <Screen sinTabs>
        <p className="text-sm text-muted">Slot no encontrado.</p>
      </Screen>
    );
  }

  const tipoComida = SLOT_TO_TIPO_COMIDA[slot.clave];
  const delTipo = dishes.filter((d) => d.tipoComida.includes(tipoComida));
  const delPlan = delTipo.filter((d) => !d.creadoPorUsuario);
  const guardadas = delTipo.filter((d) => d.creadoPorUsuario);
  const esHoy = fecha === localDayString();
  const fechaLarga = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const terminar = () => {
    void triggerFlush("visible");
    router.push(destinoDe(fecha));
  };

  const registrar = async (extra: Parameters<typeof registerMeal>[0]) => {
    await registerMeal(extra);
    terminar();
  };

  const handleReservar = async (texto: string, fotoId: string | null) => {
    const { entry } = await registerMeal({
      fecha,
      slot,
      foodGroups,
      existente: reserva,
      titulo: texto.slice(0, 60) || slot.nombre,
      textoLibre: texto || null,
      fotoPrincipalId: fotoId,
      estadoClasificacion: "pendiente",
      portionsInput: [],
    });
    setReserva(entry);
  };

  const cancelar = async () => {
    if (reserva) await deleteMealEntry(reserva, fecha);
    terminar();
  };

  const handleDishSelect = (dish: DishRecord) =>
    registrar({
      fecha,
      slot,
      foodGroups,
      dishId: dish.id,
      titulo: dish.nombre,
      portionsInput: porcionesDesdePlatillo(dish),
    });

  const handleRepeat = (found: FoundMeal) =>
    registrar({
      fecha,
      slot,
      foodGroups,
      dishId: found.entry.dishId,
      titulo: found.entry.titulo,
      portionsInput: found.portions.map((p) => ({
        foodGroupId: p.foodGroupId,
        foodItemId: p.foodItemId,
        porciones: p.porciones,
        nombre: p.nombre,
        cantidad: p.cantidad,
        ...(macrosPropiasGuardadas(p) ?? {}),
      })),
    });

  const handleManual = (porcionesPorGrupo: Map<string, number>) =>
    registrar({
      fecha,
      slot,
      foodGroups,
      titulo: slot.nombre,
      portionsInput: Array.from(porcionesPorGrupo.entries())
        .filter(([, porciones]) => porciones > 0)
        .map(([foodGroupId, porciones]) => ({ foodGroupId, foodItemId: null, porciones })),
    });

  const handleConfirmar = async (titulo: string, porciones: PorcionConfirmada[], guardar: boolean) => {
    let dishId = estimacion?.dishId ?? null;
    if (guardar && titulo) {
      const dish = await saveUserDish({
        nombre: titulo,
        tipoComida,
        foodGroups,
        portions: porciones,
      });
      dishId = dish.id;
    }
    const r = estimacion!;
    return registrar({
      fecha,
      slot,
      foodGroups,
      existente: reserva,
      dishId,
      titulo: titulo || null,
      textoLibre: r.texto || null,
      confianzaIa: r.estimacion.confianza,
      fotoPrincipalId: r.fotoId,
      estadoClasificacion: "clasificado",
      notas: null,
      portionsInput: porciones,
    });
  };

  const handleSinIa = (texto: string, fotoId: string | null, motivo: string | null) =>
    registrar({
      fecha,
      slot,
      foodGroups,
      existente: reserva,
      titulo: texto.slice(0, 60) || slot.nombre,
      textoLibre: texto || null,
      fotoPrincipalId: fotoId,
      estadoClasificacion: "pendiente",
      notas: motivo,
      portionsInput: [],
    });

  const quitar = async (dish: DishRecord) => {
    await archiveUserDish(dish);
    setDishes((prev) => prev.filter((d) => d.id !== dish.id));
    void triggerFlush("visible");
  };

  if (estimacion) {
    return (
      <Screen sinTabs>
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Confirmar</h1>
            <p className="text-xs text-muted">
              {slot.nombre}
              {!esHoy && <span className="capitalize"> · {fechaLarga}</span>}
            </p>
          </div>
        </header>
        <ConfirmarEstimacion
          resultado={estimacion}
          foodGroups={foodGroups}
          foodItems={foodItems}
          onConfirmar={handleConfirmar}
          onCancelar={() => setEstimacion(null)}
        />
      </Screen>
    );
  }

  return (
    <Screen sinTabs>
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{slot.nombre}</h1>
          <p className="text-xs text-muted">
            {esHoy ? slot.horaSugerida : <span className="capitalize">{fechaLarga}</span>}
            {!esHoy && ` · ${slot.horaSugerida}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cancelar()}
          className="text-sm text-muted underline underline-offset-4"
        >
          Cancelar
        </button>
      </header>

      <EntradaLibre
        slotNombre={slot.nombre}
        onReservar={handleReservar}
        onEstimacion={setEstimacion}
        onSinIa={handleSinIa}
      />

      <RepeatButtons fecha={fecha} clave={slot.clave} onRepeat={(found) => void handleRepeat(found)} />

      <section>
        <div role="tablist" aria-label="Platillos" className="mb-3 grid grid-cols-2 rounded-xl bg-surface-raised p-1">
          {(
            [
              ["plan", "Del plan"],
              ["guardadas", "Guardadas"],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-11 rounded-lg text-sm font-medium transition-colors",
                tab === id ? "bg-surface text-foreground shadow-sm" : "text-muted"
              )}
            >
              {etiqueta}
              {id === "guardadas" && guardadas.length > 0 ? ` (${guardadas.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "plan" ? (
          <PlatilloList
            dishes={delPlan}
            onSelect={(dish) => void handleDishSelect(dish)}
            vacio="Este tiempo no tiene platillos en el plan."
          />
        ) : (
          <PlatilloList
            dishes={guardadas}
            onSelect={(dish) => void handleDishSelect(dish)}
            onQuitar={(dish) => void quitar(dish)}
            vacio="Cuando confirmes una comida, márcala para guardarla y repetirla aquí."
          />
        )}
      </section>

      {manual ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Porciones a mano</h2>
          <PorcionesSueltasGrid foodGroups={foodGroups} onSubmit={handleManual} />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="self-center text-sm text-muted underline underline-offset-4"
        >
          Ajustar porciones a mano
        </button>
      )}
    </Screen>
  );
}
