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

  const b2 = fixups.bloque2;
  console.log(
    `Bloque 2: ${b2.itemsCreados} ítems, ${b2.platillosCreados} platillos, ` +
      `${b2.platillosArchivados} archivados del Bloque 1, plan ` +
      `${b2.planCreado ? "creado" : "ya existente"}${b2.planActivado ? " y activado" : ""}.`
  );
  // No aborta el arranque a propósito (ver ensureBloque2), pero tiene que
  // quedar visible en los logs del deploy.
  if (b2.error) console.error(`Bloque 2 INCOMPLETO: ${b2.error}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
