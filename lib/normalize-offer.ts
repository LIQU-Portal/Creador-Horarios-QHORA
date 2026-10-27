import type { Meeting, Section, SubjectResult } from "./scheduler.ts";

export type RawRow = Record<string, unknown>;

export function rowsToObjects(data: unknown[][]): RawRow[] {
  const headers = (data[0] ?? []).map((value) => String(value ?? "").replace(/^\uFEFF/, "").trim());
  return data.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export function parseCsv(text: string): RawRow[] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiters = [",", ";", "\t"];
  const delimiter = delimiters.toSorted((left, right) => firstLine.split(right).length - firstLine.split(left).length)[0];
  const data: string[][] = [[]];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      data.at(-1)!.push(value); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      data.at(-1)!.push(value); value = "";
      data.push([]);
    } else value += character;
  }
  data.at(-1)!.push(value);
  return rowsToObjects(data.filter((row) => row.some((cell) => cell.trim() !== "")));
}

const aliases = {
  key: ["clave", "clave materia", "clave de materia", "crse", "course"],
  subject: ["materia", "nombre", "nombre materia", "asignatura"],
  nrc: ["nrc"],
  section: ["seccion", "sección", "sec"],
  capacity: ["cupo", "capacidad", "cup"],
  registered: ["registrados", "inscritos", "reg"],
  available: ["disponibles", "disponible", "disp", "cupos disponibles"],
  day: ["dia", "día", "dias", "días"],
  start: ["inicio", "hora inicio", "hora inicial"],
  end: ["fin", "hora fin", "hora final"],
  schedule: ["horario", "horarios"],
  building: ["edificio", "edif"],
  room: ["aula", "salon", "salón"],
  period: ["periodo", "período"],
  professor: ["profesor", "docente", "academico", "académico"],
} as const;

