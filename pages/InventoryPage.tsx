import React, { useState, useEffect, useMemo } from 'react';
import { 
  CubeIcon, 
  PlusIcon, 
  AdjustmentsHorizontalIcon, 
  ArrowUpOnSquareIcon,
  MagnifyingGlassIcon, 
  XMarkIcon, 
  ChevronUpIcon, 
  ChevronDownIcon, 
  TrashIcon, 
  ExclamationTriangleIcon, 
  TableCellsIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon,
  PresentationChartLineIcon,
  ArrowPathIcon,
  FunnelIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { collection, doc, onSnapshot, setDoc, addDoc, updateDoc, query, where, writeBatch, orderBy, Firestore, increment, getDocs } from "firebase/firestore";
import { User } from "firebase/auth";
import CustomSelect from '../components/CustomSelect';
import SortableHeader from '../components/SortableHeader';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface InventoryPageProps {
  isDarkMode: boolean;
  db: Firestore;
  user: User;
}

// --- Types ---

interface InventoryColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  options?: string[]; // for select type
}

interface InventorySchema {
  id: string; // e.g. 'batteries', 'chargers'
  label: string;
  columns: InventoryColumn[];
  isSerialized?: boolean; // New field
}

interface InventoryItem {
  id: string;
  typeId: string;
  data: Record<string, any>;
  status: 'in stock' | 'in use' | 'repair' | 'other';
  purpose?: string;
  quantity?: number; // For non-serialized items
  lastMoved: string;
  updatedBy: string;
}

interface InventoryLog {
  id: string;
  itemId?: string;
  typeId?: string;
  action: 'IN' | 'OUT' | 'MAINTENANCE' | 'STATUS_CHANGE';
  quantity?: number;
  destination?: string;
  purpose?: string;
  data?: any;
  timestamp: string;
  user: string;
}

// --- Helper: Date Parser ---
const parseFlexibleDate = (dateStr: any): number => {
    if (!dateStr) return 0;
    if (typeof dateStr === 'object' && typeof dateStr.toDate === 'function') {
        return dateStr.toDate().getTime();
    }
    if (typeof dateStr === 'number') return dateStr;
    const str = String(dateStr).trim();
    // Handle DD-MM-YYYY or DD/MM/YYYY or D-M-YYYY
    const ddmmyyyy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;
    const match = str.match(ddmmyyyy);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; 
        const year = parseInt(match[3], 10);
        const d = new Date(year, month, day);
        return d.getTime();
    }
    const t = new Date(str).getTime();
    return isNaN(t) ? 0 : t;
};

