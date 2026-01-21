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
import Finanzas from './pages/Finanzas';
import Home from './pages/Home';
import Inventario from './pages/Inventario';
import MiDia from './pages/MiDia';
import MigrationAdmin from './pages/MigrationAdmin';
import MisVentas from './pages/MisVentas';
import Onboarding from './pages/Onboarding';
import Operacion from './pages/Operacion';
import OrdenesTrabajo from './pages/OrdenesTrabajo';
import PortalCliente from './pages/PortalCliente';
import PortalComprobante from './pages/PortalComprobante';
import PortalCotizacion from './pages/PortalCotizacion';
import PortalGarantia from './pages/PortalGarantia';
import ProductividadTecnicos from './pages/ProductividadTecnicos';
import PuntoVenta from './pages/PuntoVenta';
import Reciclaje from './pages/Reciclaje';
import ResumenDiagnostico from './pages/ResumenDiagnostico';
import Saas from './pages/Saas';
import Settings from './pages/Settings';
import VentasCotizaciones from './pages/VentasCotizaciones';
import VentasGarantias from './pages/VentasGarantias';
import VentasHistorial from './pages/VentasHistorial';
import VentasMetricas from './pages/VentasMetricas';
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
    "Finanzas": Finanzas,
    "Home": Home,
    "Inventario": Inventario,
    "MiDia": MiDia,
    "MigrationAdmin": MigrationAdmin,
    "MisVentas": MisVentas,
    "Onboarding": Onboarding,
    "Operacion": Operacion,
    "OrdenesTrabajo": OrdenesTrabajo,
    "PortalCliente": PortalCliente,
    "PortalComprobante": PortalComprobante,
    "PortalCotizacion": PortalCotizacion,
    "PortalGarantia": PortalGarantia,
    "ProductividadTecnicos": ProductividadTecnicos,
    "PuntoVenta": PuntoVenta,
    "Reciclaje": Reciclaje,
    "ResumenDiagnostico": ResumenDiagnostico,
    "Saas": Saas,
    "Settings": Settings,
    "VentasCotizaciones": VentasCotizaciones,
    "VentasGarantias": VentasGarantias,
    "VentasHistorial": VentasHistorial,
    "VentasMetricas": VentasMetricas,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};