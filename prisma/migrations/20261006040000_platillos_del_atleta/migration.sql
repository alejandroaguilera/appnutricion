-- AlterTable
ALTER TABLE "Dish" ADD COLUMN     "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "creadoPorUsuario" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DishComponent" ADD COLUMN     "carbosGPorPorcion" DOUBLE PRECISION,
ADD COLUMN     "grasaGPorPorcion" DOUBLE PRECISION,
ADD COLUMN     "kcalPorPorcion" DOUBLE PRECISION,
ADD COLUMN     "proteinaGPorPorcion" DOUBLE PRECISION;
