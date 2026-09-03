import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
    GeoJSON,
    MapContainer,
    Marker,
    Popup,
    TileLayer,
    useMap,
} from "react-leaflet";

import indiaStatesUrl from "../../assets/india-states.geojson?url";

import {
    getGeographicProjects,
    type GeographicProject,
} from "../../services/api";

interface GeoJsonFeature {
    type: string;
    properties?: Record<string, unknown>;
    geometry?: {
        type: string;
        coordinates: unknown;
    } | null;
}

interface GeoJsonCollection {
    type: string;
    features: GeoJsonFeature[];
}

type LatLng = [number, number];

/* =========================================================
   INDIA MAP CONFIG
========================================================= */

const INDIA_CENTER: LatLng = [22.5, 79];

const INDIA_BOUNDS: L.LatLngBoundsExpression = [
    [6, 68],
    [37, 98],
];

/*
 * Approximate centers used ONLY for displaying projects
 * when actual project GPS coordinates are unavailable.
 */
const INDIA_STATE_CENTER: Record<string, LatLng> = {
    Gujarat: [22.3, 71.6],
    Maharashtra: [19.3, 75.3],
    Rajasthan: [27.0, 74.2],
    "Madhya Pradesh": [23.5, 78.5],
    "Uttar Pradesh": [26.8, 80.9],
    Bihar: [25.9, 85.3],
    Jharkhand: [23.6, 85.3],
    Chhattisgarh: [21.3, 82.0],
    Odisha: [20.3, 84.4],
    "West Bengal": [23.0, 87.8],
    Karnataka: [15.3, 75.7],
    Kerala: [10.4, 76.3],
    "Tamil Nadu": [11.1, 78.6],
    "Andhra Pradesh": [15.9, 79.7],
    Telangana: [17.9, 79.3],
    Goa: [15.3, 74.1],
    Punjab: [31.1, 75.3],
    Haryana: [29.1, 76.1],
    "Himachal Pradesh": [31.8, 77.2],
    Uttarakhand: [30.1, 79.2],
    Assam: [26.2, 92.9],
    Meghalaya: [25.5, 91.3],
    Tripura: [23.8, 91.3],
    Mizoram: [23.3, 92.8],
    Manipur: [24.7, 93.9],
    Nagaland: [26.1, 94.4],
    "Arunachal Pradesh": [28.2, 94.7],
    Sikkim: [27.5, 88.5],
    "Jammu and Kashmir": [33.8, 76.3],
    Ladakh: [34.1, 77.6],
    Delhi: [28.6, 77.2],
};

/* =========================================================
   STATE HELPERS
========================================================= */

function getStateName(
    feature: GeoJsonFeature,
): string {
    const properties =
        feature.properties ?? {};

    const possibleKeys = [
        "ST_NM",
        "state",
        "State",
        "STATE",
        "NAME_1",
        "name",
        "NAME",
    ];

    for (const key of possibleKeys) {
        const value = properties[key];

        if (
            typeof value === "string" &&
            value.trim()
        ) {
            return value.trim();
        }
    }

    return "Unknown State";
}

function normalizeStateName(
    value: string,
): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/&/g, "and");
}

function statesMatch(
    left: string,
    right: string,
): boolean {
    return (
        normalizeStateName(left) ===
        normalizeStateName(right)
    );
}

/* =========================================================
   RISK HELPERS
========================================================= */

function riskColor(
    riskLevel: string | null,
): string {
    switch (riskLevel) {
        case "CRITICAL":
            return "#991b1b";

        case "HIGH":
            return "#dc2626";

        case "MEDIUM":
            return "#d97706";

        case "LOW":
            return "#16a34a";

        default:
            return "#64748b";
    }
}

/*
 * Large clickable marker.
 * HTML div marker gives us a much larger hit area than
 * a tiny CircleMarker.
 */
