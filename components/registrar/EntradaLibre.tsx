"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subirFoto } from "@/lib/media/downscale";
import { leerEventos } from "@/lib/http/sse";
import type { Estimacion } from "@/lib/ai/schema";

const CLAVE_FOTOS = "appnutricion:fotosHabilitadas";

export interface ResultadoEstimacion {
  estimacion: Estimacion;
  dishId: string | null;
  fuente: "catalogo" | "modelo";
  crudo: unknown;
  modelo: string | null;
  fotoId: string | null;
  texto: string;
}

// El camino que faltaba: "¿dónde pongo los alimentos que no entran en el plan
// propuesto?" — aquí. Se describe con palabras, o se toma una foto, y la IA
// estima las porciones. No hace falta una base de datos gigantesca de
// alimentos comerciales, que es justo lo que este producto no quiere ser.
export function EntradaLibre({
  slotNombre,
  onReservar,
  onEstimacion,
  onSinIa,
}: {
  slotNombre: string;
  /**
   * Se llama justo ANTES de pedir la estimación y tiene que haber dejado la
   * comida guardada cuando resuelve. Es lo único que sobrevive a que esta
   * pantalla desaparezca a media espera — y desaparecer a media espera es
   * exactamente lo que hace un móvil con una pestaña en segundo plano.
   */
  onReservar: (texto: string, fotoId: string | null) => Promise<void>;
  onEstimacion: (r: ResultadoEstimacion) => void;
  onSinIa: (texto: string, fotoId: string | null, motivo: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [fotoId, setFotoId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"foto" | "estimando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [razonamiento, setRazonamiento] = useState("");
  const [segundos, setSegundos] = useState(0);
  const inputCamara = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);

  const fotosHabilitadas =
    typeof window === "undefined" || localStorage.getItem(CLAVE_FOTOS) !== "0";

  // Un contador que avanza es la señal más barata de "sigo trabajando", y la
  // única que sirve durante los segundos que el modelo tarda en soltar su
  // primer token de razonamiento.
  useEffect(() => {
    if (ocupado !== "estimando") return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [ocupado]);

  const elegirFoto = async (file: File) => {
    setOcupado("foto");
    setError(null);
    try {
      const { id, blob } = await subirFoto(file);
      if (!id) {
        setError(
          blob
            ? "No se pudo subir la foto. Puedes describirla con palabras."
            : "No pude leer esa imagen. Prueba con otra o descríbela con palabras."
        );
      }
      setFotoId(id);
      // La vista previa sale de la versión reducida, no del archivo original:
      // ver `FotoSubida.blob`.
      if (blob) {
        setPreviewUrl((anterior) => {
          if (anterior) URL.revokeObjectURL(anterior);
          return URL.createObjectURL(blob);
        });
      }
    } finally {
      setOcupado(null);
    }
  };

  // Los dos inputs se limpian al terminar: sin esto, volver a elegir el mismo
  // archivo no dispara `change` (el value no cambió) y el botón se siente muerto.
  const alElegir = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void elegirFoto(f);
  };

  const quitarFoto = () => {
    setFotoId(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (inputCamara.current) inputCamara.current.value = "";
    if (inputGaleria.current) inputGaleria.current.value = "";
  };

  const estimar = async () => {
    if (!texto.trim() && !fotoId) return;
    const limpio = texto.trim();

    setOcupado("estimando");
    setError(null);
    setRazonamiento("");
    setSegundos(0);

    // Primero se guarda, después se pregunta. Si algo mata esta pantalla
    // mientras el modelo piensa —la pestaña descartada, la app en segundo
    // plano, un despliegue— la comida ya está en el registro como
    // `pendiente` con su texto y su foto (§3.2-D). Antes vivía solo en el
    // estado de React y se perdía entera y en silencio.
    try {
      await onReservar(limpio, fotoId);
    } catch {
      setOcupado(null);
      setError("No se pudo guardar el registro. Inténtalo otra vez.");
      return;
    }

    try {
      const res = await fetch("/api/estimate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: limpio || null, fotoId, slotNombre }),
      });

      // Los errores con un código honesto (payload inválido, foto que ya no
      // está) llegan como JSON antes de que se abra el stream.
      if (!res.ok || !res.body) {
        setOcupado(null);
        setError("No se pudo estimar. Inténtalo otra vez o ajusta las porciones a mano.");
        return;
      }

      let resuelto = false;

      for await (const evento of leerEventos(res.body)) {
        if (evento.tipo === "razon") {
          const { texto: trozo } = evento.datos as { texto: string };
          setRazonamiento((r) => r + trozo);
        } else if (evento.tipo === "fase") {
          const { fase } = evento.datos as { fase: string };
          if (fase === "reparando") setRazonamiento((r) => r + "\n\n(reintentando la respuesta…)\n");
        } else if (evento.tipo === "listo") {
          const d = evento.datos as Omit<ResultadoEstimacion, "fotoId" | "texto">;
          resuelto = true;
          onEstimacion({ ...d, fotoId, texto: limpio });
          return;
        } else if (evento.tipo === "sin_ia") {
          // La IA no está disponible. El registro ya existe desde `onReservar`;
          // esto solo le pone la causa para que no aparezca en Hoy con 0 kcal
          // y sin explicación.
          const { motivo } = evento.datos as { motivo?: string };
          resuelto = true;
          onSinIa(limpio, fotoId, motivo ?? null);
          return;
        } else if (evento.tipo === "falla") {
          resuelto = true;
          onSinIa(limpio, fotoId, "hubo un error al estimar");
          return;
        }
      }

      // El stream terminó sin decir en qué acabó: la conexión se cortó.
      if (!resuelto) onSinIa(limpio, fotoId, "se cortó la conexión al estimar");
    } catch {
      onSinIa(limpio, fotoId, "no pude conectarme al modelo");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-3">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        placeholder="3 huevos, 2 tortillas y aguacate…"
        className="w-full resize-none rounded-xl border border-border bg-surface p-3 text-base text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />

      {previewUrl && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Foto de la comida" className="max-h-48 w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={quitarFoto}
            aria-label="Quitar foto"
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-warning">{error}</p>}

      <div className="flex gap-2">
        {fotosHabilitadas && (
          <>
            {/* Dos inputs, no uno: `capture` abre la cámara directo y no deja
                llegar al carrete, y sin `capture` Android suele ir directo a la
                galería. Un botón para cada intención es lo único que se comporta
                igual en iOS y en Android. */}
            <input
              ref={inputCamara}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={alElegir}
            />
            <input
              ref={inputGaleria}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={alElegir}
            />
            <Button
              variant="secondary"
              size="lg"
              className="shrink-0"
              disabled={ocupado !== null}
              onClick={() => inputCamara.current?.click()}
              aria-label="Tomar foto"
            >
              <Camera />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="shrink-0"
              disabled={ocupado !== null}
              onClick={() => inputGaleria.current?.click()}
              aria-label="Elegir foto de la galería"
            >
              <ImagePlus />
            </Button>
          </>
        )}

        <Button
          size="lg"
          className="flex-1"
          disabled={ocupado !== null || (!texto.trim() && !fotoId)}
          onClick={() => void estimar()}
        >
          <Sparkles />
          {ocupado === "estimando"
            ? "Estimando…"
            : ocupado === "foto"
              ? "Subiendo foto…"
              : "Estimar"}
        </Button>
      </div>

      {ocupado === "estimando" && <Razonando texto={razonamiento} segundos={segundos} />}
    </section>
  );
}

// El razonamiento del modelo, tal cual sale. No es decoración: 20-60 s de
// botón inerte se leen como una app colgada, y ver lo que está pensando es
// además la forma más directa de entender por qué estimó lo que estimó.
function Razonando({ texto, segundos }: { texto: string; segundos: number }) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pegado al final: lo último que escribió es lo que interesa.
    if (caja.current) caja.current.scrollTop = caja.current.scrollHeight;
  }, [texto]);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center justify-between text-xs text-muted">
        <span>
          {texto ? "Pensando…" : "Mirando la comida…"} {segundos}s
        </span>
        <span>El registro ya está guardado</span>
      </p>

      {texto && (
        <div
          ref={caja}
          aria-live="polite"
          className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface p-2.5 text-[11px] leading-relaxed text-muted"
        >
          {texto}
        </div>
      )}
    </div>
  );
}
