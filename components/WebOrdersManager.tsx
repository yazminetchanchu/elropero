import React from 'react';
import { db, functions } from '../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { database } from '../services/storage';
import { collection, getDocs, doc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { Search, ShoppingBag, Eye, X, MessageSquare, CheckCircle, Clock, Truck, Loader2, Receipt, Package, FileText, Activity, Download, ExternalLink, RefreshCw, Gift } from 'lucide-react';
import { fulfillWebOrder, releaseExpiredReservations, isOrderExpired, restoreInventory } from '../services/webOrderFulfillment';
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
    cantidadDevuelta?: number;
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
  estado: 'Pendiente' | 'Enviado' | 'Entregado' | 'Confirmado' | 'Cancelado' | 'PENDING_PAYMENT' | 'pending_transfer' | 'PAID' | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | 'parcialmente_cambiado' | 'Completado';
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
  tipoPedido?: 'compra' | 'cambio_web';
  ordenOrigenId?: string;
  itemsDevueltos?: {
    productId?: string;
    descripcion: string;
    sku?: string;
    cantidad: number;
    talle?: string;
    color?: string;
  }[];
  itemsNuevos?: any[];
  giftCardGenerada?: string;
  isExchanged?: boolean;
}

interface WebOrdersManagerProps {
  onOrderFulfilled?: () => void;
}

