-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FoodGroupClave" AS ENUM ('verdura', 'fruta', 'cereal', 'leguminosa', 'aoa_muy_bajo', 'aoa_bajo', 'aoa_moderado', 'grasa_sin_proteina', 'grasa_con_proteina', 'leche', 'libre');

-- CreateEnum
CREATE TYPE "TipoComida" AS ENUM ('desayuno', 'comida', 'cena', 'snack');

-- CreateEnum
CREATE TYPE "PlanMealSlotClave" AS ENUM ('desayuno', 'snack_am', 'comida', 'snack_pm', 'post_gym', 'cena');

-- CreateEnum
CREATE TYPE "OrigenMealEntry" AS ENUM ('app', 'telegram', 'import');

-- CreateEnum
CREATE TYPE "EstadoClasificacion" AS ENUM ('clasificado', 'pendiente', 'fallido');

-- CreateEnum
CREATE TYPE "FuenteWeightEntry" AS ENUM ('appgym', 'manual', 'telegram');

-- CreateEnum
CREATE TYPE "TipoTelegramUpdate" AS ENUM ('texto', 'foto', 'comando', 'callback');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Matamoros',
    "exportToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodGroup" (
    "id" TEXT NOT NULL,
    "clave" "FoodGroupClave" NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinaG" DOUBLE PRECISION NOT NULL,
    "carbosG" DOUBLE PRECISION NOT NULL,
    "grasaG" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FoodGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL,
    "foodGroupId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cantidadPorcion" TEXT NOT NULL,
    "cantidadGramos" DOUBLE PRECISION,
    "esFavorito" BOOLEAN NOT NULL DEFAULT false,
    "archivadoEn" TIMESTAMP(3),
    "creadoPorUsuario" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tipoComida" "TipoComida"[],
    "descripcion" TEXT,
    "instrucciones" TEXT,
    "tiempoPrepMin" INTEGER,
    "esFavorito" BOOLEAN NOT NULL DEFAULT false,
    "vecesUsado" INTEGER NOT NULL DEFAULT 0,
    "archivadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishComponent" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "foodItemId" TEXT,
    "foodGroupId" TEXT NOT NULL,
    "porciones" DOUBLE PRECISION NOT NULL,
    "notaLibre" TEXT,

    CONSTRAINT "DishComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "kcalObjetivo" DOUBLE PRECISION NOT NULL,
    "proteinaG" DOUBLE PRECISION NOT NULL,
    "carbosG" DOUBLE PRECISION NOT NULL,
    "grasaG" DOUBLE PRECISION NOT NULL,
    "fibraG" DOUBLE PRECISION NOT NULL,
    "aguaL" DOUBLE PRECISION NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "vigenteHasta" DATE,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTargetByGroup" (
    "id" TEXT NOT NULL,
    "nutritionPlanId" TEXT NOT NULL,
    "foodGroupId" TEXT NOT NULL,
    "porcionesDia" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PlanTargetByGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMealSlot" (
    "id" TEXT NOT NULL,
    "nutritionPlanId" TEXT NOT NULL,
    "clave" "PlanMealSlotClave" NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "horaSugerida" TEXT NOT NULL,
    "esOpcional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanMealSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMealSlotTarget" (
    "id" TEXT NOT NULL,
    "planMealSlotId" TEXT NOT NULL,
    "foodGroupId" TEXT NOT NULL,
    "porciones" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PlanMealSlotTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayLog" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "pesoCorporalKg" DOUBLE PRECISION,
    "aguaMl" INTEGER,
    "notas" TEXT,
    "animo1a5" INTEGER,
    "hambre1a5" INTEGER,
    "adherenciaPct" DOUBLE PRECISION,
    "cerradoEn" TIMESTAMP(3),
    "sincronizadoEn" TIMESTAMP(3),
    "archivadoEn" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DayLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealEntry" (
    "id" TEXT NOT NULL,
    "dayLogId" TEXT NOT NULL,
    "planMealSlotId" TEXT,
    "clave" "PlanMealSlotClave" NOT NULL,
    "horaRegistro" TIMESTAMP(3) NOT NULL,
    "dishId" TEXT,
    "textoLibre" TEXT,
    "fueraDeCasa" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "origen" "OrigenMealEntry" NOT NULL DEFAULT 'app',
    "estimacionIa" JSONB,
    "estadoClasificacion" "EstadoClasificacion" NOT NULL DEFAULT 'clasificado',
    "archivadoEn" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealEntryPortion" (
    "id" TEXT NOT NULL,
    "mealEntryId" TEXT NOT NULL,
    "foodGroupId" TEXT NOT NULL,
    "foodItemId" TEXT,
    "porciones" DOUBLE PRECISION NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinaG" DOUBLE PRECISION NOT NULL,
    "carbosG" DOUBLE PRECISION NOT NULL,
    "grasaG" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealEntryPortion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "updateId" BIGINT NOT NULL,
    "chatId" TEXT NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3),
    "tipo" "TipoTelegramUpdate" NOT NULL,
    "payloadCrudo" JSONB NOT NULL,
    "mealEntryId" TEXT,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateTable
CREATE TABLE "TelegramSession" (
    "chatId" TEXT NOT NULL,
    "estado" JSONB NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("chatId")
);

-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "pesoKg" DOUBLE PRECISION NOT NULL,
    "fuente" "FuenteWeightEntry" NOT NULL DEFAULT 'manual',
    "sincronizadoDesdeAppgymEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "semanaInicio" DATE NOT NULL,
    "kcalPromedio" DOUBLE PRECISION,
    "proteinaPromedioG" DOUBLE PRECISION,
    "diasRegistrados" INTEGER,
    "adherenciaPct" DOUBLE PRECISION,
    "pesoPromedioMovil7d" DOUBLE PRECISION,
    "deltaPesoSemana" DOUBLE PRECISION,
    "ajusteAplicado" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_exportToken_key" ON "User"("exportToken");

-- CreateIndex
CREATE UNIQUE INDEX "FoodGroup_clave_key" ON "FoodGroup"("clave");

-- CreateIndex
CREATE INDEX "FoodItem_foodGroupId_idx" ON "FoodItem"("foodGroupId");

-- CreateIndex
CREATE INDEX "DishComponent_dishId_idx" ON "DishComponent"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTargetByGroup_nutritionPlanId_foodGroupId_key" ON "PlanTargetByGroup"("nutritionPlanId", "foodGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanMealSlot_nutritionPlanId_clave_key" ON "PlanMealSlot"("nutritionPlanId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "PlanMealSlotTarget_planMealSlotId_foodGroupId_key" ON "PlanMealSlotTarget"("planMealSlotId", "foodGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "DayLog_fecha_key" ON "DayLog"("fecha");

-- CreateIndex
CREATE INDEX "MealEntry_dayLogId_idx" ON "MealEntry"("dayLogId");

-- CreateIndex
CREATE INDEX "MealEntry_dayLogId_clave_idx" ON "MealEntry"("dayLogId", "clave");

-- CreateIndex
CREATE INDEX "MealEntryPortion_mealEntryId_idx" ON "MealEntryPortion"("mealEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "WeightEntry_fecha_fuente_key" ON "WeightEntry"("fecha", "fuente");

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_foodGroupId_fkey" FOREIGN KEY ("foodGroupId") REFERENCES "FoodGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishComponent" ADD CONSTRAINT "DishComponent_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishComponent" ADD CONSTRAINT "DishComponent_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishComponent" ADD CONSTRAINT "DishComponent_foodGroupId_fkey" FOREIGN KEY ("foodGroupId") REFERENCES "FoodGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTargetByGroup" ADD CONSTRAINT "PlanTargetByGroup_nutritionPlanId_fkey" FOREIGN KEY ("nutritionPlanId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTargetByGroup" ADD CONSTRAINT "PlanTargetByGroup_foodGroupId_fkey" FOREIGN KEY ("foodGroupId") REFERENCES "FoodGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMealSlot" ADD CONSTRAINT "PlanMealSlot_nutritionPlanId_fkey" FOREIGN KEY ("nutritionPlanId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMealSlotTarget" ADD CONSTRAINT "PlanMealSlotTarget_planMealSlotId_fkey" FOREIGN KEY ("planMealSlotId") REFERENCES "PlanMealSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMealSlotTarget" ADD CONSTRAINT "PlanMealSlotTarget_foodGroupId_fkey" FOREIGN KEY ("foodGroupId") REFERENCES "FoodGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEntry" ADD CONSTRAINT "MealEntry_dayLogId_fkey" FOREIGN KEY ("dayLogId") REFERENCES "DayLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEntry" ADD CONSTRAINT "MealEntry_planMealSlotId_fkey" FOREIGN KEY ("planMealSlotId") REFERENCES "PlanMealSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEntry" ADD CONSTRAINT "MealEntry_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEntryPortion" ADD CONSTRAINT "MealEntryPortion_mealEntryId_fkey" FOREIGN KEY ("mealEntryId") REFERENCES "MealEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEntryPortion" ADD CONSTRAINT "MealEntryPortion_foodGroupId_fkey" FOREIGN KEY ("foodGroupId") REFERENCES "FoodGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEntryPortion" ADD CONSTRAINT "MealEntryPortion_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

