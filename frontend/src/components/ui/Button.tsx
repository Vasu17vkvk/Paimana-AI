import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    fullWidth?: boolean;
}

export default function Button({
    children,
    variant = "primary",
    size = "md",
    fullWidth = false,
    className = "",
    disabled,
    ...props
}: ButtonProps) {
    const baseStyles =
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50";

    const variants = {
        primary:
            "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
        secondary:
            "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
        ghost:
            "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        danger:
            "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
    };

    const sizes = {
        sm: "h-8 px-3 text-[11px]",
        md: "h-10 px-4 text-xs",
        lg: "h-11 px-5 text-sm",
    };

    return (
        <button
            {...props}
            disabled={disabled}
            className={[
                baseStyles,
                variants[variant],
                sizes[size],
                fullWidth ? "w-full" : "",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {children}
        </button>
    );
}