function canonical(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function rowMap(row: RawRow) {
  return new Map(Object.entries(row).map(([key, value]) => [canonical(key), value]));
}

function pick(map: Map<string, unknown>, names: readonly string[]) {
  for (const name of names) {
    const value = map.get(canonical(name));
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function timeParts(value: unknown) {
  if (typeof value === "number" && value >= 0 && value < 1) {
    const total = Math.round(value * 24 * 60);
    return { raw: `${String(Math.floor(total / 60)).padStart(2, "0")}${String(total % 60).padStart(2, "0")}`, minutes: total };
  }
  const digits = String(value ?? "").trim().replace(/[^0-9]/g, "").padStart(4, "0").slice(0, 4);
  if (!/^\d{4}$/.test(digits)) return null;
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
  if (minutes > 24 * 60) return null;
  return { raw: digits, minutes };
}

function daysFrom(value: unknown) {
  const raw = canonical(value);
  if (!raw) return [];
  const named: Array<[RegExp, string]> = [
    [/lunes|(^|\s)l($|\s)/, "L"], [/martes|(^|\s)m($|\s)/, "M"],
    [/miercoles|miércoles|(^|\s)(i|x)($|\s)/, "I"], [/jueves|(^|\s)j($|\s)/, "J"],
    [/viernes|(^|\s)v($|\s)/, "V"], [/sabado|sábado|(^|\s)s($|\s)/, "S"],
  ];
  const found = named.filter(([pattern]) => pattern.test(raw)).map(([, day]) => day);
  if (found.length > 0) return found;
  const compact = String(value).toUpperCase().replace(/[^LMXIJVS.]/g, "");
  if (compact.includes(".")) {
    const marks = String(value).trim().split(/\s+/);
    return ["L", "M", "I", "J", "V", "S"].filter((_, index) => marks[index] && marks[index] !== ".");
  }
  return [];
}

function meetingsFromSchedule(value: unknown, defaults: { building: string; room: string; period: string }) {
  const meetings: Meeting[] = [];
  for (const line of String(value ?? "").split(/\r?\n|\s*;\s*/).map((part) => part.trim()).filter(Boolean)) {
    const match = line.match(/(\d{1,2}:?\d{2})\s*[-–]\s*(\d{1,2}:?\d{2})\s+(.+)/);
    if (!match) continue;
    const start = timeParts(match[1]);
    const end = timeParts(match[2]);
    if (!start || !end) continue;
    const days = daysFrom(match[3]);
    for (const day of days) meetings.push({ day, time: `${start.raw}-${end.raw}`, start: start.minutes, end: end.minutes, ...defaults });
  }
  return meetings;
}

export function normalizeRows(rows: RawRow[]) {
  const sections = new Map<string, Section>();
  const warnings: string[] = [];

  rows.forEach((row, index) => {
    const map = rowMap(row);
    const key = String(pick(map, aliases.key)).trim().toUpperCase();
    const nrc = String(pick(map, aliases.nrc)).trim().replace(/\.0$/, "");
    if (!key || !nrc) return;
    const subject = String(pick(map, aliases.subject)).trim() || "Materia sin nombre";
    const sectionName = String(pick(map, aliases.section)).trim() || "Sin sección";
    const capacity = numberValue(pick(map, aliases.capacity));
    const registered = numberValue(pick(map, aliases.registered));
    const availableRaw = pick(map, aliases.available);
    const available = String(availableRaw).trim() ? numberValue(availableRaw) : Math.max(0, capacity - registered);
    const building = String(pick(map, aliases.building)).trim();
    const room = String(pick(map, aliases.room)).trim();
    const period = String(pick(map, aliases.period)).trim();
    const professor = String(pick(map, aliases.professor)).trim();
    const id = `${key}-${nrc}`;
    if (!sections.has(id)) {
      sections.set(id, { nrc, key, name: subject, section: sectionName, capacity, available, localAvailable: available, meetings: [], professors: professor ? [professor] : [], source: "archivo" });
    }
    const target = sections.get(id)!;
    if (professor && !target.professors.includes(professor)) target.professors.push(professor);

    const start = timeParts(pick(map, aliases.start));
    const end = timeParts(pick(map, aliases.end));
    const days = daysFrom(pick(map, aliases.day));
    if (start && end && days.length > 0) {
      for (const day of days) target.meetings.push({ day, time: `${start.raw}-${end.raw}`, start: start.minutes, end: end.minutes, building, room, period });
    } else {
      target.meetings.push(...meetingsFromSchedule(pick(map, aliases.schedule), { building, room, period }));
    }
    if (target.meetings.length === 0 && index < 5) warnings.push(`La fila ${index + 2} no contiene un horario reconocible.`);
  });

  const uniqueSections = [...sections.values()].map((section) => ({
    ...section,
    meetings: section.meetings.filter((meeting, index, values) => values.findIndex((item) => item.day === meeting.day && item.time === meeting.time && item.building === meeting.building && item.room === meeting.room) === index),
  }));

  const subjects = [...new Set(uniqueSections.map((section) => section.key))].map((key) => ({
    key,
    name: uniqueSections.find((section) => section.key === key)?.name ?? "",
    sections: uniqueSections.filter((section) => section.key === key),
  } satisfies SubjectResult));

  return { subjects, sections: uniqueSections, warnings: [...new Set(warnings)].slice(0, 8) };
}

export function mergeSubjects(local: SubjectResult[], live: SubjectResult[]) {
  const keys = [...new Set([...local.map((subject) => subject.key), ...live.map((subject) => subject.key)])];
  return keys.map((key) => {
    const localSubject = local.find((subject) => subject.key === key);
    const liveSubject = live.find((subject) => subject.key === key);
    const byNrc = new Map<string, Section>();
    for (const section of localSubject?.sections ?? []) byNrc.set(section.nrc, { ...section, source: "archivo" });
    for (const section of liveSubject?.sections ?? []) {
      const existing = byNrc.get(section.nrc);
      if (!existing) {
        byNrc.set(section.nrc, { ...section, liveAvailable: section.available, source: "siiau" });
      } else {
        byNrc.set(section.nrc, {
          ...existing,
          capacity: section.capacity || existing.capacity,
          available: section.available,
          liveAvailable: section.available,
          localAvailable: existing.available,
          missingSeats: Math.max(0, existing.available - section.available),
          meetings: section.meetings.length > 0 ? section.meetings : existing.meetings,
          professors: section.professors.length > 0 ? section.professors : existing.professors,
          source: "combinado",
        });
      }
    }
    return { key, name: liveSubject?.name || localSubject?.name || "Materia pendiente", sections: [...byNrc.values()] } satisfies SubjectResult;
  });
}

