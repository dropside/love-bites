export function extractTimers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseFloat(m[2] ?? m[1]);
    const unit = m[3][0].toLowerCase();
    const secs = unit === 'h' ? n * 3600 : unit === 'm' ? n * 60 : n;
    if (secs >= 30 && secs <= 6 * 3600) out.push(Math.round(secs));
  }
  return out;
}
