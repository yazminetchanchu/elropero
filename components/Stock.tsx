import React from 'react';
import { InventoryItem } from '../types';
import { Tag, Sparkles, PackagePlus } from 'lucide-react';

interface StockProps {
  onAddItem: (item: Omit<InventoryItem, 'id' | 'costoTotal'>) => void;
  inventory: InventoryItem[];
}

const Stock: React.FC<StockProps> = ({ onAddItem, inventory }) => {
  const [formData, setFormData] = React.useState({
    descripcion: '',
    proveedor: '',
    cantidad: 1,
    costo: 0
  });
  const [ventaEfectivo, setVentaEfectivo] = React.useState(0);
  const [ventaTarjeta, setVentaTarjeta] = React.useState(0);
  const [generatedSku, setGeneratedSku] = React.useState('');

  const handlePriceInput = (value: string, callback: (num: number) => void) => {
    const numericValue = value.replace(/\D/g, ''); // 1. Elimina letras/puntos
    const finalValue = numericValue === '' ? 0 : parseInt(numericValue, 10); // 2. Borra el 0 inicial
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
    const sugeridoEfe = Math.ceil((val * 1.68) / 1000) * 1000;
    const sugeridoTar = Math.ceil((sugeridoEfe * 1.27) / 1000) * 1000;
    setVentaEfectivo(sugeridoEfe);
    setVentaTarjeta(sugeridoTar);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.descripcion || !formData.proveedor || !generatedSku) return;
    
    onAddItem({
      fechaIngreso: new Date().toLocaleDateString('es-AR'),
      sku: generatedSku,
      ventaEfectivo,
      ventaTarjeta,
      ...formData
    });

    setFormData({ descripcion: '', proveedor: '', cantidad: 1, costo: 0 });
    setVentaEfectivo(0);
    setVentaTarjeta(0);
    setGeneratedSku('');
  };

  return (
    <div className="w-full text-left">
      <div className="mb-6 border-b-2 border-[#C9B8A8]/30 pb-4 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-3xl mb-1 italic tracking-tight text-left text-[#1A1A1A]">Carga de Mercadería</h2>
          <p className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A] text-left">Ingreso de stock con precio y referencia</p>
        </div>
        <PackagePlus className="opacity-10 hidden md:block" size={40} />
      </div>

      <div className="flex flex-col items-start">
        <form onSubmit={handleSubmit} className="w-full bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 -mr-12 -mt-12 bg-[#F5F1EB] rounded-full opacity-50 border border-[#C9B8A8]/30"></div>
          
          <div className="space-y-6 relative z-10">
            <div className="space-y-3">
              <label className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A] leading-none">Descripción de la Prenda</label>
              <input 
                type="text" 
                required 
                value={formData.descripcion} 
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} 
                className="w-full bg-transparent border-b-2 border-[#C9B8A8]/40 py-4 focus:outline-none focus:border-[#C9B8A8] text-sm font-medium uppercase tracking-wide text-[#1A1A1A] placeholder:text-gray-500 transition-colors" 
                placeholder="BIKINI, VESTIDO, ETC." 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A] leading-none">Proveedor</label>
                <input 
                  type="text" 
                  required 
                  value={formData.proveedor} 
                  onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })} 
                  className="w-full bg-transparent border-b-2 border-[#C9B8A8]/40 py-4 focus:outline-none focus:border-[#C9B8A8] text-sm font-medium uppercase tracking-wide text-[#1A1A1A] placeholder:text-gray-500 transition-colors" 
                  placeholder="SKY, PALPITANTE, ETC." 
                />
              </div>

              <div className="bg-[#F5F1EB]/60 border-2 border-[#C9B8A8]/50 rounded-xl p-6 flex flex-col justify-center h-full shadow-sm">
                <p className="text-[9px] tracking-[3px] uppercase font-black text-[#1A1A1A] leading-none">Referencia Asignada (REF)</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="bg-[#C9B8A8] text-[#1A1A1A] p-2 rounded-lg">
                    <Tag size={14} />
                  </div>
                  <span className={`font-serif text-3xl font-bold italic text-[#1A1A1A] ${!generatedSku ? 'opacity-20' : 'opacity-100'}`}>
                    {generatedSku || '----'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-black text-[#1A1A1A] leading-none">Cantidad en Stock</label>
                <input 
                  type="number" 
                  min="1" 
                  required 
                  value={formData.cantidad} 
                  onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value) || 0 })} 
                  className="w-full bg-transparent border-b-2 border-[#C9B8A8]/40 py-4 focus:outline-none focus:border-[#C9B8A8] text-lg font-bold text-[#1A1A1A] transition-colors" 
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-black text-[#1A1A1A] leading-none">Costo Unitario</label>
                <div className="relative flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
                  <span className="text-lg font-black pr-1 text-[#1A1A1A]">$</span>
                  <input 
                    type="text"
                    required 
                    value={formData.costo === 0 ? "0" : formData.costo} 
                    onChange={(e) => handlePriceInput(e.target.value, handleCostoChange)} 
                    className="w-full bg-transparent py-4 focus:outline-none text-lg font-black text-[#1A1A1A]" 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className = "bg-[#C9B8A8]/10 text-[#1A1A1A] p-5 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-lg border border-[#C9B8A8]/20">
              <div className="text-center md:text-left flex flex-col md:flex-row gap-6 w-full md:w-auto items-center">
                  <div className="hidden lg:block border-r border-[#C9B8A8]/30 pr-4 mr-2">
                    <span className="text-[10px] tracking-[3px] font-medium uppercase text-[#1A1A1A] block">Precios Finales</span>
                  </div>
                  <div className="flex gap-6">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-medium tracking-[1px] text-[#1A1A1A]">Efectivo</p>
                        <div className="flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
                          <span className="font-serif text-lg font-bold italic text-[#1A1A1A] pr-1">$</span>
                          <input 
                            type="text" 
                            value={ventaEfectivo === 0 ? "0" : ventaEfectivo} 
                            onChange={(e) => handlePriceInput(e.target.value, setVentaEfectivo)}
                            className="bg-transparent font-serif text-lg font-bold italic text-[#1A1A1A] focus:outline-none w-24 py-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-medium tracking-[1px] text-[#1A1A1A]">Tarjeta</p>
                        <div className="flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
                          <span className="font-serif text-lg font-bold italic text-[#1A1A1A] pr-1">$</span>
                          <input 
                            type="text" 
                            value={ventaTarjeta === 0 ? "0" : ventaTarjeta} 
                            onChange={(e) => handlePriceInput(e.target.value, setVentaTarjeta)}
                            className="bg-transparent font-serif text-lg font-bold italic text-[#1A1A1A] focus:outline-none w-24 py-1"
                          />
                        </div>
                      </div>
                  </div>
              </div>
              
              <button 
                type="submit" 
                disabled={!generatedSku}
                className="group flex items-center gap-2 bg-[#C9B8A8] text-[#1A1A1A] px-6 py-3 text-[10px] tracking-[4px] font-medium uppercase hover:bg-[#B8A696] transition-all disabled:opacity-30 flex-shrink-0 border border-[#C9B8A8]/50 rounded-lg shadow-md hover:shadow-lg"
              >
                <span>Confirmar</span>
                <Sparkles size={12} className="group-hover:rotate-12 transition-transform" />
              </button>
          </div>
        </form>
      </div>
      
      <div className="mt-12 text-center opacity-30">
        <p className="text-[9px] uppercase tracking-[5px] font-bold">El Ropero Showroom &copy; 2026</p>
      </div>
    </div>
  );
};

export default Stock;