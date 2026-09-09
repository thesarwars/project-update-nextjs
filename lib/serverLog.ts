/**
 * Operational messages that belong to the server and only to the server.
 *
 * In development React forwards every server-side `console.*` call made during a render
 * into the browser's console, rebuilding its stack on the way (buildFakeCallStack in
 * react-server-dom-turbopack). That is useful for a component logging about its own
 * render, and wrong for these: "which database did I open" and "the mail provider
 * refused this" are for whoever is running the process, not for whoever is looking at
 * the page. Forwarding them also drops an absolute filesystem path into every viewer's
 * console and puts our messages through a fragile dev-only code path for no benefit.
 *
 * Writing to the streams directly reaches the same terminal and the same production log,
 * and React does not patch them.
 */

const write = (stream: NodeJS.WriteStream, text: string) => {
  try {
    stream.write(`${text}\n`);
  } catch {
    // A closed or full stdout must never take down a request.
  }
};

export function serverLog(message: string): void {
  write(process.stdout, message);
}

export function serverError(message: string, cause?: unknown): void {
  const detail = cause instanceof Error ? `${cause.message}` : cause === undefined ? "" : String(cause);
  write(process.stderr, detail ? `${message} ${detail}` : message);
  if (cause instanceof Error && cause.stack) write(process.stderr, cause.stack);
}
