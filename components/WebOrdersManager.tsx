import React from 'react';
import { db, functions } from '../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { database } from '../services/storage';
import { collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Search, ShoppingBag, Eye, X, MessageSquare, CheckCircle, Clock, Truck, Loader2, Receipt, Package, FileText, Activity, Download, ExternalLink } from 'lucide-react';
import { fulfillWebOrder, releaseExpiredReservations, isOrderExpired } from '../services/webOrderFulfillment';
import { sendNotificationEmail, sendSaleConfirmationEmail, sendOrderCancelledEmail } from '../services/emailService';
import { useModal } from '../contexts/ModalContext';
import { generarEnvioManual, obtenerEtiquetaPdf } from '../services/correoArgentinoService';


interface WebOrder {
  id: string;
  customerId: string;
  customerEmail: string;
  customerNombre: string;
  customerTelefono: string;
  fecha: string;
  items: {
    productId: string;
    descripcion: string;
    sku: string;
    cantidad: number;
    precioUnitario: number;
    talle?: string;
    color?: string;
    payMethod?: string;
  }[];
  total: number;
  tipoEnvio: 'retiro' | 'envio' | 'envio_sucursal';
  trackingNumber?: string;
  agencyId?: string;
  direccionEnvio?: {
    provincia: string;
    localidad: string;
    calle: string;
    numero: string;
    pisoDepto?: string;
    codigoPostal: string;
    indicaciones?: string;
  };
  estado: 'Pendiente' | 'Enviado' | 'Entregado' | 'Confirmado' | 'Cancelado' | 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'FAILED' | 'REFUNDED';
  costoEnvio?: number;
  metodoPago?: string;
  saleId?: string;
  paymentStatus?: string;
  ualaPlan?: {
    cuotas: number;
    montoCuota: number;
    totalConRecargo: number;
  } | null;
  giftCardUsada?: {
    codigo: string;
    montoUsado: number;
  };
}

interface WebOrdersManagerProps {
  onOrderFulfilled?: () => void;
}

