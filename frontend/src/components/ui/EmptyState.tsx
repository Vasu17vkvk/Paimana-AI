import type { ReactNode } from "react";

interface EmptyStateProps {
    title: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
}

export default function EmptyState({
    title,
    description,
    icon,
    action,
}: EmptyStateProps) {
    return (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center">
            {icon && (
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
                    {icon}
                </div>
            )}

            <h3 className="text-sm font-bold text-slate-800">
                {title}
            </h3>

            {description && (
                <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-400">
                    {description}
                </p>
            )}

            {action && (
                <div className="mt-4">
                    {action}
                </div>
            )}
        </div>
    );
}