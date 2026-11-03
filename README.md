# TRP — Technology Reliability Platform

**Para cualquier nuevo programador o agente: leer primero [AGENTS.md](AGENTS.md) y [la auditoría maestra](docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md).**

Estado al 3 de noviembre de 2026: auditoría comercial y de seguridad documentada; correcciones de código verificadas, pero el acceso autenticado del runtime y P0-AUD-01 aún bloquean la aprobación general. No repetir la auditoría sin evidencia de regresión. Consulta también [docs/README.md](docs/README.md).

---

**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
