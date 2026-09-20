import React from 'react';
export const SUPPORTED_LOCALES=['es','en','pt','fr','no'];
export const LOCALE_LABELS={es:'ES',en:'EN',pt:'PT',fr:'FR',no:'NO'};
const KEY='trp.locale';
const messages={
 es:{loading:'Cargando plataforma...',retry:'Reintentar',logout:'Cerrar sesión',language:'Idioma',temporaryBusy:'Servicio temporalmente saturado'},
 en:{loading:'Loading platform...',retry:'Retry',logout:'Sign out',language:'Language',temporaryBusy:'Service temporarily busy'},
 pt:{loading:'Carregando plataforma...',retry:'Tentar novamente',logout:'Sair',language:'Idioma',temporaryBusy:'Serviço temporariamente sobrecarregado'},
 fr:{loading:'Chargement de la plateforme...',retry:'Réessayer',logout:'Se déconnecter',language:'Langue',temporaryBusy:'Service temporairement saturé'},
 no:{loading:'Laster plattform...',retry:'Prøv igjen',logout:'Logg ut',language:'Språk',temporaryBusy:'Tjenesten er midlertidig belastet'}
};
const Context=React.createContext(null);
function initial(){if(typeof window==='undefined')return'es';const saved=localStorage.getItem(KEY);if(SUPPORTED_LOCALES.includes(saved))return saved;const browser=(navigator.language||'es').toLowerCase();const candidate=browser.startsWith('nb')||browser.startsWith('nn')?'no':browser.slice(0,2);return SUPPORTED_LOCALES.includes(candidate)?candidate:'es'}
export function I18nProvider({children}){const[locale,setState]=React.useState(initial);const setLocale=React.useCallback(next=>{if(!SUPPORTED_LOCALES.includes(next))return;setState(next);try{localStorage.setItem(KEY,next)}catch{}},[]);React.useEffect(()=>{document.documentElement.lang=locale},[locale]);const t=React.useCallback((key,fallback)=>messages[locale]?.[key]??messages.es[key]??fallback??key,[locale]);return <Context.Provider value={{locale,setLocale,t}}>{children}</Context.Provider>}
export function useI18n(){const value=React.useContext(Context);return value||{locale:'es',setLocale:()=>{},t:(k,f)=>messages.es[k]??f??k}}
