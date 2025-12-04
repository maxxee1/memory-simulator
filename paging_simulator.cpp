#include <iostream>
#include <vector>
#include <map>
#include <random>
#include <chrono>
#include <thread>
#include <iomanip>
#include <ctime>
#include <algorithm>

using namespace std;

// Estructura para representar una entrada en la tabla de páginas
struct PageTableEntry {
    int virtualPage;
    int physicalFrame;
    string location; // "RAM" o "SWAP"
};

// Estructura para representar un proceso
struct Process {
    int pid;
    int sizeKB;
    int numPages;
    vector<PageTableEntry> pageTable;
    time_t creationTime;
};

// Estructura para representar una página en memoria
struct Page {
    int pid;
    int pageNum;
    time_t loadTime; // Para política FIFO
};

class PagingSimulator {
private:
    int physicalMemMB;
    int virtualMemMB;
    int pageSizeKB;
    int minProcessSizeMB;
    int maxProcessSizeMB;
    
    int ramPages;
    int swapPages;
    
    vector<Page*> ram;
    vector<Page*> swap;
    vector<Process*> processes;
    
    int nextPid;
    int pageFaults;
    int processesCreated;
    int processesFinished;
    
    mt19937 rng;
    
    void log(const string& message) {
        auto now = chrono::system_clock::now();
        auto time = chrono::system_clock::to_time_t(now);
        cout << "[" << put_time(localtime(&time), "%H:%M:%S") << "] " << message << endl;
    }
    
    void printMemoryStatus() {
        int ramUsed = 0;
        int swapUsed = 0;
        
        for (auto p : ram) if (p != nullptr) ramUsed++;
        for (auto p : swap) if (p != nullptr) swapUsed++;
        
        cout << "\n========== ESTADO DE MEMORIA ==========\n";
        cout << "RAM: " << ramUsed << "/" << ramPages << " páginas (" 
             << (ramPages > 0 ? (ramUsed * 100.0 / ramPages) : 0) << "%)\n";
        cout << "SWAP: " << swapUsed << "/" << swapPages << " páginas (" 
             << (swapPages > 0 ? (swapUsed * 100.0 / swapPages) : 0) << "%)\n";
        cout << "Procesos activos: " << processes.size() << "\n";
        cout << "Page Faults: " << pageFaults << "\n";
        cout << "Procesos creados: " << processesCreated << "\n";
        cout << "Procesos finalizados: " << processesFinished << "\n";
        cout << "=======================================\n\n";
    }
    
public:
    PagingSimulator(int physMem, int pageSize, int minProc, int maxProc) 
        : physicalMemMB(physMem), pageSizeKB(pageSize), 
          minProcessSizeMB(minProc), maxProcessSizeMB(maxProc),
          nextPid(1), pageFaults(0), processesCreated(0), processesFinished(0) {
        
        // Generar memoria virtual aleatoria (1.5 a 4.5 veces la física)
        random_device rd;
        rng.seed(rd());
        uniform_real_distribution<double> dist(1.5, 4.5);
        virtualMemMB = static_cast<int>(physicalMemMB * dist(rng));
        
        // Calcular número de páginas
        ramPages = (physicalMemMB * 1024) / pageSizeKB;
        int totalPages = (virtualMemMB * 1024) / pageSizeKB;
        swapPages = totalPages - ramPages;
        
        // Inicializar memoria
        ram.resize(ramPages, nullptr);
        swap.resize(swapPages, nullptr);
        
        log("=== SIMULADOR DE PAGINACION INICIALIZADO ===");
        cout << "Memoria Física: " << physicalMemMB << " MB\n";
        cout << "Memoria Virtual: " << virtualMemMB << " MB\n";
        cout << "Tamaño de página: " << pageSizeKB << " KB\n";
        cout << "Páginas en RAM: " << ramPages << "\n";
        cout << "Páginas en SWAP: " << swapPages << "\n";
        cout << "Rango de procesos: " << minProcessSizeMB << "-" << maxProcessSizeMB << " MB\n";
        cout << "============================================\n\n";
    }
    
    ~PagingSimulator() {
        for (auto p : processes) delete p;
        for (auto p : ram) if (p) delete p;
        for (auto p : swap) if (p) delete p;
    }
    
