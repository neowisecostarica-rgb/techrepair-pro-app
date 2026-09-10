const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	const canonicalAppId = import.meta.env.VITE_BASE44_APP_ID;
	const incomingParams = isNode ? new URLSearchParams() : new URLSearchParams(window.location.search);
	const requestedAppId = incomingParams.get('app_id');

	// This build belongs to one Base44 app. Never let a link from another TRP
	// clone replace its runtime identity or persist that clone's bearer token.
	if (requestedAppId && canonicalAppId && requestedAppId !== canonicalAppId) {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
		incomingParams.delete('app_id');
		incomingParams.delete('access_token');
		const cleanUrl = `${window.location.pathname}${incomingParams.toString() ? `?${incomingParams.toString()}` : ''}${window.location.hash}`;
		window.history.replaceState({}, document.title, cleanUrl);
	}

	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}
	return {
		appId: canonicalAppId,
		token: requestedAppId && canonicalAppId && requestedAppId !== canonicalAppId
			? null
			: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl: getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL }),
	}
}


export const appParams = {
	...getAppParams()
}
