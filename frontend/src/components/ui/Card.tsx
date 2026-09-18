import type { HTMLAttributes, ReactNode } from "react";

interface CardProps
    extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    padding?: "none" | "sm" | "md" | "lg";
    hoverable?: boolean;
}

export default function Card({
    children,
    padding = "md",
    hoverable = false,
    className = "",
    ...props
}: CardProps) {
    const paddingStyles = {
        none: "p-0",
        sm: "p-3.5",
        md: "p-5",
        lg: "p-6",
    };

    return (
        <div
            {...props}
            className={[
                "min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white",
                "shadow-[0_3px_12px_rgba(30,55,80,0.055)]",
                paddingStyles[padding],
                hoverable
                    ? "transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(0,0,0,0.28)]"
                    : "",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
        >
            {children}
        </div>
    );
}
