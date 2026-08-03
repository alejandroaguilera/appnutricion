// Gráfica de barras en SVG puro — geometría en porcentajes sobre un viewBox,
// así escala sola y no arrastra ninguna librería de charting para lo que son
// siete barras. Estilo de las capturas de referencia: barra = consumido,
// línea = objetivo.
//
// §7.4: nada de rojo de castigo. Por encima del objetivo se usa el color de
// aviso, no el de peligro — un día fuera de objetivo es un dato neutro.
export interface BarraDia {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}

export function BarChart({
  datos,
  objetivo,
  unidad = "",
  alturaPx = 140,
}: {
  datos: BarraDia[];
  objetivo: number;
  unidad?: string;
  alturaPx?: number;
}) {
  if (datos.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">Sin datos todavía.</p>;
  }

  const max = Math.max(objetivo, ...datos.map((d) => d.valor)) * 1.15 || 1;
  const anchoBarra = 100 / datos.length;
  const yObjetivo = 100 - (objetivo / max) * 100;

  return (
    <div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ height: alturaPx }}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Consumo por día contra el objetivo de ${objetivo} ${unidad}`}
      >
        {objetivo > 0 && (
          <line
            x1="0"
            x2="100"
            y1={yObjetivo}
            y2={yObjetivo}
            stroke="var(--muted)"
            strokeWidth="0.4"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {datos.map((d, i) => {
          const alto = (d.valor / max) * 100;
          const excede = objetivo > 0 && d.valor > objetivo;
          return (
            <rect
              key={d.etiqueta + i}
              x={i * anchoBarra + anchoBarra * 0.2}
              y={100 - alto}
              width={anchoBarra * 0.6}
              height={Math.max(alto, d.valor > 0 ? 0.8 : 0)}
              rx="1"
              fill={excede ? "var(--warning)" : "var(--primary)"}
              opacity={d.destacado === false ? 0.45 : 1}
            />
          );
        })}
      </svg>

      <div className="mt-1 flex">
        {datos.map((d, i) => (
          <div key={d.etiqueta + i} className="flex-1 text-center">
            <p className="text-[10px] tabular-nums text-foreground">
              {d.valor > 0 ? Math.round(d.valor) : "—"}
            </p>
            <p className="text-[10px] text-muted">{d.etiqueta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
