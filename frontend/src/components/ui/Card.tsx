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
                "rounded-2xl border border-[#d7dadd] bg-[#f5f6f7]",
                "shadow-[0_2px_8px_rgba(20,24,30,0.045)]",
                paddingStyles[padding],
                hoverable
                    ? "transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(20,24,30,0.08)]"
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
