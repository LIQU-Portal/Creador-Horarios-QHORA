import type { Combination } from "./scheduler";

const DAYS = ["L", "M", "I", "J", "V", "S"];
const DAY_LABELS: Record<string, string> = { L: "Lunes", M: "Martes", I: "Miércoles", J: "Jueves", V: "Viernes", S: "Sábado" };
const SUBJECT_COLORS = ["#5630a8", "#16738a", "#a43b76", "#1c7958", "#a45c08", "#9b3f55"];

function subjectColor(key: string) {
  return SUBJECT_COLORS[[...key].reduce((total, character) => total + character.charCodeAt(0), 0) % SUBJECT_COLORS.length];
}

function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function shiftLabel(shift: Combination["shift"]) {
  return ({ matutino: "Matutino", vespertino: "Vespertino", mixto: "Mixto", "sin-horario": "Sin horario" })[shift];
}

function saveBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 1000);
}

export function downloadSchedulesCsv(combinations: Combination[]) {
  const rows = [["Propuesta", "Tipo", "Clave", "Materia", "Sección", "NRC", "Disponibles", "Día", "Horario", "Edificio", "Aula", "Profesor"]];
  combinations.forEach((combination, index) => {
    for (const section of combination.sections) {
      if (section.meetings.length === 0) rows.push([String(index + 1), shiftLabel(combination.shift), section.key, section.name, section.section, section.nrc, String(section.available), "Sin horario", "", "", "", section.professors.join(" / ")]);
      for (const meeting of section.meetings) rows.push([String(index + 1), shiftLabel(combination.shift), section.key, section.name, section.section, section.nrc, String(section.available), DAY_LABELS[meeting.day] ?? meeting.day, `${clock(meeting.start)}-${clock(meeting.end)}`, meeting.building, meeting.room, section.professors.join(" / ")]);
    }
  });
  const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
  saveBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), "horarios-qhora.csv");
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > width && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

export async function downloadSchedulesPng(combinations: Combination[]) {
  if (combinations.length > 20) throw new Error("Para descargar PNG selecciona como máximo 20 horarios.");
  const width = 1400;
  const cardHeight = 470;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = cardHeight * combinations.length;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no pudo crear la imagen.");
  context.fillStyle = "#f6f4fa";
  context.fillRect(0, 0, canvas.width, canvas.height);

  combinations.forEach((combination, proposalIndex) => {
    const top = proposalIndex * cardHeight + 24;
    context.fillStyle = "#ffffff";
    context.fillRect(24, top, width - 48, cardHeight - 48);
    context.fillStyle = "#271b47";
    context.font = "700 25px Arial";
    context.fillText(`QHORA · Propuesta ${proposalIndex + 1}`, 52, top + 45);
    context.fillStyle = "#6743ad";
    context.font = "700 17px Arial";
    context.fillText(`${shiftLabel(combination.shift)} · ${combination.activeDays} días · ${combination.gapMinutes} min de huecos`, 52, top + 75);

    const startX = 52;
    const gridTop = top + 105;
    const columnWidth = 216;
    for (const [dayIndex, day] of DAYS.entries()) {
      const x = startX + dayIndex * columnWidth;
      context.fillStyle = "#eee9f7";
      context.fillRect(x, gridTop, columnWidth - 8, 40);
      context.fillStyle = "#4e4464";
      context.font = "700 14px Arial";
      context.fillText(DAY_LABELS[day], x + 12, gridTop + 25);
      const meetings = combination.sections.flatMap((section) => section.meetings.filter((meeting) => meeting.day === day).map((meeting) => ({ section, meeting }))).sort((a, b) => a.meeting.start - b.meeting.start);
      let y = gridTop + 58;
      if (meetings.length === 0) {
        context.fillStyle = "#9891a5";
        context.font = "13px Arial";
        context.fillText("Sin clase", x + 12, y + 12);
      }
      for (const { section, meeting } of meetings) {
        context.fillStyle = "#f2edff";
        context.fillRect(x, y, columnWidth - 8, 72);
        context.fillStyle = subjectColor(section.key);
        context.font = "700 14px Arial";
        context.fillText(`${section.key} · ${clock(meeting.start)}–${clock(meeting.end)}`, x + 10, y + 21);
        context.fillStyle = "#514866";
        context.font = "12px Arial";
        const detail = `${section.name} · ${section.section} · NRC ${section.nrc} · ${meeting.building || "Edif. pendiente"} ${meeting.room}`;
        wrapText(context, detail, columnWidth - 28).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x + 10, y + 43 + lineIndex * 15));
        y += 80;
      }
    }
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No fue posible crear la imagen.");
  saveBlob(blob, "horarios-qhora.png");
}

function ascii(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
}

function pdfEscape(value: string) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

export function downloadSchedulesPdf(combinations: Combination[]) {
  const pageLines = combinations.map((combination, index) => {
    const lines = [`QHORA - Propuesta ${index + 1}`, `${shiftLabel(combination.shift)} | ${combination.activeDays} dias | ${combination.gapMinutes} min de huecos`, ""];
    for (const day of DAYS) {
      lines.push(DAY_LABELS[day]);
      const meetings = combination.sections.flatMap((section) => section.meetings.filter((meeting) => meeting.day === day).map((meeting) => ({ section, meeting }))).sort((a, b) => a.meeting.start - b.meeting.start);
      if (meetings.length === 0) lines.push("  Sin clase");
      else for (const { section, meeting } of meetings) lines.push(`  ${clock(meeting.start)}-${clock(meeting.end)}  ${section.key}  ${section.name}  ${section.section}  NRC ${section.nrc}  ${meeting.building} ${meeting.room}`);
      lines.push("");
    }
    return lines.slice(0, 46);
  });

  const objectCount = 3 + pageLines.length * 2;
  const fontId = objectCount;
  const objects: string[] = new Array(objectCount);
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = pageLines.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects[1] = `<< /Type /Pages /Kids [${kids}] /Count ${pageLines.length} >>`;
  pageLines.forEach((lines, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const commands = lines.map((line, lineIndex) => `${lineIndex === 0 ? "" : "0 -15 Td "}(${pdfEscape(line)}) Tj`).join("\n");
    const stream = `BT /F1 11 Tf 48 748 Td\n${commands}\nET`;
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = Uint8Array.from(pdf, (character) => character.charCodeAt(0) & 255);
  saveBlob(new Blob([bytes], { type: "application/pdf" }), "horarios-qhora.pdf");
}
