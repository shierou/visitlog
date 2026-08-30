export function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

/** 로컬 타임존 기준 YYYY-MM-DD (input[type=date] 용) */
export function toDateInput(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD 를 로컬 정오로 파싱 (타임존 밀림 방지) */
export function fromDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  return Math.max(0, Math.round((t2 - t1) / 86400000));
}

export const REVISIT_LABEL: Record<string, string> = {
  yes: '또 갈래요',
  maybe: '글쎄요',
  no: '안 갈래요',
};
