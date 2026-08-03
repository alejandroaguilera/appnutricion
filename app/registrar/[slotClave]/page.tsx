"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { registerMeal, type RegisterPortionInput } from "@/lib/logic/registerMeal";
import { getCachedDishes } from "@/lib/db/catalogSync";
import { SLOT_TO_TIPO_COMIDA } from "@/lib/data/plan";
import { triggerFlush } from "@/lib/sync/flush";
import { Screen } from "@/components/shell/Screen";
import { PlatilloList } from "@/components/registrar/PlatilloList";
import { RepeatButtons } from "@/components/registrar/RepeatButtons";
import { PorcionesSueltasGrid } from "@/components/registrar/PorcionesSueltasGrid";
import { EntradaLibre, type ResultadoEstimacion } from "@/components/registrar/EntradaLibre";
import { ConfirmarEstimacion, type PorcionConfirmada } from "@/components/registrar/ConfirmarEstimacion";
import type { FoundMeal } from "@/lib/logic/repeatMeal";
import type { DishRecord } from "@/lib/db/types";

export default function RegistrarSlotPage() {
  const params = useParams<{ slotClave: string }>();
  const router = useRouter();
  const { loading, fecha, plan, foodGroups } = useHoyData();
  const [dishes, setDishes] = useState<DishRecord[]>([]);
  const [estimacion, setEstimacion] = useState<ResultadoEstimacion | null>(null);
  const [manual, setManual] = useState(false);

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
  const dishesDelSlot = dishes.filter((d) => d.tipoComida.includes(tipoComida));

  const terminar = () => {
    void triggerFlush("visible");
    router.push("/hoy");
  };

  const registrar = async (extra: Parameters<typeof registerMeal>[0]) => {
    await registerMeal(extra);
    terminar();
  };

  const handleDishSelect = (dish: DishRecord) =>
    registrar({
      fecha,
      slot,
      foodGroups,
      dishId: dish.id,
      titulo: dish.nombre,
      portionsInput: dish.components.map((c) => ({
        foodGroupId: c.foodGroupId,
        foodItemId: c.foodItemId,
        porciones: c.porciones,
        nombre: c.foodItem?.nombre ?? null,
        cantidad: c.foodItem?.cantidadPorcion ?? null,
      })),
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

  const handleConfirmar = (titulo: string, porciones: PorcionConfirmada[]) => {
    const r = estimacion!;
    return registrar({
      fecha,
      slot,
      foodGroups,
      dishId: r.dishId,
      titulo: titulo || null,
      textoLibre: r.texto || null,
      confianzaIa: r.estimacion.confianza,
      fotoPrincipalId: r.fotoId,
      portionsInput: porciones as RegisterPortionInput[],
    });
  };

  // Sin IA disponible: se guarda igual, con el texto y la foto intactos y en
  // estado `pendiente`. Un trabajo en segundo plano lo reclasifica cuando
  // vuelva la conexión — nunca se descarta el registro (§3.2-D).
  const handleSinIa = (texto: string, fotoId: string | null) =>
    registrar({
      fecha,
      slot,
      foodGroups,
      titulo: texto.slice(0, 60) || slot.nombre,
      textoLibre: texto || null,
      fotoPrincipalId: fotoId,
      estadoClasificacion: "pendiente",
      portionsInput: [],
    });

  if (estimacion) {
    return (
      <Screen sinTabs>
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Confirmar</h1>
            <p className="text-xs text-muted">{slot.nombre}</p>
          </div>
        </header>
        <ConfirmarEstimacion
          resultado={estimacion}
          foodGroups={foodGroups}
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
          <p className="text-xs text-muted">{slot.horaSugerida}</p>
        </div>
        <Link href="/hoy" className="text-sm text-muted underline underline-offset-4">
          Cancelar
        </Link>
      </header>

      {/* Primero lo que cubre cualquier comida, esté o no en el plan. */}
      <EntradaLibre slotNombre={slot.nombre} onEstimacion={setEstimacion} onSinIa={handleSinIa} />

      <RepeatButtons fecha={fecha} clave={slot.clave} onRepeat={(found) => void handleRepeat(found)} />

      {dishesDelSlot.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Platillos guardados</h2>
          <PlatilloList dishes={dishesDelSlot} onSelect={(dish) => void handleDishSelect(dish)} />
        </section>
      )}

      {/* Escotilla, no camino principal: las porciones sueltas por sí solas
          no servían de nada. */}
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
