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
        <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {eyebrow && (
                    <div className="mb-2 text-[10px] font-bold tracking-[0.12em] text-slate-400">
                        {eyebrow}
                    </div>
                )}

                <h1 className="text-2xl font-bold tracking-[-0.035em] text-slate-900 sm:text-[30px]">
                    {title}
                </h1>

                {description && (
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">
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