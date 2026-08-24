"use client";

import { useState } from "react";
import { generateStrongPassword, passwordProblem } from "@/lib/password";

export default function PasswordField({
  name,
  id,
  autoComplete,
  placeholder,
  required = true,
  withGenerate = false,
  showStrength = false,
}: {
  name: string;
  id?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  withGenerate?: boolean;
  showStrength?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  const problem = showStrength && value ? passwordProblem(value) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the value is visible to copy manually */
    }
  }

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="input pr-20"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={copy}
              title="Copy password"
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                copied ? "text-green-600" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          )}
          {withGenerate && (
            <button
              type="button"
              onClick={() => {
                setValue(generateStrongPassword());
                setVisible(true);
              }}
              title="Generate a strong password"
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-sky-600 hover:bg-sky-50"
            >
              Generate
            </button>
          )}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            title={visible ? "Hide password" : "Show password"}
            aria-label={visible ? "Hide password" : "Show password"}
            className="rounded px-1 text-slate-400 hover:text-slate-700"
          >
            {visible ? "🙈" : "👁"}
          </button>
        </div>
      </div>
      {showStrength && value && (
        <p className={`mt-1 text-xs ${problem ? "text-amber-600" : "text-green-600"}`}>
          {problem ?? "Strong password ✓"}
        </p>
      )}
    </div>
  );
}
