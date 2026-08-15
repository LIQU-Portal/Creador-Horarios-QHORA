"use client";

import { useMemo, useState } from "react";

type Meeting = { day: string; time: string; start: number; end: number; building: string; room: string };
type Section = {
  nrc: string; key: string; name: string; section: string; credits: string;
  capacity: number; available: number; meetings: Meeting[]; professors: string[];
};
type SubjectResult = { key: string; name: string; sections: Section[] };
type OfferResponse = { cycle: string; center: string; queriedAt: string; subjects: SubjectResult[] };
type Combination = { id: number; sections: Section[]; hasConflict: boolean; minimumSeats: number };

const DAYS = ["L", "M", "I", "J", "V", "S"];
const DAY_LABELS: Record<string, string> = { L: "Lunes", M: "Martes", I: "Miércoles", J: "Jueves", V: "Viernes", S: "Sábado" };
const PAGE_SIZE = 6;
const MAX_STORED = 5000;

function sectionsConflict(a: Section, b: Section) {
  return a.meetings.some((left) => b.meetings.some((right) =>
    left.day === right.day && left.start < right.end && right.start < left.end,
  ));
}

function combinationHasConflict(sections: Section[]) {
  for (let i = 0; i < sections.length; i += 1) {
    for (let j = i + 1; j < sections.length; j += 1) {
      if (sectionsConflict(sections[i], sections[j])) return true;
    }
  }
  return false;
}

function buildCombinations(subjects: SubjectResult[], requireSeats: boolean, avoidOverlaps: boolean) {
  const pending = subjects.filter((subject) => subject.sections.length === 0);
  const active = subjects.filter((subject) => subject.sections.length > 0);
  const options = active.map((subject) => subject.sections
    .filter((section) => !requireSeats || section.available > 0)
    .sort((a, b) => b.available - a.available));

  if (active.length === 0 || options.some((sections) => sections.length === 0)) {
    return { combinations: [] as Combination[], total: 0, limited: false, pending };
  }

  const combinations: Combination[] = [];
  const chosen: Section[] = [];
  let total = 0;

  function visit(index: number) {
    if (index === options.length) {
      total += 1;
      if (combinations.length < MAX_STORED) {
        combinations.push({
          id: total,
          sections: [...chosen],
          hasConflict: combinationHasConflict(chosen),
          minimumSeats: Math.min(...chosen.map((section) => section.available)),
        });
      }
      return;
    }
    for (const candidate of options[index]) {
      if (avoidOverlaps && chosen.some((selected) => sectionsConflict(selected, candidate))) continue;
      chosen.push(candidate);
      visit(index + 1);
      chosen.pop();
    }
  }

  visit(0);
  combinations.sort((a, b) => b.minimumSeats - a.minimumSeats);
  return { combinations, total, limited: total > combinations.length, pending };
}

