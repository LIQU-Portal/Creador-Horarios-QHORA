import assert from "node:assert/strict";
import test from "node:test";
import { currentAcademicCycle, toSiiauCycle, UNIVERSITY_CENTERS } from "../lib/academic.ts";

test("calcula automáticamente el ciclo A o B del año actual", () => {
  assert.equal(currentAcademicCycle(new Date(2027, 0, 15)), "2027A");
  assert.equal(currentAcademicCycle(new Date(2027, 7, 15)), "2027B");
});

test("convierte el ciclo legible al formato requerido por SIIAU", () => {
  assert.equal(toSiiauCycle("2027A"), "202710");
  assert.equal(toSiiauCycle("2026B"), "202620");
  assert.equal(toSiiauCycle("202620"), "202620");
});

test("CUCEI usa la clave D y aparece como centro predeterminado", () => {
  assert.deepEqual(UNIVERSITY_CENTERS[0], { value: "D", acronym: "CUCEI" });
});
