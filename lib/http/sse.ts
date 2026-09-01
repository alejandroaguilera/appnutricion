// Lector de `text/event-stream` sobre un cuerpo de `fetch`.
//
// No se usa `EventSource` porque solo sabe hacer GET, y la estimación manda
// un POST con el texto y el id de la foto. El formato es sencillo y lo que
// hay que respetar es una sola cosa: el troceado de la red no coincide con
// las fronteras del protocolo, así que un evento puede llegar partido entre
// dos lecturas y solo se procesan los bloques ya terminados.

export interface EventoSse {
  tipo: string;
  datos: unknown;
}

export async function* leerEventos(cuerpo: ReadableStream<Uint8Array>): AsyncGenerator<EventoSse> {
  const lector = cuerpo.getReader();
  const decoder = new TextDecoder();
  let resto = "";

  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;

      resto += decoder.decode(value, { stream: true });
      const bloques = resto.split("\n\n");
      resto = bloques.pop() ?? "";

      for (const bloque of bloques) {
        let tipo = "message";
        const datos: string[] = [];

        for (const linea of bloque.split("\n")) {
          // Los comentarios (`: algo`) existen para forzar el primer flush y
          // mantener viva la conexión; no son eventos.
          if (linea.startsWith(":")) continue;
          if (linea.startsWith("event:")) tipo = linea.slice(6).trim();
          else if (linea.startsWith("data:")) datos.push(linea.slice(5).trim());
        }

        if (datos.length === 0) continue;
        try {
          yield { tipo, datos: JSON.parse(datos.join("\n")) };
        } catch {
          // Un evento ilegible se descarta; el resto del stream sigue valiendo.
        }
      }
    }
  } finally {
    // Si quien consume abandona el bucle a media respuesta (un `return` tras
    // `listo`), esto es lo que cierra la conexión en vez de dejarla abierta.
    await lector.cancel().catch(() => {});
  }
}
