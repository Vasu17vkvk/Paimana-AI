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
        sm: "p-3",
        md: "p-4 sm:p-5",
        lg: "p-5 sm:p-6",
    };

    return (
        <div
            {...props}
            className={[
                "rounded-2xl border border-slate-200 bg-white",
                "shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
                paddingStyles[padding],
                hoverable
                    ? "transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
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