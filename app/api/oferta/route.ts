import type { Section } from "../../../lib/scheduler";
import { currentAcademicCycle, toSiiauCycle } from "../../../lib/academic";

const DEFAULT_CYCLE = currentAcademicCycle();
const DEFAULT_CENTER = "D";
const DAYS = ["L", "M", "I", "J", "V", "S"];
type ParsedRow = { cells: string[]; children: Array<{ parentCell: number; row: ParsedRow }> };

function cleanText(value: string) {
  const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", ntilde: "ñ", Ntilde: "Ñ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú" };
  return value.replace(/&(#\d+|[A-Za-z]+);/g, (entity, key: string) => key.startsWith("#") ? String.fromCharCode(Number(key.slice(1))) : named[key] ?? entity).replace(/\s+/g, " ").trim();
}

function tableRows(html: string) {
  const tokens = html.match(/<tr\b[^>]*>|<\/tr>|<td\b[^>]*>|<\/td>|<[^>]+>|[^<]+/gi) ?? [];
  const stack: Array<ParsedRow & { activeCell: number | null; parentCell: number }> = [];
  const rows: ParsedRow[] = [];
  for (const token of tokens) {
    if (/^<tr\b/i.test(token)) {
      const parent = stack.at(-1);
      stack.push({ cells: [], children: [], activeCell: null, parentCell: parent?.activeCell ?? -1 });
    } else if (/^<\/tr/i.test(token)) {
      const finished = stack.pop();
      if (!finished) continue;
      const row: ParsedRow = { cells: finished.cells.map(cleanText), children: finished.children };
      const parent = stack.at(-1);
      if (parent) parent.children.push({ parentCell: finished.parentCell, row }); else rows.push(row);
    } else if (/^<td\b/i.test(token)) {
      const current = stack.at(-1);
      if (current) { current.cells.push(""); current.activeCell = current.cells.length - 1; }
    } else if (/^<\/td/i.test(token)) {
      const current = stack.at(-1);
      if (current) current.activeCell = null;
    } else if (!/^</.test(token)) {
      for (const current of stack) if (current.activeCell !== null) current.cells[current.activeCell] += ` ${token}`;
    }
  }
  return rows;
}

function toMinutes(raw: string) { return Number(raw.slice(0, 2)) * 60 + Number(raw.slice(2)); }

function parseOffer(html: string) {
  return tableRows(html).filter((row) => row.cells.length >= 9 && /^\d+$/.test(row.cells[0])).map((row) => {
    const meetings = row.children.filter(({ parentCell, row: child }) => parentCell === 7 && child.cells.length >= 6 && /^\d{4}-\d{4}$/.test(child.cells[1])).flatMap(({ row: child }) => {
      const marks = child.cells[2].split(/\s+/);
      const [startRaw, endRaw] = child.cells[1].split("-");
      return marks.flatMap((mark, index) => mark !== "." && DAYS[index] ? [{ day: DAYS[index], time: child.cells[1], start: toMinutes(startRaw), end: toMinutes(endRaw), building: child.cells[3] || "", room: child.cells[4] || "", period: child.cells[5] || "" }] : []);
    });
    const professors = row.children.filter(({ parentCell, row: child }) => parentCell === 8 && child.cells.length >= 2).map(({ row: child }) => child.cells.slice(1).join(" "));
    return { nrc: row.cells[0], key: row.cells[1].toUpperCase(), name: row.cells[2], section: row.cells[3], credits: row.cells[4], capacity: Number(row.cells[5]), available: Number(row.cells[6]), liveAvailable: Number(row.cells[6]), meetings, professors, source: "siiau" } satisfies Section;
  });
}

async function fetchOffer(params: { key?: string; nrc?: string; cycle: string; center: string }) {
  const url = new URL("https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta");
  url.searchParams.set("ciclop", params.cycle);
  url.searchParams.set("cup", params.center);
  if (params.key) url.searchParams.set("crsep", params.key);
  if (params.nrc) url.searchParams.set("nrcp", params.nrc);
  url.searchParams.set("mostrarp", "1000");
  url.searchParams.set("ordenp", "2");
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "QHORA/1.0" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`SIIAU respondió ${response.status}.`);
  return parseOffer(await response.text());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const keys = [...new Set((url.searchParams.get("claves") ?? "").toUpperCase().split(/[\s,;]+/).filter((key) => /^[A-Z]{1,3}\d{3,5}$/.test(key)))].slice(0, 20);
  const nrcs = [...new Set((url.searchParams.get("nrcs") ?? "").split(/[\s,;]+/).filter((nrc) => /^\d{3,7}$/.test(nrc)))].slice(0, 20);
  const cycle = toSiiauCycle(url.searchParams.get("ciclo") ?? DEFAULT_CYCLE);
  const center = (url.searchParams.get("centro") ?? DEFAULT_CENTER).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || DEFAULT_CENTER;
  if (keys.length === 0 && nrcs.length === 0) return Response.json({ error: "Proporciona al menos una clave o un NRC válido." }, { status: 400 });

  try {
    const responses = await Promise.all([
      ...keys.map((key) => fetchOffer({ key, cycle, center })),
      ...nrcs.map((nrc) => fetchOffer({ nrc, cycle, center })),
    ]);
    const sections = responses.flat().filter((section, index, values) => values.findIndex((item) => item.nrc === section.nrc) === index);
    const allKeys = [...new Set([...keys, ...sections.map((section) => section.key)])];
    const subjects = allKeys.map((key) => ({ key, name: sections.find((section) => section.key === key)?.name ?? "", sections: sections.filter((section) => section.key === key) }));
    return Response.json({ cycle, center, queriedAt: new Date().toISOString(), source: "siiau", subjects });
  } catch (error) {
    console.error("No fue posible consultar SIIAU:", error);
    return Response.json({
      error: "SIIAU no está disponible en este momento. Intenta de nuevo o carga un archivo para continuar con la oferta local.",
    }, { status: 502 });
  }
}
