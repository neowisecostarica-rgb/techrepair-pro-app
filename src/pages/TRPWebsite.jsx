import React from 'react';
import { useI18n } from '@/i18n';
import { getPublicSiteConfig } from '@/api/identity';
import { ArrowRight, Check, ShieldCheck, Workflow, History, Building2, Users, Monitor, Quote, Wrench, FileCheck2, BarChart3, Layers3, Headphones, ChevronRight } from 'lucide-react';

const Button = ({ children, secondary = false, href = '#contacto' }) => (
  <a href={href} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${secondary ? 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50' : 'bg-teal-600 text-white hover:bg-teal-500'}`}>{children}</a>
);

const ProductVisual = ({ title, caption, imageUrl, t }) => imageUrl
  ? <figure className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl"><img src={imageUrl} alt={title} className="aspect-[16/10] w-full object-cover" /><figcaption className="px-4 py-3 text-xs text-slate-500">{caption}</figcaption></figure>
  : <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-slate-900 p-4 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(20,184,166,.18),transparent_32%)]" />
      <div className="relative rounded-2xl border border-white/10 bg-slate-950/80 p-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-500/15 text-[10px] font-bold text-teal-300">TRP</span>
          <span className="text-xs font-semibold text-slate-300">{title}</span>
          <span className="ml-auto rounded-full bg-teal-500/10 px-2 py-1 text-[9px] uppercase tracking-wider text-teal-300">{t('website.hero.visualEnOperacion')}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
          <div className="hidden space-y-2 rounded-xl bg-white/[.03] p-3 sm:block">
            {[t('website.hero.visualMiDia'), t('website.hero.visualTaller'), t('website.hero.visualClientes'), t('website.hero.visualActivos'), t('website.hero.visualNegocio')].map((x, i) => (
              <div key={x} className={`rounded-lg px-2 py-2 text-[10px] ${i === 1 ? 'bg-teal-500/15 text-teal-300' : 'text-slate-500'}`}>{x}</div>
            ))}
          </div>
          <div>
            <div className="mb-3 flex items-end justify-between">
              <div><div className="h-2 w-24 rounded bg-white/20" /><div className="mt-2 h-2 w-40 rounded bg-white/10" /></div>
              <div className="h-8 w-20 rounded-lg bg-teal-500/20" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[t('website.hero.visualPorRecibir'), t('website.hero.visualEnProceso'), t('website.hero.visualPorEntregar')].map((x, i) => (
                <div key={x} className="rounded-xl border border-white/5 bg-white/[.04] p-3">
                  <div className="text-[9px] text-slate-500">{x}</div>
                  <div className="mt-2 text-xl font-semibold text-white">{[4, 7, 3][i]}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-white/5 bg-white/[.04] p-3">
              <div className="mb-3 flex justify-between text-[9px] text-slate-500">
                <span>{t('website.hero.visualOrden')}</span>
                <span>{t('website.hero.visualSiguiente')}</span>
              </div>
              <div className="h-2 w-full rounded bg-white/10" />
              <div className="mt-2 h-2 w-3/4 rounded bg-teal-500/20" />
            </div>
          </div>
        </div>
      </div>
      <p className="relative mt-3 text-[11px] text-slate-500">{caption}</p>
    </div>;

export default function TRPWebsite() {
  const { t } = useI18n();
  const [contactEmail, setContactEmail] = React.useState('');

  React.useEffect(() => {
    getPublicSiteConfig().then(config => setContactEmail(config?.contact_email?.trim() || '')).catch(() => setContactEmail(''));
  }, []);

  const visuals = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem('trpWebsiteVisualDraft') || '{}'); } catch { return {}; }
  }, []);

  React.useEffect(() => {
    document.title = t('website.meta.title');
    const setMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
      el.content = content;
    };
    setMeta('description', t('website.meta.description'));
    setMeta('robots', 'index, follow');
    const setProperty = (property, content) => {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
      el.content = content;
    };
    setProperty('og:title', t('website.meta.ogTitle'));
    setProperty('og:description', t('website.meta.ogDescription'));
    setProperty('og:type', 'website');
  }, [t]);

  const plans = [
    { name: 'Core', price: t('website.plans.corePrice'), annual: t('website.plans.coreAnnual'), text: t('website.plans.coreText'), items: t('website.plans.coreItems'), featured: false },
    { name: 'Business', price: t('website.plans.businessPrice'), annual: t('website.plans.businessAnnual'), text: t('website.plans.businessText'), items: t('website.plans.businessItems'), featured: true },
    { name: 'Enterprise', price: t('website.plans.enterprisePrice'), annual: t('website.plans.enterpriseAnnual'), text: t('website.plans.enterpriseText'), items: t('website.plans.enterpriseItems'), featured: false },
  ];

  return (
    <main id="contenido" className="min-h-screen bg-[#f7f8f8] text-slate-950 selection:bg-teal-200">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-slate-950">{t('website.skipLink')}</a>

      <nav aria-label="Navegación principal" className="sticky top-0 z-50 border-b border-slate-200/70 bg-[#f7f8f8]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <a href="#top" className="flex items-center gap-3" aria-label="TRP, inicio">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">TRP</span>
            <span className="hidden text-sm font-semibold sm:block">Technology Reliability Platform</span>
          </a>
          <div className="hidden gap-6 text-sm text-slate-600 lg:flex">
            <a href="#producto">{t('website.nav.product')}</a>
            <a href="#flujo">{t('website.nav.howItWorks')}</a>
            <a href="#equipos">{t('website.nav.forWhom')}</a>
            <a href="#planes">{t('website.nav.plans')}</a>
            <a href="#enterprise">{t('website.nav.enterprise')}</a>
          </div>
          <Button>{t('website.nav.demo')} <ArrowRight size={15} /></Button>
        </div>
      </nav>

      <section id="top" className="overflow-hidden bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-16 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:py-28">
          <div className="self-center">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.25em] text-teal-400">{t('website.hero.eyebrow')}</p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-.05em] sm:text-6xl lg:text-7xl">{t('website.hero.title')}</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">{t('website.hero.subtitle')}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button>{t('website.hero.cta')} <ArrowRight size={15} /></Button>
              <Button secondary href="#flujo">{t('website.hero.ctaSecondary')}</Button>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
              <span>{t('website.hero.tag1')}</span>
              <span>{t('website.hero.tag2')}</span>
              <span>{t('website.hero.tag3')}</span>
              <span>{t('website.hero.tag4')}</span>
            </div>
          </div>
          <ProductVisual imageUrl={visuals.hero} title={t('website.hero.visualTitle')} caption={t('website.hero.visualCaption')} t={t} />
        </div>
      </section>

      <section id="producto" className="mx-auto max-w-7xl px-5 py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-700">{t('website.problem.eyebrow')}</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">{t('website.problem.title')}</h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">{t('website.problem.body')}</p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            [Workflow, t('website.problem.card1Title'), t('website.problem.card1Desc')],
            [History, t('website.problem.card2Title'), t('website.problem.card2Desc')],
            [Users, t('website.problem.card3Title'), t('website.problem.card3Desc')],
          ].map(([I, title, desc]) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-7">
              <I className="text-teal-700" />
              <h3 className="mt-8 text-xl font-semibold">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="flujo" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:py-24">
          <div className="grid gap-14 lg:grid-cols-2">
            <ProductVisual imageUrl={visuals.expediente} title={t('website.flow.visualTitle')} caption={t('website.flow.visualCaption')} t={t} />
            <div className="self-center">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-700">{t('website.flow.eyebrow')}</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-.04em]">{t('website.flow.title')}</h2>
              <div className="mt-8 space-y-5">
                {[
                  ['01', t('website.flow.step1Title'), t('website.flow.step1Desc')],
                  ['02', t('website.flow.step2Title'), t('website.flow.step2Desc')],
                  ['03', t('website.flow.step3Title'), t('website.flow.step3Desc')],
                  ['04', t('website.flow.step4Title'), t('website.flow.step4Desc')],
                  ['05', t('website.flow.step5Title'), t('website.flow.step5Desc')],
                ].map(([n, title, desc]) => (
                  <div key={n} className="grid grid-cols-[42px_1fr] gap-4">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">{n}</span>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="equipos" className="mx-auto max-w-7xl px-5 py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-700">{t('website.roles.eyebrow')}</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-.04em]">{t('website.roles.title')}</h2>
            <p className="mt-5 leading-7 text-slate-600">{t('website.roles.body')}</p>
          </div>
          <ProductVisual imageUrl={visuals.hoy} title={t('website.roles.visualTitle')} caption={t('website.roles.visualCaption')} t={t} />
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            [Wrench, t('website.roles.role1Title'), t('website.roles.role1Desc')],
            [Monitor, t('website.roles.role2Title'), t('website.roles.role2Desc')],
            [BarChart3, t('website.roles.role3Title'), t('website.roles.role3Desc')],
            [Building2, t('website.roles.role4Title'), t('website.roles.role4Desc')],
          ].map(([I, title, desc]) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-7">
              <I className="text-teal-700" />
              <h3 className="mt-7 font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-100">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <ShieldCheck size={34} className="text-teal-700" />
            <h2 className="mt-6 text-4xl font-semibold tracking-[-.04em]">{t('website.control.title')}</h2>
            <p className="mt-5 leading-7 text-slate-600">{t('website.control.body')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [t('website.control.card1Title'), t('website.control.card1Desc')],
              [t('website.control.card2Title'), t('website.control.card2Desc')],
              [t('website.control.card3Title'), t('website.control.card3Desc')],
              [t('website.control.card4Title'), t('website.control.card4Desc')],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-2xl bg-white p-6">
                <Check size={18} className="text-teal-700" />
                <p className="mt-5 font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planes" className="mx-auto max-w-7xl px-5 py-16 sm:py-24">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-700">{t('website.plans.eyebrow')}</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-.04em]">{t('website.plans.title')}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">{t('website.plans.body')}</p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map(p => (
            <article key={p.name} className={`rounded-[30px] p-8 ${p.featured ? 'bg-slate-950 text-white shadow-2xl' : 'border border-slate-200 bg-white'}`}>
              <p className="text-sm font-semibold text-teal-500">TRP {p.name}</p>
              <div className="mt-5 text-4xl font-semibold">{p.price}</div>
              <p className="mt-2 text-sm opacity-60">{p.annual}</p>
              <p className="mt-6 min-h-20 leading-7 opacity-75">{p.text}</p>
              <div className="mt-7 space-y-3">
                {p.items.map(x => <p key={x} className="flex gap-2 text-sm"><Check size={16} className="mt-0.5 shrink-0 text-teal-500" />{x}</p>)}
              </div>
              <div className="mt-8">
                <Button secondary={!p.featured}>{t('website.plans.cta')} {p.name} <ArrowRight size={14} /></Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="enterprise" className="bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-400">{t('website.enterprise.eyebrow')}</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">{t('website.enterprise.title')}</h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">{t('website.enterprise.body')}</p>
            <div className="mt-8">
              <Button>{t('website.enterprise.cta')} <ArrowRight size={15} /></Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [Layers3, t('website.enterprise.card1Title'), t('website.enterprise.card1Desc')],
              [FileCheck2, t('website.enterprise.card2Title'), t('website.enterprise.card2Desc')],
              [Headphones, t('website.enterprise.card3Title'), t('website.enterprise.card3Desc')],
              [Workflow, t('website.enterprise.card4Title'), t('website.enterprise.card4Desc')],
            ].map(([I, title, desc]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[.04] p-6">
                <I className="text-teal-400" />
                <p className="mt-5 font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <Quote className="text-teal-700" />
            <h2 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-.04em]">{t('website.quote.title')}</h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">{t('website.quote.body')}</p>
          </div>
          <ProductVisual imageUrl={visuals.activo} title={t('website.quote.visualTitle')} caption={t('website.quote.visualCaption')} t={t} />
        </div>
      </section>

      <section id="contacto" className="bg-teal-700 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-20 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-100">{t('website.contact.eyebrow')}</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-.04em] sm:text-5xl">{t('website.contact.title')}</h2>
            <p className="mt-4 max-w-2xl text-teal-50">{t('website.contact.body')}</p>
          </div>
          {contactEmail
            ? <a href={`mailto:${encodeURIComponent(contactEmail)}?subject=Demo%20TRP`} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-teal-700">{t('website.contact.cta')} <ChevronRight size={16} /></a>
            : <span className="inline-flex min-h-12 items-center rounded-full border border-white/30 px-6 py-3 font-semibold text-white/80">{t('website.contact.contactConfiguring')}</span>}
        </div>
      </section>

      <footer className="bg-slate-950 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>{t('website.footer.brand')}</span>
          <div className="flex flex-wrap gap-4">
            <a href="#producto" className="hover:text-white">{t('website.footer.product')}</a>
            <a href="#planes" className="hover:text-white">{t('website.footer.plans')}</a>
            <a href="#enterprise" className="hover:text-white">{t('website.footer.enterprise')}</a>
            <a href="#top" className="hover:text-white">{t('website.footer.backToTop')}</a>
          </div>
        </div>
      </footer>
    </main>
  );
}