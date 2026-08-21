import React from 'react';
import { InventoryItem, WebSettings } from '../types';
import { Globe, Image as ImageIcon, Eye, EyeOff, Layout, Settings, Save, Search, Plus, X, ChevronRight, Ruler, Upload, Loader2, Percent, Instagram, Tag, CheckCircle, AlertCircle, ShieldCheck, ExternalLink, Filter } from 'lucide-react';
import { testUalaConnection, getUalaEnvironment, setUalaEnvironment, UalaEnvironment } from '../services/ualaApi';
import { storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { sendNotificationEmail } from '../services/emailService';
import { useModal } from '../contexts/ModalContext';


export const CURATED_COLORS = [
  'NEGRO', 'BLANCO', 'CRUDO', 'BEIGE', 'ARENA', 'CAMEL', 
  'GRIS CLARO', 'GRIS MELANGE', 'GRIS OSCURO', 'CHOCOLATE', 
  'ROJO', 'BORDÓ', 'TERRACOTA', 'NARANJA', 'AMARILLO', 'MOSTAZA', 
  'ROSA PASTEL', 'FUCSIA', 'CORAL', 'VERDE MILITAR', 'VERDE OLIVA', 
  'VERDE ESMERALDA', 'AZUL MARINO', 'AZUL FRANCIA', 'CELESTE', 'LILA'
];

export const getColorHex = (colorName: string): string => {
  const c = colorName.trim().toUpperCase();
  const palette: Record<string, string> = {
    'NEGRO': '#000000',
    'BLANCO': '#FFFFFF',
    'CRUDO': '#EADBC8',
    'OFF-WHITE': '#F8F6F0',
    'OFF WHITE': '#F8F6F0',
    'BEIGE': '#F5F5DC',
    'ARENA': '#D2B48C',
    'CAMEL': '#C19A6B',
    'GRIS': '#BEBEBE',
    'GRIS CLARO': '#D3D3D3',
    'GRIS MELANGE': '#B8B8B8',
    'GRIS OSCURO': '#5A5A5A',
    'MARRON': '#4B3621',
    'MARRÓN': '#4B3621',
    'CHOCOLATE': '#3D2314',
    'ROJO': '#DC2626',
    'BORDO': '#800020',
    'BORDÓ': '#800020',
    'VINO': '#58111A',
    'TERRACOTA': '#C05C46',
    'NARANJA': '#F97316',
    'AMARILLO': '#EAB308',
    'MOSTAZA': '#CA8A04',
    'ROSA': '#FBCFE8',
    'ROSA PASTEL': '#FBCFE8',
    'ROSA CHICLE': '#F472B6',
    'FUCSIA': '#D946EF',
    'CORAL': '#F87171',
    'VERDE': '#22C55E',
    'VERDE MILITAR': '#4B5320',
    'VERDE OLIVA': '#65A30D',
    'VERDE ESMERALDA': '#059669',
    'VERDE BENETTON': '#008751',
    'AZUL': '#2563EB',
    'AZUL MARINO': '#1E3A8A',
    'AZUL FRANCIA': '#1D4ED8',
    'CELESTE': '#60A5FA',
    'TURQUESA': '#06B6D4',
    'VIOLETA': '#7C3AED',
    'LILA': '#D8B4FE',
    'LAVANDA': '#E9D5FF',
    'MULTICOLOR': 'linear-gradient(45deg, red, orange, yellow, green, blue, purple)',
    'ORO': '#D4AF37',
    'PLATA': '#C0C0C0'
  };
  return palette[c] || '#E5E7EB'; // default light gray
};


interface WebManagerProps {
  inventory: InventoryItem[];
  webSettings: WebSettings;
  selectedCategory: string;
  onSelectCategory?: (cat: string) => void;
  onUpdateInventory: (items: InventoryItem[]) => void;
  onUpdateSettings: (settings: WebSettings) => void;
  initialEditingItemId?: string | null;
  onClearEditItem?: () => void;
}

const WebManager: React.FC<WebManagerProps> = ({ inventory, webSettings, selectedCategory, onSelectCategory, onUpdateInventory, onUpdateSettings, initialEditingItemId, onClearEditItem }) => {
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = React.useState<'catalog' | 'settings'>('catalog');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [localSettings, setLocalSettings] = React.useState<WebSettings>(webSettings || {});
  const [isTogglingStatus, setIsTogglingStatus] = React.useState(false);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);
  const [newTalle, setNewTalle] = React.useState('');
  const [newColor, setNewColor] = React.useState('');
  const [newImagen, setNewImagen] = React.useState('');
  const [newCategory, setNewCategory] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (webSettings) {
      setLocalSettings(webSettings);
    }
  }, [webSettings]);

  React.useEffect(() => {
    if (initialEditingItemId) {
      const itemToEdit = inventory.find(i => i.id === initialEditingItemId);
      if (itemToEdit) {
        setActiveTab('catalog');
        setEditingItem(itemToEdit);
      }
      if (onClearEditItem) {
        onClearEditItem();
      }
    }
  }, [initialEditingItemId, inventory, onClearEditItem]);

  const [testingUala, setTestingUala] = React.useState(false);
  const [ualaTestResult, setUalaTestResult] = React.useState<{
    success?: boolean;
    environment?: UalaEnvironment;
    token?: string;
    paymentUrl?: string;
    error?: string;
  } | null>(null);

  const handleTestUala = async () => {
    setTestingUala(true);
    setUalaTestResult(null);
    const envToTest = localSettings.ualaEnvironment || getUalaEnvironment();
    try {
      const result = await testUalaConnection(envToTest);
      setUalaTestResult(result);
    } catch (e: any) {
      setUalaTestResult({ success: false, error: e?.message || 'Error desconocido' });
    } finally {
      setTestingUala(false);
    }
  };

  const [localCategory, setLocalCategory] = React.useState<string>('');
  const activeCategory = selectedCategory !== undefined && selectedCategory !== '' ? selectedCategory : (selectedCategory === '' && onSelectCategory ? '' : localCategory);
  const handleCategoryChange = (cat: string) => {
    if (onSelectCategory) {
      onSelectCategory(cat);
    } else {
      setLocalCategory(cat);
    }
  };

  const [stockLevelFilter, setStockLevelFilter] = React.useState<'todos' | 'bajo' | 'agotados' | 'visibles'>('todos');
  const [showBulkPriceModal, setShowBulkPriceModal] = React.useState(false);
  const [bulkCategory, setBulkCategory] = React.useState('');
  const [bulkPercentage, setBulkPercentage] = React.useState(10);
  const [bulkTarget, setBulkTarget] = React.useState<'both' | 'efectivo' | 'tarjeta'>('both');

  const handleApplyBulkPriceChange = async () => {
    if (bulkPercentage === 0) return;
    const itemsToUpdate = inventory.filter(i => !bulkCategory || i.categoria === bulkCategory);
    if (itemsToUpdate.length === 0) {
      showAlert('No hay productos en la categoría seleccionada.', 'Sin Productos', 'info');
      return;
    }

    const factor = 1 + (bulkPercentage / 100);
    const updatedInventory = inventory.map(item => {
      if (bulkCategory && item.categoria !== bulkCategory) return item;
      
      const newEfectivo = (bulkTarget === 'both' || bulkTarget === 'efectivo')
        ? Math.round(item.ventaEfectivo * factor)
        : item.ventaEfectivo;
      const newTarjeta = (bulkTarget === 'both' || bulkTarget === 'tarjeta')
        ? Math.round(item.ventaTarjeta * factor)
        : item.ventaTarjeta;

      return {
        ...item,
        ventaEfectivo: newEfectivo,
        ventaTarjeta: newTarjeta
      };
    });

    onUpdateInventory(updatedInventory);
    setShowBulkPriceModal(false);
    showAlert(`Se actualizó el precio de ${itemsToUpdate.length} productos en un ${bulkPercentage}%.`, 'Actualización Exitosa', 'success');
  };

  const handleBulkSetVisibility = async (targetVisible: boolean) => {
    const confirmTitle = targetVisible ? "Poner en Vista Todos" : "Sacar de Vista Todos";
    const confirmMsg = targetVisible
      ? "¿Estás seguro de poner en vista (hacer visibles en la web) TODOS los productos del catálogo?"
      : "¿Estás seguro de sacar de vista (ocultar de la web) TODOS los productos del catálogo?";

    const confirmed = await showConfirm(
      confirmMsg,
      confirmTitle,
      targetVisible ? 'info' : 'warning'
    );

    if (!confirmed) return;

    const updatedInventory = inventory.map(item => ({
      ...item,
      visible: targetVisible
    }));

    onUpdateInventory(updatedInventory);

    showAlert(
      targetVisible
        ? `Se han puesto en vista todos los productos (${updatedInventory.length} artículos).`
        : `Se han sacado de vista todos los productos (${updatedInventory.length} artículos).`,
      "Visibilidad Actualizada",
      "success"
    );
  };

  const filteredItems = inventory.filter(i => {
    const matchesSearch = i.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) || 
      i.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !activeCategory || i.categoria === activeCategory;

    let matchesStockLevel = true;
    if (stockLevelFilter === 'bajo') matchesStockLevel = i.cantidad > 0 && i.cantidad <= 3;
    else if (stockLevelFilter === 'agotados') matchesStockLevel = i.cantidad <= 0;
    else if (stockLevelFilter === 'visibles') matchesStockLevel = i.visible === true;

    return matchesSearch && matchesCategory && matchesStockLevel;
  });

  const categoriasSet = new Set<string>(webSettings?.categoriesOrder || []);
  inventory.forEach(i => {
    if (i.categoria) categoriasSet.add(i.categoria);
  });
  const allCategories = Array.from(categoriasSet);

  const toggleVisibility = async (id: string) => {
    const next = inventory.map(item => 
      item.id === id ? { ...item, visible: !item.visible } : item
    );
    try {
      await onUpdateInventory(next);
    } catch (err) {
      console.error("Error al actualizar visibilidad del producto:", err);
    }
  };

  const handleToggleStoreStatus = async () => {
    const nextHidden = !localSettings.storeHidden;
    const nextSettings = { ...localSettings, storeHidden: nextHidden };
    setLocalSettings(nextSettings);
    setIsTogglingStatus(true);
    try {
      await onUpdateSettings(nextSettings);
      showAlert(
        nextHidden ? 'La tienda ha sido pausada para los clientes.' : 'La tienda web ha sido activada y es visible públicamente.',
        nextHidden ? 'Tienda Pausada' : 'Tienda Activa',
        'success'
      );
    } catch (err) {
      console.error('Error al cambiar visibilidad de la tienda:', err);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    if (localSettings.ualaEnvironment) {
      setUalaEnvironment(localSettings.ualaEnvironment);
    }
    const cats = localSettings.categoriesOrder || [];
    for (const cat of cats) {
      const prevDisc = webSettings?.discountBySection?.[cat] || 0;
      const newDisc = localSettings.discountBySection?.[cat] || 0;
      if (newDisc > prevDisc) {
        sendNotificationEmail(
          'Nuevo Descuento por Sección', 
          `Se ha aplicado un nuevo descuento de ${newDisc}% en la sección "${cat}".`
        );
      }
    }
    try {
      await onUpdateSettings(localSettings);
      showAlert('Configuración de la tienda guardada correctamente.', 'Configuración Guardada', 'success');
    } catch (err) {
      console.error('Error al guardar configuración:', err);
      showAlert('No se pudo guardar la configuración. Por favor reintenta.', 'Error al Guardar', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    const cat = newCategory.trim().toUpperCase();
    if (localSettings.categoriesOrder?.includes(cat)) return;
    setLocalSettings({
      ...localSettings,
      categoriesOrder: [...(localSettings.categoriesOrder || []), cat]
    });
    setNewCategory('');
  };

  const removeCategory = (cat: string) => {
    setLocalSettings({
      ...localSettings,
      categoriesOrder: (localSettings.categoriesOrder || []).filter(c => c !== cat)
    });
  };

  const moveCategory = (index: number, direction: number) => {
    const list = [...(localSettings.categoriesOrder || [])];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(newIndex, 0, moved);
    setLocalSettings({ ...localSettings, categoriesOrder: list });
  };

  const toggleSectionVisibility = (cat: string) => {
    const hidden = localSettings.hiddenSections || [];
    if (hidden.includes(cat)) {
      setLocalSettings({ ...localSettings, hiddenSections: hidden.filter(c => c !== cat) });
    } else {
      setLocalSettings({ ...localSettings, hiddenSections: [...hidden, cat] });
    }
  };

  const handleUpdateItem = (updated: InventoryItem) => {
    const prev = inventory.find(i => i.id === updated.id);
    const hasVariants = (updated.talles?.length || 0) > 0 && (updated.colores?.length || 0) > 0;
    const variantTotal = Object.values(updated.stockPorVariante || {}).reduce((sum, q) => sum + q, 0);

    if (updated.visible !== false) {
      if (!hasVariants) {
        showAlert("Para hacer visible el producto en la web, debe tener al menos un talle y color asignado.", "Faltan Variantes", "warning");
        return;
      }
      if (variantTotal !== updated.cantidad) {
        showAlert(`La cantidad distribuida en talles/colores (${variantTotal}) debe ser exactamente igual a la cantidad en stock global (${updated.cantidad}).`, 'Diferencia en Stock', 'warning');
        return;
      }
    }

    if (prev && (updated.descuentoWeb || 0) > (prev.descuentoWeb || 0)) {
      sendNotificationEmail(
        'Nuevo Descuento en Prenda', 
        `Se ha aplicado un nuevo descuento de ${updated.descuentoWeb}% en la prenda "${updated.descripcion}".`
      );
    }
    const next = inventory.map(item => item.id === updated.id ? updated : item);
    onUpdateInventory(next);
    setEditingItem(null);
  };

  const handleAddTalle = (talleName: string) => {
    if (!editingItem) return;
    const t = talleName.trim().toUpperCase();
    if (!t || editingItem.talles?.includes(t)) return;
    
    const nextTalles = [...(editingItem.talles || []), t];
    setEditingItem({ ...editingItem, talles: nextTalles });
  };

  const handleRemoveTalle = (talle: string) => {
    if (!editingItem) return;
    const nextTalles = (editingItem.talles || []).filter(t => t !== talle);
    
    const nextStock = { ...(editingItem.stockPorVariante || {}) };
    Object.keys(nextStock).forEach(key => {
      if (key.startsWith(`${talle}-`)) {
        delete nextStock[key];
      }
    });

    setEditingItem({
      ...editingItem,
      talles: nextTalles,
      stockPorVariante: nextStock
    });
  };

  const handleAddColor = (colorName: string) => {
    if (!editingItem) return;
    const c = colorName.trim().toUpperCase();
    if (!c || editingItem.colores?.includes(c)) return;
    
    const nextColores = [...(editingItem.colores || []), c];
    setEditingItem({ ...editingItem, colores: nextColores });
  };

  const handleRemoveColor = (color: string) => {
    if (!editingItem) return;
    const nextColores = (editingItem.colores || []).filter(c => c !== color);
    
    const nextStock = { ...(editingItem.stockPorVariante || {}) };
    Object.keys(nextStock).forEach(key => {
      if (key.endsWith(`-${color}`)) {
        delete nextStock[key];
      }
    });
    
    const nextLegacyStock = { ...(editingItem.coloresStock || {}) };
    delete nextLegacyStock[color];

    setEditingItem({
      ...editingItem,
      colores: nextColores,
      stockPorVariante: nextStock,
      coloresStock: nextLegacyStock
    });
  };

  const handleUpdateVariantStock = (talle: string, color: string, val: number) => {
    if (!editingItem) return;
    const key = `${talle}-${color}`;
    const nextStock = { ...(editingItem.stockPorVariante || {}) };
    nextStock[key] = Math.max(0, val);
    
    setEditingItem({
      ...editingItem,
      stockPorVariante: nextStock
    });
  };



  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !editingItem) return;

    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storageRef = ref(storage, `prendas/${editingItem.id}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(url);
      }
      
      setEditingItem({
        ...editingItem,
        imagenes: [...(editingItem.imagenes || []), ...uploadedUrls]
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      showAlert("Error al subir la imagen o imágenes. Por favor intenta de nuevo.", "Error de Subida", "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <div className="space-y-8 text-left animate-in fade-in duration-500">
        <header className="border-b-2 border-[#C9B8A8]/30 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl italic text-[#1A1A1A]">Gestión de Sitio Web</h2>
          <p className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/40 mt-1">Contenido y visualización pública</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleToggleStoreStatus}
            disabled={isTogglingStatus}
            title={localSettings.storeHidden ? "Click para Activar la Tienda Web" : "Click para Pausar la Tienda Web"}
            className={`px-3.5 py-2 rounded-xl border text-[9px] tracking-[1.5px] font-bold uppercase transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
              localSettings.storeHidden
                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {isTogglingStatus ? (
              <Loader2 size={13} className="animate-spin" />
            ) : localSettings.storeHidden ? (
              <EyeOff size={13} />
            ) : (
              <Eye size={13} />
            )}
            <span>{localSettings.storeHidden ? 'Tienda Pausada' : 'Tienda Activa'}</span>
            <span className="text-[8px] opacity-80 underline font-normal">
              ({localSettings.storeHidden ? 'Click para Activar' : 'Click para Pausar'})
            </span>
          </button>

          <div className="flex bg-[#F5F1EB] p-1 rounded-xl border border-[#C9B8A8]/30">
            <button 
              onClick={() => setActiveTab('catalog')}
              className={`px-6 py-2 rounded-lg text-[10px] tracking-[2px] font-bold uppercase transition-all ${activeTab === 'catalog' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#1A1A1A]/40 hover:text-[#1A1A1A]'}`}
            >
              Catálogo
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-2 rounded-lg text-[10px] tracking-[2px] font-bold uppercase transition-all ${activeTab === 'settings' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#1A1A1A]/40 hover:text-[#1A1A1A]'}`}
            >
              Configuración
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-2xl p-4 shadow-xl flex items-center gap-4">
            <Search className="text-[#C9B8A8]" size={20} />
            <input 
              type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="BUSCAR PRENDA PARA GESTIÓN WEB..."
              className="flex-1 bg-transparent border-none outline-none text-xs tracking-[2px] font-bold uppercase placeholder:text-black/20"
            />
          </div>

          {allCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 py-3 px-4 bg-[#F5F1EB]/60 border border-[#C9B8A8]/40 rounded-xl">
              <span className="text-[9px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/40 mr-1 flex items-center gap-1">
                <Filter size={12} /> Categorías:
              </span>
              <button
                onClick={() => handleCategoryChange('')}
                className={`px-3 py-1.5 rounded-lg text-[9px] tracking-[1.5px] uppercase font-bold transition-all ${
                  !activeCategory
                    ? 'bg-[#1A1A1A] text-white shadow-sm scale-105'
                    : 'bg-white/90 text-[#1A1A1A]/70 hover:bg-white hover:text-[#1A1A1A] border border-[#C9B8A8]/40'
                }`}
              >
                Todas ({inventory.length})
              </button>
              {allCategories.map(cat => {
                const count = inventory.filter(i => i.categoria === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => handleCategoryChange(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] tracking-[1.5px] uppercase font-bold transition-all flex items-center gap-1.5 ${
                      activeCategory === cat
                        ? 'bg-[#C9B8A8] text-[#1A1A1A] shadow-md scale-105 font-black border border-[#1A1A1A]/20'
                        : 'bg-white/90 text-[#1A1A1A]/70 hover:bg-white hover:text-[#1A1A1A] border border-[#C9B8A8]/40'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                      activeCategory === cat ? 'bg-[#1A1A1A] text-white' : 'bg-[#C9B8A8]/30 text-[#1A1A1A]'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Stock Level Filters & Bulk Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 px-4 bg-[#F5F1EB]/40 border border-[#C9B8A8]/30 rounded-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/40 mr-1">
                Filtrar por Stock:
              </span>
              <button
                onClick={() => setStockLevelFilter('todos')}
                className={`px-3 py-1 rounded-lg text-[9px] tracking-[1.5px] uppercase font-bold transition-all ${
                  stockLevelFilter === 'todos' ? 'bg-[#1A1A1A] text-white' : 'bg-white text-stone-600 border border-stone-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setStockLevelFilter('bajo')}
                className={`px-3 py-1 rounded-lg text-[9px] tracking-[1.5px] uppercase font-bold transition-all ${
                  stockLevelFilter === 'bajo' ? 'bg-amber-600 text-white' : 'bg-white text-amber-700 border border-amber-200'
                }`}
              >
                Stock Crítico (≤ 3)
              </button>
              <button
                onClick={() => setStockLevelFilter('agotados')}
                className={`px-3 py-1 rounded-lg text-[9px] tracking-[1.5px] uppercase font-bold transition-all ${
                  stockLevelFilter === 'agotados' ? 'bg-red-600 text-white' : 'bg-white text-red-700 border border-red-200'
                }`}
              >
                Agotados (0)
              </button>
              <button
                onClick={() => setStockLevelFilter('visibles')}
                className={`px-3 py-1 rounded-lg text-[9px] tracking-[1.5px] uppercase font-bold transition-all ${
                  stockLevelFilter === 'visibles' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 border border-emerald-200'
                }`}
              >
                Visibles Web
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                onClick={() => handleBulkSetVisibility(false)}
                title="Oculta todos los artículos de la tienda web"
                className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-[9px] font-bold tracking-[1.5px] uppercase rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <EyeOff size={12} /> Sacar de vista todos
              </button>
              <button
                onClick={() => handleBulkSetVisibility(true)}
                title="Hace visibles todos los artículos en la tienda web"
                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[9px] font-bold tracking-[1.5px] uppercase rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Eye size={12} /> Poner en vista todos
              </button>
              <button
                onClick={() => setShowBulkPriceModal(true)}
                className="px-3.5 py-1.5 bg-[#C9B8A8] text-[#1A1A1A] text-[9px] font-black tracking-[1.5px] uppercase rounded-lg hover:bg-stone-400 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Percent size={12} /> Actualización Masiva Precios
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white/50 rounded-2xl border-2 border-dashed border-[#C9B8A8]/30">
                <p className="text-[10px] tracking-[4px] uppercase opacity-40 font-bold">No hay productos en esta sección</p>
              </div>
            ) : filteredItems.map(item => (
              <div key={item.id} className="bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-2xl overflow-hidden shadow-lg group relative">
                <div className="aspect-[3/4] bg-[#F5F1EB] relative overflow-hidden">
                  {item.imagenes?.[0] ? (
                    <img src={item.imagenes[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10"><ImageIcon size={40}/></div>
                  )}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button 
                      onClick={() => toggleVisibility(item.id)}
                      className={`p-2 rounded-full shadow-lg backdrop-blur-md transition-all ${item.visible !== false ? 'bg-emerald-500 text-white' : 'bg-white/80 text-red-500'}`}
                    >
                      {item.visible !== false ? <Eye size={16}/> : <EyeOff size={16}/>}
                    </button>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="text-left">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A]">{item.descripcion}</p>
                      <p className="text-[9px] opacity-40 uppercase tracking-[2px] font-medium">{item.sku} — {item.categoria}</p>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded ${item.visible !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {item.visible !== false ? 'VISIBLE' : 'OCULTO'}
                    </span>
                  </div>
                  <button 
                    onClick={() => setEditingItem(item)}
                    className="w-full py-3 border-2 border-[#C9B8A8]/30 rounded-xl text-[9px] tracking-[3px] font-bold uppercase hover:bg-[#C9B8A8]/10 transition-all flex items-center justify-center gap-2"
                  >
                    Editar Contenido Web <ChevronRight size={12}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-3xl mx-auto bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-2xl p-10 shadow-xl space-y-10">
          
          <div className="bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 p-6 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${localSettings.storeHidden ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  {localSettings.storeHidden ? <EyeOff size={24} /> : <Eye size={24} />}
                </div>
                <div>
                  <h3 className="font-serif text-xl italic text-[#1A1A1A]">{localSettings.storeHidden ? 'Tienda Pausada' : 'Tienda Activa'}</h3>
                  <p className="text-[10px] tracking-[2px] uppercase opacity-40 font-bold">
                    {localSettings.storeHidden ? 'Los clientes verán un cartel de mantenimiento y comunicación de pausa.' : 'La tienda es visible públicamente.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleStoreStatus}
                disabled={isTogglingStatus}
                className={`px-6 py-2 rounded-lg text-[10px] tracking-[2px] font-bold uppercase transition-all border flex items-center gap-2 cursor-pointer ${localSettings.storeHidden ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'bg-white text-[#1A1A1A] border-[#C9B8A8]/50 hover:bg-[#F5F1EB]'} disabled:opacity-50`}
              >
                {isTogglingStatus && <Loader2 size={12} className="animate-spin" />}
                <span>{localSettings.storeHidden ? 'Activar Tienda' : 'Pausar Tienda'}</span>
              </button>
            </div>

            <div className="pt-3 border-t border-[#C9B8A8]/20 space-y-2">
              <label className="text-[10px] tracking-[2px] uppercase font-bold text-[#1A1A1A]/70 flex items-center justify-between">
                <span>Mensaje al Cliente en Vista Pausada</span>
                <span className="text-[9px] font-normal text-stone-400">Opcional</span>
              </label>
              <textarea
                rows={2}
                value={localSettings.storePausedMessage || ''}
                onChange={e => setLocalSettings({ ...localSettings, storePausedMessage: e.target.value })}
                placeholder="Ej: Estamos actualizando nuestro stock y nuevos ingresos. Volvemos muy pronto..."
                className="w-full bg-white border border-[#C9B8A8]/40 p-3 rounded-lg text-xs font-normal focus:outline-none focus:border-[#C9B8A8]"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 border-b border-[#C9B8A8]/20 pb-6">
            <Layout className="text-[#C9B8A8]" size={24} />
            <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Diseño y Editorial</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">URL Imagen Portada (Hero)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" value={localSettings?.heroImageUrl || ''} 
                    onChange={e => setLocalSettings({...localSettings, heroImageUrl: e.target.value})}
                    className="flex-1 bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                    placeholder="PEGAR URL O SUBIR..."
                  />
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute w-0 h-0 opacity-0 pointer-events-none" 
                    id="hero-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploading(true);
                      try {
                        const storageRef = ref(storage, `web/hero_${Date.now()}_${file.name}`);
                        const snapshot = await uploadBytes(storageRef, file);
                        const url = await getDownloadURL(snapshot.ref);
                        setLocalSettings({ ...localSettings, heroImageUrl: url });
                      } catch (error) {
                        console.error("Error uploading hero:", error);
                        showAlert("Error al subir la imagen de portada.", "Error de Subida", "error");
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                  />
                  <button 
                    onClick={() => document.getElementById('hero-upload')?.click()}
                    disabled={isUploading}
                    className="bg-white border-2 border-[#C9B8A8]/30 text-[#1A1A1A] px-4 rounded-xl hover:bg-[#F5F1EB] transition-all disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin text-[#C9B8A8]" /> : <Upload size={16} className="text-[#C9B8A8]" />}
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Título Portada</label>
                <input 
                  type="text" value={localSettings?.heroTitle || ''} 
                  onChange={e => setLocalSettings({...localSettings, heroTitle: e.target.value})}
                  className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold uppercase"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Subtítulo Portada</label>
                <input 
                  type="text" value={localSettings?.heroSubtitle || ''} 
                  onChange={e => setLocalSettings({...localSettings, heroSubtitle: e.target.value})}
                  className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold uppercase"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Anuncio Deslizante (Header)</label>
                <input 
                  type="text" value={localSettings?.announcementText || ''} 
                  onChange={e => setLocalSettings({...localSettings, announcementText: e.target.value})}
                  className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                  placeholder="20% de descuento pagando por transferencia ★"
                />
              </div>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">WhatsApp Contacto (ej: 549...)</label>
                <input 
                  type="text" value={localSettings?.contactWhatsapp || ''} 
                  onChange={e => setLocalSettings({...localSettings, contactWhatsapp: e.target.value})}
                  placeholder="5492346685836"
                  className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Link Mercado Pago (transferencia)</label>
                <input
                  type="url"
                  value={localSettings?.mercadoPagoTransferUrl || ''}
                  onChange={e => setLocalSettings({ ...localSettings, mercadoPagoTransferUrl: e.target.value })}
                  className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                  placeholder="https://link.mercadopago.com.ar/tu-alias"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Alias Mercado Pago (alternativo)</label>
                <input
                  type="text"
                  value={localSettings?.mercadoPagoAlias || ''}
                  onChange={e => setLocalSettings({ ...localSettings, mercadoPagoAlias: e.target.value })}
                  className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                  placeholder="elropero.showroom"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Nombre de la Tienda</label>
                <input 
                  type="text" value={localSettings?.storeName || ''} 
                  onChange={e => setLocalSettings({...localSettings, storeName: e.target.value})}
                  className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold uppercase"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-10 border-t border-[#C9B8A8]/20">
            <div className="flex items-center gap-4 border-b border-[#C9B8A8]/20 pb-6">
              <Plus className="text-[#C9B8A8]" size={24} />
              <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Secciones del Sitio</h3>
            </div>
            
            <div className="space-y-4 text-left">
              <p className="text-[10px] tracking-[2px] uppercase opacity-40 font-bold">Estas categorías aparecerán fijas en el menú del sitio web.</p>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newCategory} 
                  onChange={e => setNewCategory(e.target.value.toUpperCase())}
                  placeholder="NUEVA CATEGORÍA (EJ: ACCESORIOS)"
                  className="flex-1 bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold uppercase"
                  onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                />
                <button 
                  onClick={handleAddCategory}
                  className="bg-[#C9B8A8] text-[#1A1A1A] px-6 rounded-xl hover:bg-[#B8A696] transition-all"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(localSettings?.categoriesOrder || []).map((cat, idx) => (
                  <div key={cat} className="flex items-center justify-between p-4 bg-white border border-[#C9B8A8]/30 rounded-xl shadow-sm group">
                    <span className={`text-xs font-bold tracking-[2px] uppercase ${localSettings.hiddenSections?.includes(cat) ? 'opacity-40 line-through' : ''}`}>{cat}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSectionVisibility(cat)}
                        className={`p-1 rounded transition-colors ${localSettings.hiddenSections?.includes(cat) ? 'text-red-400 hover:bg-red-50 hover:text-red-600' : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600'}`}
                        title={localSettings.hiddenSections?.includes(cat) ? 'Mostrar sección' : 'Ocultar sección'}
                      >
                        {localSettings.hiddenSections?.includes(cat) ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button 
                        onClick={() => moveCategory(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 hover:bg-[#F5F1EB] rounded transition-colors disabled:opacity-20"
                      >
                        <ChevronRight className="-rotate-90" size={14} />
                      </button>
                      <button 
                        onClick={() => moveCategory(idx, 1)}
                        disabled={idx === (localSettings.categoriesOrder?.length || 0) - 1}
                        className="p-1 hover:bg-[#F5F1EB] rounded transition-colors disabled:opacity-20"
                      >
                        <ChevronRight className="rotate-90" size={14} />
                      </button>
                      <button 
                        onClick={() => removeCategory(cat)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-10 border-t border-[#C9B8A8]/20">
            <div className="flex items-center gap-4 border-b border-[#C9B8A8]/20 pb-6">
              <Percent className="text-[#C9B8A8]" size={24} />
              <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Descuentos por Sección</h3>
            </div>
            <p className="text-[10px] tracking-[2px] uppercase opacity-40 font-bold text-left">Aplicá un % de descuento a todas las prendas de una sección. Se muestra el precio original tachado y el precio con descuento.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(localSettings?.categoriesOrder || []).map(cat => {
                const disc = localSettings.discountBySection?.[cat] || 0;
                return (
                  <div key={`disc-${cat}`} className="flex items-center justify-between p-4 bg-white border border-[#C9B8A8]/30 rounded-xl shadow-sm">
                    <div className="text-left">
                      <span className="text-xs font-bold tracking-[2px] uppercase">{cat}</span>
                      {disc > 0 && <span className="ml-2 text-[9px] font-black text-red-500">-{disc}%</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0} max={90} step={5}
                        value={disc}
                        onChange={e => {
                          const val = Math.max(0, Math.min(90, parseInt(e.target.value) || 0));
                          setLocalSettings({
                            ...localSettings,
                            discountBySection: { ...(localSettings.discountBySection || {}), [cat]: val }
                          });
                        }}
                        className="w-16 bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded-lg px-2 py-1.5 text-xs font-bold text-center focus:outline-none focus:border-[#C9B8A8]"
                      />
                      <span className="text-[10px] opacity-40 font-bold">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6 pt-10 border-t border-[#C9B8A8]/20">
            <div className="flex items-center gap-4 border-b border-[#C9B8A8]/20 pb-6">
              <Instagram className="text-[#C9B8A8]" size={24} />
              <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Redes Sociales</h3>
            </div>
            <div className="space-y-3 text-left">
              <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Instagram (ej: @elropero.ba)</label>
              <input
                type="text"
                value={localSettings?.instagramHandle || ''}
                onChange={e => setLocalSettings({ ...localSettings, instagramHandle: e.target.value })}
                className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                placeholder="@elropero.ba"
              />
            </div>
          </div>

          <div className="space-y-6 pt-10 border-t border-[#C9B8A8]/20">
            <div className="flex items-center gap-4 border-b border-[#C9B8A8]/20 pb-6">
              <Globe className="text-[#C9B8A8]" size={24} />
              <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Sobre Nosotros</h3>
            </div>
            <div className="space-y-3 text-left">
              <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Texto "Sobre Nosotros"</label>
              <textarea
                value={localSettings?.aboutUsText || ''}
                onChange={e => setLocalSettings({ ...localSettings, aboutUsText: e.target.value })}
                rows={4}
                className="w-full bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded-xl p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-medium"
                placeholder="Escribe la historia o descripción de la tienda para los clientes..."
              />
            </div>
          </div>

          <div className="space-y-6 pt-10 border-t border-[#C9B8A8]/20">
            <div className="flex items-center gap-4 border-b border-[#C9B8A8]/20 pb-6">
              <Settings className="text-[#C9B8A8]" size={24} />
              <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Ubicaciones de Entrega</h3>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 text-left">
              <div className="space-y-6">
                <h4 className="text-[11px] tracking-[3px] uppercase font-bold text-[#1A1A1A]/50 border-b border-[#C9B8A8]/10 pb-2">Showroom Central</h4>
                <div className="space-y-3">
                  <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Dirección</label>
                  <input
                    type="text"
                    value={localSettings?.locationShowroomAddress || ''}
                    onChange={e => setLocalSettings({ ...localSettings, locationShowroomAddress: e.target.value })}
                    className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                    placeholder="San Martín 382, Chivilcoy"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Enlace de Mapa (Google Maps)</label>
                  <input
                    type="url"
                    value={localSettings?.locationShowroomMapUrl || ''}
                    onChange={e => setLocalSettings({ ...localSettings, locationShowroomMapUrl: e.target.value })}
                    className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-medium"
                    placeholder="https://www.google.com/maps/..."
                  />
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] tracking-[3px] uppercase font-bold text-[#1A1A1A]/50 border-b border-[#C9B8A8]/10 pb-2">Pick Up Point</h4>
                <div className="space-y-3">
                  <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Dirección</label>
                  <input
                    type="text"
                    value={localSettings?.locationPickupAddress || ''}
                    onChange={e => setLocalSettings({ ...localSettings, locationPickupAddress: e.target.value })}
                    className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                    placeholder="Recoleta, CABA"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Enlace de Mapa (Google Maps)</label>
                  <input
                    type="url"
                    value={localSettings?.locationPickupMapUrl || ''}
                    onChange={e => setLocalSettings({ ...localSettings, locationPickupMapUrl: e.target.value })}
                    className="w-full bg-[#F5F1EB]/50 border-b-2 border-[#C9B8A8]/40 p-3 focus:outline-none focus:border-[#C9B8A8] text-xs font-medium"
                    placeholder="https://www.google.com/maps/..."
                  />
                </div>
              </div>
            </div>
          </div>


          <div className="pt-6 border-t border-[#C9B8A8]/20 flex justify-end">
            <button 
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="bg-[#1A1A1A] text-white px-10 py-4 rounded-xl text-[11px] tracking-[4px] font-black uppercase hover:bg-black transition-all flex items-center gap-3 shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {isSavingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{isSavingSettings ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Item Web Editor Modal */}
    {editingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-10">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setEditingItem(null)} />
          <div className="relative bg-white w-full max-w-5xl max-h-[90vh] sm:h-[90vh] overflow-y-auto sm:overflow-hidden shadow-2xl flex flex-col sm:flex-row">
            {/* Close Button — ALWAYS VISIBLE */}
            <button 
              onClick={() => setEditingItem(null)} 
              className="absolute top-4 right-4 z-[110] p-2 bg-white/80 backdrop-blur-sm hover:bg-white rounded-full transition-all shadow-md text-[#1A1A1A]"
            >
              <X size={24}/>
            </button>

            {/* Gallery Side */}
            <div className="w-full sm:w-1/2 h-auto sm:h-full bg-[#F5F1EB] p-6 sm:p-8 flex flex-col gap-6 sm:overflow-y-auto no-scrollbar">
              <h3 className="font-serif text-2xl italic text-[#1A1A1A]">Gestionar Fotos</h3>
              <div className="grid grid-cols-2 gap-4">
                {Array.isArray(editingItem.imagenes) && editingItem.imagenes.map((img, i) => (
                  <div key={`img-${i}`} className="relative aspect-[3/4] bg-white rounded-xl overflow-hidden border border-[#C9B8A8]/30 shadow-sm">
                    <img src={img} alt="" className="w-full h-full object-cover"/>
                    <button 
                      onClick={() => setEditingItem({ ...editingItem, imagenes: (editingItem.imagenes || []).filter((_, idx) => idx !== i) })}
                      className="absolute top-2 right-2 bg-white/80 p-1.5 rounded-full text-red-500 hover:bg-white shadow-md"
                    >
                      <X size={12}/>
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="pt-4 border-t border-[#C9B8A8]/20 w-full space-y-3">
                <div className="flex gap-2">
                  <input 
                    type="text" value={newImagen} onChange={(e) => setNewImagen(e.target.value)}
                    className="flex-1 bg-white border border-[#C9B8A8]/40 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    placeholder="PEGAR URL O SUBIR..."
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), newImagen && (setEditingItem({...editingItem, imagenes: [...(editingItem.imagenes||[]), newImagen]}), setNewImagen('')))}
                  />
                  <input 
                    type="file" 
                    multiple
                    accept="image/*" 
                    className="absolute w-0 h-0 opacity-0 pointer-events-none" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="bg-white border-2 border-[#C9B8A8]/30 text-[#1A1A1A] px-3 rounded-xl hover:bg-[#F5F1EB] transition-all disabled:opacity-50"
                    title="Subir desde galería"
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin text-[#C9B8A8]" /> : <Upload size={16} className="text-[#C9B8A8]" />}
                  </button>
                  <button 
                    onClick={() => newImagen && (setEditingItem({...editingItem, imagenes: [...(editingItem.imagenes||[]), newImagen]}), setNewImagen(''))}
                    className="bg-[#C9B8A8] text-[#1A1A1A] px-4 rounded-xl text-[10px] font-bold uppercase hover:bg-[#B8A696]"
                  >
                    <Plus size={16}/>
                  </button>
                </div>
              </div>
            </div>

            {/* Info Side */}
            <div className="w-full sm:w-1/2 h-auto sm:h-full p-6 sm:p-10 flex flex-col bg-white sm:overflow-y-auto no-scrollbar">
              <div className="flex justify-between items-start mb-8">
                <div className="text-left">
                  <p className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/40 mb-2">Edición de Contenido Web</p>
                  <h3 className="font-serif text-3xl italic text-[#1A1A1A]">{editingItem.descripcion}</h3>
                </div>
              </div>

              <div className="space-y-8 flex-1">
                <div className="space-y-3 text-left">
                  <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Descripción Pública</label>
                  <textarea 
                    value={editingItem.descripcion} 
                    onChange={e => setEditingItem({...editingItem, descripcion: e.target.value.toUpperCase()})}
                    rows={2}
                    className="w-full bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded-xl p-4 focus:outline-none focus:border-[#C9B8A8] text-xs font-bold"
                  />
                </div>

                <div className="space-y-3 text-left">
                  <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70 flex items-center gap-2"><Ruler size={14}/> Medidas y Calce</label>
                  <textarea 
                    value={editingItem.medidas || ''} 
                    onChange={e => setEditingItem({...editingItem, medidas: e.target.value})}
                    rows={2}
                    className="w-full bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded-xl p-4 focus:outline-none focus:border-[#C9B8A8] text-xs font-medium"
                    placeholder="DETALLA LAS MEDIDAS PARA EL CLIENTE..."
                  />
                </div>

                <div className="space-y-6">
                  {/* Talles */}
                  <div className="space-y-3 text-left">
                    <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70">Talles</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" value={newTalle} onChange={e => setNewTalle(e.target.value.toUpperCase())}
                        className="flex-1 bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded-xl px-3 py-2 text-xs focus:outline-none uppercase"
                        placeholder="EJ: S, M, L"
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), newTalle && (handleAddTalle(newTalle), setNewTalle('')))}
                      />
                      <button 
                        type="button"
                        onClick={() => newTalle && (handleAddTalle(newTalle), setNewTalle(''))}
                        className="bg-[#1A1A1A] text-white p-2.5 rounded-xl hover:bg-black transition-all flex items-center justify-center"
                      >
                        <Plus size={16}/>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(!editingItem.talles || editingItem.talles.length === 0) ? (
                        <span className="text-[9px] tracking-[1px] uppercase opacity-30">Sin talles cargados</span>
                      ) : (
                        editingItem.talles.map((t, idx) => (
                          <span key={`${t}-${idx}`} className="bg-[#1A1A1A] text-white text-[9px] font-bold tracking-[1px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                            {t} 
                            <X size={10} className="cursor-pointer hover:text-red-300 transition-colors" onClick={() => handleRemoveTalle(t)}/>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Colores & Stock */}
                  <div className="space-y-4 text-left border-t border-[#C9B8A8]/20 pt-6">
                    <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70 flex items-center justify-between">
                      <span>Colores & Cantidades</span>
                      <span className={`text-[8px] tracking-[2px] font-medium normal-case px-2 py-1 rounded ${
                        ((editingItem.talles?.length || 0) > 0 && (editingItem.colores?.length || 0) > 0)
                          ? (Object.values(editingItem.stockPorVariante || {}).reduce((s: number, q: any) => s + Number(q || 0), 0) === editingItem.cantidad) 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-red-100 text-red-800'
                          : 'opacity-40'
                      }`}>
                        STOCK INICIAL: {editingItem.cantidad} U. 
                        {((editingItem.talles?.length || 0) > 0 && (editingItem.colores?.length || 0) > 0) && 
                          ` | ASIGNADO: ${Object.values(editingItem.stockPorVariante || {}).reduce((s: number, q: any) => s + Number(q || 0), 0)} U.`}
                      </span>
                    </label>
                    
                    {/* Curated color swatches grid */}
                    <div className="space-y-2">
                      <p className="text-[8px] tracking-[2px] uppercase opacity-40 font-bold">Seleccionar de la gama de moda:</p>
                      <div className="flex flex-wrap gap-1.5 p-2 bg-[#F5F1EB]/30 rounded-xl border border-[#C9B8A8]/10 max-h-[85px] overflow-y-auto no-scrollbar">
                        {CURATED_COLORS.map(c => {
                          const hex = getColorHex(c);
                          const isSelected = editingItem.colores?.includes(c);
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => isSelected ? handleRemoveColor(c) : handleAddColor(c)}
                              className={`group px-2 py-1 rounded-lg text-[8px] font-bold tracking-[1px] uppercase transition-all flex items-center gap-1.5 border ${
                                isSelected 
                                  ? 'bg-[#1A1A1A] text-white border-black shadow-sm' 
                                  : 'bg-white text-[#1A1A1A] border-[#C9B8A8]/30 hover:border-[#1A1A1A]'
                              }`}
                              title={c}
                            >
                              <span 
                                className="w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0" 
                                style={{ background: hex }}
                              />
                              <span>{c}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom Color Input */}
                    <div className="flex gap-2">
                      <input 
                        type="text" value={newColor} onChange={e => setNewColor(e.target.value.toUpperCase())}
                        className="flex-1 bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded-xl px-3 py-2 text-xs focus:outline-none uppercase font-bold placeholder:font-normal"
                        placeholder="NUEVO COLOR PERSONALIZADO..."
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), newColor && (handleAddColor(newColor), setNewColor('')))}
                      />
                      <button 
                        type="button"
                        onClick={() => newColor && (handleAddColor(newColor), setNewColor(''))}
                        className="bg-[#1A1A1A] text-white p-2.5 rounded-xl hover:bg-black transition-all flex items-center justify-center"
                      >
                        <Plus size={16}/>
                      </button>
                    </div>

                    {/* Variant Grid */}
                    <div className="space-y-4 mt-6">
                      {(!editingItem.talles || editingItem.talles.length === 0) || (!editingItem.colores || editingItem.colores.length === 0) ? (
                        <p className="text-[9px] tracking-[1px] uppercase opacity-30 text-center py-4">
                          {!editingItem.talles?.length && !editingItem.colores?.length ? "Agrega talles y colores para generar la grilla de stock" :
                           !editingItem.talles?.length ? "Agrega al menos un talle para generar la grilla" : "Agrega al menos un color para generar la grilla"}
                        </p>
                      ) : (
                        <div className="overflow-x-auto no-scrollbar border border-[#C9B8A8]/30 rounded-xl">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#F5F1EB]">
                                <th className="p-3 text-[9px] tracking-[2px] font-bold uppercase text-[#1A1A1A] border-b border-r border-[#C9B8A8]/30">Talle / Color</th>
                                {editingItem.colores.map((c, idx) => (
                                  <th key={`${c}-${idx}`} className="p-3 text-[9px] tracking-[2px] font-bold uppercase text-[#1A1A1A] border-b border-[#C9B8A8]/30 text-center min-w-[80px]">
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="w-3 h-3 rounded-full border border-black/10 shadow-sm" style={{ background: getColorHex(c) }} />
                                      {c}
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {editingItem.talles.map((t, tIdx) => (
                                <tr key={`${t}-${tIdx}`} className="border-b border-[#C9B8A8]/20 last:border-0">
                                  <td className="p-3 text-[10px] font-bold uppercase text-[#1A1A1A] border-r border-[#C9B8A8]/30 bg-[#F5F1EB]/30">{t}</td>
                                  {editingItem.colores!.map((c, cIdx) => {
                                    const qty = editingItem.stockPorVariante?.[`${t}-${c}`] ?? 0;
                                    return (
                                      <td key={`${t}-${c}-${tIdx}-${cIdx}`} className="p-2 text-center">
                                        <input
                                          type="number"
                                          min={0}
                                          value={qty === 0 ? '' : qty}
                                          placeholder="0"
                                          onChange={(e) => handleUpdateVariantStock(t, c, parseInt(e.target.value) || 0)}
                                          className="w-12 text-center text-xs font-bold bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded p-1 outline-none focus:border-[#C9B8A8] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>


                <div className="space-y-3 text-left">
                  <label className="text-[10px] tracking-[4px] uppercase font-bold text-[#1A1A1A]/70 flex items-center gap-2"><Tag size={14}/> Descuento Individual (%)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0} max={90} step={5}
                      value={editingItem.descuentoWeb || 0}
                      onChange={e => setEditingItem({ ...editingItem, descuentoWeb: Math.max(0, Math.min(90, parseInt(e.target.value) || 0)) })}
                      className="w-24 bg-[#F5F1EB]/50 border border-[#C9B8A8]/30 rounded-xl px-3 py-2 text-xs font-bold text-center focus:outline-none focus:border-[#C9B8A8]"
                    />
                    <span className="text-[10px] opacity-40 font-bold">% DE DESCUENTO</span>
                    {(editingItem.descuentoWeb || 0) > 0 && (
                      <span className="text-[10px] font-black text-red-500 ml-auto">-{editingItem.descuentoWeb}%</span>
                    )}
                  </div>
                  <p className="text-[9px] text-[#1A1A1A]/40">Si la sección ya tiene descuento, se usa el mayor de ambos.</p>
                </div>

               <div className="flex items-center justify-between p-4 bg-[#F5F1EB]/50 rounded-2xl border border-[#C9B8A8]/20">
                   <div className="text-left">
                     <p className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]">Visibilidad en Web</p>
                     <p className="text-[9px] text-[#1A1A1A]/40">Controla si el producto aparece en la tienda.</p>
                   </div>
                   <button 
                    onClick={() => setEditingItem({ ...editingItem, visible: !editingItem.visible })}
                    className={`px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${editingItem.visible !== false ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-red-500 text-white shadow-lg shadow-red-200'}`}
                   >
                     {editingItem.visible !== false ? 'VISIBLE' : 'OCULTO'}
                   </button>
                </div>
              </div>

              <button 
                onClick={() => handleUpdateItem(editingItem)}
                className="w-full mt-10 py-5 bg-[#C9B8A8] text-[#1A1A1A] rounded-2xl text-[12px] tracking-[6px] font-black uppercase hover:bg-[#B8A696] transition-all shadow-xl"
              >
                Guardar Cambios Web
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Actualización Masiva de Precios */}
      {showBulkPriceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#C9B8A8] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 text-left animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b border-stone-200 pb-3">
              <div>
                <h3 className="font-serif text-xl italic font-normal text-stone-900">Aumento / Descuento Masivo</h3>
                <p className="text-[9px] tracking-[0.18em] uppercase font-light text-stone-400">Actualizar precios por porcentaje</p>
              </div>
              <button onClick={() => setShowBulkPriceModal(false)} className="p-1 hover:bg-stone-100 rounded-full cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-stone-500 block mb-1">Categoría Objetivo</label>
                <select 
                  value={bulkCategory} 
                  onChange={e => setBulkCategory(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs uppercase font-medium focus:outline-none"
                >
                  <option value="">Todas las Categorías</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-stone-500 block mb-1">Porcentaje (+10% aumento / -10% descuento)</label>
                <input 
                  type="number" 
                  value={bulkPercentage} 
                  onChange={e => setBulkPercentage(Number(e.target.value))}
                  className="w-full bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs font-mono font-bold focus:outline-none"
                  placeholder="Ej: 15"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-stone-500 block mb-1">Aplicar a</label>
                <select 
                  value={bulkTarget} 
                  onChange={e => setBulkTarget(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-200 p-2 rounded-xl text-xs uppercase font-medium focus:outline-none"
                >
                  <option value="both">Ambos (Efectivo y Tarjeta)</option>
                  <option value="efectivo">Solo Venta Efectivo / Transferencia</option>
                  <option value="tarjeta">Solo Venta Tarjeta</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-100">
              <button 
                onClick={() => setShowBulkPriceModal(false)}
                className="flex-1 py-2.5 bg-stone-100 text-stone-700 text-[10px] tracking-widest uppercase font-bold rounded-xl hover:bg-stone-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleApplyBulkPriceChange}
                className="flex-1 py-2.5 bg-stone-900 text-white text-[10px] tracking-widest uppercase font-bold rounded-xl hover:bg-black cursor-pointer"
              >
                Aplicar Precios
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WebManager;
