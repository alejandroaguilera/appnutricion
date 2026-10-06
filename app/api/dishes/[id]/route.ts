import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertUserDish } from "@/lib/services/dish";
import { withRoute, jsonError } from "@/lib/http/route";

type Ctx = { params: Promise<{ id: string }> };

// Alta, edición y baja lógica del platillo que el atleta guardó. Nace con
// UUID en el cliente y viaja por PUT idempotente, igual que una comida.
export const PUT = withRoute<Ctx>("dishes.put", async (req: NextRequest, { params }) => {
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.dish.findUnique({
    where: { id },
    select: { creadoPorUsuario: true },
  });
  if (existing && !existing.creadoPorUsuario) {
    return jsonError(409, "platillo_del_plan");
  }

  const dish = await upsertUserDish({ ...body, id });
  return NextResponse.json({ dish });
});
