import { Check, Plus } from "lucide-react";
import Button from "../../components/ui/Button";
import { useReportsStore, type ReportSectionType } from "./reportsStore";

interface SaveToReportProps {
    id: string;
    type: ReportSectionType;
    title: string;
    description: string;
    snapshot: unknown;
    projectCode?: string;
    projectName?: string;
}

export default function SaveToReport({
    id,
    type,
    title,
    description,
    snapshot,
    projectCode,
    projectName,
}: SaveToReportProps) {
    const sections = useReportsStore((state) => state.sections);
    const addSection = useReportsStore((state) => state.addSection);
    const removeSection = useReportsStore((state) => state.removeSection);
    const setScope = useReportsStore((state) => state.setScope);
    const setProjectCode = useReportsStore((state) => state.setProjectCode);
    const setProjectName = useReportsStore((state) => state.setProjectName);

    const added = sections.some((section) => section.id === id);

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
                event.stopPropagation();

                if (added) {
                    removeSection(id);
                    return;
                }

                if (projectCode) {
                    setScope("project");
                    setProjectCode(projectCode);
                    setProjectName(projectName || projectCode);
                }

                addSection({
                    id,
                    type,
                    title,
                    description,
                    snapshot: projectCode
                        ? {
                            project_code: projectCode,
                            project_name: projectName || projectCode,
                            data: snapshot,
                        }
                        : snapshot,
                });
            }}
            className={added ? "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" : ""}
        >
            {added ? <Check size={13} /> : <Plus size={13} />}
            {added ? "Added to Report" : "Save to Report"}
        </Button>
    );
}
