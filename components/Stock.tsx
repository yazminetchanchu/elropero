import React from 'react';
import { InventoryItem, WebSettings } from '../types';
import { Tag, Sparkles, PackagePlus, CheckCircle2 } from 'lucide-react';
import { calculatePricesFromCost } from '../services/finance';

interface StockProps {
  onAddItem: (item: Omit<InventoryItem, 'id'>) => void;
  inventory: InventoryItem[];
  webSettings: WebSettings;
}

const Stock: React.FC<StockProps> = ({ onAddItem, inventory, webSettings }) => {
  const [formData, setFormData] = React.useState({
    descripcion: '',
    proveedor: '',
    cantidad: 1,
    costo: 0,
    categoria: ''
  });
  const [ventaEfectivo, setVentaEfectivo] = React.useState(0);
  const [ventaTarjeta, setVentaTarjeta] = React.useState(0);
  const [generatedSku, setGeneratedSku] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [recentlyAdded, setRecentlyAdded] = React.useState<any[]>([]);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const categorias = webSettings.categoriesOrder || [];

  const handlePriceInput = (value: string, callback: (num: number) => void) => {
    // Para campos de venta (efectivo/tarjeta) seguimos usando limpieza de caracteres no numéricos
    // pero asegurando que el parseo sea limpio.
    const numericValue = value.replace(/\D/g, ''); 
    const finalValue = numericValue === '' ? 0 : parseInt(numericValue, 10);
    callback(finalValue);
  };

  // Generar SKU único localmente para previsualización y confirmación
  const generateLocalSKU = (provider: string) => {
    if (!provider.trim()) return '';
    const initial = provider.trim().charAt(0).toUpperCase();
    let isUnique = false;
    let newSku = '';
    let attempts = 0;

    while (!isUnique && attempts < 100) {
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      newSku = `${initial}${randomNum}`;
      isUnique = !inventory.some(item => item.sku === newSku);
      attempts++;
    }
    return newSku;
  };

  // Actualizar el SKU cuando cambian los datos base
  React.useEffect(() => {
    if (formData.proveedor.trim()) {
      setGeneratedSku(generateLocalSKU(formData.proveedor));
    } else {
      setGeneratedSku('');
    }
  }, [formData.proveedor, inventory]);

  // Manejar el cambio de costo para actualizar precios sugeridos editables
  const handleCostoChange = (val: number) => {
    setFormData({ ...formData, costo: val });
    const { ventaEfectivo, ventaTarjeta } = calculatePricesFromCost(val);
    setVentaEfectivo(ventaEfectivo);
    setVentaTarjeta(ventaTarjeta);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.descripcion || !formData.proveedor || !generatedSku || isSaving) return;
    
    setIsSaving(true);

    const newItem: Omit<InventoryItem, 'id'> = {
      descripcion: formData.descripcion.trim().toUpperCase(),
      proveedor: formData.proveedor.trim().toUpperCase(),
      cantidad: formData.cantidad,
      costo: formData.costo,
      ventaEfectivo: ventaEfectivo,
      ventaTarjeta: ventaTarjeta,
      sku: generatedSku,
      categoria: formData.categoria || 'OTROS',
      fechaIngreso: new Date().toLocaleDateString('es-AR'),
      talles: [],
      colores: [],
      imagenes: [],
      visible: false // Hidden by default when adding stock
    };

    onAddItem(newItem);

    // Mantener en lista local de la sesión
    setRecentlyAdded(prev => [newItem, ...prev].slice(0, 5));
    
    // Feedback de éxito
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);

    // Reset form
    setFormData({ descripcion: '', proveedor: '', cantidad: 1, costo: 0, categoria: '' });
    setVentaEfectivo(0);
    setVentaTarjeta(0);
    setGeneratedSku('');
    setIsSaving(false);
  };

  return (
    <div className="w-full text-left">
      <div className="mb-6 border-b border-stone-200/60 pb-3 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl mb-0.5 italic font-normal tracking-tight text-left text-stone-900">Carga de Mercadería</h2>
          <p className="text-[9px] tracking-[0.18em] uppercase font-light text-stone-400 text-left">Ingreso de stock con precio y referencia</p>
        </div>
        <PackagePlus className="text-stone-300 hidden md:block" size={32} strokeWidth={1.5} />
      </div>

      <div className="flex flex-col items-start">
        <form 
          onSubmit={handleSubmit} 
          autoComplete="off"
          className="w-full bg-white border border-stone-200/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.02)] text-left relative overflow-hidden transition-all duration-200 ease-out hover:border-stone-300 hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.05)]"
        >
          <div className="space-y-6 relative z-10">
            <div className="space-y-2">
              <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Descripción de la Prenda</label>
                <input 
                  type="text" 
                  required 
                  name="desc-ropero-new"
                  autoComplete="off"
                  value={formData.descripcion} 
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} 
                  className="w-full bg-transparent border-b border-stone-200/80 py-3 focus:outline-none focus:border-stone-500 text-sm font-medium uppercase tracking-wide text-stone-900 placeholder:text-stone-400 transition-colors" 
                  placeholder="BIKINI, VESTIDO, ETC." 
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-2">
                <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Proveedor</label>
                <input 
                  type="text" 
                  required 
                  name="prov-ropero-new"
                  autoComplete="off"
                  value={formData.proveedor} 
                  onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })} 
                  className="w-full bg-transparent border-b border-stone-200/80 py-3 focus:outline-none focus:border-stone-500 text-sm font-medium uppercase tracking-wide text-stone-900 placeholder:text-stone-400 transition-colors" 
                  placeholder="SKY, PALPITANTE, ETC." 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Categoría</label>
                <select 
                  required value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                  className="w-full bg-transparent border-b border-stone-200/80 py-3 focus:outline-none focus:border-stone-500 text-sm font-medium uppercase tracking-wide text-stone-900 transition-colors cursor-pointer"
                >
                  <option value="">SELECCIONAR...</option>
                  {categorias.map(c => <option key={c} value={c.toUpperCase()}>{c.toUpperCase()}</option>)}
                </select>
              </div>

              <div className="bg-stone-50/80 border border-stone-200/60 rounded-xl p-5 flex flex-col justify-center h-full shadow-2xs">
                <p className="text-[8px] tracking-[0.2em] uppercase font-semibold text-stone-400 leading-none">Referencia Asignada (REF)</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="bg-stone-200/60 text-stone-800 p-2 rounded-lg">
                    <Tag size={13} strokeWidth={1.5} />
                  </div>
                  <span className={`font-serif text-2xl font-normal italic text-stone-900 ${!generatedSku ? 'opacity-20' : 'opacity-100'}`}>
                    {generatedSku || '----'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Cantidad en Stock</label>
                <input 
                  type="number" 
                  min="1" 
                  required 
                  value={formData.cantidad} 
                  onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value) || 0 })} 
                  className="w-full bg-transparent border-b border-stone-200/80 py-3 focus:outline-none focus:border-stone-500 text-base font-mono font-medium text-stone-900 transition-colors" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Costo Unitario</label>
                <div className="relative flex items-center border-b border-stone-200/80 focus-within:border-stone-500 transition-colors">
                  <span className="text-base font-mono font-medium pr-1 text-stone-900">$</span>
                  <input 
                    type="number"
                    step="any"
                    required 
                    name="cost-exact-input"
                    autoComplete="off"
                    value={formData.costo || ''} 
                    onChange={(e) => handleCostoChange(parseFloat(e.target.value) || 0)} 
                    className="w-full bg-transparent py-3 focus:outline-none text-base font-mono font-medium text-stone-900" 
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-stone-50/80 text-stone-900 p-5 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 border border-stone-200/60 shadow-2xs">
              <div className="text-center md:text-left flex flex-col md:flex-row gap-6 w-full md:w-auto items-center">
                  <div className="hidden lg:block border-r border-stone-200/80 pr-4 mr-2">
                    <span className="text-[9px] tracking-[0.18em] font-medium uppercase text-stone-400 block">Precios Finales</span>
                  </div>
                  <div className="flex gap-6">
                      <div className="space-y-1">
                        <p className="text-[9px] uppercase font-medium tracking-[0.15em] text-stone-500">Efectivo</p>
                        <div className="flex items-center border-b border-stone-200/80 focus-within:border-stone-500 transition-colors">
                          <span className="font-serif text-base font-medium italic text-stone-900 pr-1">$</span>
                          <input 
                            type="text" 
                            value={ventaEfectivo === 0 ? "0" : ventaEfectivo} 
                            onChange={(e) => handlePriceInput(e.target.value, setVentaEfectivo)}
                            className="bg-transparent font-serif text-base font-medium italic text-stone-900 focus:outline-none w-24 py-0.5"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] uppercase font-medium tracking-[0.15em] text-stone-500">Tarjeta</p>
                        <div className="flex items-center border-b border-stone-200/80 focus-within:border-stone-500 transition-colors">
                          <span className="font-serif text-base font-medium italic text-stone-900 pr-1">$</span>
                          <input 
                            type="text" 
                            value={ventaTarjeta === 0 ? "0" : ventaTarjeta} 
                            onChange={(e) => handlePriceInput(e.target.value, setVentaTarjeta)}
                            className="bg-transparent font-serif text-base font-medium italic text-stone-900 focus:outline-none w-24 py-0.5"
                          />
                        </div>
                      </div>
                  </div>
              </div>
              
              <button 
                type="submit" 
                disabled={!generatedSku || isSaving}
                className={`group flex items-center gap-2 px-5 py-2.5 text-[9px] tracking-[0.18em] font-medium uppercase transition-all duration-200 ease-out shrink-0 rounded-xl shadow-xs hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-40 ${
                  showSuccess 
                    ? 'bg-emerald-800 text-white' 
                    : 'bg-stone-900 text-white hover:bg-black'
                }`}
              >
                <span>{isSaving ? 'Guardando...' : showSuccess ? '¡Confirmado!' : 'Confirmar'}</span>
                {showSuccess ? <CheckCircle2 size={12} strokeWidth={1.5} /> : <Sparkles size={12} strokeWidth={1.5} className="group-hover:rotate-12 transition-transform" />}
              </button>
          </div>
        </form>

        {recentlyAdded.length > 0 && (
          <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="font-serif text-lg italic mb-3 text-stone-400 font-light">Recién cargados</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentlyAdded.map((item, idx) => (
                <div key={idx} className="bg-white border border-stone-200/60 rounded-xl p-4 flex justify-between items-center shadow-2xs hover:-translate-y-1 hover:shadow-md hover:border-stone-300 transition-all duration-200 ease-out">
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-stone-900 uppercase tracking-wide truncate max-w-[140px]">{item.descripcion}</p>
                    <p className="text-[9px] font-mono text-stone-400">REF: {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[7px] uppercase text-stone-400 mb-0.5">Costo: ${item.costo.toLocaleString()}</p>
                    <p className="font-serif italic text-base text-stone-900">${item.ventaEfectivo.toLocaleString()}</p>
                    <p className="text-[8px] uppercase tracking-[0.15em] text-stone-400">Venta — {item.cantidad} UNIDS</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stock;