import type {
    ButtonHTMLAttributes,
    ReactNode,
} from "react";

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
    const baseStyles = [
        "inline-flex items-center justify-center",
        "gap-2 rounded-[9px]",
        "font-semibold",
        "outline-none",
        "transition-[background-color,border-color,color,box-shadow,transform]",
        "duration-150",
        "focus-visible:ring-2",
        "focus-visible:ring-[#102A43]/10",
        "disabled:cursor-not-allowed",
        "disabled:opacity-50",
    ].join(" ");

    const variants = {
        primary: [
            "border border-[#102A43]",
            "bg-[#102A43] text-white",
            "shadow-[0_1px_2px_rgba(15,23,42,0.08)]",
            "hover:bg-[#173B5E]",
            "hover:border-[#173B5E]",
            "active:bg-[#0B2033]",
            "active:translate-y-px",
        ].join(" "),

        secondary: [
            "border border-[#D9E1E8]",
            "bg-white text-[#334155]",
            "shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
            "hover:border-slate-300",
            "hover:bg-[#F8FAFB]",
            "active:bg-[#EEF2F5]",
            "active:translate-y-px",
        ].join(" "),

        ghost: [
            "border border-transparent",
            "bg-transparent text-[#64748B]",
            "hover:bg-[#EEF2F5]",
            "hover:text-[#172033]",
            "active:bg-[#E7EDF2]",
        ].join(" "),

        danger: [
            "border border-red-600",
            "bg-red-600 text-white",
            "shadow-[0_1px_2px_rgba(127,29,29,0.08)]",
            "hover:bg-red-700",
            "hover:border-red-700",
            "active:bg-red-800",
            "active:translate-y-px",
        ].join(" "),
    };

    const sizes = {
        sm: [
            "h-8 px-3",
            "text-[10px]",
        ].join(" "),

        md: [
            "h-10 px-4",
            "text-[11px]",
        ].join(" "),

        lg: [
            "h-11 px-5",
            "text-[12px]",
        ].join(" "),
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