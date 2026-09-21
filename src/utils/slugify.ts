export const slugify = (value: string) => value.toLowerCase().replace(/\s+/g, '-');

const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
export const withBase = (path: string) => {
	if (/^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(path)) return path;
	const normalized = path.startsWith('/') ? path : `/${path}`;
	return `${base}${normalized}`;
};
