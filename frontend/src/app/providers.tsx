import {
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";

import type { ReactNode } from "react";
import { useState } from "react";

interface AppProvidersProps {
    children: ReactNode;
}

export default function AppProviders({
    children,
}: AppProvidersProps) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        /*
                         * Keep fetched data fresh for 5 minutes.
                         * Moving between dashboard sections will
                         * reuse cached data instead of immediately
                         * requesting it again.
                         */
                        staleTime:
                            5 * 60 * 1000,

                        /*
                         * Keep unused queries in memory for 30 minutes.
                         */
                        gcTime:
                            30 * 60 * 1000,

                        /*
                         * Do not retry repeatedly on every request.
                         */
                        retry: 1,

                        /*
                         * Do not refetch just because browser
                         * window/tab becomes active again.
                         */
                        refetchOnWindowFocus:
                            false,

                        /*
                         * Do not automatically refetch whenever
                         * a route/component mounts again while
                         * cached data already exists.
                         */
                        refetchOnMount:
                            false,

                        /*
                         * Avoid another automatic request after
                         * network reconnect.
                         */
                        refetchOnReconnect:
                            false,
                    },
                },
            }),
    );

    return (
        <QueryClientProvider
            client={queryClient}
        >
            {children}
        </QueryClientProvider>
    );
}