const WebOrdersManager: React.FC<WebOrdersManagerProps> = ({ onOrderFulfilled }) => {
  const { showAlert, showConfirm } = useModal();
  const [orders, setOrders] = React.useState<WebOrder[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isConfirmingSale, setIsConfirmingSale] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('todos');
  const [selectedOrder, setSelectedOrder] = React.useState<WebOrder | null>(null);
  const [isDownloadingLabel, setIsDownloadingLabel] = React.useState(false);
  const [isGeneratingLabel, setIsGeneratingLabel] = React.useState(false);
  const [isCheckingTracking, setIsCheckingTracking] = React.useState(false);
  const [trackingInfo, setTrackingInfo] = React.useState<any | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<string[]>([]);

  const handleSelectAll = (filteredList: WebOrder[]) => {
    if (selectedOrderIds.length === filteredList.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredList.map(o => o.id));
    }
  };

  const handleToggleSelect = (orderId: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleBulkStatusChange = async (newStatus: 'Pendiente' | 'Enviado' | 'Entregado' | 'Confirmado' | 'Cancelado') => {
    if (selectedOrderIds.length === 0) return;
    const ok = await showConfirm(
      `¿Deseás cambiar el estado de ${selectedOrderIds.length} pedidos seleccionados a "${newStatus}"?`,
      'Cambio Masivo de Estado',
      'info'
    );
    if (!ok) return;

    for (const id of selectedOrderIds) {
      const ord = orders.find(o => o.id === id);
      if (ord) {
        await handleUpdateStatus(ord.id, ord.customerId, newStatus);
      }
    }
    setSelectedOrderIds([]);
    showAlert(`Se actualizaron ${selectedOrderIds.length} pedidos a ${newStatus}.`, 'Operación Exitosa', 'success');
  };

  const handleExportPickList = () => {
    const selectedOrdersList = orders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedOrdersList.length === 0) return;

    let csvContent = "ID Pedido,Fecha,Cliente,Email,Telefono,Metodo Pago,Tipo Envio,Direccion,Items,Total\n";
    selectedOrdersList.forEach(o => {
      const itemsStr = o.items.map(i => `${i.descripcion} (${i.talle}/${i.color}) x${i.cantidad}`).join('; ');
      const addressStr = o.direccionEnvio ? `${o.direccionEnvio.calle} ${o.direccionEnvio.numero}, ${o.direccionEnvio.localidad}, ${o.direccionEnvio.provincia}` : 'N/A';
      csvContent += `"${o.id}","${o.fecha}","${o.customerNombre}","${o.customerEmail}","${o.customerTelefono}","${o.metodoPago || ''}","${o.tipoEnvio}","${addressStr}","${itemsStr}",${o.total}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista_empaque_${new Date().toISOString().substring(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConsultarTracking = async (trackingNumber: string) => {
    setIsCheckingTracking(true);
    setTrackingInfo(null);
    try {
      const obtenerTracking = httpsCallable(functions, 'obtenerTracking');
      const response: any = await obtenerTracking({ trackingNumber });
      if (response.data.success && response.data.tracking) {
        setTrackingInfo(response.data.tracking);
      } else {
        showAlert('No se pudieron obtener eventos de seguimiento para la guía: ' + trackingNumber, 'Seguimiento', 'info');
      }
    } catch (error: any) {
      console.error('Error al consultar tracking:', error);
      showAlert(error.message || 'Error al consultar el seguimiento en Correo Argentino.', 'Error de Tracking', 'error');
    } finally {
      setIsCheckingTracking(false);
    }
  };


  const handleGenerarEnvio = async (order: WebOrder) => {
    setIsGeneratingLabel(true);
    try {
      const response = await generarEnvioManual(order.id, order);

      if (response.success && response.trackingNumber) {
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, trackingNumber: response.trackingNumber } : o));
        setSelectedOrder(prev => prev && prev.id === order.id ? { ...prev, trackingNumber: response.trackingNumber } : prev);
        
        const openMiCorreo = await showConfirm(
          `Envío generado y confirmado correctamente en Correo Argentino.\nTracking: ${response.trackingNumber}\n\n¿Deseás ingresar a Mi Correo para gestionar y preparar el envío?`,
          'Envío Confirmado',
          'success'
        );
        if (openMiCorreo) {
          window.open('https://micorreo.correoargentino.com.ar/', '_blank', 'noopener,noreferrer');
        }
      } else {
        throw new Error(response.error || 'Error desconocido al comunicar con MiCorreo.');
      }
    } catch (error: any) {
      console.error('Error al generar envío manual:', error);
      showAlert(error.message || 'Error al generar el envío con MiCorreo.', 'Error', 'error');
    } finally {
      setIsGeneratingLabel(false);
    }
  };

  const handleDownloadLabel = async (orderId: string) => {
    setIsDownloadingLabel(true);
    try {
      const base64Pdf = await obtenerEtiquetaPdf(orderId);
      if (!base64Pdf) {
        throw new Error('No se recibió la etiqueta del correo.');
      }

      const linkSource = base64Pdf.startsWith('data:')
        ? base64Pdf
        : `data:application/pdf;base64,${base64Pdf}`;

      const downloadLink = document.createElement("a");
      const fileName = `etiqueta_${orderId}.pdf`;
      downloadLink.href = linkSource;
      downloadLink.download = fileName;
      downloadLink.click();

    } catch (error: any) {
      console.error('Error al descargar la etiqueta:', error);
      showAlert(error.message || 'No se pudo descargar la etiqueta. Verificá si el pedido fue confirmado en Mi Correo.', 'Error', 'error');
    } finally {
      setIsDownloadingLabel(false);
    }
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const showroomId = database.getShowroomID();
      // Liberar cualquier reserva pendiente que haya superado los 15 minutos
      await releaseExpiredReservations(showroomId).catch(err => console.error('Error al liberar reservas expiradas:', err));

      const ordersCol = collection(db, 'showrooms', showroomId, 'orders');
      const ordersSnap = await getDocs(ordersCol);
      
      const list: WebOrder[] = [];
      ordersSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const finalEstado = isOrderExpired(data) ? 'Cancelado' : data.estado;
        list.push({
          id: docSnap.id,
          ...data,
          estado: finalEstado
        } as WebOrder);
      });

      // Sort by date descending
      list.sort((a, b) => new Date(b.fecha || '').getTime() - new Date(a.fecha || '').getTime());
      setOrders(list);
    } catch (err) {
      console.error('Error fetching web orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchOrders();
  }, []);

  const handleUpdateStatus = async (
    orderId: string,
    customerId: string,
    newStatus: 'Pendiente' | 'Enviado' | 'Entregado' | 'Confirmado' | 'Cancelado'
  ) => {
    try {
      const showroomId = database.getShowroomID();
      const batch = writeBatch(db);
      
      // 1. Actualizar en colección global
      const orderRef = doc(db, 'showrooms', showroomId, 'orders', orderId);
      batch.update(orderRef, { estado: newStatus });

      // 2. Actualizar en la subcolección del cliente si está registrado
      if (customerId && customerId !== 'GUEST') {
        const customerOrderRef = doc(db, 'showrooms', showroomId, 'customers', customerId, 'orders', orderId);
        batch.set(customerOrderRef, { estado: newStatus }, { merge: true });
      }

      await batch.commit();

      if (newStatus === 'Confirmado') {
        const orderToConfirm = orders.find(o => o.id === orderId);
        if (orderToConfirm && orderToConfirm.estado !== 'Confirmado') {
          await sendSaleConfirmationEmail(
            {
              id: orderToConfirm.saleId || orderToConfirm.id,
              fecha: orderToConfirm.fecha,
              metodoPago: orderToConfirm.metodoPago,
              costoEnvio: orderToConfirm.costoEnvio,
              items: orderToConfirm.items || [],
              total: orderToConfirm.total || 0,
              giftCardUsada: orderToConfirm.giftCardUsada
            },
            orderToConfirm.customerNombre,
            orderToConfirm.customerEmail,
            'web'
          );
        }
      } else if (newStatus === 'Cancelado') {
        const orderToCancel = orders.find(o => o.id === orderId);
        if (orderToCancel && orderToCancel.estado !== 'Cancelado') {
          await sendOrderCancelledEmail(
            orderToCancel.id,
            orderToCancel.customerNombre,
            orderToCancel.customerEmail,
            orderToCancel.items || [],
            orderToCancel.total
          );
        }
      }

      // Actualizar estado local
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: newStatus } : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, estado: newStatus } : null);
      }
    } catch (err) {
      console.error('Error updating order status:', err);
      showAlert('Error al actualizar el estado del pedido.', 'Error de Actualización', 'error');
    }
  };

  const handleConfirmSale = async (order: WebOrder) => {
    if (order.saleId) {
      showAlert('Este pedido ya fue registrado en caja.', 'Pedido Registrado', 'warning');
      return;
    }

    const ok = await showConfirm(
      `¿Confirmar venta del pedido #${order.id.substring(0, 8)}?\n\n` +
      `Se descontará el stock y se registrará en caja, ganancias e historial por $${order.total.toLocaleString('es-AR')}.`,
      'Confirmar Venta y Stock',
      'info'
    );
    if (!ok) return;

    setIsConfirmingSale(true);
    try {
      const showroomId = database.getShowroomID();
      const saleId = await fulfillWebOrder(showroomId, order.id, {
        fecha: order.fecha,
        items: order.items,
        total: order.total,
        metodoPago: order.metodoPago,
        costoEnvio: order.costoEnvio,
        giftCardUsada: order.giftCardUsada,
        customerId: order.customerId,
      });

      await sendSaleConfirmationEmail(
        {
          id: saleId || order.id,
          fecha: order.fecha,
          metodoPago: order.metodoPago,
          costoEnvio: order.costoEnvio,
          items: order.items || [],
          total: order.total || 0,
          giftCardUsada: order.giftCardUsada
        },
        order.customerNombre,
        order.customerEmail,
        'web'
      );

      setOrders(prev =>
        prev.map(o =>
          o.id === order.id ? { ...o, saleId, estado: 'Confirmado' as const } : o
        )
      );
      setSelectedOrder(prev =>
        prev && prev.id === order.id
          ? { ...prev, saleId, estado: 'Confirmado' as const }
          : prev
      );
      onOrderFulfilled?.();
      showAlert(`Venta registrada correctamente (${saleId}).`, 'Venta Confirmada', 'success');
    } catch (err) {
      console.error(err);
      showAlert('No se pudo confirmar la venta. Verificá conexión y que el pedido no esté duplicado.', 'Error al Confirmar Venta', 'error');
    } finally {
      setIsConfirmingSale(false);
    }
  };

  const handleContactCustomer = (order: WebOrder) => {
    let msg = `Hola ${order.customerNombre}, te escribimos desde El Ropero Showroom sobre tu pedido web #${order.id.substring(0, 6)}.\n\n`;
    msg += `Estado actual del pedido: *${order.estado.toUpperCase()}*`;
    
    const cleanPhone = order.customerTelefono.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };


  const filteredOrders = React.useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = 
        (o.customerNombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.customerEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.customerTelefono || '').includes(searchTerm) ||
        o.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = 
        statusFilter === 'todos' || 
        o.estado === statusFilter || 
        (statusFilter === 'Pendiente' && o.estado === 'PENDING_PAYMENT') ||
        (statusFilter === 'Cancelado' && ['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(o.estado));
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const getStatusBadge = (status: WebOrder['estado']) => {
    switch (status) {
      case 'Confirmado':
      case 'PAID':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-emerald-300">
            <CheckCircle size={11} /> Confirmado
          </span>
        );
      case 'Pendiente':
      case 'PENDING_PAYMENT':
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-amber-200">
            <Clock size={11} /> Pendiente
          </span>
        );
      case 'Enviado':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-blue-200">
            <Truck size={11} /> Enviado
          </span>
        );
      case 'Entregado':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-emerald-200">
            <CheckCircle size={11} /> Entregado
          </span>
        );
      case 'Cancelado':
      case 'CANCELLED':
      case 'REJECTED':
      case 'EXPIRED':
      case 'FAILED':
      case 'REFUNDED':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-red-200">
            <X size={11} /> Cancelado
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-left selection:bg-stone-900 selection:text-white font-['Inter']">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200/60 pb-4">
        <div>
          <h2 className="font-serif text-2xl italic font-normal text-stone-900">Pedidos Web</h2>
          <p className="text-[9px] text-stone-400 uppercase tracking-[0.18em] mt-0.5 font-light">Visualización y gestión de reservas enviadas por clientes.</p>
        </div>
        <button 
          onClick={fetchOrders}
          className="self-start bg-stone-900 text-white px-5 py-2.5 text-[9px] tracking-[0.18em] uppercase font-medium hover:bg-black transition-colors rounded-xl shadow-2xs"
        >
          Actualizar Lista
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white border border-stone-200/60 p-3.5 rounded-2xl shadow-2xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={14} strokeWidth={1.5} />
          <input
            type="text"
            placeholder="BUSCAR CLIENTE O PEDIDO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-stone-50/50 border border-stone-200/70 py-2 pl-9 pr-3 text-xs uppercase tracking-[0.1em] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-400 transition-colors rounded-xl font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <span className="text-[9px] font-semibold tracking-[0.18em] text-stone-400 uppercase">Filtrar por:</span>
          <div className="flex border border-stone-200/70 rounded-xl overflow-hidden p-0.5 bg-stone-50/50">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'Pendiente', label: 'Pendientes' },
              { id: 'Confirmado', label: 'Confirmados' },
              { id: 'Cancelado', label: 'Cancelados' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-[9px] tracking-[0.15em] uppercase font-medium transition-all rounded-lg ${
                  statusFilter === tab.id 
                    ? 'bg-stone-900 text-white shadow-2xs' 
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Action Bar & Select All Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-100 border border-stone-200/80 p-3 rounded-2xl">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox"
            checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
            onChange={() => handleSelectAll(filteredOrders)}
            className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
            id="select-all-orders"
          />
          <label htmlFor="select-all-orders" className="text-xs uppercase tracking-wider font-semibold text-stone-700 cursor-pointer">
            Seleccionar Todos ({filteredOrders.length})
          </label>
        </div>

        {selectedOrderIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-stone-900 text-white px-2.5 py-1 rounded-md">
              {selectedOrderIds.length} Seleccionados
            </span>
            <button
              onClick={() => handleBulkStatusChange('Confirmado')}
              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[9px] uppercase tracking-widest font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Marcar Confirmado
            </button>
            <button
              onClick={() => handleBulkStatusChange('Enviado')}
              className="px-2.5 py-1 bg-blue-700 hover:bg-blue-600 text-white text-[9px] uppercase tracking-widest font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Marcar Enviado
            </button>
            <button
              onClick={() => handleBulkStatusChange('Cancelado')}
              className="px-2.5 py-1 bg-red-700 hover:bg-red-600 text-white text-[9px] uppercase tracking-widest font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Marcar Cancelado
            </button>
            <button
              onClick={handleExportPickList}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[9px] uppercase tracking-widest font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Download size={11} /> CSV Empaque
            </button>
          </div>
        )}
      </div>

      {/* Orders Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-32 bg-white rounded-2xl border border-stone-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.02)]">
          <ShoppingBag size={30} strokeWidth={1.5} className="mx-auto text-stone-300 mb-3" />
          <p className="text-[10px] tracking-[0.2em] uppercase text-stone-400 font-light">No se encontraron pedidos web</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredOrders.map(order => (
            <div 
              key={order.id}
              className={`border rounded-2xl p-5 transition-all duration-200 ease-out shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-5 ${
                selectedOrderIds.includes(order.id)
                  ? 'bg-amber-50/40 border-stone-400 shadow-sm'
                  : ['Cancelado', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(order.estado) 
                    ? 'bg-stone-50 border-stone-200/60 opacity-60' 
                    : 'bg-white border-stone-200/60 hover:border-stone-300 hover:-translate-y-1 hover:shadow-md'
              }`}
            >
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap gap-2.5 items-center">
                  <input 
                    type="checkbox"
                    checked={selectedOrderIds.includes(order.id)}
                    onChange={() => handleToggleSelect(order.id)}
                    className="w-4 h-4 accent-stone-900 rounded cursor-pointer mr-1"
                  />
                  <span className="font-mono text-xs font-semibold text-stone-900 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200/60">
                    #{order.id.substring(0, 8).toUpperCase()}
                  </span>
                  <span className="text-[10px] tracking-[0.5px] text-stone-400 font-normal font-mono">
                    {new Date(order.fecha).toLocaleString('es-AR')}
                  </span>
                  {getStatusBadge(order.estado)}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-6">
                  <div>
                    <p className="text-[8px] tracking-[0.18em] text-stone-400 uppercase font-semibold">Cliente</p>
                    <p className="text-xs font-semibold text-stone-900 uppercase">{order.customerNombre}</p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.18em] text-stone-400 uppercase font-semibold">Contacto</p>
                    <p className="text-[11px] font-medium text-stone-600">{order.customerEmail} · {order.customerTelefono}</p>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.18em] text-stone-400 uppercase font-semibold">Método Entrega</p>
                    <p className="text-[11px] font-medium text-stone-800 uppercase">
                      {order.tipoEnvio === 'envio' ? '🏠 Envío a domicilio' : '🏢 Retiro local'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 justify-between md:justify-end border-stone-100">
                <div className="text-right">
                  <p className="text-[8px] tracking-[0.18em] text-stone-400 uppercase font-semibold">Total</p>
                  <p className="text-xl font-serif font-normal italic text-stone-900">${order.total.toLocaleString()}</p>
                </div>
                <button 
                  onClick={() => setSelectedOrder(order)}
                  className="bg-stone-50 hover:bg-stone-100 border border-stone-200/70 p-2.5 rounded-xl transition-all shadow-2xs text-stone-700 hover:text-stone-900"
                  title="Ver Detalles"
                >
                  <Eye size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white border border-[#C9B8A8] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in duration-300">
            
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-black/5 p-6 flex justify-between items-center z-10">
              <div>
                <h3 className="font-serif text-2xl italic text-black font-semibold">Detalle del Pedido</h3>
                <p className="text-[9px] text-black/40 uppercase tracking-[2px] mt-0.5 font-bold font-mono">
                  #{selectedOrder.id.toUpperCase()}
                </p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)} 
                className="p-2 hover:bg-[#C9B8A8]/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 sm:p-8 space-y-8 overflow-y-auto">
              
              {/* Order Status Action Panel */}
              <div className="bg-neutral-50 p-6 rounded-xl border border-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[8px] tracking-[1.5px] uppercase text-black/40 font-bold">Estado actual</p>
                  <div className="flex items-center gap-2">{getStatusBadge(selectedOrder.estado)}</div>
                </div>
                <div className="space-y-2">
                  <p className="text-[8px] tracking-[1.5px] uppercase text-black/40 font-bold">Cambiar estado a:</p>
                  <div className="flex border border-black/10 rounded-lg overflow-hidden bg-white flex-wrap">
                    {(['Pendiente', 'Confirmado', 'Cancelado'] as const).map(status => (
                      <button
                        key={status}
                        onClick={() => handleUpdateStatus(selectedOrder.id, selectedOrder.customerId, status)}
                        className={`px-3 py-2 text-[9px] tracking-[1px] uppercase font-bold transition-all ${
                          selectedOrder.estado === status || 
                          (status === 'Pendiente' && selectedOrder.estado === 'PENDING_PAYMENT') ||
                          (status === 'Cancelado' && ['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(selectedOrder.estado))
                            ? 'bg-black text-white' 
                            : 'bg-white text-black hover:bg-neutral-50'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customer Section */}
              <div className="space-y-3">
                <h4 className="text-[10px] tracking-[2px] uppercase text-black/40 font-bold border-b border-black/5 pb-2">Información del Cliente</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12px] uppercase tracking-[0.5px]">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-black">{selectedOrder.customerNombre}</p>
                    <p className="text-black/60 font-medium">{selectedOrder.customerEmail}</p>
                    <p className="text-black/60 font-medium">{selectedOrder.customerTelefono}</p>
                  </div>
                  {['envio', 'envio_sucursal'].includes(selectedOrder.tipoEnvio) && selectedOrder.direccionEnvio && (
                    <div className="space-y-1 bg-[#F5F1EB]/20 p-4 border border-[#C9B8A8]/30 rounded-xl">
                      <p className="text-[9px] font-bold text-black/40 tracking-[1.5px]">Dirección de Envío</p>
                      <p className="font-semibold text-black">
                        {selectedOrder.direccionEnvio.calle} {selectedOrder.direccionEnvio.numero}
                        {selectedOrder.direccionEnvio.pisoDepto && ` · ${selectedOrder.direccionEnvio.pisoDepto}`}
                      </p>
                      <p className="text-black/60 font-medium">{selectedOrder.direccionEnvio.localidad}, {selectedOrder.direccionEnvio.provincia} ({selectedOrder.direccionEnvio.codigoPostal})</p>
                      {selectedOrder.direccionEnvio.indicaciones && (
                        <p className="text-[9px] text-[#A38A70] italic font-semibold mt-1">Indicaciones: {selectedOrder.direccionEnvio.indicaciones}</p>
                      )}
                      {selectedOrder.trackingNumber && (
                        <div className="mt-3 pt-2 border-t border-[#C9B8A8]/30 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-[10px] tracking-[1px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded inline-block">
                              Seguimiento: {selectedOrder.trackingNumber}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleConsultarTracking(selectedOrder.trackingNumber!)}
                                disabled={isCheckingTracking}
                                className="text-[9px] font-bold tracking-[1.5px] uppercase bg-black text-white px-3 py-1.5 rounded hover:bg-neutral-800 transition-colors flex items-center gap-1 disabled:opacity-40"
                              >
                                {isCheckingTracking ? <Loader2 size={10} className="animate-spin" /> : <Activity size={10} />}
                                Ver Tracking
                              </button>
                              <a
                                href="https://micorreo.correoargentino.com.ar/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] font-bold tracking-[1.5px] uppercase bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700 transition-colors flex items-center gap-1"
                              >
                                <ExternalLink size={10} />
                                Ir a Mi Correo
                              </a>
                            </div>
                          </div>

                          {trackingInfo && (
                            <div className="bg-white border border-blue-100 rounded-lg p-3 space-y-2 text-[10px] text-left">
                              <p className="font-bold text-blue-950 uppercase tracking-[1px]">Historial de Movimientos</p>
                              {Array.isArray(trackingInfo.event) && trackingInfo.event.length > 0 ? (
                                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                  {trackingInfo.event.map((evt: any, i: number) => (
                                    <div key={i} className="border-l-2 border-blue-500 pl-2 py-0.5">
                                      <p className="font-semibold text-neutral-800">{evt.status || evt.evento}</p>
                                      <p className="text-[9px] text-neutral-500">{evt.date} · {evt.facility || evt.planta}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-neutral-500 italic">No hay eventos registrados aún en Correo Argentino.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedOrder.tipoEnvio === 'retiro' && (
                    <div className="p-4 bg-[#F5F1EB]/20 border border-[#C9B8A8]/30 rounded-xl flex items-center justify-center">
                      <p className="text-[10px] tracking-[1.5px] font-bold text-black/50 text-center">🏢 RETIRO POR LOCAL / SHOWROOM</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Desglose */}
              <div className="space-y-3">
                <h4 className="text-[10px] tracking-[2px] uppercase text-black/40 font-bold border-b border-black/5 pb-2">Prendas Reservadas</h4>
                <div className="divide-y divide-black/5">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="py-4 flex justify-between items-center text-[12px] uppercase tracking-[0.5px]">
                      <div className="space-y-1">
                        <p className="font-semibold text-black">{item.descripcion}</p>
                        <p className="text-black/40 text-[9px] font-bold font-mono">
                          SKU: {item.sku}
                          {item.talle && ` · TALLE: ${item.talle}`}
                          {item.color && ` · COLOR: ${item.color}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-black">{item.cantidad} u. × ${item.precioUnitario.toLocaleString()}</p>
                        <p className="text-[10px] text-black/50 font-semibold font-mono">${(item.cantidad * item.precioUnitario).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Desglose de Totales */}
              <div className="space-y-2 pt-6 border-t border-black/10 text-[11px] tracking-[1px] uppercase">
                <div className="flex justify-between text-black/60 font-medium">
                  <span>Subtotal prendas</span>
                  <span>${selectedOrder.items.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0).toLocaleString('es-AR')}</span>
                </div>
                {selectedOrder.costoEnvio !== undefined && selectedOrder.costoEnvio > 0 && (
                  <div className="flex justify-between text-black/60 font-medium">
                    <span>Costo de envío</span>
                    <span>${selectedOrder.costoEnvio.toLocaleString('es-AR')}</span>
                  </div>
                )}
                {selectedOrder.giftCardUsada && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Descuento Gift Card ({selectedOrder.giftCardUsada.codigo})</span>
                    <span>-${selectedOrder.giftCardUsada.montoUsado.toLocaleString('es-AR')}</span>
                  </div>
                )}
                {selectedOrder.metodoPago === 'Ualá Bis' && selectedOrder.ualaPlan && selectedOrder.ualaPlan.cuotas === 12 && (
                  <div className="flex justify-between text-amber-700 font-semibold">
                    <span>Recargo Financiación (15%)</span>
                    <span>+${Math.round(selectedOrder.ualaPlan.totalConRecargo - (selectedOrder.items.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0) + (selectedOrder.costoEnvio || 0))).toLocaleString('es-AR')}</span>
                  </div>
                )}
                <div className="flex justify-between text-black/60 font-medium border-t border-dashed border-black/5 pt-2">
                  <span>Método de Pago</span>
                  <span className="font-bold text-black">
                    {selectedOrder.metodoPago || 'Efectivo'} 
                    {selectedOrder.metodoPago === 'Ualá Bis' && selectedOrder.ualaPlan && (
                      ` (${selectedOrder.ualaPlan.cuotas} ${selectedOrder.ualaPlan.cuotas === 1 ? 'pago' : 'cuotas'})`
                    )}
                  </span>
                </div>
              </div>

              {/* Total final */}
              <div className="pt-6 border-t border-black/10 flex justify-between items-baseline">
                <span className="text-[12px] tracking-[3px] uppercase font-bold text-black/50">Total Pedido</span>
                <span className="text-[32px] font-bold tracking-tight text-black font-serif">${selectedOrder.total.toLocaleString()}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-6 bg-neutral-50/50 border-t border-black/5 flex flex-col gap-3">
              
              <div className="flex flex-col sm:flex-row gap-3">
                {!selectedOrder.saleId && (
                  <button
                    onClick={() => handleConfirmSale(selectedOrder)}
                    disabled={isConfirmingSale}
                    className="flex-1 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isConfirmingSale ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Receipt size={13} />
                    )}
                    Confirmar venta (caja)
                  </button>
                )}
                <button
                  onClick={() => handleContactCustomer(selectedOrder)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare size={13} /> WhatsApp
                </button>
                
                {selectedOrder.trackingNumber ? (
                  <>
                    <button
                      onClick={() => handleDownloadLabel(selectedOrder.id)}
                      disabled={isDownloadingLabel}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {isDownloadingLabel ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      Etiqueta
                    </button>
                    <a
                      href="https://micorreo.correoargentino.com.ar/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-center"
                    >
                      <ExternalLink size={13} />
                      Ir a Mi Correo
                    </a>
                  </>
                ) : (
                  ['envio', 'envio_sucursal'].includes(selectedOrder.tipoEnvio) && ['Confirmado', 'PAID', 'Pendiente'].includes(selectedOrder.estado) && (
                    <button
                      onClick={() => handleGenerarEnvio(selectedOrder)}
                      disabled={isGeneratingLabel}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {isGeneratingLabel ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Package size={13} />
                      )}
                      Generar Envío
                    </button>
                  )
                )}
              </div>


              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full border border-black/20 hover:border-black text-black py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors"
              >
                Cerrar Detalles
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default WebOrdersManager;
