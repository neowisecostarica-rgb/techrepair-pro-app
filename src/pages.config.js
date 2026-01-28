/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
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
import Gastos from './pages/Gastos';
import Proveedores from './pages/Proveedores';
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
    "Gastos": Gastos,
    "Proveedores": Proveedores,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};