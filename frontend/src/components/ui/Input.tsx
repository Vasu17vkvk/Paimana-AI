import type { InputHTMLAttributes } from "react";

interface InputProps
    extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export default function Input({
    label,
    error,
    className = "",
    id,
    ...props
}: InputProps) {
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

            <input
                {...props}
                id={id}
                className={[
                    "h-10 w-full rounded-lg border bg-slate-50 px-3",
                    "text-xs text-slate-700 outline-none",
                    "transition-colors",
                    "placeholder:text-slate-400",
                    error
                        ? "border-red-300 focus:border-red-500"
                        : "border-slate-200 focus:border-slate-400 focus:bg-white",
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
            />

            {error && (
                <p className="mt-1.5 text-[10px] text-red-600">
                    {error}
                </p>
            )}
        </div>
    );
}