// --- Helper: CSV Export ---
const exportToCSV = (data: any[], filename: string, headers?: string[]) => {
  if (!data || !data.length) return;

  // Flatten data for CSV
  const flattenedData = data.map(item => {
    const flat: Record<string, any> = {};
    
    // Core fields
    flat['ID'] = item.id;
    flat['Status'] = item.status;
    flat['Type'] = item.typeId;
    flat['Last Updated'] = new Date(item.lastMoved).toLocaleDateString();

    // Dynamic Data fields
    if (item.data) {
      Object.entries(item.data).forEach(([key, val]) => {
        flat[key] = val;
      });
    }
    return flat;
  });

  // Determine headers if not provided
  const cols = headers || Array.from(new Set(flattenedData.flatMap(Object.keys)));

  const csvContent = [
    cols.join(','), // Header row
    ...flattenedData.map(row => cols.map(fieldName => {
      let val = row[fieldName] || '';
      if (typeof val === 'string' && (val.includes(',') || val.includes('\n'))) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- Helper: Excel Grid Component ---
const ExcelGrid: React.FC<{
  headers: string[];
  data: string[][];
  onChange: (newData: string[][]) => void;
}> = ({ headers, data, onChange }) => {
  const handlePaste = (e: React.ClipboardEvent, startRow: number, startCol: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const rows = text.split(/\r\n|\n|\r/).filter(row => row.trim() !== '');
    if (rows.length === 0) return;
    const newData = [...data];
    const neededRows = startRow + rows.length;
    if (neededRows > newData.length) {
       const emptyRow = Array(headers.length).fill('');
       for (let i = newData.length; i < neededRows; i++) {
         newData.push([...emptyRow]);
       }
    }
    rows.forEach((rowStr, i) => {
      const rIdx = startRow + i;
      const cells = rowStr.split('\t'); 
      cells.forEach((val, j) => {
        const cIdx = startCol + j;
        if (cIdx < headers.length) {
          if (!newData[rIdx]) newData[rIdx] = Array(headers.length).fill('');
          newData[rIdx] = [...newData[rIdx]]; 
          newData[rIdx][cIdx] = val.trim().replace(/^"|"$/g, ''); 
        }
      });
    });
    onChange(newData);
  };

  const handleChange = (rIdx: number, cIdx: number, val: string) => {
    const newData = [...data];
    if (!newData[rIdx]) newData[rIdx] = Array(headers.length).fill('');
    newData[rIdx] = [...newData[rIdx]];
    newData[rIdx][cIdx] = val;
    onChange(newData);
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-auto max-h-[500px]">
      <table className="w-full text-left border-collapse">
        <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0 z-10 shadow-sm">
          <tr>
            <th className="p-3 border-r border-b border-zinc-200 dark:border-zinc-700 w-12 text-center text-xs font-bold text-zinc-400">#</th>
            {headers.map((h, i) => (
              <th key={i} className="p-3 border-r border-b border-zinc-200 dark:border-zinc-700 text-xs font-bold uppercase text-zinc-500 whitespace-nowrap min-w-[150px]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-zinc-900">
          {data.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10">
              <td className="p-2 border-r border-b border-zinc-200 dark:border-zinc-700 text-center text-xs text-zinc-400 select-none">{rIdx + 1}</td>
              {Array.from({ length: headers.length }).map((_, cIdx) => (
                <td key={cIdx} className="p-0 border-r border-b border-zinc-200 dark:border-zinc-700">
                  <input
                    type="text"
                    value={row?.[cIdx] || ''}
                    onChange={(e) => handleChange(rIdx, cIdx, e.target.value)}
                    onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                    className="w-full h-full px-3 py-2.5 bg-transparent text-xs font-medium text-zinc-700 dark:text-zinc-200 outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// --- Charts Component ---
const FlowCharts: React.FC<{ logs: InventoryLog[], items: InventoryItem[], isDarkMode: boolean }> = ({ logs, items, isDarkMode }) => {
  const chartColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  
  const flowTrend = useMemo(() => {
    const grouped: Record<string, { in: number, out: number }> = {};
    logs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!grouped[date]) grouped[date] = { in: 0, out: 0 };
      if (log.action === 'IN') grouped[date].in += log.quantity || 1;
      if (log.action === 'OUT') grouped[date].out += log.quantity || 1;
    });
    return Object.entries(grouped).map(([name, val]) => ({ name, ...val })).slice(-7); 
  }, [logs]);

  const statusDist = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(i => {
      counts[i.status] = (counts[i.status] || 0) + (i.quantity || 1);
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [items]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
      <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
        <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Flow Trends (Last 7 Days)</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={flowTrend}>
              <defs>
                <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#333' : '#eee'} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: isDarkMode ? '#1f2937' : '#fff' }} />
              <Area type="monotone" dataKey="in" stroke="#10b981" fillOpacity={1} fill="url(#colorIn)" name="Inflow" />
              <Area type="monotone" dataKey="out" stroke="#ef4444" fillOpacity={1} fill="url(#colorOut)" name="Outflow" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
        <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Current Stock Status</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusDist}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {statusDist.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: isDarkMode ? '#1f2937' : '#fff' }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// --- Main Page Component ---

const DEFAULT_SCHEMAS: InventorySchema[] = [
  {
    id: 'batteries',
    label: 'Batteries',
    isSerialized: true,
    columns: [
      { key: 'serial', label: 'Serial Number', type: 'text', required: true },
      { key: 'make', label: 'Manufacturer', type: 'text', required: true },
      { key: 'voltage', label: 'Voltage', type: 'text', required: false },
      { key: 'cycles', label: 'Cycle Count', type: 'number', required: false },
    ]
  },
  {
    id: 'chargers',
    label: 'Chargers',
    isSerialized: true,
    columns: [
      { key: 'id', label: 'Asset ID', type: 'text', required: true },
      { key: 'power', label: 'Power Rating (kW)', type: 'number', required: true },
      { key: 'location', label: 'Install Location', type: 'text', required: false }
    ]
  },
  {
    id: 'harnesses',
    label: 'Harnesses',
    isSerialized: false,
    columns: [
      { key: 'batch', label: 'Batch Number', type: 'text', required: true },
      { key: 'type', label: 'Connector Type', type: 'select', required: true, options: ['Type A', 'Type B', 'Universal'] }
    ]
  },
  {
    id: 'soc_meters',
    label: 'SoC Meters',
    isSerialized: true,
    columns: [
      { key: 'serial', label: 'Serial Number', type: 'text', required: true },
      { key: 'firmware', label: 'Firmware Version', type: 'text', required: false }
    ]
  },
  {
    id: 'mcbs',
    label: 'MCBs',
    isSerialized: false,
    columns: [
      { key: 'rating', label: 'Amp Rating', type: 'text', required: true },
      { key: 'brand', label: 'Brand', type: 'text', required: false }
    ]
  }
];

const SkeletonRow: React.FC<{ colCount: number }> = ({ colCount }) => (
  <tr className="animate-pulse border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
    {Array.from({ length: colCount }).map((_, i) => (
      <td key={i} className="px-6 py-4">
        {i === colCount - 1 ? (
           // Last column (Status usually) - pill shape
           <div className="h-6 w-20 bg-zinc-100 dark:bg-zinc-800 rounded-lg ml-auto"></div>
        ) : i === 0 ? (
           // First column (ID usually) - slightly wider/bolder looking
           <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded mb-1"></div>
        ) : (
           // Middle columns
           <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded"></div>
        )}
      </td>
    ))}
  </tr>
);

const InventoryPage: React.FC<InventoryPageProps> = ({ isDarkMode, db, user }) => {
  // State
  const [schemas, setSchemas] = useState<InventorySchema[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // View Mode
  const [viewMode, setViewMode] = useState<'stock' | 'flow'>('stock');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Filters State
  const [showStockFilters, setShowStockFilters] = useState(false);
  const [stockFilters, setStockFilters] = useState({
    status: 'all',
    manufacturer: 'all'
  });

  const [showFlowFilters, setShowFlowFilters] = useState(false);
  const [flowFilters, setFlowFilters] = useState({
    type: 'all',
    manufacturer: 'all',
    startDate: '',
    endDate: ''
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [stockSortConfig, setStockSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | 'none' }>({ key: 'lastMoved', direction: 'desc' });
  const [flowSortConfig, setFlowSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | 'none' }>({ key: 'timestamp', direction: 'desc' });

  const handleStockSort = (key: string) => {
    setStockSortConfig(prev => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? 'none' : 'asc') : 'asc'
    }));
  };

  const handleFlowSort = (key: string) => {
    setFlowSortConfig(prev => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? 'none' : 'asc') : 'asc'
    }));
  };

  // Modals
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'IN' | 'OUT'>('IN');
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showChartsModal, setShowChartsModal] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<number | null>(null);
  
  // Forms
  const [newItemData, setNewItemData] = useState<Record<string, any>>({});
  const [transactionData, setTransactionData] = useState<{
    typeId: string;
    items: string[]; // For serialized OUT
    quantity: number; // For bulk IN/OUT
    destination: string;
    purpose: string;
    status: 'in stock' | 'in use' | 'repair' | 'other';
    remark: string;
    commonData: Record<string, any>;
  }>({
    typeId: '',
    items: [],
    quantity: 1,
    destination: '',
    purpose: '',
    status: 'in stock',
    remark: '',
    commonData: {}
  });
  const [editingSchema, setEditingSchema] = useState<InventorySchema | null>(null);
  const [newColumn, setNewColumn] = useState<InventoryColumn>({ key: '', label: '', type: 'text', required: false });
  const [newTypeName, setNewTypeName] = useState('');

  // Bulk Upload State
  const [bulkGridData, setBulkGridData] = useState<string[][]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Derived State (Moved up to avoid used before declaration)
  const activeSchema = schemas.find(s => s.id === activeTypeId);

  // --- 1. Load Schemas ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory_schemas"), async (snapshot) => {
      if (snapshot.empty) {
        const batch = writeBatch(db);
        for (const schema of DEFAULT_SCHEMAS) {
          batch.set(doc(db, "inventory_schemas", schema.id), schema);
        }
        await batch.commit();
      } else {
        const loaded = snapshot.docs.map(d => d.data() as InventorySchema);
        loaded.sort((a, b) => {
           if (a.id === 'batteries') return -1;
           if (b.id === 'batteries') return 1;
           return a.label.localeCompare(b.label);
        });
        setSchemas(loaded);
        if (!activeTypeId && loaded.length > 0) setActiveTypeId(loaded[0].id);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [db]);

  // --- 2. Load Items ---
  useEffect(() => {
    let q;
    // IF FLOW MODE: Fetch ALL items to allow global aggregation
    if (viewMode === 'flow') {
      q = query(collection(db, "inventory_items"));
    } else {
      // IF STOCK MODE: Fetch only active type
      if (!activeTypeId) return;
      q = query(collection(db, "inventory_items"), where("typeId", "==", activeTypeId));
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const loadedItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));
      setItems(loadedItems);
    });
    return () => unsub();
  }, [activeTypeId, viewMode, db]);

  // --- 3. Load Logs (For Flow View Dates) ---
  useEffect(() => {
    // Only load logs if in Flow mode or Charts requested to save bandwidth
    if (viewMode === 'flow' || showChartsModal) {
      const q = query(collection(db, "inventory_logs"), orderBy("timestamp", "desc"));
      const unsub = onSnapshot(q, (snapshot) => {
        const loadedLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryLog));
        // We need all logs for Flow View to determine received dates correctly
        setLogs(loadedLogs);
      });
      return () => unsub();
    }
  }, [viewMode, showChartsModal, db]);

  // Initialize Bulk Grid
  useEffect(() => {
    if (showBulkModal && activeSchema) {
      const initialRows = 20;
      const colCount = activeSchema.columns.length;
      setBulkGridData(Array.from({ length: initialRows }, () => Array(colCount).fill('')));
    }
  }, [showBulkModal, activeSchema]);

  // Reset pagination
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTypeId, searchQuery, viewMode, flowFilters, stockFilters]);

  // --- Handlers ---

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    const id = newTypeName.toLowerCase().replace(/\s+/g, '_');
    const newSchema: InventorySchema = {
      id,
      label: newTypeName,
      columns: [{ key: 'serial_or_id', label: 'ID / Serial', type: 'text', required: true }]
    };
    try {
      await setDoc(doc(db, "inventory_schemas", id), newSchema);
      setNewTypeName('');
      setActiveTypeId(id);
      setEditingSchema(newSchema);
    } catch (e) {
      console.error("Error creating type", e);
    }
  };

  const handleAddColumn = async () => {
    if (!editingSchema || !newColumn.label) return;
    const key = newColumn.label.toLowerCase().replace(/\s+/g, '_');
    const updatedCols = [...editingSchema.columns, { ...newColumn, key }];
    try {
      await updateDoc(doc(db, "inventory_schemas", editingSchema.id), { columns: updatedCols });
      setEditingSchema({ ...editingSchema, columns: updatedCols });
      setNewColumn({ key: '', label: '', type: 'text', required: false });
    } catch (e) { console.error(e); }
  };

  const handleMoveColumn = async (index: number, direction: 'up' | 'down') => {
    if (!editingSchema) return;
    const newCols = [...editingSchema.columns];
    if (direction === 'up') {
      if (index === 0) return;
      [newCols[index - 1], newCols[index]] = [newCols[index], newCols[index - 1]];
    } else {
      if (index === newCols.length - 1) return;
      [newCols[index], newCols[index + 1]] = [newCols[index + 1], newCols[index]];
    }
    setEditingSchema({ ...editingSchema, columns: newCols });
    try { await updateDoc(doc(db, "inventory_schemas", editingSchema.id), { columns: newCols }); } catch (e) { console.error(e); }
  };

  const handleDeleteColumnClick = (index: number) => setColumnToDelete(index);

  const confirmDeleteColumn = async () => {
    if (columnToDelete === null || !editingSchema) return;
    const newCols = [...editingSchema.columns];
    newCols.splice(columnToDelete, 1);
    setEditingSchema({ ...editingSchema, columns: newCols });
    setColumnToDelete(null);
    try { await updateDoc(doc(db, "inventory_schemas", editingSchema.id), { columns: newCols }); } catch (e) { console.error(e); }
  };

  const handleTransaction = async () => {
    if (!transactionData.typeId) return;
    const schema = schemas.find(s => s.id === transactionData.typeId);
    if (!schema) return;

    try {
      if (transactionType === 'IN') {
        if (schema.isSerialized) {
          // Serialized IN
          // We expect serials in the remark field, one per line
          const serials = transactionData.remark.split('\n').map(s => s.trim()).filter(s => s);
          if (serials.length === 0) {
            alert("Please enter serial numbers in the remark field (one per line)");
            return;
          }
          const batch = writeBatch(db);
          for (const serial of serials) {
            const itemRef = doc(collection(db, "inventory_items"));
            const itemData = {
              typeId: transactionData.typeId,
              data: { ...transactionData.commonData, serial },
              status: 'in stock',
              lastMoved: new Date().toISOString(),
              updatedBy: user.email
            };
            batch.set(itemRef, itemData);
            
            const logRef = doc(collection(db, "inventory_logs"));
            batch.set(logRef, {
              itemId: itemRef.id,
              typeId: transactionData.typeId,
              action: 'IN',
              data: itemData.data,
              timestamp: new Date().toISOString(),
              user: user.email,
              remark: transactionData.remark
            });
          }
          await batch.commit();
        } else {
          // Bulk IN
          const q = query(collection(db, "inventory_items"), 
            where("typeId", "==", transactionData.typeId),
            where("status", "==", "in stock")
          );
          const snapshot = await getDocs(q);
          let existingItem = snapshot.docs.find(d => {
            const data = d.data().data;
            // Simple check for common attributes
            return JSON.stringify(data) === JSON.stringify(transactionData.commonData);
          });

          if (existingItem) {
            await updateDoc(doc(db, "inventory_items", existingItem.id), {
              quantity: increment(transactionData.quantity),
              lastMoved: new Date().toISOString(),
              updatedBy: user.email
            });
          } else {
            const itemRef = await addDoc(collection(db, "inventory_items"), {
              typeId: transactionData.typeId,
              data: transactionData.commonData,
              status: 'in stock',
              quantity: transactionData.quantity,
              lastMoved: new Date().toISOString(),
              updatedBy: user.email
            });
            existingItem = { id: itemRef.id } as any;
          }

          await addDoc(collection(db, "inventory_logs"), {
            itemId: existingItem!.id,
            typeId: transactionData.typeId,
            action: 'IN',
            quantity: transactionData.quantity,
            data: transactionData.commonData,
            timestamp: new Date().toISOString(),
            user: user.email,
            remark: transactionData.remark
          });
        }
      } else {
        // OUTWARD
        if (schema.isSerialized) {
          if (transactionData.items.length === 0) {
            alert("Please select items to dispatch");
            return;
          }
          const batch = writeBatch(db);
          for (const itemId of transactionData.items) {
            const itemRef = doc(db, "inventory_items", itemId);
            batch.update(itemRef, {
              status: transactionData.status,
              purpose: transactionData.status === 'other' ? transactionData.purpose : '',
              lastMoved: new Date().toISOString(),
              updatedBy: user.email
            });

            const logRef = doc(collection(db, "inventory_logs"));
            batch.set(logRef, {
              itemId,
              typeId: transactionData.typeId,
              action: 'OUT',
              destination: transactionData.destination,
              purpose: transactionData.purpose,
              timestamp: new Date().toISOString(),
              user: user.email,
              remark: transactionData.remark
            });
          }
          await batch.commit();
        } else {
          // Bulk OUT
          // Find the 'in stock' record for this type/attributes
          const q = query(collection(db, "inventory_items"), 
            where("typeId", "==", transactionData.typeId),
            where("status", "==", "in stock")
          );
          const snapshot = await getDocs(q);
          const stockItem = snapshot.docs.find(d => {
            const data = d.data().data;
            return JSON.stringify(data) === JSON.stringify(transactionData.commonData);
          });

          if (!stockItem || (stockItem.data().quantity || 0) < transactionData.quantity) {
            alert("Insufficient stock available");
            return;
          }

          // Reduce stock
          await updateDoc(doc(db, "inventory_items", stockItem.id), {
            quantity: increment(-transactionData.quantity),
            lastMoved: new Date().toISOString(),
            updatedBy: user.email
          });

          // Create or update the 'out' record (In Use, Repair, etc.)
          const qOut = query(collection(db, "inventory_items"), 
            where("typeId", "==", transactionData.typeId),
            where("status", "==", transactionData.status)
          );
          const snapshotOut = await getDocs(qOut);
          let existingOutItem = snapshotOut.docs.find(d => {
            const dData = d.data();
            return JSON.stringify(dData.data) === JSON.stringify(transactionData.commonData) && 
                   dData.purpose === (transactionData.status === 'other' ? transactionData.purpose : '');
          });

          if (existingOutItem) {
            await updateDoc(doc(db, "inventory_items", existingOutItem.id), {
              quantity: increment(transactionData.quantity),
              lastMoved: new Date().toISOString(),
              updatedBy: user.email
            });
          } else {
            await addDoc(collection(db, "inventory_items"), {
              typeId: transactionData.typeId,
              data: transactionData.commonData,
              status: transactionData.status,
              purpose: transactionData.status === 'other' ? transactionData.purpose : '',
              quantity: transactionData.quantity,
              lastMoved: new Date().toISOString(),
              updatedBy: user.email
            });
          }

          await addDoc(collection(db, "inventory_logs"), {
            typeId: transactionData.typeId,
            action: 'OUT',
            quantity: transactionData.quantity,
            destination: transactionData.destination,
            purpose: transactionData.purpose,
            timestamp: new Date().toISOString(),
            user: user.email,
            remark: transactionData.remark
          });
        }
      }
      setShowTransactionModal(false);
      setTransactionData({
        typeId: activeTypeId,
        items: [],
        quantity: 1,
        destination: '',
        purpose: '',
        status: 'in stock',
        remark: '',
        commonData: {}
      });
    } catch (e) {
      console.error("Transaction error", e);
    }
  };

  const handleBulkSave = async () => {
    if (!activeSchema) return;
    setBulkSaving(true);
    
    try {
      const batch = writeBatch(db);
      let count = 0;
      const batchLimit = 250; 

      for (const row of bulkGridData) {
        if (row.every(cell => !cell.trim())) continue;

        const itemData: Record<string, any> = {};
        let isValid = true;

        activeSchema.columns.forEach((col, idx) => {
          const val = row[idx]?.trim();
          if (col.required && !val) isValid = false;
          itemData[col.key] = val;
        });

        if (!isValid) continue;

        const firstColKey = activeSchema.columns[0].key;
        const firstColVal = row[0]?.trim();

        // Check if item already exists with this ID (and optionally date if provided in row)
        // For simplicity and reliability, we match by the first column (ID/Serial)
        const existingItem = items.find(it => it.typeId === activeTypeId && it.data[firstColKey] === firstColVal);

        if (existingItem) {
          // UPDATE / APPEND
          const mergedData = { ...existingItem.data, ...itemData };
          batch.update(doc(db, "inventory_items", existingItem.id), {
            data: mergedData,
            lastMoved: new Date().toISOString(),
            updatedBy: user.email
          });

          const logRef = doc(collection(db, "inventory_logs"));
          batch.set(logRef, {
            itemId: existingItem.id,
            typeId: activeTypeId,
            action: 'UPDATE',
            data: itemData,
            timestamp: new Date().toISOString(),
            user: user.email
          });
        } else {
          // NEW ITEM
          const newDocRef = doc(collection(db, "inventory_items"));
          batch.set(newDocRef, {
            typeId: activeTypeId,
            data: itemData,
            lastMoved: new Date().toISOString(),
            updatedBy: user.email
          });

          const logRef = doc(collection(db, "inventory_logs"));
          batch.set(logRef, {
            itemId: newDocRef.id,
            typeId: activeTypeId,
            action: 'INWARD_NEW',
            data: itemData,
            timestamp: new Date().toISOString(),
            user: user.email
          });
        }
        
        count++;
        if (count >= batchLimit) break;
      }

      if (count > 0) {
        await batch.commit();
        alert(`Successfully imported ${count} items.`);
        setShowBulkModal(false);
        setBulkGridData([]);
      } else {
        alert("No valid data found.");
      }

    } catch (e) {
      console.error("Bulk save error", e);
      alert("Failed to save bulk data.");
    } finally {
      setBulkSaving(false);
    }
  };

  const handleExportBulk = () => {
    let dataToExport = viewMode === 'stock' ? filteredItems : groupedFlowItems.flatMap(g => g.items);
    if (!dataToExport || dataToExport.length === 0) {
      alert("No data to export");
      return;
    }
    const filename = `${viewMode}_export_${new Date().toISOString().split('T')[0]}`;
    exportToCSV(dataToExport, filename);
  };

  const handleExportSingle = (item: InventoryItem) => {
    exportToCSV([item], `${item.typeId}_${item.id}_export`);
  };

  // --- Filtered Display (Sorting & Filtering) ---
  
  const filteredItems = useMemo(() => {
    let result = items;

    // Search
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(item => {
        return Object.values(item.data).some(val => String(val).toLowerCase().includes(lowerQ));
      });
    }

    // Stock Filters
    if (stockFilters.status !== 'all') {
      result = result.filter(item => item.status === stockFilters.status);
    }
    if (stockFilters.manufacturer !== 'all') {
      result = result.filter(item => {
        const mfg = item.data['make'] || item.data['manufacturer'] || item.data['brand'] || item.data['vendor'];
        return mfg === stockFilters.manufacturer;
      });
    }

    // Sorting
    if (stockSortConfig.direction !== 'none') {
      result.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (stockSortConfig.key === 'status') {
          aValue = a.status;
          bValue = b.status;
        } else if (stockSortConfig.key === 'lastMoved') {
          aValue = new Date(a.lastMoved).getTime();
          bValue = new Date(b.lastMoved).getTime();
        } else {
          aValue = a.data[stockSortConfig.key] || '';
          bValue = b.data[stockSortConfig.key] || '';
          if (typeof aValue === 'string') aValue = aValue.toLowerCase();
          if (typeof bValue === 'string') bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return stockSortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return stockSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default Sort: Latest received date first
      result.sort((a, b) => {
        const getTimestamp = (item: InventoryItem) => {
          const d1 = parseFlexibleDate(item.data['received_date']);
          if (d1 > 0) return d1;
          const d2 = parseFlexibleDate(item.data['date']);
          if (d2 > 0) return d2;
          return new Date(item.lastMoved).getTime();
        };
        return getTimestamp(b) - getTimestamp(a);
      });
    }

    return result;
  }, [items, searchQuery, stockFilters, stockSortConfig]);

  // --- Derived Lists for Filters ---
  const manufacturerOptions = useMemo(() => {
    const manufacturers = new Set<string>();
    items.forEach(item => {
      const mfg = item.data['make'] || item.data['manufacturer'] || item.data['brand'] || item.data['vendor'];
      if (mfg) manufacturers.add(mfg);
    });
    return [{ value: 'all', label: 'All Manufacturers' }, ...Array.from(manufacturers).map(m => ({ value: m, label: m }))];
  }, [items]);

  const typeOptions = useMemo(() => {
    return [{ value: 'all', label: 'All Types' }, ...schemas.map(s => ({ value: s.id, label: s.label }))];
  }, [schemas]);

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'in stock', label: 'In Stock' },
    { value: 'in use', label: 'In Use' },
    { value: 'repair', label: 'Repair' },
    { value: 'other', label: 'Other' }
  ];

  // --- Grouping Logic for Flow View ---
  const groupedFlowItems = useMemo(() => {
    if (viewMode !== 'flow') return [];
    
    const groups: Record<string, {
        id: string;
        typeId: string; // Keep track of schema type
        itemType: string;
        quantity: number;
        manufacturer: string;
        receivedDate: string;
        timestamp: number;
        items: (InventoryItem & { receivedDateForRow: string })[];
        remark: string;
    }> = {};

    // Use items (all loaded in flow mode) but apply search query first
    const baseItems = searchQuery ? items.filter(item => Object.values(item.data).some(val => String(val).toLowerCase().includes(searchQuery.toLowerCase()))) : items;

    baseItems.forEach(item => {
        // --- Flow Filters ---
        if (flowFilters.type !== 'all' && item.typeId !== flowFilters.type) return;
        
        const mfg = item.data['make'] || item.data['manufacturer'] || item.data['brand'] || item.data['vendor'] || 'Unknown';
        if (flowFilters.manufacturer !== 'all' && mfg !== flowFilters.manufacturer) return;

        // 2. Received Date
        let dateStr = 'Unknown';
        let timestamp = 0;

        if (item.data['date']) {
             timestamp = parseFlexibleDate(item.data['date']);
             dateStr = timestamp > 0 ? new Date(timestamp).toLocaleDateString() : String(item.data['date'] || 'Unknown');
        } else if (item.data['received_date']) {
             timestamp = parseFlexibleDate(item.data['received_date']);
             dateStr = timestamp > 0 ? new Date(timestamp).toLocaleDateString() : String(item.data['received_date'] || 'Unknown');
        } else {
             const itemLogs = logs.filter(l => l.itemId === item.id);
             const inwardLog = itemLogs.find(l => l.action === 'IN');
             const dateRaw = inwardLog ? inwardLog.timestamp : item.lastMoved;
             const dateObj = new Date(dateRaw);
             dateStr = dateObj.toLocaleDateString();
             timestamp = dateObj.getTime();
        }

        // Date Range Filter
        if (flowFilters.startDate) {
           const start = new Date(flowFilters.startDate).getTime();
           if (timestamp < start) return;
        }
        if (flowFilters.endDate) {
           const end = new Date(flowFilters.endDate).getTime();
           if (timestamp > end + 86400000) return;
        }
        
        // 3. Remark
        const remark = item.data['remark'] || '-';
        
        // Composite Key: Type-Date
        const key = `${item.typeId}-${dateStr}`;
        
        if (!groups[key]) {
            const typeSchema = schemas.find(s => s.id === item.typeId);
            const label = typeSchema ? typeSchema.label : item.typeId;

            groups[key] = {
                id: key,
                typeId: item.typeId,
                itemType: label,
                quantity: 0,
                manufacturer: mfg,
                receivedDate: dateStr,
                timestamp: timestamp,
                items: [],
                remark: remark
            };
        }
        
        groups[key].quantity += item.quantity || 1;
        groups[key].items.push({ ...item, receivedDateForRow: dateStr });
    });

    // Sorting
    if (flowSortConfig.direction !== 'none') {
      return Object.values(groups).sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (flowSortConfig.key) {
          case 'itemType': aValue = a.itemType.toLowerCase(); bValue = b.itemType.toLowerCase(); break;
          case 'quantity': aValue = a.quantity; bValue = b.quantity; break;
          case 'manufacturer': aValue = a.manufacturer.toLowerCase(); bValue = b.manufacturer.toLowerCase(); break;
          case 'timestamp': aValue = a.timestamp; bValue = b.timestamp; break;
          case 'remark': aValue = a.remark.toLowerCase(); bValue = b.remark.toLowerCase(); break;
          default: return 0;
        }

        if (aValue < bValue) return flowSortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return flowSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Default Sort: Latest received date first
    return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
  }, [items, logs, viewMode, schemas, flowFilters, searchQuery, flowSortConfig]);

  // --- Pagination Logic ---
  const sourceDataLength = viewMode === 'stock' ? filteredItems.length : groupedFlowItems.length;
  const totalPages = Math.ceil(sourceDataLength / itemsPerPage);
  
  const paginatedStockItems = viewMode === 'stock' ? filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) : [];
  const paginatedFlowGroups = viewMode === 'flow' ? groupedFlowItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage) : [];

  const PaginationFooter = () => {
    if (totalPages <= 0) return null;
    return (
      <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky bottom-0 z-10">
        <div className="flex items-center gap-4">
           <div className="text-xs font-bold text-zinc-500">Page {currentPage} of {totalPages}</div>
           <div className="w-32">
             <CustomSelect 
               options={[
                 { value: '10', label: '10 rows' },
                 { value: '20', label: '20 rows' },
                 { value: '50', label: '50 rows' }
               ]}
               value={String(itemsPerPage)}
               onChange={(val) => { setItemsPerPage(Number(val)); setCurrentPage(1); }}
               position="top"
             />
           </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => p - 1)} 
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <button 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(p => p + 1)} 
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Inventory Management</h2>
          <p className="font-semibold text-zinc-500 dark:text-zinc-400">Track components, spares, and hardware.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-2xl h-11 shrink-0">
             <button 
               onClick={() => setViewMode('stock')}
               className={`px-4 rounded-xl text-xs font-bold transition-all h-full flex items-center justify-center ${viewMode === 'stock' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}
             >
               Stock View
             </button>
             <button 
               onClick={() => setViewMode('flow')}
               className={`px-4 rounded-xl text-xs font-bold transition-all h-full flex items-center justify-center ${viewMode === 'flow' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}
             >
               Asset Flow
             </button>
          </div>

          <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700 hidden sm:block"></div>

          {/* Actions */}
          <button 
             onClick={handleExportBulk}
             className="flex items-center justify-center h-11 px-4 lg:px-5 lg:py-3 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold text-xs lg:text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all border border-zinc-200 dark:border-zinc-800 shadow-sm shrink-0"
          >
             <ArrowDownTrayIcon className="w-5 h-5 lg:mr-2" /> 
             <span className="hidden sm:inline">Export CSV</span>
             <span className="sm:hidden">Export</span>
          </button>

          {viewMode === 'flow' && (
             <button 
                onClick={() => setShowChartsModal(true)}
                className="flex items-center justify-center h-11 px-4 lg:px-5 lg:py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl font-bold text-xs lg:text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all border border-indigo-200 dark:border-indigo-800 shrink-0"
             >
               <PresentationChartLineIcon className="w-5 h-5 lg:mr-2" />
               <span className="hidden sm:inline">Overview Charts</span>
               <span className="sm:hidden">Charts</span>
             </button>
          )}
          {viewMode === 'stock' && (
            <button 
              onClick={() => { setEditingSchema(activeSchema || null); setShowSchemaModal(true); }}
              className="flex items-center justify-center h-11 px-4 lg:px-5 lg:py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold text-xs lg:text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shrink-0"
            >
              <AdjustmentsHorizontalIcon className="w-5 h-5 lg:mr-2" />
              <span className="hidden sm:inline">Manage Types</span>
              <span className="sm:hidden">Types</span>
            </button>
          )}
          <button 
            onClick={() => {
              setTransactionType('IN');
              setTransactionData({
                typeId: activeTypeId,
                items: [],
                quantity: 1,
                destination: '',
                purpose: '',
                status: 'in stock',
                remark: '',
                commonData: {}
              });
              setShowTransactionModal(true);
            }}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-200/50 dark:shadow-none hover:bg-indigo-700 transition-all"
          >
            <PlusIcon className="w-4 h-4" /> Asset Flow (IN/OUT)
          </button>
        </div>
      </div>

      {/* Tabs - Only show in Stock View */}
      {viewMode === 'stock' && (
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto scrollbar-hide">
          {schemas.map(schema => (
            <button
              key={schema.id}
              onClick={() => setActiveTypeId(schema.id)}
              className={`px-6 py-4 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                activeTypeId === schema.id 
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {schema.label}
            </button>
          ))}
          <button 
             onClick={() => { setEditingSchema(null); setShowSchemaModal(true); }}
             className="px-4 py-4 text-xs font-bold text-zinc-400 hover:text-indigo-500 flex items-center gap-1 border-b-2 border-transparent"
          >
             <PlusIcon className="w-3 h-3" /> New Type
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative group flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder={`Search ${viewMode === 'stock' ? (activeSchema?.label || 'items') : 'all inventory'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-bold transition-all shadow-sm"
            />
          </div>
          
          {viewMode === 'stock' && (
             <button 
                onClick={() => setShowStockFilters(!showStockFilters)}
                className={`flex items-center gap-2 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all border ${showStockFilters ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border-indigo-200 dark:border-indigo-800' : 'bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'}`}
             >
                <FunnelIcon className="w-4 h-4" /> Filters
             </button>
          )}

          {viewMode === 'flow' && (
             <button 
                onClick={() => setShowFlowFilters(!showFlowFilters)}
                className={`flex items-center gap-2 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all border ${showFlowFilters ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border-indigo-200 dark:border-indigo-800' : 'bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'}`}
             >
                <FunnelIcon className="w-4 h-4" /> Filters
             </button>
          )}
        </div>

        {/* Filters Panel for Stock */}
        {viewMode === 'stock' && showStockFilters && (
           <div className="p-6 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in slide-in-from-top-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <CustomSelect 
                    label="Status"
                    options={[
                       { value: 'all', label: 'All Statuses' },
                       { value: 'in stock', label: 'In Stock' },
                       { value: 'in use', label: 'In Use' },
                       { value: 'repair', label: 'Repair' },
                       { value: 'other', label: 'Other' }
                    ]}
                    value={stockFilters.status}
                    onChange={(val) => setStockFilters({...stockFilters, status: val as string})}
                 />
                 <CustomSelect 
                    label="Manufacturer" 
                    options={manufacturerOptions} 
                    value={stockFilters.manufacturer} 
                    onChange={(val) => setStockFilters({...stockFilters, manufacturer: val as string})} 
                 />
              </div>
              <div className="flex justify-end mt-4">
                 <button 
                    onClick={() => setStockFilters({ status: 'all', manufacturer: 'all' })}
                    className="text-xs font-bold text-zinc-400 hover:text-indigo-600 transition-colors"
                 >
                    Reset Filters
                 </button>
              </div>
           </div>
        )}

        {/* Filters Panel for Flow */}
        {viewMode === 'flow' && showFlowFilters && (
           <div className="p-6 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm animate-in slide-in-from-top-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 <CustomSelect 
                    label="Item Type" 
                    options={typeOptions} 
                    value={flowFilters.type} 
                    onChange={(val) => setFlowFilters({...flowFilters, type: val as string})}
                 />
                 <CustomSelect 
                    label="Manufacturer" 
                    options={manufacturerOptions} 
                    value={flowFilters.manufacturer} 
                    onChange={(val) => setFlowFilters({...flowFilters, manufacturer: val as string})} 
                 />
                 <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 block">Start Date</label>
                    <input 
                       type="date" 
                       value={flowFilters.startDate}
                       onChange={(e) => setFlowFilters({...flowFilters, startDate: e.target.value})}
                       className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 block">End Date</label>
                    <input 
                       type="date" 
                       value={flowFilters.endDate}
                       onChange={(e) => setFlowFilters({...flowFilters, endDate: e.target.value})}
                       className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
                    />
                 </div>
              </div>
              <div className="flex justify-end mt-4">
                 <button 
                    onClick={() => setFlowFilters({ type: 'all', manufacturer: 'all', startDate: '', endDate: '' })}
                    className="text-xs font-bold text-zinc-400 hover:text-indigo-600 transition-colors"
                 >
                    Reset Filters
                 </button>
              </div>
           </div>
        )}
      </div>

      {/* === STOCK VIEW === */}
      {viewMode === 'stock' && (
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-auto max-h-[70vh] min-h-[300px] scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
            <table className="w-full text-left min-w-[1000px] table-fixed border-collapse">
              <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm border-b border-zinc-200 dark:border-zinc-800">
                <tr className="h-12">
                  {activeSchema?.columns.map(col => (
                    <SortableHeader 
                      key={col.key} 
                      label={col.label} 
                      sortKey={col.key} 
                      currentSort={stockSortConfig} 
                      onSort={handleStockSort} 
                    />
                  ))}
                  <th className="w-16 h-12 px-6 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 bg-white dark:bg-zinc-900">
                {loading ? (
                   Array.from({ length: 10 }).map((_, i) => (
                     <SkeletonRow key={i} colCount={(activeSchema?.columns.length || 4) + 1} />
                   ))
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={(activeSchema?.columns.length || 0) + 2} className="py-20 text-center text-zinc-400 text-sm font-bold">
                      No {activeSchema?.label.toLowerCase()} found.
                    </td>
                  </tr>
                ) : (
                  paginatedStockItems.map(item => (
                    <tr key={item.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      {activeSchema?.columns.map(col => (
                        <td key={col.key} className="px-6 py-4 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          {item.data[col.key] || '--'}
                        </td>
                      ))}
                      <td className="px-6 py-4 text-right">
                         <button 
                           onClick={() => handleExportSingle(item)}
                           className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                           title="Export Item CSV"
                         >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                         </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationFooter />
        </div>
      )}

      {/* === ASSET FLOW VIEW (UPDATED GROUPING) === */}
      {viewMode === 'flow' && (
        <div className="space-y-4">
           {groupedFlowItems.length === 0 ? (
              <div className="py-20 text-center text-zinc-400 text-sm font-bold bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800">
                 No asset flow history found matching current filters.
              </div>
           ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
                 <div className="overflow-auto max-h-[70vh] min-h-[300px] scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                    <table className="w-full text-left min-w-[1000px] table-fixed border-collapse">
                       <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm border-b border-zinc-200 dark:border-zinc-800">
                          <tr className="h-12">
                             <SortableHeader className="w-32" label="Item" sortKey="itemType" currentSort={flowSortConfig} onSort={handleFlowSort} />
                             <SortableHeader className="w-24" label="Quantity" sortKey="quantity" currentSort={flowSortConfig} onSort={handleFlowSort} />
                             <SortableHeader className="w-40" label="Manufacturer" sortKey="manufacturer" currentSort={flowSortConfig} onSort={handleFlowSort} />
                             <SortableHeader className="w-32" label="Received Date" sortKey="timestamp" currentSort={flowSortConfig} onSort={handleFlowSort} />
                             <SortableHeader className="w-64" label="Remark" sortKey="remark" currentSort={flowSortConfig} onSort={handleFlowSort} />
                             <th className="w-12 h-12"></th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 bg-white dark:bg-zinc-900">
                          {paginatedFlowGroups.map(group => {
                             const isExpanded = expandedGroupId === group.id;
                             
                             return (
                                <React.Fragment key={group.id}>
                                   <tr 
                                      onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                                      className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                                   >
                                      <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">{group.itemType}</td>
                                      <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">{group.quantity}</td>
                                      <td className="px-6 py-4 text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase">{group.manufacturer}</td>
                                      <td className="px-6 py-4 text-sm font-bold text-zinc-700 dark:text-zinc-300">{group.receivedDate}</td>
                                      <td className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                         {group.remark}
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                         {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-zinc-400" /> : <ChevronDownIcon className="w-4 h-4 text-zinc-400" />}
                                      </td>
                                   </tr>
                                   
                                   {isExpanded && (
                                      <tr>
                                         <td colSpan={6} className="p-0 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
                                            <div className="p-4 pl-12 overflow-x-auto">
                                               {(() => {
                                                  const groupSchema = schemas.find(s => s.id === group.typeId);
                                                  const displayColumns = groupSchema ? groupSchema.columns.filter(c => c.key !== 'make') : [];
                                                  const mainKey = displayColumns.length > 0 ? displayColumns[0].key : 'serial_or_id';

                                                  return (
                                                    <table className="w-full text-left text-xs">
                                                        <thead>
                                                            <tr className="text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 h-12">
                                                                <th className="px-4 font-bold uppercase tracking-wider text-[10px]">ID / Serial</th>
                                                                <th className="px-4 font-bold uppercase tracking-wider text-[10px]">Status</th>
                                                                {displayColumns.filter(c => c.key !== mainKey).map(c => (
                                                                    <th key={c.key} className="px-4 font-bold uppercase tracking-wider text-[10px]">{c.label}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
                                                            {group.items.map(item => (
                                                                <tr key={item.id}>
                                                                    <td className="py-2 font-bold text-zinc-700 dark:text-zinc-300">
                                                                        {item.data[mainKey] || item.id}
                                                                    </td>
                                                                    {displayColumns.filter(c => c.key !== mainKey).map(c => (
                                                                        <td key={c.key} className="py-2 text-zinc-500 dark:text-zinc-400 font-bold">{item.data[c.key] || '-'}</td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                  );
                                               })()}
                                            </div>
                                         </td>
                                      </tr>
                                   )}
                                </React.Fragment>
                             );
                          })}
                       </tbody>
                    </table>
                 </div>
                 <PaginationFooter />
              </div>
           )}
        </div>
      )}

      {/* ... (Existing Modals: Charts, Add Item, Bulk Upload, Schema Editor, Delete Confirm) ... */}
      {/* ... (Keep existing modal code here - unchanged) ... */}
      {/* --- CHARTS MODAL --- */}
      {showChartsModal && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-4xl p-8 shadow-2xl animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
               <div className="flex justify-between items-start mb-6">
                  <div>
                     <h3 className="text-2xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-3">
                        <PresentationChartLineIcon className="w-8 h-8 text-indigo-600" /> Asset Flow Analytics
                     </h3>
                     <p className="text-sm font-bold text-zinc-500 mt-1">Visual insights into inventory movement and status.</p>
                  </div>
                  <button onClick={() => setShowChartsModal(false)} className="p-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-2xl transition-all"><XMarkIcon className="w-6 h-6 text-zinc-500" /></button>
               </div>
               
               <FlowCharts logs={logs} items={items} isDarkMode={isDarkMode} />
            </div>
         </div>
      )}

      {/* --- ASSET FLOW MODAL --- */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Asset Flow: {transactionType}
                </h3>
                <p className="text-xs font-bold text-zinc-500 mt-1">
                  {transactionType === 'IN' ? 'Receive new assets into stock' : 'Dispatch assets from stock'}
                </p>
              </div>
              <button onClick={() => setShowTransactionModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                <XMarkIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="flex gap-2 mb-6 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <button 
                onClick={() => setTransactionType('IN')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${transactionType === 'IN' ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                RECEIVING (IN)
              </button>
              <button 
                onClick={() => setTransactionType('OUT')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${transactionType === 'OUT' ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                DISPATCHING (OUT)
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
              <CustomSelect 
                label="Asset Type"
                options={schemas.map(s => ({ value: s.id, label: s.label }))}
                value={transactionData.typeId}
                onChange={(val) => setTransactionData({ ...transactionData, typeId: val as string, items: [] })}
              />

              {transactionData.typeId && (() => {
                const schema = schemas.find(s => s.id === transactionData.typeId);
                if (!schema) return null;

                return (
                  <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex justify-center mb-4">
                       <button 
                         onClick={() => setShowBulkModal(true)}
                         className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold text-sm border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all"
                       >
                         <ArrowUpOnSquareIcon className="w-5 h-5" />
                         Bulk Upload via Excel
                       </button>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                       <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                       <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Or Manual Entry</span>
                       <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                    </div>

                    {/* Common Data Fields */}
                    <div className="grid grid-cols-2 gap-4">
                      {schema.columns.filter(c => c.key !== 'serial' && c.key !== 'id' && c.key !== 'serial_or_id').map(col => (
                        <div key={col.key}>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">
                            {col.label}
                          </label>
                          {col.type === 'select' ? (
                            <CustomSelect 
                              options={col.options?.map(o => ({ value: o, label: o })) || []}
                              value={transactionData.commonData[col.key] || ''}
                              onChange={(val) => setTransactionData({
                                ...transactionData, 
                                commonData: { ...transactionData.commonData, [col.key]: val }
                              })}
                            />
                          ) : (
                            <input 
                              type={col.type}
                              value={transactionData.commonData[col.key] || ''}
                              onChange={(e) => setTransactionData({
                                ...transactionData, 
                                commonData: { ...transactionData.commonData, [col.key]: e.target.value }
                              })}
                              className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs font-bold dark:text-white outline-none transition-all"
                              placeholder={`Enter ${col.label}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    {transactionType === 'IN' ? (
                      <>
                        {schema.isSerialized ? (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">
                              Serial Numbers / IDs (One per line)
                            </label>
                            <textarea 
                              value={transactionData.remark}
                              onChange={(e) => setTransactionData({ ...transactionData, remark: e.target.value })}
                              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs font-bold dark:text-white outline-none transition-all min-h-[100px]"
                              placeholder="Enter serial numbers..."
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">Quantity</label>
                            <input 
                              type="number"
                              value={transactionData.quantity}
                              onChange={(e) => setTransactionData({ ...transactionData, quantity: parseInt(e.target.value) || 1 })}
                              className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs font-bold dark:text-white outline-none transition-all"
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {schema.isSerialized ? (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">
                              Select Items to Dispatch
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-zinc-100 dark:border-zinc-800 rounded-xl p-2 space-y-1">
                              {items.filter(i => i.typeId === transactionData.typeId && i.status === 'in stock').map(item => {
                                const mainKey = schema.columns.find(c => c.key === 'serial' || c.key === 'id' || c.key === 'serial_or_id')?.key || 'id';
                                const label = item.data[mainKey] || item.id;
                                const isSelected = transactionData.items.includes(item.id);
                                return (
                                  <button
                                    key={item.id}
                                    onClick={() => {
                                      const newItems = isSelected 
                                        ? transactionData.items.filter(id => id !== item.id)
                                        : [...transactionData.items, item.id];
                                      setTransactionData({ ...transactionData, items: newItems });
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all ${isSelected ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">Quantity to Dispatch</label>
                            <input 
                              type="number"
                              value={transactionData.quantity}
                              onChange={(e) => setTransactionData({ ...transactionData, quantity: parseInt(e.target.value) || 1 })}
                              className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs font-bold dark:text-white outline-none transition-all"
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <CustomSelect 
                            label="New Status"
                            options={[
                              { value: 'in use', label: 'In Use' },
                              { value: 'repair', label: 'Repair' },
                              { value: 'other', label: 'Other' }
                            ]}
                            value={transactionData.status}
                            onChange={(val) => setTransactionData({ ...transactionData, status: val as any })}
                          />
                          <div className="flex-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">Destination</label>
                            <input 
                              type="text"
                              value={transactionData.destination}
                              onChange={(e) => setTransactionData({ ...transactionData, destination: e.target.value })}
                              className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs font-bold dark:text-white outline-none transition-all"
                              placeholder="Where is it going?"
                            />
                          </div>
                        </div>

                        {transactionData.status === 'other' && (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">Purpose</label>
                            <input 
                              type="text"
                              value={transactionData.purpose}
                              onChange={(e) => setTransactionData({ ...transactionData, purpose: e.target.value })}
                              className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs font-bold dark:text-white outline-none transition-all"
                              placeholder="Specify purpose"
                            />
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">Remark / Notes</label>
                      <input 
                        type="text"
                        value={transactionType === 'IN' && schema.isSerialized ? '' : transactionData.remark}
                        onChange={(e) => setTransactionData({ ...transactionData, remark: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs font-bold dark:text-white outline-none transition-all"
                        placeholder="Additional notes"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setShowTransactionModal(false)} className="px-6 py-3 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
              <button 
                onClick={handleTransaction} 
                disabled={!transactionData.typeId}
                className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Complete {transactionType} Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BULK UPLOAD MODAL --- */}
      {showBulkModal && activeSchema && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
           <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-5xl h-[85vh] p-8 shadow-2xl flex flex-col animate-in fade-in zoom-in-95">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <h3 className="text-2xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-3">
                       <TableCellsIcon className="w-8 h-8 text-indigo-600" /> Bulk Import: {activeSchema.label}
                    </h3>
                    <p className="text-sm font-bold text-zinc-500 mt-1">Paste data directly from Excel or Google Sheets. Ensure columns match.</p>
                 </div>
                 <button onClick={() => setShowBulkModal(false)} className="p-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-2xl transition-all"><XMarkIcon className="w-6 h-6 text-zinc-500" /></button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-1">
                 <ExcelGrid 
                    headers={activeSchema.columns.map(c => c.label + (c.required ? ' *' : ''))}
                    data={bulkGridData}
                    onChange={setBulkGridData}
                 />
              </div>

              <div className="mt-6 flex justify-between items-center">
                 <p className="text-xs font-bold text-zinc-400">
                    * Required fields must be filled. Empty rows will be ignored.
                 </p>
                 <div className="flex gap-3">
                    <button onClick={() => setShowBulkModal(false)} className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
                    <button 
                      onClick={handleBulkSave} 
                      disabled={bulkSaving} 
                      className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                       {bulkSaving ? (
                          <>Processing...</>
                       ) : (
                          <>
                             <ArrowUpOnSquareIcon className="w-5 h-5" /> Import Data
                          </>
                       )}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- SCHEMA EDITOR MODAL --- */}
      {showSchemaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-2xl p-8 shadow-2xl animate-in fade-in zoom-in-95 h-[80vh] flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  {editingSchema ? `Configure: ${editingSchema.label}` : 'Create New Item Type'}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Define structure and data fields.</p>
              </div>
              <button onClick={() => setShowSchemaModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"><XMarkIcon className="w-5 h-5 text-zinc-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-8 scrollbar-thin">
              {/* Create New Type Mode */}
              {!editingSchema && (
                <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                  <label className="text-xs font-bold uppercase text-indigo-900 dark:text-indigo-200 mb-2 block">New Category Name</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newTypeName} 
                      onChange={(e) => setNewTypeName(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border-none text-sm font-bold shadow-sm outline-none"
                      placeholder="e.g. Tools, Tablets, GPS Units"
                    />
                    <button onClick={handleAddType} disabled={!newTypeName} className="px-6 bg-indigo-600 text-white rounded-xl font-bold text-xs disabled:opacity-50">Create</button>
                  </div>
                </div>
              )}

              {/* Edit Schema Mode */}
              {editingSchema && (
                <>
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <AdjustmentsHorizontalIcon className="w-4 h-4" /> Existing Columns
                    </h4>
                    {editingSchema.columns.map((col, idx) => (
                      <div key={col.key} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700">
                        <div>
                          <span className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{col.label}</span>
                          <span className="ml-2 text-[10px] uppercase text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{col.type}</span>
                          {col.required && <span className="ml-2 text-[10px] uppercase text-red-500 font-bold">*Required</span>}
                        </div>
                        <div className="flex gap-1">
                           <button 
                             onClick={() => handleMoveColumn(idx, 'up')} 
                             disabled={idx === 0}
                             className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded disabled:opacity-30 transition-all text-zinc-500 dark:text-zinc-400"
                           >
                             <ChevronUpIcon className="w-4 h-4" />
                           </button>
                           <button 
                             onClick={() => handleMoveColumn(idx, 'down')}
                             disabled={idx === editingSchema.columns.length - 1}
                             className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded disabled:opacity-30 transition-all text-zinc-500 dark:text-zinc-400"
                           >
                             <ChevronDownIcon className="w-4 h-4" />
                           </button>
                           <button 
                             onClick={() => handleDeleteColumnClick(idx)} 
                             className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all text-zinc-400 hover:text-red-500 ml-1"
                             title="Delete Column"
                           >
                             <TrashIcon className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                      <PlusIcon className="w-4 h-4" /> Add New Column
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Column Name</label>
                        <input 
                          type="text" 
                          value={newColumn.label} 
                          onChange={(e) => setNewColumn({...newColumn, label: e.target.value})}
                          className="w-full px-4 py-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold outline-none"
                          placeholder="e.g. Warranty Date"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1 block">Data Type</label>
                        <CustomSelect 
                          options={[
                            { value: 'text', label: 'Text' },
                            { value: 'number', label: 'Number' },
                            { value: 'date', label: 'Date' }
                          ]}
                          value={newColumn.type}
                          onChange={(val) => setNewColumn({...newColumn, type: val as any})}
                          className="!py-2"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                       <input 
                         type="checkbox" 
                         checked={newColumn.required} 
                         onChange={(e) => setNewColumn({...newColumn, required: e.target.checked})}
                         className="rounded text-indigo-600 focus:ring-indigo-500"
                       />
                       <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Required Field?</label>
                    </div>
                    <button 
                      onClick={handleAddColumn} 
                      disabled={!newColumn.label}
                      className="w-full py-3 bg-zinc-900 dark:bg-zinc-700 text-white rounded-xl font-bold text-xs hover:bg-black dark:hover:bg-zinc-600 transition-all disabled:opacity-50"
                    >
                      Append Column
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {columnToDelete !== null && editingSchema && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3 mb-4 text-red-500">
                    <ExclamationTriangleIcon className="w-6 h-6" />
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Delete Column?</h3>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 font-medium">
                    Are you sure you want to delete <span className="font-bold text-zinc-800 dark:text-zinc-200">"{editingSchema.columns[columnToDelete].label}"</span>? 
                    This will hide existing data for this field.
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setColumnToDelete(null)} 
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={confirmDeleteColumn} 
                        className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-md transition-colors"
                    >
                        Delete Permanently
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default InventoryPage;