function createProjectIcon(
    riskLevel: string | null,
): L.DivIcon {
    const color =
        riskColor(riskLevel);

    return L.divIcon({
        className:
            "paimana-project-marker",
        html: `
            <div
                style="
                    width: 18px;
                    height: 18px;
                    border-radius: 9999px;
                    background: ${color};
                    border: 3px solid #ffffff;
                    box-sizing: border-box;
                    cursor: pointer;
                    box-shadow:
                        0 1px 5px rgba(15, 23, 42, 0.45),
                        0 0 0 1px ${color};
                "
            ></div>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -12],
    });
}

/* =========================================================
   DETERMINISTIC POSITION GENERATOR
========================================================= */

function seededRandom(
    seed: number,
): number {
    const value =
        Math.sin(seed * 12.9898) *
        43758.5453;

    return (
        value - Math.floor(value)
    );
}

/*
 * Creates visually well-spaced positions around a state's
 * approximate center.
 *
 * These are REPRESENTATIVE positions, NOT real GPS.
 */
function generateProjectPositions(
    state: string,
    count: number,
): LatLng[] {
    const center =
        INDIA_STATE_CENTER[state];

    if (!center || count <= 0) {
        return [];
    }

    const [
        centerLat,
        centerLng,
    ] = center;

    /*
     * State-specific display area.
     *
     * Larger states get larger spread.
     */
    const stateSpread: Record<
        string,
        {
            lat: number;
            lng: number;
        }
    > = {
        Gujarat: {
            lat: 2.2,
            lng: 2.8,
        },

        Maharashtra: {
            lat: 3.0,
            lng: 3.8,
        },

        Rajasthan: {
            lat: 4.0,
            lng: 5.2,
        },

        "Madhya Pradesh": {
            lat: 3.2,
            lng: 4.2,
        },

        "Uttar Pradesh": {
            lat: 3.0,
            lng: 4.5,
        },

        Bihar: {
            lat: 1.5,
            lng: 2.5,
        },

        Jharkhand: {
            lat: 1.5,
            lng: 2.3,
        },

        Chhattisgarh: {
            lat: 2.2,
            lng: 3.0,
        },

        Odisha: {
            lat: 2.4,
            lng: 3.5,
        },

        "West Bengal": {
            lat: 2.2,
            lng: 3.1,
        },

        Karnataka: {
            lat: 2.6,
            lng: 3.5,
        },

        Kerala: {
            lat: 1.7,
            lng: 1.2,
        },

        "Tamil Nadu": {
            lat: 2.4,
            lng: 3.0,
        },

        "Andhra Pradesh": {
            lat: 2.5,
            lng: 3.5,
        },

        Telangana: {
            lat: 1.8,
            lng: 2.4,
        },

        Punjab: {
            lat: 1.2,
            lng: 1.8,
        },

        Haryana: {
            lat: 1.3,
            lng: 1.8,
        },

        "Himachal Pradesh": {
            lat: 1.6,
            lng: 2.0,
        },

        Uttarakhand: {
            lat: 1.5,
            lng: 1.8,
        },

        Assam: {
            lat: 1.8,
            lng: 3.8,
        },

        "Arunachal Pradesh": {
            lat: 2.0,
            lng: 4.0,
        },

        "Jammu and Kashmir": {
            lat: 2.2,
            lng: 3.5,
        },

        Ladakh: {
            lat: 2.6,
            lng: 4.0,
        },

        Delhi: {
            lat: 0.4,
            lng: 0.5,
        },
    };

    const spread =
        stateSpread[state] ?? {
            lat: 2,
            lng: 2.5,
        };

    const positions: LatLng[] = [];

    /*
     * We intentionally use a wider grid for many projects.
     */
    const columns = Math.max(
        6,
        Math.ceil(
            Math.sqrt(
                count * 1.25,
            ),
        ),
    );

    const rows = Math.ceil(
        count / columns,
    );

    const latStep =
        spread.lat /
        Math.max(
            rows - 1,
            1,
        );

    const lngStep =
        spread.lng /
        Math.max(
            columns - 1,
            1,
        );

    for (
        let index = 0;
        index < count;
        index++
    ) {
        const row =
            Math.floor(
                index / columns,
            );

        const column =
            index % columns;

        const rowCount =
            Math.min(
                columns,
                count -
                    row *
                        columns,
            );

        const baseLat =
            centerLat -
            spread.lat / 2 +
            row *
                latStep;

        const rowWidth =
            (rowCount - 1) *
            lngStep;

        const rowStart =
            centerLng -
            rowWidth / 2;

        const baseLng =
            rowStart +
            column *
                lngStep;

        /*
         * Controlled jitter.
         * This avoids a perfect spreadsheet appearance.
         */
        const jitterLat =
            (
                seededRandom(
                    index + 100,
                ) -
                0.5
            ) *
            latStep *
            0.30;

        const jitterLng =
            (
                seededRandom(
                    index + 500,
                ) -
                0.5
            ) *
            lngStep *
            0.30;

        const stagger =
            row % 2 === 0
                ? -lngStep * 0.12
                : lngStep * 0.12;

        positions.push([
            baseLat +
                jitterLat,

            baseLng +
                jitterLng +
                stagger,
        ]);
    }

    return positions;
}

/* =========================================================
   MAP VIEW CONTROLLER
========================================================= */

function MapViewportController({
    selectedState,
}: {
    selectedState: string | null;
}) {
    const map = useMap();

    useEffect(() => {
        if (!selectedState) {
            map.fitBounds(
                INDIA_BOUNDS,
                {
                    padding: [
                        20,
                        20,
                    ],
                },
            );

            return;
        }

        const center =
            Object.entries(
                INDIA_STATE_CENTER,
            ).find(
                ([state]) =>
                    statesMatch(
                        state,
                        selectedState,
                    ),
            )?.[1];

        if (center) {
            map.setView(
                center,
                6,
                {
                    animate: true,
                },
            );
        }
    }, [
        map,
        selectedState,
    ]);

    return null;
}

/* =========================================================
   MAIN MAP COMPONENT
========================================================= */

export default function ProjectMap() {
    const [
        selectedState,
        setSelectedState,
    ] = useState<string | null>(
        null,
    );

    const [
        geoJson,
        setGeoJson,
    ] =
        useState<GeoJsonCollection | null>(
            null,
        );

    const [
        projects,
        setProjects,
    ] = useState<
        GeographicProject[]
    >([]);

    const [
        loadingMap,
        setLoadingMap,
    ] = useState(true);

    const [
        loadingProjects,
        setLoadingProjects,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState<string | null>(
        null,
    );

    /* =====================================================
       LOAD INDIA GEOJSON
    ===================================================== */

    useEffect(() => {
        let cancelled = false;

        async function loadGeoJson() {
            try {
                setLoadingMap(true);
                setError(null);

                const response =
                    await fetch(
                        indiaStatesUrl,
                    );

                if (!response.ok) {
                    throw new Error(
                        `Failed to load India state map (${response.status}).`,
                    );
                }

                const data =
                    (await response.json()) as GeoJsonCollection;

                if (!cancelled) {
                    setGeoJson(data);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load India state map.",
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingMap(false);
                }
            }
        }

        void loadGeoJson();

        return () => {
            cancelled = true;
        };
    }, []);

    /* =====================================================
       LOAD PROJECTS ONLY WHEN A STATE IS SELECTED
    ===================================================== */

    useEffect(() => {
        let cancelled = false;

        /*
         * IMPORTANT:
         * All India view = NO project API call.
         */
        if (!selectedState) {
            setProjects([]);
            setLoadingProjects(false);
            setError(null);

            return () => {
                cancelled = true;
            };
        }

        async function loadProjects() {
            setLoadingProjects(true);
            setError(null);

            try {
                const response =
                    await getGeographicProjects(
                        selectedState,
                    );

                if (!cancelled) {
                    setProjects(
                        response.projects ??
                            [],
                    );
                }
            } catch (err) {
                if (!cancelled) {
                    setProjects([]);

                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load geographic projects.",
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingProjects(
                        false,
                    );
                }
            }
        }

        void loadProjects();

        return () => {
            cancelled = true;
        };
    }, [
        selectedState,
    ]);

    /* =====================================================
       PROJECT MARKER POSITIONS
    ===================================================== */

    const positionedProjects =
        useMemo(() => {
            /*
             * INDIA VIEW:
             * Always zero project dots.
             */
            if (
                !selectedState ||
                !projects.length
            ) {
                return [];
            }

            const positions =
                generateProjectPositions(
                    selectedState,
                    projects.length,
                );

            return projects
                .map(
                    (
                        project,
                        index,
                    ) => {
                        const position =
                            positions[
                                index
                            ];

                        if (!position) {
                            return null;
                        }

                        return {
                            project,
                            position,
                        };
                    },
                )
                .filter(
                    (
                        item,
                    ): item is {
                        project: GeographicProject;
                        position: LatLng;
                    } =>
                        item !== null,
                );
        }, [
            selectedState,
            projects,
        ]);

    /* =====================================================
       LOADING MAP
    ===================================================== */

    if (
        loadingMap ||
        !geoJson
    ) {
        return (
            <div className="flex h-[620px] items-center justify-center bg-slate-50">
                <div className="text-sm text-slate-500">
                    Loading India map...
                </div>
            </div>
        );
    }

    /* =====================================================
       RENDER
    ===================================================== */

    return (
        <div className="relative w-full">
            {/* =================================================
               INFO PANEL
            ================================================= */}

            <div className="absolute left-4 top-4 z-[1000] w-[290px] rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Geographic View
                </div>

                <div className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedState ??
                        "All India"}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                    {!selectedState
                        ? "Select a state to view projects."
                        : loadingProjects
                          ? "Loading projects..."
                          : `${projects.length.toLocaleString()} projects`}
                </div>

                {error && (
                    <div className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs leading-4 text-red-600">
                        {error}
                    </div>
                )}

                {selectedState && (
                    <button
                        type="button"
                        onClick={() => {
                            setProjects(
                                [],
                            );

                            setSelectedState(
                                null,
                            );

                            setError(
                                null,
                            );
                        }}
                        className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                        Reset to India
                    </button>
                )}
            </div>

            {/* =================================================
               RISK LEGEND
            ================================================= */}

            <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Risk Level
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600">
                    {[
                        [
                            "CRITICAL",
                            "#991b1b",
                        ],
                        [
                            "HIGH",
                            "#dc2626",
                        ],
                        [
                            "MEDIUM",
                            "#d97706",
                        ],
                        [
                            "LOW",
                            "#16a34a",
                        ],
                    ].map(
                        ([
                            label,
                            color,
                        ]) => (
                            <div
                                key={
                                    label
                                }
                                className="flex items-center gap-2"
                            >
                                <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{
                                        backgroundColor:
                                            color,
                                    }}
                                />

                                <span>
                                    {
                                        label
                                    }
                                </span>
                            </div>
                        ),
                    )}
                </div>
            </div>

            {/* =================================================
               MAP
            ================================================= */}

            <MapContainer
                center={
                    INDIA_CENTER
                }
                zoom={5}
                minZoom={4}
                maxZoom={10}
                maxBounds={
                    INDIA_BOUNDS
                }
                maxBoundsViscosity={
                    1
                }
                scrollWheelZoom
                className="h-[620px] w-full"
            >
                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapViewportController
                    selectedState={
                        selectedState
                    }
                />

                {/* =================================================
                   INDIA STATE POLYGONS
                ================================================= */}

                <GeoJSON
                    key={
                        selectedState ??
                        "india"
                    }
                    data={
                        geoJson as never
                    }
                    style={(
                        feature,
                    ) => {
                        const stateName =
                            feature
                                ? getStateName(
                                      feature as GeoJsonFeature,
                                  )
                                : "";

                        const isSelected =
                            selectedState !==
                                null &&
                            statesMatch(
                                stateName,
                                selectedState,
                            );

                        return {
                            color:
                                isSelected
                                    ? "#0f172a"
                                    : "#64748b",

                            weight:
                                isSelected
                                    ? 2.5
                                    : 1,

                            fillColor:
                                isSelected
                                    ? "#cbd5e1"
                                    : "#f8fafc",

                            fillOpacity:
                                isSelected
                                    ? 0.72
                                    : 0.48,
                        };
                    }}
                    onEachFeature={(
                        feature,
                        layer,
                    ) => {
                        const stateName =
                            getStateName(
                                feature as GeoJsonFeature,
                            );

                        layer.bindTooltip(
                            stateName,
                            {
                                sticky: true,
                                direction:
                                    "top",
                            },
                        );

                        layer.on({
                            click: () => {
                                const matchedState =
                                    Object.keys(
                                        INDIA_STATE_CENTER,
                                    ).find(
                                        (
                                            knownState,
                                        ) =>
                                            statesMatch(
                                                knownState,
                                                stateName,
                                            ),
                                    );

                                /*
                                 * If a state has a known
                                 * center, use canonical
                                 * state name.
                                 */
                                setSelectedState(
                                    matchedState ??
                                        stateName,
                                );

                                setError(
                                    null,
                                );
                            },

                            mouseover: (
                                event,
                            ) => {
                                const target =
                                    event.target as L.Path;

                                target.setStyle(
                                    {
                                        weight: 2.5,
                                        color: "#334155",
                                        fillOpacity: 0.72,
                                    },
                                );
                            },

                            mouseout: (
                                event,
                            ) => {
                                const target =
                                    event.target as L.Path;

                                const isSelected =
                                    selectedState !==
                                        null &&
                                    statesMatch(
                                        stateName,
                                        selectedState,
                                    );

                                target.setStyle(
                                    {
                                        weight:
                                            isSelected
                                                ? 2.5
                                                : 1,

                                        color:
                                            isSelected
                                                ? "#0f172a"
                                                : "#64748b",

                                        fillOpacity:
                                            isSelected
                                                ? 0.72
                                                : 0.48,
                                    },
                                );
                            },
                        });
                    }}
                />

                {/* =================================================
                   PROJECT MARKERS

                   IMPORTANT:
                   These are rendered ONLY when selectedState
                   exists.
                ================================================= */}

                {selectedState &&
                    positionedProjects.map(
                        ({
                            project,
                            position,
                        }) => (
                            <Marker
                                key={
                                    project.project_code
                                }
                                position={
                                    position
                                }
                                icon={createProjectIcon(
                                    project.risk_level,
                                )}
                                zIndexOffset={
                                    1000
                                }
                                eventHandlers={{
                                    /*
                                     * Hover:
                                     * open popup.
                                     */
                                    mouseover: (
                                        event,
                                    ) => {
                                        const marker =
                                            event.target as L.Marker;

                                        marker.openPopup();
                                    },

                                    /*
                                     * Click:
                                     * also open popup.
                                     */
                                    click: (
                                        event,
                                    ) => {
                                        const marker =
                                            event.target as L.Marker;

                                        marker.openPopup();
                                    },
                                }}
                            >
                                <Popup
                                    closeButton
                                    autoPan
                                    autoPanPadding={[
                                        50,
                                        50,
                                    ]}
                                    maxWidth={
                                        340
                                    }
                                >
                                    <div className="min-w-[270px] max-w-[310px]">
                                        {/* PROJECT NAME */}
                                        <div className="text-sm font-semibold leading-5 text-slate-900">
                                            {
                                                project.project_name
                                            }
                                        </div>

                                        {/* PROJECT CODE */}
                                        <div className="mt-1 text-xs text-slate-500">
                                            Project
                                            Code:
                                            {" "}
                                            {
                                                project.project_code
                                            }
                                        </div>

                                        {/* RISK */}
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <div className="rounded-lg bg-slate-50 p-2.5">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Risk
                                                    Score
                                                </div>

                                                <div className="mt-1 text-sm font-bold text-slate-900">
                                                    {project.risk_score !==
                                                    null
                                                        ? project.risk_score.toFixed(
                                                              1,
                                                          )
                                                        : "N/A"}
                                                </div>
                                            </div>

                                            <div className="rounded-lg bg-slate-50 p-2.5">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Risk
                                                    Level
                                                </div>

                                                <div
                                                    className="mt-1 text-sm font-bold"
                                                    style={{
                                                        color: riskColor(
                                                            project.risk_level,
                                                        ),
                                                    }}
                                                >
                                                    {
                                                        project.risk_level ??
                                                        "N/A"
                                                    }
                                                </div>
                                            </div>
                                        </div>

                                        {/* PROGRESS + DELAY */}
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <div className="rounded-lg bg-slate-50 p-2.5">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Progress
                                                </div>

                                                <div className="mt-1 text-sm font-semibold text-slate-900">
                                                    {project.physical_progress_pct !==
                                                    null
                                                        ? `${project.physical_progress_pct.toFixed(
                                                              1,
                                                          )}%`
                                                        : "N/A"}
                                                </div>
                                            </div>

                                            <div className="rounded-lg bg-slate-50 p-2.5">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Delay
                                                </div>

                                                <div className="mt-1 text-sm font-semibold text-slate-900">
                                                    {project.delay_days !==
                                                    null
                                                        ? `${Math.round(
                                                              project.delay_days,
                                                          )} days`
                                                        : "N/A"}
                                                </div>
                                            </div>
                                        </div>

                                        {/* DETAILS */}
                                        <div className="mt-3 border-t border-slate-100 pt-3">
                                            <div className="text-xs leading-5 text-slate-500">
                                                <span className="font-semibold text-slate-700">
                                                    State:
                                                </span>{" "}
                                                {
                                                    project.state
                                                }
                                            </div>

                                            <div className="text-xs leading-5 text-slate-500">
                                                <span className="font-semibold text-slate-700">
                                                    Sector:
                                                </span>{" "}
                                                {project.sector ??
                                                    "Not available"}
                                            </div>

                                            <div className="text-xs leading-5 text-slate-500">
                                                <span className="font-semibold text-slate-700">
                                                    Ministry:
                                                </span>{" "}
                                                {project.ministry ??
                                                    "Not available"}
                                            </div>

                                            <div className="text-xs leading-5 text-slate-500">
                                                <span className="font-semibold text-slate-700">
                                                    Cost
                                                    Overrun:
                                                </span>{" "}
                                                {project.cost_overrun_pct !==
                                                null
                                                    ? `${project.cost_overrun_pct.toFixed(
                                                          1,
                                                      )}%`
                                                    : "N/A"}
                                            </div>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ),
                    )}
            </MapContainer>
        </div>
    );
}