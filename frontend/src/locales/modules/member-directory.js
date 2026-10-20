const strings={
 'Always the 5th of the month after the billing period.':'Siempre el día 5 del mes siguiente al periodo de cobro.',
 'Search by name, member number or DNI/NIE':'Buscar por nombre, número de socio o DNI/NIE',
 'Member state':'Estado del socio','Account link':'Vinculación de cuenta','Fee status':'Estado de cuota','All members':'Todos los socios','Member pages':'Páginas de socios','Previous page':'Anterior','Next page':'Siguiente','Showing {0}–{1} of {2}':'Mostrando {0}–{1} de {2}'
};
export const memberDirectoryStrings=language=>Object.fromEntries(Object.entries(strings).map(([key,value])=>[key,language==='es'?value:key]));
