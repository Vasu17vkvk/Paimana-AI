import ProjectMap from "../../components/maps/ProjectMap";

export default function GeographicViewPage() {
    return (
        <div className="mx-auto max-w-[1500px] space-y-6">

            <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    PAIMANA AI
                </div>

                <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                    Geographic View
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    Explore infrastructure projects across India.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <ProjectMap />
            </div>

        </div>
    );
}