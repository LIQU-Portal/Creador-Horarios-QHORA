import readExcelFile from "read-excel-file/node";
import { normalizeRows, rowsToObjects } from "../../../lib/normalize-offer";

function sheetId(url: string) {
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

export async function POST(request: Request) {
  let body: { url?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "La solicitud no contiene un enlace válido." }, { status: 400 }); }
  const id = sheetId(body.url ?? "");
  if (!id) return Response.json({ error: "Pega un enlace válido de Google Sheets." }, { status: 400 });

  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  try {
    const response = await fetch(exportUrl, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!response.ok || response.url.includes("accounts.google.com")) {
      return Response.json({ error: "No fue posible acceder a la hoja. En Google Sheets selecciona Compartir → Acceso general → Cualquier persona con el vínculo → Lector, o descárgala como Excel." }, { status: 403 });
    }
    const bytes = await response.arrayBuffer();
    const sheets = await readExcelFile(Buffer.from(bytes));
    const preferred = sheets.find((sheet) => sheet.sheet.toLowerCase().includes("bloques horario")) ?? sheets[0];
    if (!preferred) return Response.json({ error: "La hoja no contiene pestañas legibles." }, { status: 422 });
    const rows = rowsToObjects(preferred.data);
    const normalized = normalizeRows(rows);
    if (normalized.sections.length === 0) return Response.json({ error: "No se encontraron filas con Clave y NRC. Revisa los encabezados o utiliza la pestaña Bloques horario." }, { status: 422 });
    return Response.json({ source: "google-sheets", sheet: preferred.sheet, loadedAt: new Date().toISOString(), ...normalized });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Google Sheets tardó demasiado en responder." : "No fue posible leer la hoja. Verifica que sea pública o utiliza un archivo Excel.";
    return Response.json({ error: message }, { status: 502 });
  }
}

