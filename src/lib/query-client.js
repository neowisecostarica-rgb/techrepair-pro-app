import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// Un 429 es una cuota agotada: repetir enseguida prolonga el bloqueo.
			retry: (failureCount, error) => {
				const status = error?.response?.status ?? error?.status;
				return status !== 429 && failureCount < 1;
			},
		},
	},
});