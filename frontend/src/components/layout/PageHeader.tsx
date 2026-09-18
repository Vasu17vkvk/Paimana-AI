import type { ReactNode } from "react";

interface PageHeaderProps {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: ReactNode;
}

export default function PageHeader({
    eyebrow,
    title,
    description,
    action,
}: PageHeaderProps) {
    return (
        <div
            className="
                mb-5 flex flex-col gap-4
                border-b border-[#E7EDF2]
                pb-5
                sm:mb-6
                sm:flex-row
                sm:items-end
                sm:justify-between
                sm:pb-6
            "
        >
            <div className="min-w-0">
                {eyebrow && (
                    <div className="
                        mb-1.5
                        text-[9px] font-bold uppercase
                        tracking-[0.12em]
                        text-[#94A3B8]
                    ">
                        {eyebrow}
                    </div>
                )}

                <h1 className="
                    text-[26px] font-bold
                    leading-tight
                    tracking-[-0.04em]
                    text-[#172033]
                    sm:text-[30px]
                ">
                    {title}
                </h1>

                {description && (
                    <p className="
                        mt-1.5 max-w-3xl
                        text-[11px] leading-[1.6]
                        text-[#64748B]
                        sm:text-[12px]
                    ">
                        {description}
                    </p>
                )}
            </div>

            {action && (
                <div className="
                    w-full shrink-0
                    sm:w-auto
                ">
                    {action}
                </div>
            )}
        </div>
    );
}