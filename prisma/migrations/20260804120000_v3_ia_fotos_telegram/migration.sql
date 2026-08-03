-- AlterTable
ALTER TABLE "MealEntry" ADD COLUMN     "confianzaIa" DOUBLE PRECISION,
ADD COLUMN     "fotoPrincipalId" TEXT,
ADD COLUMN     "modeloIa" TEXT,
ADD COLUMN     "reclasificacionIntentos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reclasificacionReclamadaEn" TIMESTAMP(3),
ADD COLUMN     "titulo" TEXT,
ADD COLUMN     "ultimoErrorIa" TEXT;

-- AlterTable
ALTER TABLE "MealEntryPortion" ADD COLUMN     "cantidad" TEXT,
ADD COLUMN     "nombre" TEXT,
ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TelegramUpdate" ADD COLUMN     "error" TEXT,
ADD COLUMN     "intentos" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MealPhoto" (
    "id" TEXT NOT NULL,
    "mealEntryId" TEXT,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "ancho" INTEGER,
    "alto" INTEGER,
    "bytes" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "miniatura" BYTEA,
    "origen" "OrigenMealEntry" NOT NULL DEFAULT 'app',
    "telegramFileId" TEXT,
    "archivadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealEntryAudit" (
    "id" TEXT NOT NULL,
    "mealEntryId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealEntryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ejecutarEn" TIMESTAMP(3) NOT NULL,
    "reclamadoEn" TIMESTAMP(3),
    "completadoEn" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "MealPhoto_mealEntryId_idx" ON "MealPhoto"("mealEntryId");

-- CreateIndex
CREATE INDEX "MealEntryAudit_mealEntryId_idx" ON "MealEntryAudit"("mealEntryId");

-- CreateIndex
CREATE INDEX "ScheduledJob_ejecutarEn_completadoEn_idx" ON "ScheduledJob"("ejecutarEn", "completadoEn");

-- CreateIndex
CREATE INDEX "MealEntry_estadoClasificacion_idx" ON "MealEntry"("estadoClasificacion");

-- CreateIndex
CREATE INDEX "TelegramUpdate_procesadoEn_idx" ON "TelegramUpdate"("procesadoEn");

-- AddForeignKey
ALTER TABLE "MealPhoto" ADD CONSTRAINT "MealPhoto_mealEntryId_fkey" FOREIGN KEY ("mealEntryId") REFERENCES "MealEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

