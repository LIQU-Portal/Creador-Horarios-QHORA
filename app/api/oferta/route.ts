const CYCLE = "202620";
const CENTER = "D";
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
      const current = stack.at(-1); if (current) { current.cells.push(""); current.activeCell = current.cells.length - 1; }
    } else if (/^<\/td/i.test(token)) {
      const current = stack.at(-1); if (current) current.activeCell = null;
    } else if (!/^</.test(token)) {
      for (const current of stack) if (current.activeCell !== null) current.cells[current.activeCell] += ` ${token}`;
    }
  }
  return rows;
}

function toMinutes(raw: string) { return Number(raw.slice(0, 2)) * 60 + Number(raw.slice(2)); }

function parseOffer(html: string, requestedKey: string) {
  return tableRows(html).filter((row) => row.cells.length >= 9 && /^\d+$/.test(row.cells[0])).map((row) => {
    const meetings = row.children.filter(({ parentCell, row: child }) => parentCell === 7 && child.cells.length >= 6 && /^\d{4}-\d{4}$/.test(child.cells[1])).flatMap(({ row: child }) => {
      const marks = child.cells[2].split(/\s+/); const [startRaw, endRaw] = child.cells[1].split("-");
      return marks.flatMap((mark, index) => mark !== "." && DAYS[index] ? [{ day: DAYS[index], time: child.cells[1], start: toMinutes(startRaw), end: toMinutes(endRaw), building: child.cells[3] || "", room: child.cells[4] || "" }] : []);
    });
    const professors = row.children.filter(({ parentCell, row: child }) => parentCell === 8 && child.cells.length >= 2).map(({ row: child }) => child.cells.slice(1).join(" "));
    return { nrc: row.cells[0], key: row.cells[1].toUpperCase(), name: row.cells[2], section: row.cells[3], credits: row.cells[4], capacity: Number(row.cells[5]), available: Number(row.cells[6]), meetings, professors };
  }).filter((section) => section.key === requestedKey);
}

async function fetchSubject(key: string) {
  const url = new URL("https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta");
  url.searchParams.set("ciclop", CYCLE); url.searchParams.set("cup", CENTER); url.searchParams.set("crsep", key); url.searchParams.set("mostrarp", "1000"); url.searchParams.set("ordenp", "2");
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "CreadorHorariosLQUI/1.0" } });
  if (!response.ok) throw new Error(`SIIAU respondió ${response.status} para ${key}.`);
  const sections = parseOffer(await response.text(), key);
  return { key, name: sections[0]?.name ?? "", sections };
}

export async function GET(request: Request) {
  const keys = Array.from(new Set((new URL(request.url).searchParams.get("claves") ?? "").toUpperCase().split(/[\s,;]+/).filter((key) => /^[A-Z]{1,3}\d{3,5}$/.test(key)))).slice(0, 10);
  if (keys.length < 2) return Response.json({ error: "Proporciona entre 2 y 10 claves válidas." }, { status: 400 });
  try {
    const subjects = await Promise.all(keys.map(fetchSubject));
    return Response.json({ cycle: CYCLE, center: CENTER, queriedAt: new Date().toISOString(), subjects });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible consultar la oferta académica." }, { status: 502 });
  }
}
