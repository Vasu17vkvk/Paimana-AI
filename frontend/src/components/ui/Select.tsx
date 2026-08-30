import type { SelectHTMLAttributes } from "react";

interface SelectOption {
    label: string;
    value: string;
}

interface SelectProps
    extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: SelectOption[];
    error?: string;
}

export default function Select({
    label,
    options,
    error,
    id,
    className = "",
    ...props
}: SelectProps) {
    return (
        <div className="w-full">
            {label && (
                <label
                    htmlFor={id}
                    className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-400"
                >
                    {label}
                </label>
            )}

            <select
                {...props}
                id={id}
                className={[
                    "h-10 w-full rounded-lg border bg-slate-50 px-3",
                    "text-xs text-slate-700 outline-none",
                    "transition-colors",
                    "focus:border-slate-400 focus:bg-white",
                    error
                        ? "border-red-300"
                        : "border-slate-200",
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
            >
                {options.map((option) => (
                    <option
                        key={option.value}
                        value={option.value}
                    >
                        {option.label}
                    </option>
                ))}
            </select>

            {error && (
                <p className="mt-1.5 text-[10px] text-red-600">
                    {error}
                </p>
            )}
        </div>
    );
}