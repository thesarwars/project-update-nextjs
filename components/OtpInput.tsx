"use client";

import { useRef, useState } from "react";

const LENGTH = 6;

/**
 * Six boxes that behave like one field.
 *
 * The real value rides in a hidden input, so the server action reads a single `code`
 * whatever the boxes are doing. Paste is handled explicitly because the common gesture
 * is copying all six digits out of the email at once, and the default would drop five
 * of them into the first box.
 */
export default function OtpInput({ autoFocus = true }: { autoFocus?: boolean }) {
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const submitted = useRef(false);

  const focus = (index: number) => boxes.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();

  function write(next: string[], from: number) {
    setDigits(next);
    const filled = next.filter(Boolean).length;
    focus(filled >= LENGTH ? LENGTH - 1 : Math.max(from, next.findIndex((d) => !d)));

    // Entering the last digit is the whole intent, so submitting for them saves a reach
    // for the mouse. Guarded, or a re-render after the action starts would submit twice.
    if (next.every(Boolean) && !submitted.current) {
      submitted.current = true;
      queueMicrotask(() => boxes.current[0]?.form?.requestSubmit());
    }
  }

  function handleChange(index: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    if (!typed) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    const next = [...digits];
    // A phone keyboard can deliver several digits in one event; spread them rightwards.
    for (let i = 0; i < typed.length && index + i < LENGTH; i += 1) next[index + i] = typed[i];
    write(next, Math.min(index + typed.length, LENGTH - 1));
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      focus(index - 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focus(index + 1);
    }
  }

  function handlePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const typed = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!typed) return;
    event.preventDefault();
    const next = [...digits];
    for (let i = 0; i < typed.length && index + i < LENGTH; i += 1) next[index + i] = typed[i];
    write(next, Math.min(index + typed.length, LENGTH - 1));
  }

  return (
    <div>
      <input type="hidden" name="code" value={digits.join("")} />
      <div className="flex justify-between gap-2" role="group" aria-label="Six-digit code">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              boxes.current[index] = el;
            }}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1}`}
            autoFocus={autoFocus && index === 0}
            className="h-12 w-full min-w-0 rounded-lg border border-line bg-surface-sunken text-center text-[18px] font-semibold tabular-nums outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        ))}
      </div>
    </div>
  );
}