const WebOrdersManager: React.FC<WebOrdersManagerProps> = ({ onOrderFulfilled }) => {
  const { showAlert, showConfirm } = useModal();
  const [orders, setOrders] = React.useState<WebOrder[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isConfirmingSale, setIsConfirmingSale] = React.useState(false);
  const [updatingStatusId, setUpdatingStatusId] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('todos');
  const [selectedOrder, setSelectedOrder] = React.useState<WebOrder | null>(null);
  const [isDownloadingLabel, setIsDownloadingLabel] = React.useState(false);
  const [isGeneratingLabel, setIsGeneratingLabel] = React.useState(false);
  const [isCheckingTracking, setIsCheckingTracking] = React.useState(false);
  const [trackingInfo, setTrackingInfo] = React.useState<any | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<string[]>([]);

  const safeConfirm = async (
    param1: string | { message?: string; title?: string; type?: string; confirmText?: string; cancelText?: string },
    param2?: string,
    param3?: 'warning' | 'info' | 'error' | 'success'
  ) => {
    if (typeof param1 === 'object' && param1 !== null) {
      const msg = param1.message || '';
      const title = param1.title || 'Confirmación';
      const rawType = param1.type === 'danger' ? 'error' : (param1.type as any) || 'warning';
      return await showConfirm(msg, title, rawType);
    }
    return await showConfirm(param1, param2, param3);
  };

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
        if (newStatus === 'Confirmado') {
          await handleConfirmSale(ord, true);
        } else {
          await handleUpdateStatus(ord.id, newStatus, { skipConfirm: true, skipAlert: true });
        }
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
    arg2: string,
    arg3?: WebOrder['estado'] | { skipConfirm?: boolean; skipAlert?: boolean },
    arg4?: { skipConfirm?: boolean; skipAlert?: boolean }
  ) => {
    let customerId = '';
    let newStatus: WebOrder['estado'];
    let options: { skipConfirm?: boolean; skipAlert?: boolean } = {};

    const validStatuses = ['Pendiente', 'Enviado', 'Entregado', 'Confirmado', 'Cancelado', 'PENDING_PAYMENT', 'pending_transfer', 'PAID', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED', 'parcialmente_cambiado', 'Completado'];

    if (validStatuses.includes(arg2)) {
      newStatus = arg2 as WebOrder['estado'];
      if (arg3 && typeof arg3 === 'object') {
        options = arg3;
      }
    } else {
      customerId = arg2;
      newStatus = arg3 as WebOrder['estado'];
      if (arg4 && typeof arg4 === 'object') {
        options = arg4;
      }
    }

    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder || currentOrder.estado === newStatus) return;
    if (!customerId) {
      customerId = currentOrder.customerId || '';
    }

    // Confirmación preventiva al cancelar
    if (!options.skipConfirm && newStatus === 'Cancelado') {
      const confirmed = await safeConfirm({
        title: 'Cancelar Pedido',
        message: `¿Estás seguro de que deseas cancelar el pedido #${orderId.substring(0, 8)}? Se liberará el stock reservado al público.`,
        confirmText: 'Sí, cancelar pedido',
        cancelText: 'Volver',
        type: 'danger'
      });
      if (!confirmed) return;
    }

    // Confirmación preventiva al revertir una orden ya confirmada
    if (!options.skipConfirm && (currentOrder.estado === 'Confirmado' || currentOrder.saleId) && newStatus === 'Pendiente') {
      const confirmed = await safeConfirm({
        title: 'Revertir Pedido Confirmado',
        message: `El pedido #${orderId.substring(0, 8)} ya fue registrado como venta en caja. ¿Deseas volverlo a Pendiente?`,
        confirmText: 'Sí, revertir',
        cancelText: 'Volver',
        type: 'warning'
      });
      if (!confirmed) return;
    }

    try {
      setUpdatingStatusId(orderId);
      const showroomId = database.getShowroomID();

      if (newStatus === 'Cancelado') {
        const isAlreadyCancelled = ['Cancelado', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(currentOrder.estado);
        
        if (!isAlreadyCancelled) {
          const showroomRef = doc(db, 'showrooms', showroomId);
          await runTransaction(db, async (transaction) => {
            const srSnap = await transaction.get(showroomRef);
            if (srSnap.exists()) {
              const srData = srSnap.data() || {};
              const currentInv = srData.inventory || [];
              const nextInv = restoreInventory(currentInv, currentOrder.items || []);
              transaction.update(showroomRef, { inventory: nextInv, lastSync: Date.now() });
            }
            const orderRef = doc(db, 'showrooms', showroomId, 'orders', orderId);
            transaction.update(orderRef, { estado: 'Cancelado' });
            if (customerId && customerId !== 'GUEST') {
              const customerOrderRef = doc(db, 'showrooms', showroomId, 'customers', customerId, 'orders', orderId);
              transaction.set(customerOrderRef, { estado: 'Cancelado' }, { merge: true });
            }
          });

          try {
            await sendOrderCancelledEmail(
              currentOrder.id,
              currentOrder.customerNombre,
              currentOrder.customerEmail,
              currentOrder.items || [],
              currentOrder.total
            );
          } catch (e) {
            console.error('Error enviando email de cancelación:', e);
          }
        } else {
          const batch = writeBatch(db);
          const orderRef = doc(db, 'showrooms', showroomId, 'orders', orderId);
          batch.update(orderRef, { estado: newStatus });
          if (customerId && customerId !== 'GUEST') {
            const customerOrderRef = doc(db, 'showrooms', showroomId, 'customers', customerId, 'orders', orderId);
            batch.set(customerOrderRef, { estado: newStatus }, { merge: true });
          }
          await batch.commit();
        }
      } else {
        const batch = writeBatch(db);
        const orderRef = doc(db, 'showrooms', showroomId, 'orders', orderId);
        batch.update(orderRef, { estado: newStatus });

        if (customerId && customerId !== 'GUEST') {
          const customerOrderRef = doc(db, 'showrooms', showroomId, 'customers', customerId, 'orders', orderId);
          batch.set(customerOrderRef, { estado: newStatus }, { merge: true });
        }

        await batch.commit();

        if (newStatus === 'Confirmado') {
          if (currentOrder.estado !== 'Confirmado') {
            try {
              await sendSaleConfirmationEmail(
                {
                  id: currentOrder.saleId || currentOrder.id,
                  fecha: currentOrder.fecha,
                  metodoPago: currentOrder.metodoPago,
                  costoEnvio: currentOrder.costoEnvio,
                  items: currentOrder.items || [],
                  total: currentOrder.total || 0,
                  giftCardUsada: currentOrder.giftCardUsada
                },
                currentOrder.customerNombre,
                currentOrder.customerEmail,
                'web'
              );
            } catch (e) {
              console.error('Error enviando email de confirmación:', e);
            }
          }
        }
      }

      // Actualizar estado local
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: newStatus } : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, estado: newStatus } : null);
      }

      if (!options.skipAlert) {
        if (newStatus === 'Cancelado') {
          showAlert('El pedido ha sido cancelado y el stock fue liberado.', 'Pedido Cancelado', 'info');
        } else {
          showAlert(`El pedido #${orderId.substring(0, 8)} se actualizó a "${newStatus}" correctamente.`, 'Estado Actualizado', 'success');
        }
      }
    } catch (err) {
      console.error('Error al actualizar estado:', err);
      showAlert('No se pudo actualizar el estado del pedido. Verificá la conexión.', 'Error', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleConfirmSale = async (order: WebOrder, skipConfirm: boolean = false) => {
    if (order.saleId) {
      showAlert('Este pedido ya fue registrado en caja.', 'Pedido Registrado', 'warning');
      return;
    }

    if (!skipConfirm) {
      const ok = await showConfirm(
        `¿Confirmar venta del pedido #${order.id.substring(0, 8)}?\n\n` +
        `Se descontará el stock y se registrará en caja, ganancias e historial por $${order.total.toLocaleString('es-AR')}.`,
        'Confirmar Venta y Stock',
        'info'
      );
      if (!ok) return;
    }

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

      try {
        await sendSaleConfirmationEmail(
          {
            id: order.id,
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
      } catch (e) {
        console.error('Error enviando email de confirmación:', e);
      }

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
      showAlert(`Venta registrada correctamente (${saleId}). Se registró en caja y se actualizó el stock.`, 'Venta Confirmada', 'success');
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
        (statusFilter === 'Pendiente' && (o.estado === 'PENDING_PAYMENT' || o.estado === 'pending_transfer')) ||
        (statusFilter === 'Cancelado' && ['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(o.estado)) ||
        (statusFilter === 'parcialmente_cambiado' && o.estado === 'parcialmente_cambiado');
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const getStatusBadge = (status: WebOrder['estado']) => {
    switch (status) {
      case 'pending_transfer':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-amber-300">
            <Clock size={11} /> Pendiente Transferencia (24hs)
          </span>
        );
      case 'parcialmente_cambiado':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-[#F5F0EB] text-[#7C5A3E] text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-[#E3D7CB]">
            <RefreshCw size={11} /> Parcialmente Cambiado
          </span>
        );
      case 'Completado':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-800 text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-neutral-300">
            <CheckCircle size={11} /> Totalmente Cambiado
          </span>
        );
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
          <div className="flex border border-stone-200/70 rounded-xl overflow-hidden p-0.5 bg-stone-50/50 flex-wrap">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'Pendiente', label: 'Pendientes' },
              { id: 'Confirmado', label: 'Confirmados' },
              { id: 'parcialmente_cambiado', label: 'Parcialmente Cambiados' },
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
                  {order.tipoPedido === 'cambio_web' && (
                    <span className="flex items-center gap-1 px-2.5 py-0.5 bg-[#F5F0EB] text-[#7C5A3E] text-[9px] font-bold tracking-[1px] uppercase rounded-full border border-[#E3D7CB]">
                      <RefreshCw size={10} /> Cambio Web
                    </span>
                  )}
                  {order.ordenOrigenId && (
                    <span className="font-mono text-[9px] font-semibold text-stone-500 bg-stone-50 px-2 py-0.5 rounded border border-stone-200">
                      Ref: #{order.ordenOrigenId.substring(0, 8).toUpperCase()}
                    </span>
                  )}
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
              
              {/* Cambio Web Info Banner */}
              {selectedOrder.tipoPedido === 'cambio_web' && (
                <div className="bg-[#FAF7F2] border border-[#E8DFD5] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#F3ECE4] text-[#7C5A3E] rounded-lg">
                      <RefreshCw size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-[#5C3F28] tracking-wider">Pedido generado por Cambio Web</p>
                      <p className="text-[10px] text-[#7C5A3E]">Este pedido fue creado a partir del canje/cambio de prendas de una compra previa.</p>
                    </div>
                  </div>
                  {selectedOrder.ordenOrigenId && (
                    <button
                      type="button"
                      onClick={() => {
                        const orig = orders.find(o => o.id === selectedOrder.ordenOrigenId || (o.saleId && o.saleId === selectedOrder.ordenOrigenId));
                        if (orig) setSelectedOrder(orig);
                        else showAlert(`Orden original asociada: #${selectedOrder.ordenOrigenId.toUpperCase()}`, 'Orden Original', 'info');
                      }}
                      className="px-3 py-1.5 bg-[#7C5A3E] text-white text-[9px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#684930] transition-colors self-start sm:self-auto flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink size={11} /> Ver Orden Origen #{selectedOrder.ordenOrigenId.substring(0, 8).toUpperCase()}
                    </button>
                  )}
                </div>
              )}

              {/* Order Status Action Panel */}
              <div className="bg-neutral-50 p-6 rounded-xl border border-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[8px] tracking-[1.5px] uppercase text-black/40 font-bold">Estado actual</p>
                  <div className="flex items-center gap-2">{getStatusBadge(selectedOrder.estado)}</div>
                </div>
                <div className="space-y-2">
                  <p className="text-[8px] tracking-[1.5px] uppercase text-black/40 font-bold">Cambiar estado a:</p>
                  <div className="flex border border-black/10 rounded-lg overflow-hidden bg-white flex-wrap">
                    {(['Pendiente', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'] as const).map(status => {
                      const isUpdatingThis = updatingStatusId === selectedOrder.id;
                      const isSelected = selectedOrder.estado === status || 
                        (status === 'Pendiente' && (selectedOrder.estado === 'PENDING_PAYMENT' || selectedOrder.estado === 'pending_transfer')) ||
                        (status === 'Cancelado' && ['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(selectedOrder.estado));

                      return (
                        <button
                          key={status}
                          disabled={isConfirmingSale || isUpdatingThis}
                          onClick={() => {
                            if (status === 'Confirmado') {
                              handleConfirmSale(selectedOrder);
                            } else {
                              handleUpdateStatus(selectedOrder.id, status);
                            }
                          }}
                          className={`px-3 py-2 text-[9px] tracking-[1px] uppercase font-bold transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-black text-white' 
                              : 'bg-white text-black hover:bg-neutral-50'
                          }`}
                        >
                          {isUpdatingThis && status !== 'Confirmado' && <Loader2 size={10} className="animate-spin" />}
                          {isConfirmingSale && status === 'Confirmado' && <Loader2 size={10} className="animate-spin" />}
                          {status}
                        </button>
                      );
                    })}
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

              {/* Prendas Devueltas (si es un pedido de cambio) */}
              {selectedOrder.itemsDevueltos && selectedOrder.itemsDevueltos.length > 0 && (
                <div className="space-y-3 bg-red-50/50 p-4 rounded-xl border border-red-100">
                  <h4 className="text-[10px] tracking-[2px] uppercase text-red-800 font-bold border-b border-red-200/60 pb-1.5 flex items-center gap-1.5">
                    <RefreshCw size={12} /> Prendas Devueltas por el Cliente
                  </h4>
                  <div className="divide-y divide-red-100">
                    {selectedOrder.itemsDevueltos.map((item, idx) => (
                      <div key={idx} className="py-2.5 flex justify-between items-center text-[11px] uppercase tracking-[0.5px]">
                        <div className="space-y-0.5 text-left">
                          <p className="font-semibold text-stone-900">{item.descripcion}</p>
                          <p className="text-stone-500 text-[9px] font-mono">
                            {item.sku && `SKU: ${item.sku}`}
                            {item.talle && ` · TALLE: ${item.talle}`}
                            {item.color && ` · COLOR: ${item.color}`}
                          </p>
                        </div>
                        <div className="text-right font-bold text-red-700">
                          {item.cantidad} u. devuelta(s)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Items Desglose */}
              <div className="space-y-3">
                <h4 className="text-[10px] tracking-[2px] uppercase text-black/40 font-bold border-b border-black/5 pb-2">
                  {selectedOrder.tipoPedido === 'cambio_web' ? 'Prendas Nuevas Seleccionadas (Cambio)' : 'Prendas Reservadas'}
                </h4>
                <div className="divide-y divide-black/5">
                  {selectedOrder.items.map((item, idx) => {
                    const cantDev = item.cantidadDevuelta || 0;
                    const cantDisp = item.cantidad - cantDev;

                    return (
                      <div key={idx} className="py-4 flex justify-between items-center text-[12px] uppercase tracking-[0.5px]">
                        <div className="space-y-1 text-left">
                          <p className="font-semibold text-black">{item.descripcion}</p>
                          <p className="text-black/40 text-[9px] font-bold font-mono">
                            SKU: {item.sku}
                            {item.talle && ` · TALLE: ${item.talle}`}
                            {item.color && ` · COLOR: ${item.color}`}
                          </p>
                          {cantDev > 0 && (
                            <div className="mt-1">
                              <span className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 bg-[#F5F0EB] text-[#7C5A3E] rounded border border-[#E3D7CB] inline-block">
                                {cantDisp === 0 ? 'Cambiada totalmente' : `Cambiadas: ${cantDev} u. · Disponibles: ${cantDisp} u.`}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-black">{item.cantidad} u. × ${item.precioUnitario.toLocaleString()}</p>
                          <p className="text-[10px] text-black/50 font-semibold font-mono">${(item.cantidad * item.precioUnitario).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gift Card Generada si aplica */}
              {selectedOrder.giftCardGenerada && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gift size={16} className="text-emerald-700" />
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-900">Gift Card Emitida a Favor</p>
                      <p className="text-[9px] text-emerald-700">Se generó crédito a favor por la diferencia del cambio.</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-white px-3 py-1.5 rounded-lg border border-emerald-300 self-start sm:self-auto">
                    {selectedOrder.giftCardGenerada}
                  </span>
                </div>
              )}

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
                {/* Botón directo Confirmar Pedido */}
                {!selectedOrder.saleId && selectedOrder.estado !== 'Confirmado' && !['Cancelado', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(selectedOrder.estado) && (
                  <button
                    onClick={() => handleConfirmSale(selectedOrder)}
                    disabled={isConfirmingSale || updatingStatusId === selectedOrder.id}
                    className="flex-1 bg-stone-900 hover:bg-black text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isConfirmingSale ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle size={13} className="text-emerald-400" />
                    )}
                    Confirmar Pedido
                  </button>
                )}

                {/* Badge Pedido Confirmado */}
                {(selectedOrder.saleId || selectedOrder.estado === 'Confirmado') && (
                  <div className="flex-1 bg-emerald-50 border border-emerald-200 text-emerald-800 py-4 px-4 text-[10px] tracking-[2px] uppercase font-bold rounded-xl flex items-center justify-center gap-2">
                    <CheckCircle size={14} className="text-emerald-600" />
                    Pedido Confirmado {selectedOrder.saleId ? `(#${selectedOrder.saleId.substring(0, 8)})` : ''}
                  </div>
                )}

                {/* Badge Pedido Cancelado */}
                {['Cancelado', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(selectedOrder.estado) && (
                  <div className="flex-1 bg-red-50 border border-red-200 text-red-700 py-4 px-4 text-[10px] tracking-[2px] uppercase font-bold rounded-xl flex items-center justify-center gap-2">
                    <X size={14} className="text-red-600" />
                    Pedido Cancelado
                  </div>
                )}

                <button
                  onClick={() => handleContactCustomer(selectedOrder)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageSquare size={13} /> WhatsApp
                </button>
                
                {selectedOrder.trackingNumber ? (
                  <>
                    <button
                      onClick={() => handleDownloadLabel(selectedOrder.id)}
                      disabled={isDownloadingLabel}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
                      className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
                className="w-full border border-black/20 hover:border-black text-black py-4 text-[10px] tracking-[3px] uppercase font-bold rounded-xl transition-colors cursor-pointer"
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
