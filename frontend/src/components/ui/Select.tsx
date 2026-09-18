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
    tone?: "light" | "dark";
}

export default function Select({
    label,
    options,
    error,
    id,
    className = "",
    tone = "light",
    style,
    ...props
}: SelectProps) {
    const isDark = tone === "dark";

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

            <div className="relative">
                <select
                    {...props}
                    id={id}
                    style={{
                        ...style,
                        backgroundColor: isDark
                            ? "#30343B"
                            : "#F8FAFB",
                        color: isDark
                            ? "#FFFFFF"
                            : "#334155",
                        borderColor: isDark
                            ? "#30343B"
                            : "#D9E1E8",
                        colorScheme: isDark
                            ? "dark"
                            : "light",
                    }}
                    className={[
                        "h-10 w-full appearance-none",
                        "rounded-[9px]",
                        "border",
                        "px-3 pr-9",
                        "text-[11px] font-medium",
                        "outline-none",
                        "transition-[border-color,background,box-shadow,color]",
                        "duration-150",

                        isDark
                            ? [
                                "hover:border-[#3B424C]",
                                "focus:border-[#4B5563]",
                                "focus:ring-2",
                                "focus:ring-white/10",
                            ].join(" ")
                            : [
                                "hover:border-slate-300",
                                "focus:border-[#94A3B8]",
                                "focus:bg-white",
                                "focus:ring-2",
                                "focus:ring-[#102A43]/5",
                            ].join(" "),

                        error
                            ? "border-red-300"
                            : "",

                        className,
                    ]
                        .filter(Boolean)
                        .join(" ")}
                >
                    {options.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                            style={{
                                backgroundColor: isDark
                                    ? "#30343B"
                                    : "#FFFFFF",
                                color: isDark
                                    ? "#FFFFFF"
                                    : "#334155",
                            }}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>

                <span
                    aria-hidden="true"
                    className={[
                        "pointer-events-none",
                        "absolute right-3 top-1/2",
                        "-translate-y-1/2",
                        "text-[10px]",
                        isDark
                            ? "text-slate-300"
                            : "text-[#94A3B8]",
                    ].join(" ")}
                >
                    ▾
                </span>
            </div>

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