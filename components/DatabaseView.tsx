import React from 'react';
import { InventoryItem, Sale, Expense, GiftCard } from '../types';
import { CloudUpload, CloudDownload, Key, CheckCircle2, Wifi, WifiOff, Loader2, Database, Download } from 'lucide-react';
import { database } from '../services/storage';

interface DatabaseViewProps {
  inventory: InventoryItem[];
  sales: Sale[];
  expenses: Expense[];
  giftCards: GiftCard[];
  onRefreshAllData: () => void;
}

const DatabaseView: React.FC<DatabaseViewProps> = ({ inventory, sales, expenses, giftCards, onRefreshAllData }) => {
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncKey, setSyncKey] = React.useState(database.getShowroomID());
  const [lastSync, setLastSync] = React.useState(database.getLocalBackup().lastSync || "");
  const [isKeyDifferent, setIsKeyDifferent] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCloudPush = async () => {
    if (!isOnline) { 
      alert("Sin conexión a internet."); 
      return; 
    }
    setIsSyncing(true);

    try {
      await database.persist({ inventory, sales, expenses, giftCards });
      const now = new Date().toLocaleString();
      setLastSync(now);
      alert("Sincronización exitosa. Los datos están seguros en la nube.");
    } catch (e) {
      alert("Error al sincronizar. Intente nuevamente.");
    }

    setIsSyncing(false);
  };

  const handleCloudPull = async () => {
    if (!isOnline) { 
      alert("Sin conexión a internet."); 
      return; 
    }
    if (!confirm("Esto reemplazará todos tus datos locales con los del ID: " + syncKey)) return;
    setIsSyncing(true);

    const remoteData = await database.fetchRemote(syncKey);
    if (remoteData) {
      database.setShowroomID(syncKey);
      database.updateLocalOnly(remoteData);
      setIsKeyDifferent(false);
      onRefreshAllData();
      setLastSync(new Date().toLocaleString());
      alert("Datos recuperados correctamente.");
    } else {
      alert("No se encontró una base de datos con ese ID.");
    }

    setIsSyncing(false);
  };

  return (
    <div className="space-y-16 animate-in fade-in duration-700 text-left">
      <div className="border-b-2 border-black pb-8">
        <h2 className="font-serif text-5xl italic tracking-tighter mb-4">Gestión de Base de Datos</h2>
        <p className="text-[12px] tracking-[8px] uppercase font-black opacity-30 text-left">
          Persistencia y Sincronización en la Nube
        </p>
      </div>

      <section className="bg-black text-white p-8 md:p-16 shadow-[20px_20px_0px_0px_rgba(0,0,0,0.1)] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <Database size={250} />
        </div>

        <div className="relative z-10 flex flex-col gap-16">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-4">
              <h3 className="font-serif text-4xl italic">Servidor Central</h3>
              <div className="flex items-center gap-4">
                {isOnline ? (
                  <div className="flex items-center gap-2 text-green-400 text-[10px] font-black uppercase tracking-widest bg-green-400/10 px-4 py-2 rounded-full">
                    <Wifi size={14} /> Conectado
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400 text-[10px] font-black uppercase tracking-widest bg-red-400/10 px-4 py-2 rounded-full">
                    <WifiOff size={14} /> Desconectado
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16 items-end">
            <div className="space-y-6">
              <div className="flex items-center gap-3 opacity-40">
                <Key size={16} />
                <span className="text-[11px] tracking-[4px] font-black uppercase">ID de Showroom</span>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-6">
                  <input
                    type="text"
                    value={syncKey}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setSyncKey(val);
                      setIsKeyDifferent(val !== database.getShowroomID());
                    }}
                    className={`bg-transparent border-b-2 py-4 font-mono text-4xl focus:outline-none w-full uppercase transition-all ${
                      isKeyDifferent ? 'border-yellow-500 text-yellow-500' : 'border-white/20 text-white'
                    }`}
                  />
                  {!isKeyDifferent && <CheckCircle2 size={32} className="text-green-500" />}
                </div>
                <p className="text-[10px] opacity-40 uppercase tracking-[2px] leading-relaxed">
                  Usa este ID para sincronizar diferentes dispositivos. Los cambios que "subas" estarán disponibles para cualquier equipo con esta misma llave.
                </p>
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-wrap gap-8">
              <button
                onClick={handleCloudPush}
                disabled={isSyncing || isKeyDifferent || !isOnline}
                className="flex-1 min-w-[280px] flex items-center justify-center gap-4 bg-white text-black py-8 px-10 text-[12px] tracking-[5px] font-black uppercase hover:bg-neutral-200 transition-all disabled:opacity-20 shadow-2xl"
              >
                {isSyncing ? <Loader2 className="animate-spin" size={24} /> : <CloudUpload size={24} />}
                {isSyncing ? 'Procesando...' : 'Subir a la Nube'}
              </button>

              <button
                onClick={handleCloudPull}
                disabled={isSyncing || !isOnline}
                className="flex-1 min-w-[280px] flex items-center justify-center gap-4 border-2 border-white/20 py-8 px-10 text-[12px] tracking-[5px] font-black uppercase hover:bg-white/10 transition-all disabled:opacity-20"
              >
                <CloudDownload size={24} /> Descargar Datos
              </button>
            </div>
          </div>

          <div className="pt-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex flex-col gap-2 text-[10px] tracking-[4px] font-black uppercase opacity-40">
              <span>Última Sincronización Realizada: {lastSync}</span>
              <span>Encriptación: AES-256 Activa</span>
            </div>

            <button
              onClick={database.exportBackupFile}
              className="text-[10px] tracking-[3px] font-black uppercase opacity-60 hover:opacity-100 flex items-center gap-3 border border-white/20 px-6 py-3 hover:bg-white/5 transition-all"
            >
              <Download size={18} /> Exportar Backup JSON
            </button>
          </div>
        </div>
      </section>

      <div className="pt-20 opacity-10 text-center">
        <p className="font-serif italic text-xl">El Ropero Cloud Engine — Persistencia Definitiva</p>
      </div>
    </div>
  );
};

export default DatabaseView;
