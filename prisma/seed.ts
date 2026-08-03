import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../lib/services/seedDatabase";

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then((result) => {
    if (result.skipped) {
      console.log("Ya hay catálogo sembrado, no se reesembra. Usa `prisma migrate reset` para reiniciar.");
    } else {
      console.log(
        `Sembrado: ${result.foodGroupsCreated} grupos, ${result.foodItemsCreated} ítems de catálogo, ${result.dishesCreated} platillos, ${result.weightEntriesCreated} registros de peso.`
      );
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