    bool createProcess() {
        uniform_real_distribution<double> sizeDist(minProcessSizeMB, maxProcessSizeMB);
        double sizeMB = sizeDist(rng);
        int sizeKB = static_cast<int>(sizeMB * 1024);
        int pagesNeeded = (sizeKB + pageSizeKB - 1) / pageSizeKB;
        
        // Verificar memoria disponible
        int ramFree = count(ram.begin(), ram.end(), nullptr);
        int swapFree = count(swap.begin(), swap.end(), nullptr);
        
        if (pagesNeeded > ramFree + swapFree) {
            log("ERROR: No hay suficiente memoria disponible!");
            log("Simulación terminada por falta de memoria.");
            return false;
        }
        
        Process* proc = new Process();
        proc->pid = nextPid++;
        proc->sizeKB = sizeKB;
        proc->numPages = pagesNeeded;
        proc->creationTime = time(nullptr);
        
        time_t now = time(nullptr);
        
        // Asignar páginas
        for (int i = 0; i < pagesNeeded; i++) {
            PageTableEntry entry;
            entry.virtualPage = i;
            
            if (ramFree > 0) {
                // Asignar a RAM
                auto it = find(ram.begin(), ram.end(), nullptr);
                int frameIdx = distance(ram.begin(), it);
                
                Page* page = new Page();
                page->pid = proc->pid;
                page->pageNum = i;
                page->loadTime = now;
                
                ram[frameIdx] = page;
                entry.physicalFrame = frameIdx;
                entry.location = "RAM";
                ramFree--;
            } else {
                // Asignar a SWAP
                auto it = find(swap.begin(), swap.end(), nullptr);
                int frameIdx = distance(swap.begin(), it);
                
                Page* page = new Page();
                page->pid = proc->pid;
                page->pageNum = i;
                page->loadTime = now;
                
                swap[frameIdx] = page;
                entry.physicalFrame = frameIdx;
                entry.location = "SWAP";
            }
            
            proc->pageTable.push_back(entry);
        }
        
        processes.push_back(proc);
        processesCreated++;
        
        log("Proceso P" + to_string(proc->pid) + " creado: " + 
            to_string(sizeKB) + " KB (" + to_string(pagesNeeded) + " páginas)");
        
        return true;
    }
    
    void finishRandomProcess() {
        if (processes.empty()) return;
        
        uniform_int_distribution<int> dist(0, processes.size() - 1);
        int idx = dist(rng);
        
        Process* proc = processes[idx];
        
        // Liberar páginas
        for (const auto& entry : proc->pageTable) {
            if (entry.location == "RAM") {
                delete ram[entry.physicalFrame];
                ram[entry.physicalFrame] = nullptr;
            } else {
                delete swap[entry.physicalFrame];
                swap[entry.physicalFrame] = nullptr;
            }
        }
        
        log("Proceso P" + to_string(proc->pid) + " finalizado (liberó " + 
            to_string(proc->numPages) + " páginas)");
        
        processesFinished++;
        delete proc;
        processes.erase(processes.begin() + idx);
    }
    
