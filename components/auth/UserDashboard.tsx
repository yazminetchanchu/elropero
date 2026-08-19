import React from 'react';
import { X, ShoppingBag, MapPin, Heart, User, Trash2, Edit3, Plus, ArrowRight, Loader2, LogOut, CheckCircle, Package, RefreshCw, Gift, ExternalLink } from 'lucide-react';
import { useAuth, ShippingAddress, CustomerOrder } from '../../contexts/AuthContext';
import { InventoryItem, GiftCard } from '../../types';
import { isOrderEligibleForExchange, isGiftCardOrder } from '../../services/webOrderToSale';
import { isOrderExpired } from '../../services/webOrderFulfillment';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useModal } from '../../contexts/ModalContext';


interface UserDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  onAddToCart: (product: InventoryItem, talle?: string, color?: string) => void;
  onRequestExchange: (order: CustomerOrder) => void;
  onRefreshOrders?: () => void;
}

import { getShowroomID } from '../../services/storage';

const PUBLIC_SHOWROOM_ID = getShowroomID();

type ActiveTab = 'compras' | 'direcciones' | 'favoritos' | 'datos';

const UserDashboard: React.FC<UserDashboardProps> = ({
  isOpen,
  onClose,
  inventory,
  onAddToCart,
  onRequestExchange,
  onRefreshOrders,
}) => {
  const { showAlert, showConfirm } = useModal();
  const { customerProfile, orders, logout, updateProfile, removeFromWishlist } = useAuth();
  
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('compras');
  const [comprasSubTab, setComprasSubTab] = React.useState<'actuales' | 'historial'>('actuales');

  const isCancelledOrder = (estado?: string) =>
    ['Cancelado', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(estado || '');
  
  const currentOrders = React.useMemo(() => {
    return (orders || []).filter(o => {
      if (isGiftCardOrder(o)) return false;
      if (isCancelledOrder(o.estado) || isOrderExpired(o)) return false;
      const days = Math.floor((Date.now() - new Date(o.fecha).getTime()) / 86400000);
      return o.estado !== 'Entregado' && days <= 15;
    });
  }, [orders]);

  const pastOrders = React.useMemo(() => {
    return (orders || []).filter(o => {
      if (isGiftCardOrder(o)) return true;
      if (isCancelledOrder(o.estado) || isOrderExpired(o)) return true;
      const days = Math.floor((Date.now() - new Date(o.fecha).getTime()) / 86400000);
      return o.estado === 'Entregado' || days > 15;
    });
  }, [orders]);

  // Mapear wishlist IDs a productos reales
  const wishlistProducts = React.useMemo(() => {
    const list = customerProfile?.wishlist || [];
    return inventory.filter(item => list.includes(item.id));
  }, [customerProfile?.wishlist, inventory]);

  // States for Address Form
  const [showAddressForm, setShowAddressForm] = React.useState(false);
  const [editingAddressId, setEditingAddressId] = React.useState<string | null>(null);
  
  const [calle, setCalle] = React.useState('');
  const [numero, setNumero] = React.useState('');
  const [pisoDepto, setPisoDepto] = React.useState('');
  const [localidad, setLocalidad] = React.useState('');
  const [provincia, setProvincia] = React.useState('');
  const [codigoPostal, setCodigoPostal] = React.useState('');
  const [indicaciones, setIndicaciones] = React.useState('');
  
  // Profile Data Form
  const [nombre, setNombre] = React.useState('');
  const [telefono, setTelefono] = React.useState('');
  
  // UI feedback states
  const [isLoading, setIsLoading] = React.useState(false);
  const [feedbackMsg, setFeedbackMsg] = React.useState<string | null>(null);


  React.useEffect(() => {
    if (customerProfile) {
      setNombre(customerProfile.nombre || '');
      setTelefono(customerProfile.telefono || '');
    }
  }, [customerProfile]);

  if (!isOpen || !customerProfile) return null;

  // Mutación de Direcciones
  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedbackMsg(null);

    try {
      const addresses = [...(customerProfile.direcciones || [])];
      
      const newAddress: ShippingAddress = {
        id: editingAddressId || `addr_${Date.now()}`,
        calle: calle.trim().toUpperCase(),
        numero: numero.trim(),
        pisoDepto: pisoDepto.trim().toUpperCase(),
        localidad: localidad.trim().toUpperCase(),
        provincia: provincia.trim().toUpperCase(),
        codigoPostal: codigoPostal.trim(),
        indicaciones: indicaciones.trim().toUpperCase(),
        esPrincipal: addresses.length === 0 ? true : false // Si es la primera, es principal
      };

      if (editingAddressId) {
        // Editar existente
        const idx = addresses.findIndex(a => a.id === editingAddressId);
        if (idx !== -1) {
          // Mantener si era principal
          newAddress.esPrincipal = addresses[idx].esPrincipal;
          addresses[idx] = newAddress;
        }
      } else {
        // Agregar nueva
        addresses.push(newAddress);
      }

      await updateProfile({ direcciones: addresses });
      setFeedbackMsg(editingAddressId ? 'Dirección actualizada con éxito' : 'Dirección guardada con éxito');
      
      // Reset form
      setShowAddressForm(false);
      setEditingAddressId(null);
      setCalle('');
      setNumero('');
      setPisoDepto('');
      setLocalidad('');
      setProvincia('');
      setCodigoPostal('');
      setIndicaciones('');
      
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (e) {
      console.error(e);
      setFeedbackMsg('Error al procesar dirección');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditAddress = (addr: ShippingAddress) => {
    setEditingAddressId(addr.id);
    setCalle(addr.calle);
    setNumero(addr.numero);
    setPisoDepto(addr.pisoDepto || '');
    setLocalidad(addr.localidad);
    setProvincia(addr.provincia);
    setCodigoPostal(addr.codigoPostal);
    setIndicaciones(addr.indicaciones || '');
    setShowAddressForm(true);
  };

  const handleDeleteAddress = async (id: string) => {
    if (!(await showConfirm('¿Seguro que querés eliminar esta dirección?', 'Eliminar Dirección', 'warning'))) return;
    try {
      let addresses = customerProfile.direcciones.filter(a => a.id !== id);
      // Si eliminamos la principal y quedan otras, hacemos la primera principal
      if (addresses.length > 0 && !addresses.some(a => a.esPrincipal)) {
        addresses[0].esPrincipal = true;
      }
      await updateProfile({ direcciones: addresses });
      setFeedbackMsg('Dirección eliminada');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetPrincipalAddress = async (id: string) => {
    try {
      const addresses = customerProfile.direcciones.map(a => ({
        ...a,
        esPrincipal: a.id === id
      }));
      await updateProfile({ direcciones: addresses });
      setFeedbackMsg('Dirección principal actualizada');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  // Mutación de Perfil Básica
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedbackMsg(null);

    try {
      await updateProfile({
        nombre: nombre.trim().toUpperCase(),
        telefono: telefono.trim()
      });
      setFeedbackMsg('Datos personales actualizados');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (e) {
      console.error(e);
      setFeedbackMsg('Error al guardar datos');
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="fixed inset-0 z-[120] font-['Inter'] select-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      
      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-2xl flex flex-col drawer-slide-in">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 h-20 border-b border-black/5 flex-shrink-0">
          <div className="flex flex-col">
            <span className="text-[12px] tracking-[4px] uppercase font-semibold text-black">Mi Cuenta</span>
            <span className="text-[9px] tracking-[1px] text-black/40 uppercase truncate max-w-[280px]">{customerProfile.email}</span>
          </div>
          <button onClick={onClose} className="opacity-40 hover:opacity-100 transition-opacity">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap border-b border-black/5 bg-neutral-50/50 flex-shrink-0">
          {[
            { id: 'compras', icon: ShoppingBag, label: 'Compras' },
            { id: 'direcciones', icon: MapPin, label: 'Envío' },
            { id: 'favoritos', icon: Heart, label: 'Favoritos' },
            { id: 'datos', icon: User, label: 'Mis Datos' }
          ].map(t => {
            const Icon = t.icon;
            const isSel = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id as ActiveTab); setShowAddressForm(false); }}
                className={`flex-1 py-4 flex flex-col items-center gap-1.5 text-[9px] tracking-[1.5px] uppercase transition-all ${
                  isSel 
                    ? 'bg-white border-b border-black font-semibold text-black' 
                    : 'opacity-40 hover:opacity-100 text-black hover:bg-neutral-50/20'
                }`}
              >
                <Icon size={14} strokeWidth={isSel ? 2 : 1.5} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback Message */}
        {feedbackMsg && (
          <div className="bg-black text-white px-8 py-3 text-[10px] tracking-[2px] uppercase text-center animate-in fade-in slide-in-from-top-1 duration-200">
            {feedbackMsg}
          </div>
        )}

        {/* Main Panel Content */}
        <div className="flex-1 overflow-y-auto p-8 visible-scrollbar bg-white">

          {/* TAB: MIS COMPRAS */}
          {activeTab === 'compras' && (
            <div className="space-y-6">
              {/* Selector de sub-tabs */}
              <div className="flex border border-neutral-200 p-1 bg-white mb-6 rounded-none">
                <button
                  type="button"
                  onClick={() => setComprasSubTab('actuales')}
                  className={`flex-1 py-2 text-center text-[9px] tracking-[0.2em] uppercase font-light transition-all rounded-none ${
                    comprasSubTab === 'actuales'
                      ? 'bg-black text-white'
                      : 'text-neutral-400 hover:text-black'
                  }`}
                >
                  Pedidos Actuales ({currentOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setComprasSubTab('historial')}
                  className={`flex-1 py-2 text-center text-[9px] tracking-[0.2em] uppercase font-light transition-all rounded-none ${
                    comprasSubTab === 'historial'
                      ? 'bg-black text-white'
                      : 'text-neutral-400 hover:text-black'
                  }`}
                >
                  Historial ({pastOrders.length})
                </button>
              </div>

              {(() => {
                const activeOrders = comprasSubTab === 'actuales' ? currentOrders : pastOrders;

                if (activeOrders.length === 0) {
                  return (
                    <div className="py-20 text-center text-neutral-400 space-y-3">
                      <Package size={36} className="mx-auto text-neutral-300" strokeWidth={1} />
                      <p className="text-[10px] tracking-[0.2em] uppercase font-light">
                        {comprasSubTab === 'actuales' ? 'No tenés pedidos en curso' : 'Aún no realizaste compras'}
                      </p>
                    </div>
                  );
                }

                return activeOrders.map(order => (
                  <div key={order.id} className="border border-neutral-200 p-4 space-y-4 rounded-none bg-white animate-in fade-in duration-200">
                    <div className="flex justify-between items-baseline pb-2.5 border-b border-neutral-100">
                      <span className="text-[8px] tracking-[0.15em] uppercase text-neutral-400 font-light">
                        {new Date(order.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      <span className="text-[8px] tracking-[0.2em] uppercase px-2 py-0.5 font-light border border-black/20 text-black">
                        {isCancelledOrder(order.estado)
                          ? 'CANCELADO'
                          : order.estado === 'PENDING_PAYMENT' || order.estado === 'Pendiente'
                          ? 'PENDIENTE'
                          : order.estado === 'PAID'
                          ? 'PAGADO'
                          : order.estado}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {order.items.map((item, idx) => {
                        const matchingProduct = inventory.find(inv => inv.id === item.productId || inv.sku === item.sku || inv.descripcion === item.descripcion);
                        const thumbnail = matchingProduct?.imagenes?.[0];

                        return (
                          <div key={idx} className="flex gap-4 items-center">
                            <div className="w-10 h-14 bg-neutral-100 flex-shrink-0 relative overflow-hidden rounded border border-black/5">
                              {thumbnail ? (
                                <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[5px] text-black/30 font-bold uppercase text-center p-1">
                                  {item.descripcion}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-black truncate">{item.descripcion}</p>
                              <p className="text-[9px] text-black/40 uppercase tracking-[1px] font-medium">
                                {item.talle && `Talle ${item.talle}`} {item.color && `— ${item.color}`}
                              </p>
                              <p className="text-[10px] text-black/60 font-semibold mt-0.5">
                                {item.cantidad} x ${item.precioUnitario.toLocaleString('es-AR')}
                              </p>
                            </div>
                            <div className="text-[12px] font-bold text-black flex-shrink-0">
                              ${(item.precioUnitario * item.cantidad).toLocaleString('es-AR')}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-black/5 pt-3 space-y-1.5">
                      {order.tipoEnvio === 'envio' && order.costoEnvio !== undefined && (
                        <div className="flex justify-between text-[10px] uppercase text-black/60">
                          <span>Costo de Envío:</span>
                          <span className="font-semibold">${order.costoEnvio.toLocaleString('es-AR')}</span>
                        </div>
                      )}
                      {order.metodoPago === 'Ualá Bis' && order.ualaPlan && (
                        <div className="flex justify-between text-[10px] uppercase text-black/60">
                          <span>Financiación:</span>
                          <span className="font-semibold">
                            {order.ualaPlan.cuotas} {order.ualaPlan.cuotas === 1 ? 'pago' : 'cuotas'} de ${order.ualaPlan.montoCuota.toLocaleString('es-AR')}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-baseline pt-1.5 border-t border-dashed border-black/5">
                        <div className="text-[9px] tracking-[2px] uppercase text-black/40 font-medium">
                          {order.tipoEnvio === 'envio' ? 'Envío a domicilio' : order.tipoEnvio === 'envio_sucursal' ? 'Envío a sucursal' : 'Retiro por local'} · {order.metodoPago}
                        </div>
                        <div className="text-[16px] font-bold text-black">
                          Total: ${order.total.toLocaleString('es-AR')}
                        </div>
                      </div>
                      {order.trackingNumber && (
                        <div className="mt-2 p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg flex items-center justify-between gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[1px] text-blue-900 font-mono">
                            Seguimiento: {order.trackingNumber}
                          </span>
                          <a
                            href="https://micorreo.correoargentino.com.ar/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[8px] font-bold tracking-[1.5px] uppercase bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded transition-colors flex items-center gap-1"
                          >
                            <ExternalLink size={10} /> Ir a Mi Correo
                          </a>
                        </div>
                      )}
                      {!isGiftCardOrder(order) && (!!order.saleId || order.estado === 'Confirmado' || order.estado === 'Entregado') && (
                        <button
                          type="button"
                          disabled={!!order.isExchanged}
                          onClick={() => {
                            if (order.isExchanged) return;
                            const days = Math.floor((Date.now() - new Date(order.fecha).getTime()) / 86400000);
                            if (days > 15) {
                              showAlert('Ya han pasado 15 días desde la compra.', 'Plazo Vencido', 'warning');
                              return;
                            }
                            onRequestExchange(order);
                          }}
                          className={`w-full mt-4 border py-3 text-[10px] tracking-[3px] uppercase font-bold transition-colors flex items-center justify-center gap-2 ${
                            order.isExchanged 
                              ? 'border-black/20 text-black/30 bg-neutral-100 cursor-not-allowed' 
                              : 'border-black hover:bg-black hover:text-white'
                          }`}
                        >
                          <RefreshCw size={12} /> {order.isExchanged ? 'Cambio Realizado' : 'Solicitar cambio'}
                        </button>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* TAB: DIRECCIONES */}
          {activeTab === 'direcciones' && (
            <div className="space-y-6">
              {!showAddressForm ? (
                <>
                  <button 
                    onClick={() => { setShowAddressForm(true); setEditingAddressId(null); }}
                    className="w-full border border-dashed border-black/20 hover:border-black py-4 text-[10px] tracking-[3px] uppercase font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Plus size={14} /> Nueva dirección
                  </button>

                  <div className="space-y-4 mt-6">
                    {customerProfile.direcciones?.length === 0 ? (
                      <p className="text-center py-12 text-[11px] tracking-[2px] uppercase opacity-30">No tenés direcciones guardadas</p>
                    ) : (
                      customerProfile.direcciones?.map(addr => (
                        <div key={addr.id} className={`border p-5 relative transition-all rounded ${addr.esPrincipal ? 'border-black bg-neutral-50/20' : 'border-black/10'}`}>
                          {addr.esPrincipal && <span className="absolute top-4 right-4 text-[8px] tracking-[1.5px] uppercase bg-black text-white px-2 py-0.5 font-bold">Principal</span>}
                          
                          <div className="space-y-1 text-[11px] tracking-[1px] uppercase pr-20">
                            <p className="font-bold text-black">{addr.calle} {addr.numero} {addr.pisoDepto && `— Piso/Depto: ${addr.pisoDepto}`}</p>
                            <p className="text-black/60">{addr.localidad}, {addr.provincia} (CP {addr.codigoPostal})</p>
                            {addr.indicaciones && <p className="text-[9px] text-black/40 italic mt-1 font-medium">{addr.indicaciones}</p>}
                          </div>

                          <div className="mt-4 pt-3 border-t border-black/5 flex items-center gap-4">
                            {!addr.esPrincipal && (
                              <button 
                                onClick={() => handleSetPrincipalAddress(addr.id)}
                                className="text-[9px] tracking-[2.5px] uppercase text-black/50 hover:text-black font-semibold"
                              >
                                Usar Principal
                              </button>
                            )}
                            <button 
                              onClick={() => handleEditAddress(addr)}
                              className="text-[9px] tracking-[2.5px] uppercase text-black/50 hover:text-black font-semibold flex items-center gap-1.5"
                            >
                              <Edit3 size={11} /> Editar
                            </button>
                            <button 
                              onClick={() => handleDeleteAddress(addr.id)}
                              className="text-[9px] tracking-[2.5px] uppercase text-red-500 hover:text-red-700 font-semibold flex items-center gap-1.5 ml-auto"
                            >
                              <Trash2 size={11} /> Eliminar
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                // Formulario de Dirección
                <form onSubmit={handleAddressSubmit} className="space-y-6 animate-in fade-in duration-200">
                  <div className="flex justify-between items-baseline mb-4">
                    <h3 className="text-[10px] tracking-[3px] uppercase font-bold text-black">
                      {editingAddressId ? 'Editar Dirección' : 'Nueva Dirección de Envío'}
                    </h3>
                    <button 
                      type="button" 
                      onClick={() => setShowAddressForm(false)}
                      className="text-[9px] tracking-[2px] uppercase opacity-40 hover:opacity-100"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 group">
                      <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Calle *</label>
                      <input 
                        type="text" value={calle} onChange={(e) => setCalle(e.target.value)} required
                        className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase"
                        placeholder="AV. RIVADAVIA"
                      />
                    </div>
                    <div className="sm:col-span-1 group">
                      <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Número *</label>
                      <input 
                        type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required
                        className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px]"
                        placeholder="1234"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="group sm:col-span-1">
                      <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Piso/Depto</label>
                      <input 
                        type="text" value={pisoDepto} onChange={(e) => setPisoDepto(e.target.value)}
                        className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase"
                        placeholder="3B"
                      />
                    </div>
                    <div className="group sm:col-span-2">
                      <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Código Postal *</label>
                      <input 
                        type="text" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} required
                        className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px]"
                        placeholder="1406"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Localidad *</label>
                    <input 
                      type="text" value={localidad} onChange={(e) => setLocalidad(e.target.value)} required
                      className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase"
                      placeholder="RECOLETA / CABA"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Provincia *</label>
                    <input 
                      type="text" value={provincia} onChange={(e) => setProvincia(e.target.value)} required
                      className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase"
                      placeholder="BUENOS AIRES"
                    />
                  </div>

                  <div className="group">
                    <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Indicaciones (Opcional)</label>
                    <input 
                      type="text" value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)}
                      className="w-full bg-transparent border-b border-black/10 py-2 text-[11px] focus:outline-none focus:border-black tracking-[1px] uppercase placeholder:text-black/10"
                      placeholder="EJ. PORTERO ELÉCTRICO NO ANDA / ENTRADA NEGRA"
                    />
                  </div>

                  <button 
                    type="submit" disabled={isLoading}
                    className="w-full bg-black text-white py-4 text-[10px] tracking-[3px] uppercase font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={12} /> : 'Guardar Dirección'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB: MIS FAVORITOS */}
          {activeTab === 'favoritos' && (
            <div className="space-y-6">
              {wishlistProducts.length === 0 ? (
                <div className="py-24 text-center text-black/30 space-y-4">
                  <Heart size={40} className="mx-auto opacity-35" strokeWidth={1.2} />
                  <p className="text-[11px] tracking-[3px] uppercase font-medium">No tenés favoritos guardados</p>
                </div>
              ) : (
                <div className="divide-y divide-black/5">
                  {wishlistProducts.map(product => (
                    <div key={product.id} className="py-6 flex gap-6 first:pt-0 last:pb-0">
                      <div className="w-16 h-20 bg-neutral-50 flex-shrink-0 relative overflow-hidden">
                        {product.imagenes?.[0] ? (
                          <img src={product.imagenes[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[6px] opacity-20 uppercase font-bold text-center p-2">{product.descripcion}</div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex justify-between items-start">
                          <h4 className="text-[12px] tracking-[0.5px] uppercase font-bold text-black truncate pr-4">{product.descripcion}</h4>
                          <button 
                            onClick={() => removeFromWishlist(product.id)}
                            className="opacity-30 hover:opacity-100 transition-opacity text-black"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <p className="text-[14px] font-bold text-black mb-3">${product.ventaEfectivo.toLocaleString('es-AR')} <span className="text-[9px] text-black/50 font-normal">Efectivo</span></p>

                        
                        <button 
                          onClick={() => {
                            // En favorios del dashboard, si hay talles/colores elegimos los primeros por defecto
                            const talle = product.talles?.[0];
                            const color = product.colores?.[0];
                            onAddToCart(product, talle, color);
                            setFeedbackMsg('Agregado al carrito');
                            setTimeout(() => setFeedbackMsg(null), 1500);
                          }}
                          className="self-start text-[9px] tracking-[2px] uppercase font-semibold border-b border-black pb-0.5 hover:opacity-60 transition-opacity flex items-center gap-1.5 mt-auto"
                        >
                          Añadir al Carrito <ArrowRight size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {/* TAB: MIS DATOS */}
          {activeTab === 'datos' && (
            <div className="space-y-8">
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="group">
                  <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Nombre Completo</label>
                  <input 
                    type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required
                    className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px] uppercase"
                    placeholder="COMPLETA TU NOMBRE"
                  />
                </div>

                <div className="group">
                  <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-1">Teléfono</label>
                  <input 
                    type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
                    className="w-full bg-transparent border-b border-black/10 py-2 text-[12px] focus:outline-none focus:border-black tracking-[1.5px]"
                    placeholder="EJ. 11 1234 5678"
                  />
                </div>

                <button 
                  type="submit" disabled={isLoading}
                  className="w-full bg-black text-white py-4 text-[10px] tracking-[3px] uppercase font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={12} /> : 'Guardar Cambios'}
                </button>
              </form>

              <div className="pt-8 border-t border-black/5">
                <button
                  onClick={() => { logout(); onClose(); }}
                  className="w-full border border-black/15 text-black hover:border-black py-4 text-[10px] tracking-[3px] uppercase font-semibold flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors"
                >
                  <LogOut size={12} /> Cerrar Sesión
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
