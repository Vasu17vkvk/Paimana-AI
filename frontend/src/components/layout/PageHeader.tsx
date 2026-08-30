interface PageHeaderProps {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export default function PageHeader({
    eyebrow,
    title,
    description,
    action,
}: PageHeaderProps) {
    return (
        <div className="mb-7 flex items-end justify-between gap-6">
            <div>
                {eyebrow && (
                    <div className="mb-2 text-[10px] font-bold tracking-[0.12em] text-slate-400">
                        {eyebrow}
                    </div>
                )}

                <h1 className="text-[30px] font-bold tracking-[-0.035em] text-slate-900">
                    {title}
                </h1>

                {description && (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                        {description}
                    </p>
                )}
            </div>

            {action && <div>{action}</div>}
        </div>
    );
}