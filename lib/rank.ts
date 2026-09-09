/**
 * Fractional ranking.
 *
 * Ordering is a string, not an integer, so dropping something between two neighbours
 * writes exactly one row. Integer positions would renumber every sibling below the
 * insertion point — unbounded write amplification, and under two people dragging at once
 * those renumbers interleave and scramble the order.
 *
 * Appending and prepending step through a fixed-width base-62 number instead of halving
 * the remaining interval. Halving looks elegant but is wrong for the commonest operation
 * there is: every append eats half the space above it, so keys grow without bound —
 * measured at 334 characters after 2000 appends. Stepping keeps them at six.
 */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length;

/** Six base-62 digits is 56.8 billion slots; the step leaves ~65k between neighbours. */
const WIDTH = 6;
const STEP = 1 << 16;
const SPACE = BASE ** WIDTH;
const START = Math.floor(SPACE / 2);

const indexOf = (ch: string) => {
  const i = ALPHABET.indexOf(ch);
  return i === -1 ? 0 : i;
};

function toInt(key: string): number {
  const padded = key.slice(0, WIDTH).padEnd(WIDTH, ALPHABET[0]);
  let value = 0;
  for (const ch of padded) value = value * BASE + indexOf(ch);
  return value;
}

function fromInt(value: number): string {
  let n = Math.max(0, Math.min(SPACE - 1, Math.floor(value)));
  let out = "";
  for (let i = 0; i < WIDTH; i += 1) {
    out = ALPHABET[n % BASE] + out;
    n = Math.floor(n / BASE);
  }
  return out;
}

/** The midpoint algorithm. Correct for any pair, and the only option when both ends exist. */
function between(a: string, b: string): string {
  let prefix = "";
  for (let i = 0; ; i += 1) {
    const lo = i < a.length ? indexOf(a[i]) : 0;
    const hi = i < b.length ? indexOf(b[i]) : BASE;
    if (hi - lo > 1) return prefix + ALPHABET[Math.floor((lo + hi) / 2)];
    // No room at this position, so keep this character and look one deeper.
    prefix += i < a.length ? a[i] : ALPHABET[0];
  }
}

/**
 * A key strictly between `before` and `after`.
 *
 * Pass null for either end to append or prepend. When two adjacent keys leave no gap the
 * result grows a character rather than failing, so there is always room to insert.
 */
export function rankBetween(before: string | null, after: string | null): string {
  const a = before ?? "";
  const b = after ?? "";
  if (a && b && a >= b) {
    throw new Error(`rankBetween expects before < after, got ${a} >= ${b}`);
  }

  if (!a && !b) return fromInt(START);

  if (!b) {
    // Append: step up through the fixed-width space, falling back to halving only if
    // this key has already grown past that space.
    const stepped = fromInt(toInt(a) + STEP);
    return stepped > a ? stepped : between(a, "");
  }

  if (!a) {
    const stepped = fromInt(toInt(b) - STEP);
    return stepped < b && stepped.length > 0 ? stepped : between("", b);
  }

  return between(a, b);
}

/** Evenly spaced keys for a fresh list, so later inserts rarely need to grow one. */
export function initialRanks(count: number): string[] {
  const out: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < count; i += 1) {
    previous = rankBetween(previous, null);
    out.push(previous);
  }
  return out;
}
