// Punto de arranque del proceso servidor de Next. Aquí vive el reloj de la
// app: no hay cron en el contenedor, no hay worker aparte y no hay acceso a
// shell para instalar nada.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./lib/jobs/scheduler");
  startScheduler();
}
