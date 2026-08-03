"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { registerMeal } from "@/lib/logic/registerMeal";
import { getCachedDishes } from "@/lib/db/catalogSync";
import { SLOT_TO_TIPO_COMIDA } from "@/lib/data/plan";
import { PorcionesSueltasGrid } from "@/components/registrar/PorcionesSueltasGrid";
import { PlatilloList } from "@/components/registrar/PlatilloList";
import { RepeatButtons } from "@/components/registrar/RepeatButtons";
import type { FoundMeal } from "@/lib/logic/repeatMeal";
import type { DishRecord } from "@/lib/db/types";

export default function RegistrarSlotPage() {
  const params = useParams<{ slotClave: string }>();
  const router = useRouter();
  const { loading, fecha, plan, foodGroups } = useHoyData();
  const [dishes, setDishes] = useState<DishRecord[]>([]);

  useEffect(() => {
    void getCachedDishes().then(setDishes);
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }

  const slot = plan?.slots.find((s) => s.clave === params.slotClave);
  if (!slot) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted">Slot no encontrado.</p>
      </main>
    );
  }

  const tipoComida = SLOT_TO_TIPO_COMIDA[slot.clave];
  const dishesDelSlot = dishes.filter((d) => d.tipoComida.includes(tipoComida));

  const handleDishSelect = async (dish: DishRecord) => {
    await registerMeal({
      fecha,
      slot,
      foodGroups,
      dishId: dish.id,
      portionsInput: dish.components.map((c) => ({
        foodGroupId: c.foodGroupId,
        foodItemId: c.foodItemId,
        porciones: c.porciones,
      })),
    });
    router.push("/hoy");
  };

  const handleRepeat = async (found: FoundMeal) => {
    await registerMeal({
      fecha,
      slot,
      foodGroups,
      dishId: found.entry.dishId,
      portionsInput: found.portions.map((p) => ({
        foodGroupId: p.foodGroupId,
        foodItemId: p.foodItemId,
        porciones: p.porciones,
      })),
    });
    router.push("/hoy");
  };

  const handlePorcionesSueltas = async (porcionesPorGrupo: Map<string, number>) => {
    await registerMeal({
      fecha,
      slot,
      foodGroups,
      portionsInput: Array.from(porcionesPorGrupo.entries())
        .filter(([, porciones]) => porciones > 0)
        .map(([foodGroupId, porciones]) => ({ foodGroupId, foodItemId: null, porciones })),
    });
    router.push("/hoy");
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{slot.nombre}</h1>
          <p className="text-xs text-muted">{slot.horaSugerida}</p>
        </div>
        <Link href="/hoy" className="text-sm text-muted underline underline-offset-4">
          Cancelar
        </Link>
      </header>

      <RepeatButtons fecha={fecha} clave={slot.clave} onRepeat={(found) => void handleRepeat(found)} />

      {dishesDelSlot.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Platillos guardados</h2>
          <PlatilloList dishes={dishesDelSlot} onSelect={(dish) => void handleDishSelect(dish)} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Porciones sueltas</h2>
        <PorcionesSueltasGrid foodGroups={foodGroups} onSubmit={handlePorcionesSueltas} />
      </section>
    </main>
  );
}
