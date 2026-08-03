// Normalización compartida: minúsculas, sin acentos, sin espacios de sobra.
// Vivía dentro de seedDatabase.ts; se extrajo porque el emparejamiento local
// de platillos (lib/ai/localMatch.ts) necesita exactamente la misma regla —
// si las dos difirieran, "Huevo revuelto" dejaría de coincidir con su alias.
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(" ")
    .filter((t) => t.length > 2);
}
