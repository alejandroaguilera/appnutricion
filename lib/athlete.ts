import { prisma } from "@/lib/prisma";

let cachedAthleteId: string | null = null;

// App de un solo atleta, sin auth (§0.1). Resuelve la única fila User
// sembrada y la cachea en memoria del proceso.
export async function getAthleteId(): Promise<string> {
  if (cachedAthleteId) return cachedAthleteId;
  const user = await prisma.user.findFirstOrThrow();
  cachedAthleteId = user.id;
  return cachedAthleteId;
}