function formatTime(raw: string) {
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}–${raw.slice(5, 7)}:${raw.slice(7, 9)}`;
}

function ScheduleCard({ combination, number, pending }: { combination: Combination; number: number; pending: SubjectResult[] }) {
  const byDay = DAYS.map((day) => ({
    day,
    meetings: combination.sections.flatMap((section) => section.meetings
      .filter((meeting) => meeting.day === day)
      .map((meeting) => ({ section, meeting })))
      .sort((a, b) => a.meeting.start - b.meeting.start),
  }));
  const withoutTime = combination.sections.filter((section) => section.meetings.length === 0);

  return (
    <article className="schedule-card">
      <div className="schedule-heading">
        <div><span className="eyebrow">Propuesta {number}</span><h3>{combination.sections.map((section) => section.section).join(" · ")}</h3></div>
        <div className="badges">
          <span className={combination.minimumSeats > 0 ? "badge success" : "badge danger"}>Mínimo {combination.minimumSeats} cupos</span>
          {combination.hasConflict && <span className="badge danger">Con traslape</span>}
        </div>
      </div>
      <div className="week-grid">
        {byDay.map(({ day, meetings }) => (
          <section className="day-column" key={day}>
            <h4>{DAY_LABELS[day]}</h4>
            {meetings.length === 0 ? <p className="empty-day">Sin clase</p> : meetings.map(({ section, meeting }) => (
              <div className="class-block" key={`${section.nrc}-${day}-${meeting.time}`}>
                <strong>{section.key}</strong><span>{formatTime(meeting.time)}</span>
                <small>{section.section} · NRC {section.nrc}</small>
                <small>{meeting.building || "Edificio pendiente"} {meeting.room}</small>
              </div>
            ))}
          </section>
        ))}
      </div>
      {(withoutTime.length > 0 || pending.length > 0) && (
        <div className="pending-strip">
          {withoutTime.map((section) => <span key={section.nrc}><strong>{section.key}</strong> sin horario capturado · NRC {section.nrc}</span>)}
          {pending.map((subject) => <span key={subject.key}><strong>{subject.key}</strong> pendiente · sin sección ofertada</span>)}
        </div>
      )}
      <details>
        <summary>Ver detalle de secciones</summary>
        <div className="section-detail-grid">
          {combination.sections.map((section) => (
            <div key={section.nrc}><strong>{section.key} · {section.section}</strong><span>NRC {section.nrc} · {section.available} cupos</span><span>{section.professors.join(", ") || "Profesor por asignar"}</span></div>
          ))}
        </div>
      </details>
    </article>
  );
}

export default function Home() {
  const [keys, setKeys] = useState("V3684 IG738 IL340 V2475");
  const [requireSeats, setRequireSeats] = useState(true);
  const [avoidOverlaps, setAvoidOverlaps] = useState(true);
  const [data, setData] = useState<OfferResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const result = useMemo(() => data ? buildCombinations(data.subjects, requireSeats, avoidOverlaps) : null, [data, requireSeats, avoidOverlaps]);
  const totalPages = result ? Math.max(1, Math.ceil(result.combinations.length / PAGE_SIZE)) : 1;
  const visible = result?.combinations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];

  async function consultOffer() {
    const normalized = Array.from(new Set(keys.toUpperCase().split(/[\s,;]+/).filter(Boolean)));
    if (normalized.length < 2) { setError("Escribe al menos dos claves de materias."); return; }
    setLoading(true); setError(""); setPage(1);
    try {
      const response = await fetch(`/api/oferta?claves=${encodeURIComponent(normalized.join(","))}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No fue posible consultar SIIAU.");
      setData(payload);
    } catch (caught) {
      setData(null); setError(caught instanceof Error ? caught.message : "Ocurrió un error inesperado.");
    } finally { setLoading(false); }
  }

  function toggleRule(update: () => void) { update(); setPage(1); }

  return (
    <main>
      <header className="hero">
        <div className="brand-mark">LQ</div>
        <div className="hero-copy"><span className="eyebrow">CUCEI · Calendario 2026B</span><h1>Creador de Horarios para LQUI</h1><p>Consulta materias por clave y genera propuestas completas, con control sobre cupos y traslapes.</p></div>
        <span className="live-pill"><i /> Oferta académica</span>
      </header>

      <section className="workspace">
        <aside className="query-panel">
          <div className="field-group"><label htmlFor="keys">Claves de las materias</label><p>Sepáralas con espacios o comas. Las claves sin oferta se conservarán como pendientes.</p><textarea id="keys" value={keys} onChange={(event) => setKeys(event.target.value)} rows={3} spellCheck={false} /></div>
          <div className="rules" aria-label="Reglas de generación">
            <label className="toggle-row"><span><strong>Solo secciones con cupo</strong><small>Excluye grupos llenos o con disponibilidad negativa.</small></span><input type="checkbox" checked={requireSeats} onChange={() => toggleRule(() => setRequireSeats((value) => !value))} /></label>
            <label className="toggle-row"><span><strong>Evitar traslapes</strong><small>Descarta propuestas con clases simultáneas.</small></span><input type="checkbox" checked={avoidOverlaps} onChange={() => toggleRule(() => setAvoidOverlaps((value) => !value))} /></label>
          </div>
          <button className="primary-button" onClick={consultOffer} disabled={loading}>{loading ? "Consultando oferta…" : "Generar propuestas"}</button>
          <p className="source-note">Los cupos cambian continuamente; confirma los NRC antes de agendar.</p>
        </aside>

        <section className="results-panel">
          {!data && !loading && !error && <div className="welcome-state"><span>01</span><h2>Escribe las claves</h2><p>La herramienta buscará secciones y construirá combinaciones compatibles.</p></div>}
          {loading && <div className="loading-state"><div className="spinner" /><p>Revisando secciones, horarios y cupos…</p></div>}
          {error && <div className="error-box"><strong>No se pudo generar el horario</strong><p>{error}</p></div>}
          {data && result && (
            <>
              <div className="results-heading">
                <div><span className="eyebrow">Resultados</span><h2>{result.total.toLocaleString("es-MX")} combinaciones</h2><p>Consulta realizada {new Date(data.queriedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}.</p></div>
                <div className="rule-status"><span className={requireSeats ? "on" : "off"}>Cupo {requireSeats ? "obligatorio" : "sin restricción"}</span><span className={avoidOverlaps ? "on" : "off"}>Traslapes {avoidOverlaps ? "bloqueados" : "permitidos"}</span></div>
              </div>
              <div className="subject-summary">
                {data.subjects.map((subject) => {
                  const usable = subject.sections.filter((section) => !requireSeats || section.available > 0).length;
                  const pending = subject.sections.length === 0;
                  return <article className={pending ? "subject-card pending" : usable === 0 ? "subject-card unavailable" : "subject-card"} key={subject.key}><span>{subject.key}</span><strong>{subject.name || "Materia pendiente"}</strong><small>{pending ? "Sin sección ofertada; no bloquea las propuestas" : `${usable} de ${subject.sections.length} secciones utilizables`}</small></article>;
                })}
              </div>
              {!requireSeats && <div className="advisory">Escenario exploratorio: algunas propuestas pueden incluir secciones sin lugares disponibles.</div>}
              {!avoidOverlaps && <div className="advisory danger-note">Escenario exploratorio: las propuestas con empalmes se marcarán en rojo.</div>}
              {result.total === 0 ? <div className="empty-result"><strong>No existe un horario con las reglas actuales.</strong><p>Alguna materia ofertada no tiene secciones utilizables. Puedes desactivar temporalmente una restricción.</p></div> : (
                <>
                  {result.limited && <p className="limit-note">Se encontraron {result.total.toLocaleString("es-MX")} combinaciones; se muestran las primeras {result.combinations.length.toLocaleString("es-MX")}, priorizadas por cupo.</p>}
                  <div className="schedule-list">{visible.map((combination, offset) => <ScheduleCard key={`${combination.id}-${page}`} combination={combination} number={(page - 1) * PAGE_SIZE + offset + 1} pending={result.pending} />)}</div>
                  <nav className="pagination" aria-label="Páginas de propuestas"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente</button></nav>
                </>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
