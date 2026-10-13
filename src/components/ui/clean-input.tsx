"use client";

import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { PROFANITY_MESSAGE, containsProfanity } from "@/lib/profanity/filter";

// Inputs with instant (client-side) bad-word feedback. The server check is authoritative.

export function CleanInput(props: InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  const [bad, setBad] = useState(false);
  const describedBy = [props["aria-describedby"], bad ? `${props.id}-bad` : null].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <input
        {...props}
        aria-invalid={bad || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          setBad(containsProfanity(e.target.value));
          props.onChange?.(e);
        }}
        className={props.className ?? "input"}
      />
      {bad && (
        <p id={`${props.id}-bad`} className="mt-1 text-sm text-danger">
          {PROFANITY_MESSAGE}
        </p>
      )}
    </>
  );
}

export function CleanTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string; showCount?: boolean }) {
  const { showCount, ...rest } = props;
  const [bad, setBad] = useState(false);
  const [len, setLen] = useState(typeof props.defaultValue === "string" ? props.defaultValue.length : 0);
  return (
    <>
      <textarea
        {...rest}
        aria-invalid={bad || undefined}
        onChange={(e) => {
          setBad(containsProfanity(e.target.value));
          setLen(e.target.value.length);
          props.onChange?.(e);
        }}
        className={props.className ?? "input min-h-24"}
      />
      {showCount && props.maxLength && (
        <p className="mt-1 text-right text-sm text-muted" aria-live="polite">
          {len}/{props.maxLength}
        </p>
      )}
      {bad && <p className="mt-1 text-sm text-danger">{PROFANITY_MESSAGE}</p>}
    </>
  );
}
