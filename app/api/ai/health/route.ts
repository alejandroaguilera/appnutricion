import { NextRequest, NextResponse } from "next/server";
import { withRoute, jsonError } from "@/lib/http/route";
import { aiConfig, xaiChat, AiUnavailableError } from "@/lib/ai/provider";

// Sin acceso a shell en el contenedor, esta ruta es la única forma de
// comprobar que las credenciales y el id de modelo quedaron bien puestos.
// `?probe=1` gasta unos pocos tokens de verdad y va protegido.
export const GET = withRoute<unknown>("ai.health", async (req: NextRequest) => {
  const cfg = aiConfig();
  const base = {
    configurado: cfg.habilitado,
    modelo: cfg.modelo,
    modeloVision: cfg.modeloVision,
    baseUrl: cfg.baseUrl,
  };

  if (req.nextUrl.searchParams.get("probe") !== "1") {
    return NextResponse.json(base);
  }

  const secreto = process.env.JOBS_SECRET;
  if (!secreto || req.headers.get("x-jobs-secret") !== secreto) {
    return jsonError(401, "no_autorizado");
  }
  if (!cfg.habilitado) return NextResponse.json({ ...base, probe: "omitido" });

  try {
    const res = await xaiChat({
      modelo: cfg.modelo as string,
      system: 'Responde exactamente {"ok":true}',
      user: [{ type: "text", text: "ping" }],
      maxTokens: 20,
      timeoutMs: 15_000,
    });
    return NextResponse.json({ ...base, probe: "ok", latenciaMs: res.latenciaMs });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ ...base, probe: "falló", causa: err.causa, detalle: err.detalle });
    }
    throw err;
  }
});
