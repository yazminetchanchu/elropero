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
        <div className="border-b border-stone-200/60 pb-3">
            <h2 className="font-serif text-2xl mb-0.5 italic font-normal tracking-tight text-stone-900">Egresos de Caja</h2>
            <p className="text-[9px] tracking-[0.18em] uppercase font-light text-stone-400">Registro de gastos operativos y salidas varias</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-stone-200/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.02)] text-left transition-all duration-200 ease-out hover:border-stone-300 hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.05)]">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Concepto del Gasto</label>
              <input
                type="text"
                required
                value={formData.concepto}
                onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
                className="w-full bg-transparent border-b border-stone-200/80 py-3 focus:outline-none focus:border-stone-500 text-sm font-medium uppercase tracking-wide text-stone-900 placeholder:text-stone-400 transition-colors"
                placeholder="EJ: ALQUILER, PACKAGING, PUBLICIDAD"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Monto ($)</label>
              <div className="relative flex items-center border-b border-stone-200/80 focus-within:border-stone-500 transition-colors">
                <span className="text-xl font-mono text-stone-400 pr-1">$</span>
                <input
                  type="text"
                  required
                  value={formData.monto === 0 ? "0" : formData.monto}
                  onChange={(e) => handlePriceInput(e.target.value, (val) => setFormData({ ...formData, monto: val }))}
                  className="w-full bg-transparent py-3 focus:outline-none text-xl font-mono font-medium text-stone-900"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-stone-900 text-white py-3.5 text-[10px] tracking-[0.2em] font-medium uppercase hover:bg-black transition-all duration-200 ease-out rounded-xl shadow-xs hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
          >
            Registrar Egreso
          </button>
        </form>
      </section>

      <section className="space-y-5 max-w-5xl">
        <div className="text-left border-b border-stone-200/60 pb-3">
            <h3 className="font-serif text-xl italic font-normal text-stone-900">Historial de Salidas</h3>
            <p className="text-[9px] tracking-[0.18em] uppercase font-light text-stone-400">Detalle cronológico de gastos registrados</p>
        </div>
        <div className="bg-white border border-stone-200/60 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="max-h-[calc(100vh-320px)] min-h-[250px] overflow-y-auto">
            {expenses.length > 0 ? (
                <ul className="divide-y divide-stone-100">
                    {expenses.slice().reverse().map((exp) => (
                        <li key={exp.id} className="p-4 flex justify-between items-center hover:bg-stone-50/70 transition-colors">
                            <div className="flex-1 text-left">
                                <p className="font-medium text-xs tracking-[0.15em] uppercase text-stone-900">{exp.concepto}</p>
                                <p className="text-[9px] text-stone-400 mt-0.5 uppercase tracking-[0.15em] font-light">{exp.fecha}</p>
                            </div>
                            <div className="flex items-center gap-5">
                                <p className="font-serif text-xl italic text-rose-700 leading-none">-$ {exp.monto.toLocaleString()}</p>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => setEditingExpense(exp)} 
                                    className="p-2 border border-stone-200/70 rounded-xl hover:bg-stone-100 text-stone-700 transition-all shadow-2xs"
                                    title="Editar"
                                  >
                                    <Edit2 size={13} strokeWidth={1.5} />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(exp.id)} 
                                    className={`p-2 border rounded-xl transition-all flex items-center gap-1.5 shadow-2xs ${
                                      pendingDeleteId === exp.id 
                                        ? 'bg-rose-600 border-rose-600 text-white font-medium' 
                                        : 'border-rose-200/80 text-rose-600 hover:bg-rose-50'
                                    }`}
                                    title="Eliminar"
                                  >
                                    {pendingDeleteId === exp.id ? <span className="text-[9px] uppercase tracking-wider">¿Borrar?</span> : <Trash2 size={13} strokeWidth={1.5} />}
                                  </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="p-24 text-center text-stone-400">
                    <p className="text-[10px] tracking-[0.2em] uppercase font-light">Sin egresos registrados</p>
                </div>
            )}
          </div>
        </div>
      </section>

      {editingExpense && (
        <div className="fixed inset-0 z-[60] bg-stone-900/30 backdrop-blur-md flex items-center justify-center p-4 text-left">
          <div className="bg-white border border-stone-200/70 rounded-3xl w-full max-w-md p-8 shadow-xl relative">
            <button onClick={() => setEditingExpense(null)} className="absolute top-6 right-6 p-1.5 hover:bg-stone-100 rounded-xl transition-colors text-stone-500"><X size={18} strokeWidth={1.5} /></button>
            <h3 className="font-serif text-2xl mb-6 italic text-stone-900">Editar Egreso</h3>
            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Concepto</label>
                <input 
                  type="text" 
                  value={editingExpense.concepto} 
                  onChange={(e) => setEditingExpense({...editingExpense, concepto: e.target.value})}
                  className="w-full bg-transparent border-b border-stone-200/80 py-2.5 focus:outline-none focus:border-stone-500 text-sm font-medium uppercase text-stone-900 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] tracking-[0.18em] uppercase font-semibold text-stone-400 leading-none">Monto</label>
                <div className="relative flex items-center border-b border-stone-200/80 focus-within:border-stone-500 transition-colors">
                  <span className="text-lg font-mono text-stone-400 pr-1">$</span>
                  <input 
                    type="text" 
                    value={editingExpense.monto === 0 ? "0" : editingExpense.monto} 
                    onChange={(e) => handlePriceInput(e.target.value, (val) => setEditingExpense({...editingExpense, monto: val}))}
                    className="w-full bg-transparent py-2.5 focus:outline-none text-lg font-mono font-medium text-stone-900"
                  />
                </div>
              </div>
              <button type="submit" className="w-full bg-stone-900 text-white py-3 text-[10px] tracking-[0.2em] font-medium uppercase hover:bg-black transition-all rounded-xl shadow-xs">
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