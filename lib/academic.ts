export const EXAMPLE_SUBJECT_KEYS = "I6921\nI6922\nI7501";

export const UNIVERSITY_CENTERS = [
  { value: "D", acronym: "CUCEI" },
  { value: "A", acronym: "CUAAD" },
  { value: "B", acronym: "CUCBA" },
  { value: "C", acronym: "CUCEA" },
  { value: "E", acronym: "CUCS" },
  { value: "F", acronym: "CUCSH" },
  { value: "4", acronym: "CUGDL" },
  { value: "G", acronym: "CUALTOS" },
  { value: "6", acronym: "CUCHAPALA" },
  { value: "H", acronym: "CUCIÉNEGA" },
  { value: "I", acronym: "CUCOSTA" },
  { value: "J", acronym: "CUCSUR" },
  { value: "U", acronym: "CULAGOS" },
  { value: "N", acronym: "CUNORTE" },
  { value: "K", acronym: "CUSUR" },
  { value: "3", acronym: "CUTLAJOMULCO" },
  { value: "5", acronym: "CUTLAQUEPAQUE" },
  { value: "Z", acronym: "CUTONALÁ" },
  { value: "M", acronym: "CUVALLES" },
  { value: "O", acronym: "CUCEI · VALLES" },
  { value: "P", acronym: "CUCSUR · VALLES" },
  { value: "Q", acronym: "CUCEI · NORTE" },
  { value: "R", acronym: "CUALTOS · NORTE" },
  { value: "S", acronym: "CUCOSTA · NORTE" },
  { value: "T", acronym: "SEDE TLAJOMULCO" },
  { value: "W", acronym: "CUCEA · VALLE" },
  { value: "X", acronym: "UDGVIRTUAL" },
  { value: "Y", acronym: "INCORPORADAS" },
] as const;

export function currentAcademicCycle(date = new Date()) {
  const period = date.getMonth() < 6 ? "A" : "B";
  return `${date.getFullYear()}${period}`;
}

export function toSiiauCycle(cycle: string): string {
  const normalized = cycle.trim().toUpperCase();
  const readable = normalized.match(/^(\d{4})(A|B)$/);
  if (readable) return `${readable[1]}${readable[2] === "A" ? "10" : "20"}`;
  return /^\d{6}$/.test(normalized) ? normalized : toSiiauCycle(currentAcademicCycle());
}
