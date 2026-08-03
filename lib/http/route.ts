import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logEvent, newErrorId, errorInfo } from "@/lib/log";

export type RouteHandler<C> = (req: NextRequest, ctx: C) => Promise<NextResponse>;

export function jsonError(
  status: number,
  codigo: string,
  detalle?: unknown,
  errorId?: string
): NextResponse {
  return NextResponse.json(
    { error: true, codigo, ...(detalle !== undefined ? { detalle } : {}), ...(errorId ? { errorId } : {}) },
    { status }
  );
}

// Envoltura obligatoria de toda ruta que muta. Sin ella, un throw de zod o de
// Prisma sale como 500 crudo — y el outbox del cliente trata los 5xx como
// transitorios, así que un error de validación (permanente por definición) se
// reintentaba para siempre y atoraba la cola. La distinción 4xx/5xx no es
// cosmética: es lo que decide si el cliente reintenta o se rinde y avisa.
export function withRoute<C>(nombre: string, handler: RouteHandler<C>): RouteHandler<C> {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    const inicio = Date.now();
    try {
      const res = await handler(req, ctx);
      logEvent("route_ok", { ruta: nombre, metodo: req.method, status: res.status, ms: Date.now() - inicio });
      return res;
    } catch (err) {
      const ms = Date.now() - inicio;

      if (err instanceof ZodError) {
        logEvent("route_validacion", { ruta: nombre, metodo: req.method, ms, issues: err.issues });
        return jsonError(422, "validacion", err.issues);
      }

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const base = { ruta: nombre, metodo: req.method, ms, code: err.code, meta: err.meta };
        if (err.code === "P2002") {
          logEvent("route_conflicto", base);
          return jsonError(409, "conflicto_unico", err.meta);
        }
        if (err.code === "P2003") {
          logEvent("route_fk", base);
          return jsonError(422, "referencia_invalida", err.meta);
        }
        if (err.code === "P2025") {
          logEvent("route_no_encontrado", base);
          return jsonError(404, "no_encontrado", err.meta);
        }
        const errorId = newErrorId();
        logEvent("route_error", { ...base, errorId, ...errorInfo(err) });
        return jsonError(500, "interno", undefined, errorId);
      }

      const errorId = newErrorId();
      logEvent("route_error", { ruta: nombre, metodo: req.method, ms, errorId, ...errorInfo(err) });
      return jsonError(500, "interno", undefined, errorId);
    }
  };
}