    void accessVirtualAddress() {
        if (processes.empty()) return;
        
        uniform_int_distribution<int> procDist(0, processes.size() - 1);
        int procIdx = procDist(rng);
        Process* proc = processes[procIdx];
        
        uniform_int_distribution<int> pageDist(0, proc->numPages - 1);
        int virtualPage = pageDist(rng);
        
        uniform_int_distribution<int> offsetDist(0, pageSizeKB * 1024 - 1);
        int offset = offsetDist(rng);
        int virtualAddr = virtualPage * pageSizeKB * 1024 + offset;
        
        PageTableEntry& entry = proc->pageTable[virtualPage];
        
        cout << "\n--- ACCESO A MEMORIA VIRTUAL ---\n";
        cout << "Dirección virtual: 0x" << hex << uppercase << virtualAddr << dec 
             << " (P" << proc->pid << ", página " << virtualPage << ")\n";
        
        if (entry.location == "SWAP") {
            pageFaults++;
            log("PAGE FAULT: Página " + to_string(virtualPage) + " de P" + 
                to_string(proc->pid) + " está en SWAP");
            
            // Política de reemplazo FIFO
            // Buscar la página más antigua en RAM
            time_t oldestTime = time(nullptr);
            int victimFrame = -1;
            
            for (int i = 0; i < ramPages; i++) {
                if (ram[i] != nullptr && ram[i]->loadTime < oldestTime) {
                    oldestTime = ram[i]->loadTime;
                    victimFrame = i;
                }
            }
            
            if (victimFrame != -1) {
                Page* victim = ram[victimFrame];
                
                // Encontrar proceso víctima y actualizar su tabla
                for (auto p : processes) {
                    if (p->pid == victim->pid) {
                        for (auto& e : p->pageTable) {
                            if (e.virtualPage == victim->pageNum && e.location == "RAM") {
                                // Mover víctima a SWAP
                                auto it = find(swap.begin(), swap.end(), nullptr);
                                if (it != swap.end()) {
                                    int swapIdx = distance(swap.begin(), it);
                                    swap[swapIdx] = victim;
                                    e.physicalFrame = swapIdx;
                                    e.location = "SWAP";
                                    
                                    log("Página víctima P" + to_string(victim->pid) + 
                                        " página " + to_string(victim->pageNum) + 
                                        " movida a SWAP (FIFO)");
                                }
                                break;
                            }
                        }
                        break;
                    }
                }
                
                // Mover página solicitada a RAM
                Page* requestedPage = swap[entry.physicalFrame];
                swap[entry.physicalFrame] = nullptr;
                
                requestedPage->loadTime = time(nullptr);
                ram[victimFrame] = requestedPage;
                entry.physicalFrame = victimFrame;
                entry.location = "RAM";
                
                log("Página P" + to_string(proc->pid) + " página " + 
                    to_string(virtualPage) + " cargada en RAM (frame " + 
                    to_string(victimFrame) + ")");
            }
        } else {
            log("Página " + to_string(virtualPage) + " encontrada en RAM (frame " + 
                to_string(entry.physicalFrame) + ")");
        }
        
        cout << "--------------------------------\n";
    }
    
    void run() {
        auto startTime = chrono::steady_clock::now();
        auto lastProcessCreate = startTime;
        auto lastEvent = startTime;
        
        log("Simulación iniciada...\n");
        
        while (true) {
            auto currentTime = chrono::steady_clock::now();
            auto elapsed = chrono::duration_cast<chrono::seconds>(currentTime - startTime).count();
            
            // Crear proceso cada 2 segundos
            auto sinceLastProcess = chrono::duration_cast<chrono::seconds>(
                currentTime - lastProcessCreate).count();
            
            if (sinceLastProcess >= 2) {
                if (!createProcess()) {
                    break; // Terminar si no hay memoria
                }
                lastProcessCreate = currentTime;
            }
            
            // Eventos cada 5 segundos después de 30 segundos
            if (elapsed >= 30) {
                auto sinceLastEvent = chrono::duration_cast<chrono::seconds>(
                    currentTime - lastEvent).count();
                
                if (sinceLastEvent >= 5) {
                    finishRandomProcess();
                    this_thread::sleep_for(chrono::milliseconds(100));
                    accessVirtualAddress();
                    printMemoryStatus();
                    lastEvent = currentTime;
                }
            }
            
            // Verificar si hay memoria swap disponible
            int swapFree = count(swap.begin(), swap.end(), nullptr);
            if (swapFree == 0 && count(ram.begin(), ram.end(), nullptr) == 0) {
                log("ERROR: No hay memoria disponible en RAM ni SWAP!");
                log("Simulación terminada.");
                break;
            }
            
            this_thread::sleep_for(chrono::milliseconds(100));
        }
        
        printMemoryStatus();
        log("=== SIMULACION FINALIZADA ===");
    }
};

int main() {
    int physicalMemMB, pageSizeKB, minProcMB, maxProcMB;
    
    cout << "=== SIMULADOR DE PAGINACION DE MEMORIA ===\n";
    cout << "Sistemas Operativos - Universidad Diego Portales\n\n";
    
    cout << "Ingrese el tamaño de la memoria física (MB): ";
    cin >> physicalMemMB;
    
    cout << "Ingrese el tamaño de cada página (KB): ";
    cin >> pageSizeKB;
    
    cout << "Ingrese el tamaño mínimo de proceso (MB): ";
    cin >> minProcMB;
    
    cout << "Ingrese el tamaño máximo de proceso (MB): ";
    cin >> maxProcMB;
    
    cout << "\n";
    
    PagingSimulator simulator(physicalMemMB, pageSizeKB, minProcMB, maxProcMB);
    simulator.run();
    
    return 0;
}