/**
 * The app's content layout: up to three columns, each its own scroll container on a wide
 * screen, stacking into one ordinary page below `lg`.
 *
 * Column widths are a fixed set of named presets rather than free-form props, because
 * Tailwind only generates classes it can see as literals — an interpolated
 * `lg:grid-cols-[${w}]` would silently produce no CSS at all.
 */
const COLUMNS = {
  /** One column, full width. */
  main: "",
  /** Main + a right pane (preview, issue detail). */
  "main+detail": "lg:grid-cols-[minmax(0,1fr)_420px]",
  /** A left aside + main + a right pane. */
  "aside+main+detail":
    "lg:grid-cols-[210px_minmax(0,1fr)_340px] xl:grid-cols-[250px_minmax(0,1fr)_400px]",
} as const;

export type PaneColumns = keyof typeof COLUMNS;

interface Props {
  columns: PaneColumns;
  /** Rendered first, and ordered first on narrow screens. */
  aside?: React.ReactNode;
  detail?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function PaneGrid({ columns, aside, detail, children, className = "" }: Props) {
  return (
    <main
      className={`mx-auto grid w-full max-w-[1500px] flex-1 gap-4 px-4 py-4 lg:min-h-0 lg:overflow-hidden ${COLUMNS[columns]} ${className}`}
    >
      {aside ? (
        <div className="order-first max-h-[45vh] lg:max-h-none lg:min-h-0">{aside}</div>
      ) : null}
      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1 thin-scroll">
        {children}
      </div>
      {detail ? <div className="lg:min-h-0">{detail}</div> : null}
    </main>
  );
}
