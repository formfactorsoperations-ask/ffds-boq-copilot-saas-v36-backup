export let cachedAccessToken: string | null = null;
export const setCachedAccessToken = (token: string | null) => { cachedAccessToken = token; };
export const getCachedAccessToken = () => cachedAccessToken;
