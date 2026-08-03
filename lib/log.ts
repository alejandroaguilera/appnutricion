// Bitácora estructurada a stdout. Dokploy captura el stdout del contenedor y
// no hay `docker exec` disponible en este VPS, así que esta es la ÚNICA
// ventana a lo que pasa en producción. Una línea = un evento = un JSON, para
// poder filtrar con grep sin pelearse con saltos de línea.

type Campos = Record<string, unknown>;

export function logEvent(evt: string, campos: Campos = {}): void {
  const linea = { ts: new Date().toISOString(), evt, ...campos };
  try {
    console.log(JSON.stringify(linea));
  } catch {
    // Un campo no serializable (ciclo, BigInt) no debe tirar la petición.
    console.log(JSON.stringify({ ts: linea.ts, evt, _error: "campos no serializables" }));
  }
}

// Id corto que se le devuelve al cliente en un 500 y se escribe en la
// bitácora, para poder cruzar "me salió un error" con la línea exacta.
export function newErrorId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function errorInfo(err: unknown): { msg: string; stack?: string; nombre?: string } {
  if (err instanceof Error) {
    return { msg: err.message, stack: err.stack, nombre: err.name };
  }
  return { msg: String(err) };
}
