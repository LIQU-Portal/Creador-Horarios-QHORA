export type Shift = "matutino" | "vespertino" | "mixto" | "sin-horario";

export type Meeting = {
  day: string;
  time: string;
  start: number;
  end: number;
  building: string;
  room: string;
  period?: string;
};

export type Section = {
  nrc: string;
  key: string;
  name: string;
  section: string;
  credits?: string;
  capacity: number;
  available: number;
  localAvailable?: number;
  liveAvailable?: number;
  missingSeats?: number;
  meetings: Meeting[];
  professors: string[];
  source?: "archivo" | "siiau" | "combinado";
};

export type SubjectResult = { key: string; name: string; sections: Section[] };

export type Combination = {
  id: number;
  sections: Section[];
  hasConflict: boolean;
  minimumSeats: number;
  gapMinutes: number;
  gapCount: number;
  activeDays: number;
  shift: Shift;
  uncertain: number;
};

export type BuildOptions = {
  requireSeats: boolean;
  avoidOverlaps: boolean;
  allowUnscheduled: boolean;
  fixedNrcs?: string[];
  maximum?: number;
};

const MORNING_LIMIT = 11 * 60;

export function sectionsConflict(a: Section, b: Section) {
  return a.meetings.some((left) => b.meetings.some((right) =>
    left.day === right.day && left.start < right.end && right.start < left.end,
  ));
}

export function combinationHasConflict(sections: Section[]) {
  for (let index = 0; index < sections.length; index += 1) {
    for (let other = index + 1; other < sections.length; other += 1) {
      if (sectionsConflict(sections[index], sections[other])) return true;
    }
  }
  return false;
}

export function classifyShift(sections: Section[]): Shift {
  const starts = sections.flatMap((section) => section.meetings.map((meeting) => meeting.start));
  if (starts.length === 0) return "sin-horario";
  const morning = starts.some((start) => start <= MORNING_LIMIT);
  const afternoon = starts.some((start) => start > MORNING_LIMIT);
  if (morning && afternoon) return "mixto";
  return morning ? "matutino" : "vespertino";
}

export function calculateCompactness(sections: Section[]) {
  const byDay = new Map<string, Meeting[]>();
  for (const meeting of sections.flatMap((section) => section.meetings)) {
    byDay.set(meeting.day, [...(byDay.get(meeting.day) ?? []), meeting]);
  }

  let gapMinutes = 0;
  let gapCount = 0;
  for (const meetings of byDay.values()) {
    const ordered = [...meetings].sort((left, right) => left.start - right.start || left.end - right.end);
    let latestEnd = ordered[0]?.end ?? 0;
    for (const meeting of ordered.slice(1)) {
      const gap = meeting.start - latestEnd;
      if (gap > 0) {
        gapMinutes += gap;
        gapCount += 1;
      }
      latestEnd = Math.max(latestEnd, meeting.end);
    }
  }
  return { gapMinutes, gapCount, activeDays: byDay.size };
}

export function buildCombinations(subjects: SubjectResult[], options: BuildOptions) {
  const maximum = options.maximum ?? 2500;
  const fixed = new Set((options.fixedNrcs ?? []).map((nrc) => nrc.trim()).filter(Boolean));
  const pending = subjects.filter((subject) => subject.sections.length === 0);
  const active = subjects.filter((subject) => subject.sections.length > 0);
  const blocked: SubjectResult[] = [];

  const choices = active.map((subject) => {
    const fixedForSubject = subject.sections.filter((section) => fixed.has(section.nrc));
    const base = fixedForSubject.length > 0 ? fixedForSubject : subject.sections;
    const usable = base.filter((section) =>
      (!options.requireSeats || section.available > 0) &&
      (options.allowUnscheduled || section.meetings.length > 0),
    );
    if (usable.length === 0) blocked.push(subject);
    return usable.sort((left, right) => right.available - left.available);
  });

  if (active.length === 0 || choices.some((sections) => sections.length === 0)) {
    return { combinations: [] as Combination[], total: 0, limited: false, pending, blocked };
  }

  const combinations: Combination[] = [];
  const chosen: Section[] = [];
  let total = 0;
  let stoppedEarly = false;

  function visit(index: number) {
    if (combinations.length >= maximum) {
      stoppedEarly = true;
      return;
    }
    if (index === choices.length) {
      total += 1;
      const compactness = calculateCompactness(chosen);
      combinations.push({
        id: total,
        sections: [...chosen],
        hasConflict: combinationHasConflict(chosen),
        minimumSeats: Math.min(...chosen.map((section) => section.available)),
        shift: classifyShift(chosen),
        uncertain: chosen.filter((section) => section.meetings.length === 0).length,
        ...compactness,
      });
      return;
    }

    for (const candidate of choices[index]) {
      if (options.avoidOverlaps && chosen.some((selected) => sectionsConflict(selected, candidate))) continue;
      chosen.push(candidate);
      visit(index + 1);
      chosen.pop();
      if (stoppedEarly) return;
    }
  }

  visit(0);
  combinations.sort((left, right) =>
    left.gapMinutes - right.gapMinutes ||
    left.gapCount - right.gapCount ||
    left.activeDays - right.activeDays ||
    left.uncertain - right.uncertain ||
    right.minimumSeats - left.minimumSeats,
  );

  return { combinations, total, limited: stoppedEarly, pending, blocked };
}

