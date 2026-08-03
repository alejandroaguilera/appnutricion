import { NextRequest, NextResponse } from "next/server";
import { withRoute, jsonError } from "@/lib/http/route";
import { tick } from "@/lib/jobs/scheduler";

// Corre un tick del programador de forma SÍNCRONA y devuelve el reporte.
// Dos motivos: es el único canal para verificar los trabajos desde fuera
// (no hay shell en el contenedor), y sirve de respaldo si el `setInterval`
// en proceso resultara poco fiable — un cron externo puede llamarlo.
export const POST = withRoute<unknown>("jobs.tick", async (req: NextRequest) => {
  const secreto = process.env.JOBS_SECRET;
  if (!secreto || req.headers.get("x-jobs-secret") !== secreto) {
    return jsonError(401, "no_autorizado");
  }
  return NextResponse.json({ reporte: await tick() });
});
