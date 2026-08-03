"use client";

import { useRef, useState } from "react";
import { Camera, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subirFoto } from "@/lib/media/downscale";
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
  onEstimacion,
  onSinIa,
}: {
  slotNombre: string;
  onEstimacion: (r: ResultadoEstimacion) => void;
  onSinIa: (texto: string, fotoId: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [fotoId, setFotoId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"foto" | "estimando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputFile = useRef<HTMLInputElement>(null);

  const fotosHabilitadas =
    typeof window === "undefined" || localStorage.getItem(CLAVE_FOTOS) !== "0";

  const elegirFoto = async (file: File) => {
    setOcupado("foto");
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const id = await subirFoto(file);
      if (!id) setError("No se pudo subir la foto. Puedes describirla con palabras.");
      setFotoId(id);
    } finally {
      setOcupado(null);
    }
  };

  const quitarFoto = () => {
    setFotoId(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const estimar = async () => {
    if (!texto.trim() && !fotoId) return;
    setOcupado("estimando");
    setError(null);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim() || null, fotoId, slotNombre }),
      });

      if (res.status === 503) {
        // La IA no está disponible: no se pierde el registro. Se guarda como
        // pendiente con el texto y la foto intactos y se reclasifica después
        // (§3.2-D). Nunca se descarta.
        onSinIa(texto.trim(), fotoId);
        return;
      }
      if (!res.ok) {
        setError("No se pudo estimar. Inténtalo otra vez o ajusta las porciones a mano.");
        return;
      }

      const data = await res.json();
      onEstimacion({
        estimacion: data.estimacion,
        dishId: data.dishId,
        fuente: data.fuente,
        crudo: data.crudo,
        modelo: data.modelo,
        fotoId,
        texto: texto.trim(),
      });
    } catch {
      onSinIa(texto.trim(), fotoId);
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
            <input
              ref={inputFile}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void elegirFoto(f);
              }}
            />
            <Button
              variant="secondary"
              size="lg"
              className="shrink-0"
              disabled={ocupado !== null}
              onClick={() => inputFile.current?.click()}
              aria-label="Tomar foto"
            >
              <Camera />
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
          {ocupado === "estimando" ? "Estimando…" : ocupado === "foto" ? "Subiendo foto…" : "Estimar"}
        </Button>
      </div>
    </section>
  );
}
