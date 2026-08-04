import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../lib/services/seedDatabase";
import { applyDataFixups } from "../lib/services/dataFixups";

const prisma = new PrismaClient();

async function main() {
  const result = await seedDatabase(prisma);
  if (result.skipped) {
    console.log("Ya hay catálogo sembrado, no se reesembra. Usa `prisma migrate reset` para reiniciar.");
  } else {
    console.log(
      `Sembrado: ${result.foodGroupsCreated} grupos, ${result.foodItemsCreated} ítems de catálogo, ${result.dishesCreated} platillos, ${result.weightEntriesCreated} registros de peso.`
    );
  }

  // FUERA del early-return de `seedDatabase`: ahí adentro nada volvería a
  // correr nunca, porque corta en cuanto hay catálogo. Las correcciones sobre
  // filas existentes tienen que vivir aquí.
  const fixups = await applyDataFixups(prisma);
  console.log(`Correcciones: ${fixups.gramosBackfilled} ítems con gramos rellenados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
