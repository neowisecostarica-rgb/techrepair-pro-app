export const INTL_LOCALES={es:'es-CR',en:'en-US',pt:'pt-BR',fr:'fr-FR',no:'nb-NO'};
export function intlLocale(locale){return INTL_LOCALES[locale]||INTL_LOCALES.es}
/** @param {string|number|Date} value @param {string} locale @param {Intl.DateTimeFormatOptions} [options] */
export function formatDateTime(value,locale,options={dateStyle:'medium',timeStyle:'short'}){if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat(intlLocale(locale),options).format(d)}
/** @param {string|number|Date} value @param {string} locale @param {Intl.DateTimeFormatOptions} [options] */
export function formatDate(value,locale,options={dateStyle:'medium'}){return formatDateTime(value,locale,options)}
export function formatLongDate(value,locale){return formatDateTime(value,locale,{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
