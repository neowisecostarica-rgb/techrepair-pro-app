import Agenda from './pages/Agenda';
import Calidad from './pages/Calidad';
import Clientes from './pages/Clientes';
import Dashboard from './pages/Dashboard';
import Inventario from './pages/Inventario';
import MiDia from './pages/MiDia';
import OrdenesTrabajo from './pages/OrdenesTrabajo';
import PuntoVenta from './pages/PuntoVenta';
import Reciclaje from './pages/Reciclaje';
import Saas from './pages/Saas';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Agenda": Agenda,
    "Calidad": Calidad,
    "Clientes": Clientes,
    "Dashboard": Dashboard,
    "Inventario": Inventario,
    "MiDia": MiDia,
    "OrdenesTrabajo": OrdenesTrabajo,
    "PuntoVenta": PuntoVenta,
    "Reciclaje": Reciclaje,
    "Saas": Saas,
    "Settings": Settings,
    "Onboarding": Onboarding,
    "Home": Home,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};