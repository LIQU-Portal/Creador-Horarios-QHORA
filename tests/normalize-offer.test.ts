import assert from "node:assert/strict";
import test from "node:test";
import { mergeSubjects, normalizeRows, parseCsv } from "../lib/normalize-offer.ts";

test("lee CSV UTF-8 con acentos y campos entre comillas", () => {
  const rows = parseCsv('Clave,Materia,NRC,Sección,Día,Inicio,Fin\nI5288,"Química, general",12345,D01,Miércoles,0700,0855');
  const result = normalizeRows(rows);
  assert.equal(result.sections[0].name, "Química, general");
  assert.equal(result.sections[0].meetings[0].day, "I");
});

test("normaliza encabezados usuales de Bloques horario", () => {
  const result = normalizeRows([{ Clave: "I5288", Materia: "Fundamentos", NRC: 12345, Sección: "D01", Cupo: 30, Registrados: 24, Día: "Lunes", Inicio: "0700", Fin: "0855", Edificio: "V", Aula: "12", Profesor: "Ada" }]);
  assert.equal(result.sections[0].available, 6);
  assert.equal(result.sections[0].meetings[0].day, "L");
  assert.equal(result.sections[0].meetings[0].start, 420);
});

test("calcula faltantes al combinar oferta local y SIIAU", () => {
  const local = normalizeRows([{ Clave: "I5288", Materia: "Fundamentos", NRC: 12345, Sección: "D01", Disponibles: 10 }]).subjects;
  const live = normalizeRows([{ Clave: "I5288", Materia: "Fundamentos", NRC: 12345, Sección: "D01", Disponibles: 4 }]).subjects;
  const merged = mergeSubjects(local, live);
  assert.equal(merged[0].sections[0].available, 4);
  assert.equal(merged[0].sections[0].missingSeats, 6);
});

