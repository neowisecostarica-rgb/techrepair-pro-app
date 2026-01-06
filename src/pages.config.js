import Dashboard from './pages/Dashboard';
import MiDia from './pages/MiDia';
import OrdenesTrabajo from './pages/OrdenesTrabajo';
import Clientes from './pages/Clientes';
import Inventario from './pages/Inventario';
import PuntoVenta from './pages/PuntoVenta';
import Agenda from './pages/Agenda';
import Reciclaje from './pages/Reciclaje';
import Calidad from './pages/Calidad';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "MiDia": MiDia,
    "OrdenesTrabajo": OrdenesTrabajo,
    "Clientes": Clientes,
    "Inventario": Inventario,
    "PuntoVenta": PuntoVenta,
    "Agenda": Agenda,
    "Reciclaje": Reciclaje,
    "Calidad": Calidad,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};