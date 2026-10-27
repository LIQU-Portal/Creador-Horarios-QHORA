import assert from "node:assert/strict";
import test from "node:test";
import { buildCombinations, calculateCompactness, classifyShift, type Section, type SubjectResult } from "../lib/scheduler.ts";

function section(key: string, nrc: string, starts: Array<[string, number, number]>, available = 10): Section {
  return { key, nrc, name: key, section: "A", capacity: 30, available, professors: [], meetings: starts.map(([day, start, end]) => ({ day, start, end, time: `${start}-${end}`, building: "", room: "" })) };
}

test("clasifica horarios matutinos, vespertinos y mixtos por hora de inicio", () => {
  assert.equal(classifyShift([section("A", "1", [["L", 420, 480], ["M", 660, 720]])]), "matutino");
  assert.equal(classifyShift([section("A", "1", [["L", 661, 720]])]), "vespertino");
  assert.equal(classifyShift([section("A", "1", [["L", 540, 600]]), section("B", "2", [["M", 780, 840]])]), "mixto");
});

test("calcula únicamente los huecos entre clases del mismo día", () => {
  const compactness = calculateCompactness([section("A", "1", [["L", 540, 660]]), section("B", "2", [["L", 780, 900]]), section("C", "3", [["M", 900, 960]])]);
  assert.deepEqual(compactness, { gapMinutes: 120, gapCount: 1, activeDays: 2 });
});

test("descarta traslapes y ordena primero la combinación más compacta", () => {
  const subjects: SubjectResult[] = [
    { key: "A", name: "A", sections: [section("A", "1", [["L", 420, 480]]), section("A", "2", [["L", 600, 660]])] },
    { key: "B", name: "B", sections: [section("B", "3", [["L", 480, 540]]), section("B", "4", [["L", 450, 510]])] },
  ];
  const result = buildCombinations(subjects, { requireSeats: true, avoidOverlaps: true, allowUnscheduled: true });
  assert.equal(result.combinations.length, 3);
  assert.equal(result.combinations[0].gapMinutes, 0);
  assert.equal(result.combinations.some((item) => item.sections.map((value) => value.nrc).sort().join(",") === "1,4"), false);
});

test("mantiene materias pendientes sin bloquear las combinaciones restantes", () => {
  const result = buildCombinations([{ key: "A", name: "A", sections: [section("A", "1", [["L", 420, 480]])] }, { key: "P", name: "Pendiente", sections: [] }], { requireSeats: true, avoidOverlaps: true, allowUnscheduled: true });
  assert.equal(result.combinations.length, 1);
  assert.equal(result.pending[0].key, "P");
});

