import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// Un 429 es una cuota agotada: repetir enseguida prolonga el bloqueo.
			retry: (failureCount, error) => {
				// Axios/SDK agregan campos HTTP a Error sin declararlos en su tipo base.
				const httpError = /** @type {Error & {response?: {status?: number}, status?: number}} */ (error);
				const status = httpError?.response?.status ?? httpError?.status;
				return status !== 429 && failureCount < 1;
			},
		},
	},
});