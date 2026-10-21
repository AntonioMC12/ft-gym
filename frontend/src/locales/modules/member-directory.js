const strings={
 'All dates':'Todas las fechas',
 'Pending renewals':'Renovaciones pendientes',
 'Active monthly members who paid last month and have not fully paid this month, including unissued receipts. Independent of date filters.':'Socios activos con mensualidad que pagaron el mes anterior y aún no han completado el pago del actual, aunque no haya recibo emitido. No depende del filtro de fechas.',
 'Billing month':'Mes de cobro',
 'Monthly receipts cover a calendar month, starting on the 1st.':'Los recibos mensuales corresponden al mes natural, desde el día 1.',
 'Receipt created. No payment has been recorded.':'Recibo creado. Todavía no se ha registrado ningún pago.',
 'Pending payment':'Pendiente de pago',
 'Partially paid':'Pagado parcialmente',
 'Paid':'Pagado',
 'Always the 5th of the month after the billing period.':'Siempre el día 5 del mes siguiente al periodo de cobro.',
 'Search by name, member number or DNI/NIE':'Buscar por nombre, número de socio o DNI/NIE',
 'Member state':'Estado del socio','Account link':'Vinculación de cuenta','Fee status':'Estado de cuota','All members':'Todos los socios','Member pages':'Páginas de socios','Previous page':'Anterior','Next page':'Siguiente','Showing {0}–{1} of {2}':'Mostrando {0}–{1} de {2}'
};
export const memberDirectoryStrings=language=>Object.fromEntries(Object.entries(strings).map(([key,value])=>[key,language==='es'?value:key]));
