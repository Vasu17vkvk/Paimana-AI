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
        <div className="mb-7 flex flex-col gap-5 border-b border-slate-200/70 pb-6 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {eyebrow && (
                    <div className="mb-2 text-[10px] font-bold tracking-[0.15em] text-[#7890ac]">
                        {eyebrow}
                    </div>
                )}

                <h1 className="text-[28px] font-bold tracking-[-0.045em] text-[#14233a] sm:text-[32px]">
                    {title}
                </h1>

                {description && (
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-[#6d8098] sm:text-sm sm:leading-6">
                        {description}
                    </p>
                )}
            </div>

            {action && (
                <div className="w-full shrink-0 sm:w-auto">
                    {action}
                </div>
            )}
        </div>
    );
}