import React from 'react';
import { Expense } from '../types';
import { Edit2, Trash2, X } from 'lucide-react';

interface ExpensesProps {
  expenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  onUpdateExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

const Expenses: React.FC<ExpensesProps> = ({ expenses, onAddExpense, onUpdateExpense, onDeleteExpense }) => {
  const [formData, setFormData] = React.useState({
    concepto: '',
    monto: 0
  });
  
  const [editingExpense, setEditingExpense] = React.useState<Expense | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);

  // Función de limpieza de precio consistente con el resto de la app
  const handlePriceInput = (value: string, callback: (num: number) => void) => {
    const numericValue = value.replace(/\D/g, '');
    const finalValue = numericValue === '' ? 0 : parseInt(numericValue, 10);
    callback(finalValue);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.concepto || formData.monto <= 0) return;

    onAddExpense({
      fecha: new Date().toISOString(),
      ...formData
    });

    setFormData({ concepto: '', monto: 0 });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingExpense) {
      onUpdateExpense(editingExpense);
      setEditingExpense(null);
    }
  };

  const handleDelete = (id: string) => {
    if (pendingDeleteId === id) {
      onDeleteExpense(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
      setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  return (
    <div className="flex flex-col space-y-6 text-left max-w-7xl">
      <section className="space-y-6 max-w-4xl">
        <div className="border-b-2 border-[#C9B8A8]/30 pb-4">
            <h2 className="font-serif text-3xl mb-1 italic tracking-tight text-[#1A1A1A]">Egresos de Caja</h2>
            <p className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A]">Registro de gastos operativos y salidas varias</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl text-left">
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A] leading-none">Concepto del Gasto</label>
              <input
                type="text"
                required
                value={formData.concepto}
                onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
                className="w-full bg-transparent border-b-2 border-[#C9B8A8]/40 py-4 focus:outline-none focus:border-[#C9B8A8] text-sm font-medium uppercase tracking-wide text-[#1A1A1A] placeholder:text-gray-500 transition-colors"
                placeholder="EJ: ALQUILER, PACKAGING, PUBLICIDAD"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A] leading-none">Monto</label>
              <div className="relative flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
                <span className="text-2xl font-medium text-[#1A1A1A]/40 pr-1">$</span>
                <input
                  type="text"
                  required
                  value={formData.monto === 0 ? "0" : formData.monto}
                  onChange={(e) => handlePriceInput(e.target.value, (val) => setFormData({ ...formData, monto: val }))}
                  className="w-full bg-transparent py-4 focus:outline-none text-2xl font-medium text-[#1A1A1A]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#C9B8A8] text-[#1A1A1A] py-7 text-[12px] tracking-[7px] font-medium uppercase hover:bg-[#B8A696] transition-all rounded-xl shadow-lg hover:shadow-xl"
          >
            REGISTRAR EGRESO
          </button>
        </form>
      </section>

      <section className="space-y-6 max-w-5xl">
        <div className="text-left border-b-2 border-[#C9B8A8]/30 pb-4">
            <h3 className="font-serif text-2xl italic mb-1 text-[#1A1A1A]">Historial de Salidas</h3>
            <p className="text-[10px] tracking-[4px] uppercase font-medium text-[#1A1A1A]">Detalle cronológico de gastos registrados</p>
        </div>
        <div className="bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-[calc(100vh-500px)] overflow-y-auto">
            {expenses.length > 0 ? (
                <ul className="divide-y divide-[#C9B8A8]/20">
                    {expenses.slice().reverse().map((exp) => (
                        <li key={exp.id} className="p-4 flex justify-between items-center hover:bg-[#C9B8A8]/5 transition-colors">
                            <div className="flex-1 text-left">
                                <p className="font-medium text-sm tracking-[2px] uppercase text-[#1A1A1A]">{exp.concepto}</p>
                                <p className="text-[10px] text-[#1A1A1A]/60 mt-1 uppercase tracking-[3px] font-medium">{exp.fecha}</p>
                            </div>
                            <div className="flex items-center gap-6">
                                <p className="font-serif text-2xl italic text-red-700 leading-none">-$ {exp.monto.toLocaleString()}</p>
                                <div className="flex gap-3">
                                  <button 
                                    onClick={() => setEditingExpense(exp)} 
                                    className="p-3 border border-[#C9B8A8]/50 rounded-lg hover:bg-[#C9B8A8] hover:text-[#1A1A1A] transition-all text-[#1A1A1A] shadow-sm"
                                    title="Editar"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(exp.id)} 
                                    className={`p-3 border rounded-lg transition-all flex items-center gap-2 shadow-sm ${
                                      pendingDeleteId === exp.id 
                                        ? 'bg-red-600 border-red-600 text-white' 
                                        : 'border-red-200 text-red-600 hover:bg-red-50'
                                    }`}
                                    title="Eliminar"
                                  >
                                    {pendingDeleteId === exp.id ? <span className="text-[9px] font-black uppercase tracking-widest">¿BORRAR?</span> : <Trash2 size={16} />}
                                  </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="p-32 text-center opacity-20">
                    <p className="text-[10px] tracking-[8px] uppercase font-black text-[#1A1A1A]">Sin egresos registrados</p>
                </div>
            )}
          </div>
        </div>
      </section>

      {editingExpense && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 text-left">
          <div className="bg-white/95 backdrop-blur-md border border-[#C9B8A8]/50 rounded-2xl w-full max-w-lg p-12 shadow-2xl relative">
            <button onClick={() => setEditingExpense(null)} className="absolute top-8 right-8 p-2 hover:bg-[#C9B8A8]/20 rounded-lg transition-colors text-[#1A1A1A]"><X size={24} /></button>
            <h3 className="font-serif text-3xl mb-10 italic text-[#1A1A1A]">Editar Egreso</h3>
            <form onSubmit={handleEditSubmit} className="space-y-10">
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-black text-[#1A1A1A]/70 leading-none">Concepto</label>
                <input 
                  type="text" 
                  value={editingExpense.concepto} 
                  onChange={(e) => setEditingExpense({...editingExpense, concepto: e.target.value})}
                  className="w-full bg-transparent border-b-2 border-[#C9B8A8]/40 py-3 focus:outline-none focus:border-[#C9B8A8] text-sm font-bold uppercase text-[#1A1A1A] transition-colors"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] tracking-[4px] uppercase font-black text-[#1A1A1A]/70 leading-none">Monto</label>
                <div className="relative flex items-center border-b-2 border-[#C9B8A8]/40 focus-within:border-[#C9B8A8] transition-colors">
                  <span className="text-xl font-black text-[#1A1A1A]/50 pr-1">$</span>
                  <input 
                    type="text" 
                    value={editingExpense.monto === 0 ? "0" : editingExpense.monto} 
                    onChange={(e) => handlePriceInput(e.target.value, (val) => setEditingExpense({...editingExpense, monto: val}))}
                    className="w-full bg-transparent py-3 focus:outline-none text-2xl font-black text-[#1A1A1A]"
                  />
                </div>
              </div>
              <button type="submit" className="w-full bg-[#C9B8A8] text-[#1A1A1A] py-6 mt-6 text-[12px] tracking-[6px] font-medium uppercase hover:bg-[#B8A696] transition-all rounded-xl shadow-lg hover:shadow-xl">
                Guardar Cambios
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;