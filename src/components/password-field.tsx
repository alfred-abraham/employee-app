"use client";

import { useId, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

type PasswordFieldProps = {
  label: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
};

export function PasswordField({ label, name, autoComplete, value, onChange, hint }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <label className="block text-sm font-medium text-[#435047]">
      {label}
      <span className="relative mt-1.5 block">
        <LockKeyhole className="pointer-events-none absolute left-3.5 top-3 text-[#87928b]" size={17} />
        <input
          required
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          className="w-full rounded-xl border border-[#d5dcd7] py-2.5 pl-10 pr-12 font-normal outline-none transition focus:border-[#4c7f60] focus:ring-2 focus:ring-[#4c7f60]/15"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute right-2.5 top-1.5 grid size-8 place-items-center rounded-lg text-[#87928b] transition hover:bg-[#f2f5f3] hover:text-[#435047]"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      {hint && <span id={`${inputId}-hint`} className="mt-1.5 block text-xs font-normal text-[#87928b]">{hint}</span>}
    </label>
  );
}
