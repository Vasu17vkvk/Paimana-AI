import type {
    HTMLAttributes,
    ReactNode,
} from "react";


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
        md: "p-4 sm:p-[18px]",
        lg: "p-5 sm:p-6",
    };

    return (
        <div
            {...props}
            className={[
                /* =================================================
                   BASE CARD
                ================================================== */

                "rounded-[14px]",
                "border border-[#D9E1E8]",
                "bg-white",

                /* =================================================
                   PREMIUM SHADOW
                ================================================== */

                "shadow-[0_1px_3px_rgba(15,23,42,0.05)]",

                /* =================================================
                   TRANSITION
                ================================================== */

                "transition-[box-shadow,transform,border-color]",
                "duration-150",

                /* =================================================
                   PADDING
                ================================================== */

                paddingStyles[padding],

                /* =================================================
                   HOVER
                ================================================== */

                hoverable
                    ? [
                        "hover:-translate-y-[1px]",
                        "hover:border-slate-300",
                        "hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]",
                    ].join(" ")
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