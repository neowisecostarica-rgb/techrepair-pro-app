import AdminDashboard from './pages/AdminDashboard';
import AdminSeedCompuStore from './pages/AdminSeedCompuStore';
import Agenda from './pages/Agenda';
import AnalisisTrabajo from './pages/AnalisisTrabajo';
import CRM from './pages/CRM';
import Calidad from './pages/Calidad';
import Clientes from './pages/Clientes';
import ColaRevision from './pages/ColaRevision';
import CrearUsuariosPrueba from './pages/CrearUsuariosPrueba';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Inventario from './pages/Inventario';
import MiDia from './pages/MiDia';
import MigrationAdmin from './pages/MigrationAdmin';
import Onboarding from './pages/Onboarding';
import OrdenesTrabajo from './pages/OrdenesTrabajo';
import PortalCliente from './pages/PortalCliente';
import PortalCotizacion from './pages/PortalCotizacion';
import ProductividadTecnicos from './pages/ProductividadTecnicos';
import PuntoVenta from './pages/PuntoVenta';
import Reciclaje from './pages/Reciclaje';
import Saas from './pages/Saas';
import Settings from './pages/Settings';
import PortalGarantia from './pages/PortalGarantia';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AdminSeedCompuStore": AdminSeedCompuStore,
    "Agenda": Agenda,
    "AnalisisTrabajo": AnalisisTrabajo,
    "CRM": CRM,
    "Calidad": Calidad,
    "Clientes": Clientes,
    "ColaRevision": ColaRevision,
    "CrearUsuariosPrueba": CrearUsuariosPrueba,
    "Dashboard": Dashboard,
    "Home": Home,
    "Inventario": Inventario,
    "MiDia": MiDia,
    "MigrationAdmin": MigrationAdmin,
    "Onboarding": Onboarding,
    "OrdenesTrabajo": OrdenesTrabajo,
    "PortalCliente": PortalCliente,
    "PortalCotizacion": PortalCotizacion,
    "ProductividadTecnicos": ProductividadTecnicos,
    "PuntoVenta": PuntoVenta,
    "Reciclaje": Reciclaje,
    "Saas": Saas,
    "Settings": Settings,
    "PortalGarantia": PortalGarantia,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};