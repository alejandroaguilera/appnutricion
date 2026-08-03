export interface WeightCsvRow {
  fecha: string; // "YYYY-MM-DD"
  pesoKg: number;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// CSV de báscula Omron (§10.4): columnas "Fecha de la medición" (formato
// "YYYY/MM/DD HH:mm", hora local), "Huso horario", "Peso(kg)", ...
//
// Se usa el componente de fecha tal cual viene en la columna, sin convertir
// zona horaria: la fecha ya ES el día calendario local en el huso horario de
// esa fila. Una fila del CSV dice "America/Chicago" en vez de
// "America/Matamoros" pero ambos husos comparten el mismo offset todo el año
// (siguen el mismo horario de verano de EU), y ninguna medición cae cerca de
// medianoche (07:19–20:29), así que no hay riesgo de cruzar el día calendario
// al no aplicar una conversión explícita — hacerlo asumiendo un solo huso fijo
// sería el error real aquí.
export function parseWeightCsv(csvText: string): WeightCsvRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  const [, ...rows] = lines; // descarta encabezado
  return rows
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cols = parseCsvLine(line);
      const fechaMedicion = cols[0]; // "2026/01/04 11:57"
      const pesoStr = cols[2]; // "78.30"
      const [datePart] = fechaMedicion.split(" ");
      const fecha = datePart.replaceAll("/", "-"); // "2026-01-04"
      return { fecha, pesoKg: Number(pesoStr) };
    });
}
