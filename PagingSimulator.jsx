import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const PagingSimulator = () => {
  const [physicalMemMB, setPhysicalMemMB] = useState(128);
  const [virtualMemMB, setVirtualMemMB] = useState(0);
  const [pageSize, setPageSize] = useState(4);
  const [minProcessSize, setMinProcessSize] = useState(4);
  const [maxProcessSize, setMaxProcessSize] = useState(32);
  
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processes, setProcesses] = useState([]);
  const [ram, setRam] = useState([]);
  const [swap, setSwap] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ pageFaults: 0, processesCreated: 0, processesFinished: 0 });
  
  const nextPidRef = useRef(1);
  const timerRef = useRef(null);
  const lastProcessCreateRef = useRef(0);
  const lastEventRef = useRef(0);

  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev.slice(-100), { time: elapsedTime, message, type }]);
  };

  const initializeSimulation = () => {
    const virtualMem = Math.floor(physicalMemMB * (1.5 + Math.random() * 3));
    setVirtualMemMB(virtualMem);
    
    const ramPages = Math.floor((physicalMemMB * 1024) / pageSize);
    const swapPages = Math.floor((virtualMem * 1024) / pageSize) - ramPages;
    
    setRam(new Array(ramPages).fill(null));
    setSwap(new Array(swapPages).fill(null));
    setProcesses([]);
    setLogs([]);
    setStats({ pageFaults: 0, processesCreated: 0, processesFinished: 0 });
    setElapsedTime(0);
    nextPidRef.current = 1;
    lastProcessCreateRef.current = 0;
    lastEventRef.current = 0;
    
    addLog(`Simulación inicializada: RAM=${physicalMemMB}MB, Virtual=${virtualMem}MB, Página=${pageSize}KB`, 'success');
  };

  const createProcess = () => {
    const sizeMB = minProcessSize + Math.random() * (maxProcessSize - minProcessSize);
    const sizeKB = Math.floor(sizeMB * 1024);
    const pagesNeeded = Math.ceil(sizeKB / pageSize);
    
    const pid = nextPidRef.current++;
    const newProcess = {
      pid,
      size: sizeKB,
      pages: pagesNeeded,
      pageTable: []
    };

    let ramFreePages = ram.filter(p => p === null).length;
    let swapFreePages = swap.filter(p => p === null).length;
    
    if (pagesNeeded > ramFreePages + swapFreePages) {
      addLog(`ERROR: No hay suficiente memoria para proceso P${pid} (necesita ${pagesNeeded} páginas)`, 'error');
      setIsRunning(false);
      setIsPaused(false);
      return null;
    }

    const newRam = [...ram];
    const newSwap = [...swap];
    
    for (let i = 0; i < pagesNeeded; i++) {
      const pageInfo = { pid, pageNum: i };
      
      if (ramFreePages > 0) {
        const ramIdx = newRam.findIndex(p => p === null);
        newRam[ramIdx] = pageInfo;
        newProcess.pageTable.push({ virtual: i, physical: ramIdx, location: 'RAM' });
        ramFreePages--;
      } else {
        const swapIdx = newSwap.findIndex(p => p === null);
        newSwap[swapIdx] = pageInfo;
        newProcess.pageTable.push({ virtual: i, physical: swapIdx, location: 'SWAP' });
      }
    }

    setRam(newRam);
    setSwap(newSwap);
    setProcesses(prev => [...prev, newProcess]);
    setStats(prev => ({ ...prev, processesCreated: prev.processesCreated + 1 }));
    addLog(`Proceso P${pid} creado: ${sizeKB}KB (${pagesNeeded} páginas)`, 'success');
    
    return newProcess;
  };

  const finishRandomProcess = () => {
    if (processes.length === 0) return;
    
    const idx = Math.floor(Math.random() * processes.length);
    const process = processes[idx];
    
    const newRam = [...ram];
    const newSwap = [...swap];
    
    process.pageTable.forEach(entry => {
      if (entry.location === 'RAM') {
        newRam[entry.physical] = null;
      } else {
        newSwap[entry.physical] = null;
      }
    });
    
    setRam(newRam);
    setSwap(newSwap);
    setProcesses(prev => prev.filter((_, i) => i !== idx));
    setStats(prev => ({ ...prev, processesFinished: prev.processesFinished + 1 }));
    addLog(`Proceso P${process.pid} finalizado (liberó ${process.pages} páginas)`, 'info');
  };

  const accessVirtualAddress = () => {
    if (processes.length === 0) return;
    
    const process = processes[Math.floor(Math.random() * processes.length)];
    const virtualPage = Math.floor(Math.random() * process.pages);
    const virtualAddr = virtualPage * pageSize * 1024 + Math.floor(Math.random() * pageSize * 1024);
    
    const pageEntry = process.pageTable[virtualPage];
    
    addLog(`Acceso a dirección virtual 0x${virtualAddr.toString(16).toUpperCase()} (P${process.pid}, página ${virtualPage})`, 'info');
    
    if (pageEntry.location === 'SWAP') {
      addLog(`PAGE FAULT: Página ${virtualPage} de P${process.pid} está en SWAP`, 'warning');
      setStats(prev => ({ ...prev, pageFaults: prev.pageFaults + 1 }));
      
      // Política FIFO: buscar la página más antigua en RAM
      const ramPages = ram.map((page, idx) => ({ page, idx })).filter(p => p.page !== null);
      
      if (ramPages.length > 0) {
        const victimIdx = ramPages[0].idx;
        const victim = ram[victimIdx];
        
        // Swap de páginas
        const newRam = [...ram];
        const newSwap = [...swap];
        const newProcesses = [...processes];
        
        // Mover víctima a SWAP
        const swapFreeIdx = newSwap.findIndex(p => p === null);
        if (swapFreeIdx !== -1) {
          newSwap[swapFreeIdx] = victim;
          newSwap[pageEntry.physical] = null;
          
          // Actualizar tabla de páginas de la víctima
          const victimProcess = newProcesses.find(p => p.pid === victim.pid);
          if (victimProcess) {
            const victimEntry = victimProcess.pageTable.find(e => e.physical === victimIdx && e.location === 'RAM');
            if (victimEntry) {
              victimEntry.physical = swapFreeIdx;
              victimEntry.location = 'SWAP';
            }
          }
          
          // Mover página solicitada a RAM
          newRam[victimIdx] = { pid: process.pid, pageNum: virtualPage };
          pageEntry.physical = victimIdx;
          pageEntry.location = 'RAM';
          
          setRam(newRam);
          setSwap(newSwap);
          setProcesses(newProcesses);
          
          addLog(`Swap realizado: P${victim.pid} página ${victim.pageNum} → SWAP, P${process.pid} página ${virtualPage} → RAM (FIFO)`, 'warning');
        }
      }
    } else {
      addLog(`Página ${virtualPage} encontrada en RAM (frame ${pageEntry.physical})`, 'success');
    }
  };

  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => {
          const newTime = prev + 1;
          
          // Crear proceso cada 2 segundos
          if (newTime - lastProcessCreateRef.current >= 2) {
            createProcess();
            lastProcessCreateRef.current = newTime;
          }
          
          // Eventos cada 5 segundos después de los 30 segundos
          if (newTime >= 30 && newTime - lastEventRef.current >= 5) {
            finishRandomProcess();
            setTimeout(() => accessVirtualAddress(), 100);
            lastEventRef.current = newTime;
          }
          
          return newTime;
        });
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, isPaused, processes]);

  const handleStart = () => {
    if (!isRunning) {
      initializeSimulation();
    }
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
    initializeSimulation();
  };

  const ramUsage = ((ram.filter(p => p !== null).length / ram.length) * 100).toFixed(1);
  const swapUsage = ((swap.filter(p => p !== null).length / swap.length) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
          Simulador de Paginación de Memoria
        </h1>
        <p className="text-center text-slate-400 mb-6">Sistemas Operativos - Universidad Diego Portales</p>

        {!isRunning && (
          <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 mb-6 border border-slate-700">
            <h2 className="text-xl font-semibold mb-4 text-blue-400">Configuración</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Memoria Física (MB)</label>
                <input
                  type="number"
                  value={physicalMemMB}
                  onChange={(e) => setPhysicalMemMB(Number(e.target.value))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  min="16"
                  max="1024"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Tamaño de Página (KB)</label>
                <input
                  type="number"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                  min="1"
                  max="64"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Rango de Procesos (MB)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={minProcessSize}
                    onChange={(e) => setMinProcessSize(Number(e.target.value))}
                    className="w-1/2 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                    min="1"
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    value={maxProcessSize}
                    onChange={(e) => setMaxProcessSize(Number(e.target.value))}
                    className="w-1/2 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                    min="1"
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4 mb-6 justify-center">
          {!isRunning ? (
            <button
              onClick={handleStart}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
            >
              <Play size={20} /> Iniciar Simulación
            </button>
          ) : (
            <>
              <button
                onClick={handlePause}
                className="bg-yellow-600 hover:bg-yellow-700 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <Pause size={20} /> {isPaused ? 'Reanudar' : 'Pausar'}
              </button>
              <button
                onClick={handleReset}
                className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition"
              >
                <RotateCcw size={20} /> Reiniciar
              </button>
            </>
          )}
        </div>

        {isRunning && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Tiempo Transcurrido</div>
                <div className="text-3xl font-bold text-blue-400">{elapsedTime}s</div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Procesos Activos</div>
                <div className="text-3xl font-bold text-green-400">{processes.length}</div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Page Faults</div>
                <div className="text-3xl font-bold text-orange-400">{stats.pageFaults}</div>
              </div>
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <div className="text-sm text-slate-400">Creados / Finalizados</div>
                <div className="text-3xl font-bold text-purple-400">{stats.processesCreated} / {stats.processesFinished}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <h3 className="text-lg font-semibold mb-3 text-blue-400">RAM ({physicalMemMB} MB)</h3>
                <div className="mb-2 bg-slate-700 rounded-full h-6 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full flex items-center justify-center text-xs font-bold"
                    style={{ width: `${ramUsage}%` }}
                  >
                    {ramUsage}%
                  </div>
                </div>
                <div className="text-sm text-slate-400">
                  {ram.filter(p => p !== null).length} / {ram.length} páginas usadas
                </div>
              </div>

              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <h3 className="text-lg font-semibold mb-3 text-purple-400">SWAP ({virtualMemMB - physicalMemMB} MB)</h3>
                <div className="mb-2 bg-slate-700 rounded-full h-6 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-full flex items-center justify-center text-xs font-bold"
                    style={{ width: `${swapUsage}%` }}
                  >
                    {swapUsage}%
                  </div>
                </div>
                <div className="text-sm text-slate-400">
                  {swap.filter(p => p !== null).length} / {swap.length} páginas usadas
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <h3 className="text-lg font-semibold mb-3 text-green-400">Procesos Activos</h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {processes.map(proc => (
                    <div key={proc.pid} className="bg-slate-700/50 rounded-lg p-3 text-sm">
                      <div className="font-semibold text-blue-300">P{proc.pid}</div>
                      <div className="text-slate-400">
                        Tamaño: {proc.size} KB | Páginas: {proc.pages}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        RAM: {proc.pageTable.filter(p => p.location === 'RAM').length} | 
                        SWAP: {proc.pageTable.filter(p => p.location === 'SWAP').length}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
                <h3 className="text-lg font-semibold mb-3 text-yellow-400">Log de Eventos</h3>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {logs.slice(-20).reverse().map((log, idx) => (
                    <div key={idx} className="text-sm flex items-start gap-2">
                      <span className="text-slate-500 shrink-0">[{log.time}s]</span>
                      {log.type === 'success' && <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />}
                      {log.type === 'warning' && <AlertCircle size={16} className="text-orange-400 shrink-0 mt-0.5" />}
                      {log.type === 'error' && <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />}
                      <span className={`${
                        log.type === 'success' ? 'text-green-300' :
                        log.type === 'warning' ? 'text-orange-300' :
                        log.type === 'error' ? 'text-red-300' :
                        'text-slate-300'
                      }`}>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PagingSimulator;