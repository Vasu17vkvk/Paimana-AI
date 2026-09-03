import ProjectMap from "../../components/maps/ProjectMap";

export default function GeographicViewPage() {
    return (
        <div className="mx-auto w-full max-w-[1500px] space-y-5">
            <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    PAIMANA AI
                </div>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Geographic View
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    Explore infrastructure projects across India.
                </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <ProjectMap />
            </div>
        </div>
    );
}