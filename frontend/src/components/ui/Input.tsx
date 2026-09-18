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
                    className="
                        mb-1.5 block
                        text-[9px] font-bold
                        uppercase tracking-[0.08em]
                        text-[#94A3B8]
                    "
                >
                    {label}
                </label>
            )}

            <input
                {...props}
                id={id}
                className={[
                    "h-10 w-full rounded-[9px]",
                    "border bg-[#F8FAFB] px-3",
                    "text-[11px] font-medium",
                    "text-[#334155]",
                    "outline-none",
                    "transition-[border-color,background,box-shadow]",
                    "duration-150",
                    "placeholder:text-[#94A3B8]",
                    "hover:border-slate-300",
                    error
                        ? [
                            "border-red-300",
                            "focus:border-red-400",
                            "focus:bg-white",
                            "focus:ring-2",
                            "focus:ring-red-500/5",
                        ].join(" ")
                        : [
                            "border-[#D9E1E8]",
                            "focus:border-[#94A3B8]",
                            "focus:bg-white",
                            "focus:ring-2",
                            "focus:ring-[#102A43]/5",
                        ].join(" "),
                    className,
                ]
                    .filter(Boolean)
                    .join(" ")}
            />

            {error && (
                <p className="
                    mt-1.5 text-[10px]
                    font-medium text-red-600
                ">
                    {error}
                </p>
            )}
        </div>
    );
}