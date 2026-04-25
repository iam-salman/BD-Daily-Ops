import React, { useState, useEffect, useMemo } from 'react';
import { 
  BanknotesIcon, 
  PlusIcon, 
  CalendarIcon, 
  MapPinIcon, 
  UserIcon, 
  ArrowDownTrayIcon,
  XMarkIcon,
  CheckCircleIcon,
  CurrencyRupeeIcon,
  TrashIcon,
  PencilSquareIcon,
  TagIcon,
  ListBulletIcon,
  Squares2X2Icon,
  FunnelIcon,
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  where,
  getDocs,
  Firestore,
  limit,
  doc,
  setDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { CashCollection, CashDenominations, Station, UserRole, StationGroup } from '../types';
import CustomSelect from '../components/CustomSelect';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { motion, AnimatePresence } from 'motion/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

import { 
  format, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfToday, 
  startOfYesterday,
  isWithinInterval,
  parseISO,
  subMonths
} from 'date-fns';

interface CashReportPageProps {
  isDarkMode: boolean;
  user: any;
  role: UserRole | null;
  db: Firestore;
  userName?: string;
}

type DateRangePreset = 'Today' | 'Yesterday' | 'Last 7 Days' | 'Last 30 Days' | 'This Month' | 'Last Month' | 'Custom Range';

const DENOMINATIONS: (keyof Omit<CashDenominations, 'coins'>)[] = ['n500', 'n200', 'n100', 'n50', 'n20', 'n10'];
const DENOM_VALUES = {
  n500: 500,
  n200: 200,
  n100: 100,
  n50: 50,
  n20: 20,
  n10: 10
};

const CashReportPage: React.FC<CashReportPageProps> = ({ isDarkMode, user, role, db, userName }) => {
  const [collections, setCollections] = useState<CashCollection[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [sessionStations, setSessionStations] = useState<{id: string, name: string}[]>([]);
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([]);
  const [supervisors, setSupervisors] = useState<{ id: string; name: string; email: string }[]>([]);
  const [stationGroups, setStationGroups] = useState<StationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewType, setViewType] = useState<'cards' | 'table'>('table');
  
  // Group Management State
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedStationsForGroup, setSelectedStationsForGroup] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const handleSaveGroup = async () => {
    if (!newGroupName.trim() || selectedStationsForGroup.length === 0) return;
    
    try {
      if (editingGroupId) {
        await updateDoc(doc(db, 'station_groups', editingGroupId), {
          name: newGroupName,
          stationIds: selectedStationsForGroup,
          type: 'cash_report'
        });
      } else {
        await addDoc(collection(db, 'station_groups'), {
          name: newGroupName,
          stationIds: selectedStationsForGroup,
          type: 'cash_report',
          createdAt: new Date().toISOString()
        });
      }
      setNewGroupName('');
      setSelectedStationsForGroup([]);
      setEditingGroupId(null);
    } catch (error) {
      console.error("Error saving group:", error);
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteGroup = async (e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (deleteConfirmId !== groupId) {
      setDeleteConfirmId(groupId);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'station_groups', groupId));
      setDeleteConfirmId(null);
      if (editingGroupId === groupId) {
        setEditingGroupId(null);
        setNewGroupName('');
        setSelectedStationsForGroup([]);
      }
    } catch (error) {
      console.error("Error deleting group:", error);
      setDeleteConfirmId(null);
    }
  };

  const handleEditGroup = (group: StationGroup) => {
    setEditingGroupId(group.id);
    setNewGroupName(group.name || '');
    setSelectedStationsForGroup(group.stationIds || []);
  };

  // Filters
  const [datePreset, setDatePreset] = useState<DateRangePreset>('Today');
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [stationFilter, setStationFilter] = useState('All');
  const [groupFilter, setGroupFilter] = useState('All');
  const [collectorFilter, setCollectorFilter] = useState('All');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    operators.forEach(o => map.set(o.id.toLowerCase(), o.name));
    supervisors.forEach(s => map.set(s.email.toLowerCase() || s.id.toLowerCase(), s.name));
    return map;
  }, [operators, supervisors]);

  const resolveName = (email: string, fallback: string) => {
    if (!email) return fallback;
    return userMap.get(email.toLowerCase()) || fallback;
  };

  const uniqueCollectors = useMemo(() => {
    const collectors = (collections || []).map(c => ({ 
      id: c.collectedBy, 
      name: resolveName(c.collectedBy, c.collectedByName || c.collectedBy.split('@')[0])
    }));
    const seen = new Set();
    return collectors.filter(c => {
      if (!c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [collections, userMap]);

  const availableStations = useMemo(() => {
    const masters = (stations || []).map(s => ({ id: s.id, name: s.name || 'Unknown' }));
    const fromSessions = (sessionStations || []).map(s => ({ id: s.id, name: s.name }));
    const fromCollections = (collections || []).map(c => ({ id: c.stationId, name: c.stationName || 'Unknown' }));
    
    const combined = [...masters, ...fromSessions, ...fromCollections];
    
    // Use a Set to track NAMES to prevent visual duplicates
    const seenNames = new Set();
    
    return combined
      .filter(s => {
        if (!s.name || s.name === 'Unknown' || seenNames.has(s.name.trim().toLowerCase())) {
          return false;
        }
        seenNames.add(s.name.trim().toLowerCase());
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stations, collections, sessionStations]);

  useEffect(() => {
    const now = new Date();
    let from = now;
    let to = now;

    switch (datePreset) {
      case 'Today':
        from = startOfToday();
        to = now;
        break;
      case 'Yesterday':
        from = startOfYesterday();
        to = startOfYesterday();
        break;
      case 'Last 7 Days':
        from = subDays(now, 6);
        to = now;
        break;
      case 'Last 30 Days':
        from = subDays(now, 29);
        to = now;
        break;
      case 'This Month':
        from = startOfMonth(now);
        to = now;
        break;
      case 'Last Month':
        const lastMonth = subMonths(now, 1);
        from = startOfMonth(lastMonth);
        to = endOfMonth(lastMonth);
        break;
      case 'Custom Range':
        return;
    }

    setDateFrom(format(from, 'yyyy-MM-dd'));
    setDateTo(format(to, 'yyyy-MM-dd'));
  }, [datePreset]);

  // Entry Form State
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [denoms, setDenoms] = useState<CashDenominations>({
    n500: 0,
    n200: 0,
    n100: 0,
    n50: 0,
    n20: 0,
    n10: 0,
    coins: 0
  });

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const collectionsRef = collection(db, 'cash_collections');
      const q = query(collectionsRef, orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      
      const collectionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashCollection));
      setCollections(collectionsData);
    } catch (err) {
      console.error("Error fetching collections:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    const fetchStations = async () => {
      const sSnap = await getDocs(query(collection(db, 'swap_stations'), orderBy('name', 'asc')));
      setStations(sSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Station)));
    };

    const fetchOperators = async () => {
      const uSnap = await getDocs(query(collection(db, 'users'), where('role', '==', UserRole.OPERATOR)));
      setOperators(uSnap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || doc.data().email.split('@')[0]
      })));
    };

    const fetchSupervisors = async () => {
      const uSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', [UserRole.ADMIN, UserRole.SUPERVISOR])));
      setSupervisors(uSnap.docs.map(doc => ({
        id: doc.id,
        email: doc.data().email,
        name: doc.data().name || doc.data().email.split('@')[0]
      })));
    };

    const unsubscribeGroups = onSnapshot(query(collection(db, 'station_groups'), where('type', '==', 'cash_report')), (snapshot) => {
      setStationGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StationGroup)));
    });

    const fetchSessionStations = async () => {
      try {
        const sessSnap = await getDocs(query(
          collection(db, 'swapping_sessions'), 
          orderBy('timestamp', 'desc'),
          limit(500)
        ));
        const uniqueNames = Array.from(new Set(sessSnap.docs.map(d => d.data().dealer_name))).filter(Boolean);
        setSessionStations(uniqueNames.map(name => ({ id: name, name: name })));
      } catch (err) {
        console.error("Error fetching session stations:", err);
      }
    };

    fetchStations();
    fetchOperators();
    fetchSupervisors();
    fetchSessionStations();

    return () => {
      unsubscribeGroups();
    };
  }, [db]);

  const handleDenomChange = (key: keyof CashDenominations, value: string) => {
    const num = parseInt(value) || 0;
    setDenoms(prev => ({ ...prev, [key]: num }));
  };

  const totalAmount = useMemo(() => {
    let total = denoms.coins;
    DENOMINATIONS.forEach(key => {
      total += denoms[key] * DENOM_VALUES[key];
    });
    return total;
  }, [denoms]);

  const handleSaveEntry = async () => {
    if (!selectedStation || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const station = availableStations.find(s => s.id === selectedStation);
      
      const timestamp = editingCollectionId 
        ? collections.find(c => c.id === editingCollectionId)?.timestamp || new Date().toISOString() 
        : new Date().toISOString();

      const entryData: any = {
        stationId: selectedStation,
        stationName: station?.name || 'Unknown',
        operatorId: 'N/A',
        operatorName: 'N/A',
        collectedBy: user.email,
        collectedByName: userName || user.displayName || user.email.split('@')[0],
        denominations: denoms,
        totalAmount,
        date: selectedDate,
        timestamp: timestamp,
        createdAt: timestamp
      };

      if (editingCollectionId) {
        await updateDoc(doc(db, 'cash_collections', editingCollectionId), entryData);
        // Update local state to reflect change immediately
        setCollections(prev => prev.map(c => c.id === editingCollectionId ? { ...c, ...entryData } : c));
      } else {
        const docRef = await addDoc(collection(db, 'cash_collections'), entryData);
        // Optionally update local state
        setCollections(prev => [{ id: docRef.id, ...entryData }, ...prev]);
      }

      setShowEntryModal(false);
      resetForm();
    } catch (error) {
      console.error("Error saving cash collection:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    if (!window.confirm('Are you sure you want to delete this collection record?')) return;
    
    try {
      await deleteDoc(doc(db, 'cash_collections', collectionId));
      setCollections(prev => prev.filter(c => c.id !== collectionId));
    } catch (error) {
      console.error("Error deleting collection:", error);
      alert("Failed to delete record.");
    }
  };

  const handleEditCollection = (item: CashCollection) => {
    setEditingCollectionId(item.id || null);
    setSelectedStation(item.stationId);
    setSelectedDate(item.date);
    setDenoms(item.denominations);
    setShowEntryModal(true);
  };

  const resetForm = () => {
    setSelectedStation('');
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setEditingCollectionId(null);
    setDenoms({
      n500: 0,
      n200: 0,
      n100: 0,
      n50: 0,
      n20: 0,
      n10: 0,
      coins: 0
    });
  };

  const filteredCollections = useMemo(() => {
    return (collections || []).filter(c => {
      const matchesStation = stationFilter === 'All' || c.stationId === stationFilter;
      const matchesCollector = collectorFilter === 'All' || c.collectedBy === collectorFilter;
      const matchesDate = c.date >= dateFrom && c.date <= dateTo;
      
      let matchesGroup = true;
      if (groupFilter !== 'All') {
        const group = (stationGroups || []).find(g => g.id === groupFilter);
        if (group) {
          matchesGroup = (group.stationIds || []).includes(c.stationId);
        } else {
          matchesGroup = false;
        }
      }

      return matchesStation && matchesCollector && matchesDate && matchesGroup;
    });
  }, [collections, stationFilter, groupFilter, collectorFilter, dateFrom, dateTo, stationGroups]);

  const stationData = useMemo(() => {
    const data: Record<string, { stationName: string; denoms: CashDenominations; total: number; hasData: boolean }> = {};
    
    (stations || []).forEach(s => {
      if (s?.id) {
        data[s.id] = {
          stationName: s.name || 'Unknown Station',
          denoms: { n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0 },
          total: 0,
          hasData: false
        };
      }
    });

    (filteredCollections || []).forEach(c => {
      if (c?.stationId && data[c.stationId]) {
        const s = data[c.stationId];
        s.total += c.totalAmount || 0;
        s.denoms.coins += (c.denominations?.coins || 0);
        DENOMINATIONS.forEach(key => {
          s.denoms[key] += (c.denominations?.[key] || 0);
        });
        s.hasData = true;
      }
    });

    let result = Object.entries(data).map(([id, val]) => ({ id, ...val }));

    if (groupFilter !== 'All') {
      const group = (stationGroups || []).find(g => g.id === groupFilter);
      if (group) {
        result = result.filter(r => (group.stationIds || []).includes(r.id));
      } else {
        result = [];
      }
    }

    if (stationFilter !== 'All') {
      result = result.filter(r => r.id === stationFilter);
    }

    return result;
  }, [stations, filteredCollections, stationFilter, groupFilter, stationGroups]);

  const truncateText = (text: string, limit: number = 20) => {
    if (!text) return '';
    return text.length > limit ? text.substring(0, limit) + '...' : text;
  };

  const exportReport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cash Report');

    const headers = [
      'Date', 'Station', '500x', '200x', '100x', '50x', '20x', '10x', 'Coins', 'Total Amount', 'Collected By'
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'BFBFBF' }
      };
    });

    filteredCollections.forEach(c => {
      const denoms = c.denominations || { n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0 };
      worksheet.addRow([
        c.date || '-',
        c.stationName || 'Unknown',
        denoms.n500 || 0,
        denoms.n200 || 0,
        denoms.n100 || 0,
        denoms.n50 || 0,
        denoms.n20 || 0,
        denoms.n10 || 0,
        denoms.coins || 0,
        c.totalAmount || 0,
        resolveName(c.collectedBy, c.collectedByName || (c.collectedBy ? c.collectedBy.split('@')[0] : 'Unknown'))
      ]).eachCell(cell => {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    });

    worksheet.columns.forEach(column => {
      column.width = 15;
    });

    const summarySheet = workbook.addWorksheet('Station Summary');
    const summaryHeaders = ['Station', '500x', '200x', '100x', '50x', '20x', '10x', 'Coins', 'Total Amount'];
    const sHeaderRow = summarySheet.addRow(summaryHeaders);
    sHeaderRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BFBFBF' } };
    });

    stationData.filter(s => s.hasData).forEach(s => {
      summarySheet.addRow([
        s.stationName,
        s.denoms.n500,
        s.denoms.n200,
        s.denoms.n100,
        s.denoms.n50,
        s.denoms.n20,
        s.denoms.n10,
        s.denoms.coins,
        s.total
      ]).eachCell(cell => {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    });

    summarySheet.columns.forEach(column => {
      column.width = 15;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Cash_Report_${dateFrom}_to_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 px-2 mt-4 lg:mt-0">
        <div className="space-y-1">
          <h2 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">Cash Collections</h2>
          <p className="text-xs lg:text-sm font-semibold text-gray-400 dark:text-slate-400">Daily revenue and denomination management</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-2xl shadow-inner shrink-0 h-11">
            <button 
              onClick={() => setViewType('table')}
              className={`px-3 lg:px-4 rounded-xl text-[10px] lg:text-xs font-bold transition-all flex items-center justify-center h-full ${
                viewType === 'table' 
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <ListBulletIcon className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button 
              onClick={() => setViewType('cards')}
              className={`px-3 lg:px-4 rounded-xl text-[10px] lg:text-xs font-bold transition-all flex items-center justify-center h-full ${
                viewType === 'cards' 
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Squares2X2Icon className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Grid</span>
            </button>
          </div>
          
          <button 
            onClick={exportReport}
            className="flex items-center justify-center h-11 px-4 lg:px-5 lg:py-3 rounded-2xl font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all shadow-sm shrink-0"
            title="Export Report"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            <span className="hidden lg:inline ml-2">Export</span>
          </button>
          
          <button 
            onClick={() => setShowEntryModal(true)}
            className="flex items-center justify-center h-11 px-4 lg:px-5 lg:py-3 rounded-2xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200/50 dark:shadow-none transition-all active:scale-95 shrink-0"
          >
            <PlusIcon className="w-5 h-5 lg:mr-2 text-indigo-200" />
            <span className="hidden sm:inline font-bold">Collect Cash</span>
            <span className="sm:hidden text-xs font-bold">Collect</span>
          </button>

          <button 
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className={`lg:hidden flex items-center justify-center w-11 h-11 rounded-2xl transition-all shadow-md active:scale-95 shrink-0 ${
              isFiltersOpen 
                ? 'bg-indigo-600 text-white rotate-180' 
                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500'
            }`}
          >
            {isFiltersOpen ? <ChevronDownIcon className="w-5 h-5" /> : <AdjustmentsHorizontalIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className={`bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[2.5rem] lg:rounded-[3rem] border border-zinc-100 dark:border-zinc-800 shadow-xl shadow-zinc-200/20 dark:shadow-none mb-10 ${!isFiltersOpen ? 'hidden lg:block' : 'block'}`}>
        <AnimatePresence>
          {(isFiltersOpen || (typeof window !== 'undefined' && window.innerWidth >= 1024)) && (
            <motion.div 
              initial={typeof window !== 'undefined' && window.innerWidth < 1024 ? { height: 0, opacity: 0 } : false}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="lg:!h-auto lg:!opacity-100 overflow-visible"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 lg:pt-0">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Date Range</label>
                  <CustomSelect 
                    options={[
                      { value: 'Today', label: 'Today' },
                      { value: 'Yesterday', label: 'Yesterday' },
                      { value: 'Last 7 Days', label: 'Last 7 Days' },
                      { value: 'Last 30 Days', label: 'Last 30 Days' },
                      { value: 'This Month', label: 'This Month' },
                      { value: 'Last Month', label: 'Last Month' },
                      { value: 'Custom Range', label: 'Custom Range' }
                    ]}
                    value={datePreset}
                    onChange={(val) => setDatePreset(val as DateRangePreset)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center pr-1 gap-2 mb-1">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Station Group</label>
                    <button 
                      onClick={() => setShowGroupsModal(true)}
                      className="text-[10px] font-bold text-indigo-600 hover:underline shrink-0"
                    >
                      Manage
                    </button>
                  </div>
                  <CustomSelect 
                    options={[
                      { value: 'All', label: 'All Groups' },
                      ...(stationGroups || []).map(g => ({ value: g.id, label: g.name || 'Unnamed Group' }))
                    ]}
                    value={groupFilter}
                    onChange={(v) => setGroupFilter(v as string)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Station</label>
                  <CustomSelect 
                    options={[
                      { value: 'All', label: 'All Stations' },
                      ...(availableStations || []).map(s => ({ value: s.id, label: s.name || 'Unknown' }))
                    ]}
                    value={stationFilter}
                    onChange={(v) => setStationFilter(v as string)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1 text-nowrap">Collected By</label>
                  <CustomSelect 
                    options={[
                      { value: 'All', label: 'All Supervisors' },
                      ...(uniqueCollectors || []).map(c => ({ value: c.id, label: c.name || 'Unknown' }))
                    ]}
                    value={collectorFilter}
                    onChange={(v) => setCollectorFilter(v as string)}
                  />
                </div>
              </div>

              {datePreset === 'Custom Range' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 mt-8 border-t border-zinc-50 dark:border-zinc-800 animate-in slide-in-from-top-4 duration-500">
                  <div className="space-y-2 px-1">
                    <CustomDatePicker 
                      label="From Date"
                      value={dateFrom}
                      onChange={(val) => setDateFrom(val)}
                    />
                  </div>
                  <div className="space-y-2 px-1">
                    <CustomDatePicker 
                      label="To Date"
                      value={dateTo}
                      onChange={(val) => setDateTo(val)}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {viewType === 'table' ? (
        <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] scrollbar-thin">
            <table className="w-full text-left border-collapse table-auto min-w-[800px]">
              <thead className="sticky top-0 z-30 bg-zinc-50 dark:bg-zinc-800 shadow-sm text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider border border-zinc-100 dark:border-zinc-700 whitespace-nowrap sticky left-0 z-40 bg-zinc-50 dark:bg-zinc-800">Station</th>
                  {DENOMINATIONS.map(d => (
                    <th key={d} className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-center border border-zinc-100 dark:border-zinc-700 whitespace-nowrap">₹{d.replace('n', '')}</th>
                  ))}
                  <th className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-center border border-zinc-100 dark:border-zinc-700 whitespace-nowrap">Coins</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-right border border-zinc-100 dark:border-zinc-700 whitespace-nowrap">Total Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={10} className="px-6 py-4 border border-zinc-100 dark:border-zinc-700"><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full"></div></td>
                    </tr>
                  ))
                ) : (stationData || []).length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-zinc-400 font-bold italic border border-zinc-100 dark:border-zinc-700 whitespace-nowrap">No stations found</td>
                  </tr>
                ) : (
                  (stationData || []).map(s => (
                    <tr key={s.id} className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors ${!s.hasData ? 'opacity-50 grayscale-[0.5]' : ''}`}>
                      <td className="px-6 py-4 border border-zinc-100 dark:border-zinc-700 whitespace-nowrap min-w-[200px] sticky left-0 z-20 bg-white dark:bg-zinc-900 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.hasData ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                          <span className="font-black text-zinc-900 dark:text-white text-xs uppercase tracking-tight" title={s.stationName}>
                            {truncateText(s.stationName)}
                          </span>
                        </div>
                      </td>
                      {DENOMINATIONS.map(d => (
                        <td key={d} className="px-4 py-4 text-center border border-zinc-100 dark:border-zinc-700 whitespace-nowrap">
                          <span className={`text-xs font-black ${(s.denoms?.[d] || 0) > 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400/50 dark:text-zinc-600/50'}`}>
                            {s.denoms?.[d] || 0}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-4 text-center border border-zinc-100 dark:border-zinc-700 whitespace-nowrap">
                        <span className={`text-xs font-black ${(s.denoms?.coins || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400/50 dark:text-zinc-600/50'}`}>
                          ₹{(s.denoms?.coins || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right border border-zinc-100 dark:border-zinc-700 whitespace-nowrap">
                        <span className={`text-sm font-black ${(s.total || 0) > 0 ? 'text-indigo-600 dark:text-indigo-500' : 'text-zinc-300 dark:text-zinc-700'}`}>
                          ₹{(s.total || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {(stationData || []).length > 0 && !loading && (
                <tfoot className="sticky bottom-0 z-30 bg-indigo-50 dark:bg-indigo-900 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                  <tr className="font-black">
                    <td className="px-6 py-4 bg-indigo-50 dark:bg-zinc-900 text-zinc-900 dark:text-white border border-indigo-100 dark:border-indigo-800 text-[10px] uppercase tracking-widest whitespace-nowrap sticky left-0 z-40">Grand Total</td>
                    {DENOMINATIONS.map(d => (
                      <td key={d} className="px-4 py-4 text-center text-zinc-900 dark:text-white border border-indigo-100 dark:border-indigo-800 text-xs whitespace-nowrap">
                        {(stationData || []).reduce((acc, curr) => acc + (curr.denoms?.[d] || 0), 0)}
                      </td>
                    ))}
                    <td className="px-4 py-4 text-center text-zinc-900 dark:text-white border border-indigo-100 dark:border-indigo-800 text-xs whitespace-nowrap">
                      ₹{(stationData || []).reduce((acc, curr) => acc + (curr.denoms?.coins || 0), 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 text-sm whitespace-nowrap">
                      ₹{(stationData || []).reduce((acc, curr) => acc + (curr.total || 0), 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-48 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 animate-pulse"></div>
            ))
          ) : filteredCollections.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800">
              <BanknotesIcon className="w-16 h-16 mx-auto mb-4 text-zinc-200" />
              <p className="text-lg font-bold text-zinc-400">No collections found for this period</p>
            </div>
          ) : (
            filteredCollections.map(item => (
              <div 
                key={item.id}
                className="bg-white dark:bg-zinc-900 p-6 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
                
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
                      <MapPinIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-800 dark:text-white leading-tight truncate whitespace-nowrap max-w-[150px] sm:max-w-[200px]" title={item.stationName}>
                        {truncateText(item.stationName)}
                      </h3>
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter whitespace-nowrap">{item.date}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    {/* Edit Option with 30-hour limitation - Moved to actions container */}
                    {(item.collectedBy === user.email && (Date.now() - new Date(item.timestamp).getTime() < 30 * 60 * 60 * 1000)) && (
                      <button 
                        onClick={() => handleEditCollection(item)}
                        className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-all shadow-sm border border-indigo-100 dark:border-indigo-800/50"
                        title="Edit Collection"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                    )}

                    {/* Admin Delete Action */}
                    {role === UserRole.ADMIN && (
                      <button 
                        onClick={() => handleDeleteCollection(item.id)}
                        className="p-2 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                        title="Delete Record"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-6 relative z-10">
                  {DENOMINATIONS.map(key => {
                    const val = item.denominations?.[key] || 0;
                    return (
                      <div key={key} className={`p-2 rounded-xl text-center border transition-all duration-300 ${val > 0 ? 'bg-zinc-50/50 dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800 shadow-sm' : 'bg-transparent border-zinc-50 dark:border-zinc-900 opacity-30 shadow-none'}`}>
                        <p className={`text-[8px] font-black uppercase tracking-widest ${val > 0 ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-300'}`}>₹{key.replace('n', '')}</p>
                        <p className={`text-xs font-black ${val > 0 ? 'text-zinc-800 dark:text-white' : 'text-zinc-300'}`}>{val}</p>
                      </div>
                    );
                  })}
                  <div className={`p-2 rounded-xl text-center border transition-all duration-300 ${item.denominations?.coins > 0 ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800 shadow-sm' : 'bg-transparent border-zinc-50 dark:border-zinc-900 opacity-30 shadow-none'}`}>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${item.denominations?.coins > 0 ? 'text-emerald-400 dark:text-emerald-500' : 'text-zinc-300'}`}>Coins</p>
                    <p className={`text-xs font-black ${item.denominations?.coins > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-300'}`}>₹{item.denominations?.coins || 0}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-50 dark:border-zinc-800 relative z-10">
                  <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">Total Collected</p>
                    <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">₹{item.totalAmount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest whitespace-nowrap">Collector</p>
                    <p className="text-[10px] font-bold text-zinc-500 whitespace-nowrap truncate" title={resolveName(item.collectedBy, item.collectedByName || item.collectedBy.split('@')[0])}>
                      {truncateText(resolveName(item.collectedBy, item.collectedByName || item.collectedBy.split('@')[0]))}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Entry Modal */}
      <AnimatePresence>
        {showEntryModal && (
          <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-50 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{editingCollectionId ? 'Edit Station Cash' : 'Collect Station Cash'}</h3>
                  <p className="text-xs font-semibold text-zinc-400">{editingCollectionId ? 'Update denominations received from station' : 'Record denominations received from station'}</p>
                </div>
                <button onClick={() => { setShowEntryModal(false); resetForm(); }} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                  <XMarkIcon className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="p-4 sm:p-8 overflow-y-auto space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Station</label>
                    <CustomSelect 
                      options={availableStations.map(s => ({ value: s.id, label: s.name }))}
                      value={selectedStation}
                      onChange={setSelectedStation}
                    />
                  </div>
                  <div className="space-y-2">
                    <CustomDatePicker 
                      label="Collection Date"
                      value={selectedDate}
                      onChange={(val) => setSelectedDate(val)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Revenue Detail (Denominations)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {DENOMINATIONS.map(key => (
                      <div key={key} className="space-y-1.5 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[1.5rem] border border-transparent focus-within:border-indigo-500/30 transition-all">
                        <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">₹{key.replace('n', '')} Notes</label>
                        <input 
                          type="number" 
                          placeholder="0"
                          value={denoms[key] || ''}
                          onChange={(e) => handleDenomChange(key, e.target.value)}
                          className="w-full bg-transparent border-none p-0 text-xl font-black focus:ring-0 outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <p className="text-[10px] font-bold text-zinc-400 italic">Total: ₹{(denoms[key] * DENOM_VALUES[key]).toLocaleString()}</p>
                      </div>
                    ))}
                    <div className="space-y-1.5 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[1.5rem] border border-transparent focus-within:border-emerald-500/30 transition-all">
                      <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Total Coins (₹)</label>
                      <input 
                        type="number" 
                        placeholder="0"
                        value={denoms.coins || ''}
                        onChange={(e) => handleDenomChange('coins', e.target.value)}
                        className="w-full bg-transparent border-none p-0 text-xl font-black focus:ring-0 outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <p className="text-[10px] font-bold text-emerald-500 italic">Value is amount</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Grand Total</p>
                  <p className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">₹{totalAmount.toLocaleString()}</p>
                </div>
                <button 
                  onClick={handleSaveEntry}
                  disabled={!selectedStation || totalAmount <= 0 || isSubmitting}
                  className="w-full sm:w-auto px-10 py-4 bg-indigo-600 text-white rounded-2xl font-bold font-button shadow-lg shadow-indigo-200/50 dark:shadow-none hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (editingCollectionId ? <PencilSquareIcon className="w-5 h-5" /> : <PlusIcon className="w-5 h-5" />)}
                  {editingCollectionId ? 'Update Entry' : 'Collect Cash'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manage Groups Modal */}
      <AnimatePresence>
        {showGroupsModal && (
          <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-50 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Manage Station Groups</h3>
                  <p className="text-xs font-semibold text-zinc-400">Create groups for faster filtering</p>
                </div>
                <button onClick={() => setShowGroupsModal(false)} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                  <XMarkIcon className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="flex flex-col lg:flex-row h-full overflow-hidden">
                <div className="w-full lg:w-1/2 p-8 border-b lg:border-b-0 lg:border-r border-zinc-50 dark:border-zinc-800 overflow-y-auto">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Group Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. South Zone, Night Shift"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none dark:text-zinc-100 font-bold"
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Select Stations</label>
                        <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">{(selectedStationsForGroup || []).length} Selected</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto p-1">
                        {(availableStations || []).map(station => (
                          <button
                            key={station.id}
                            onClick={() => {
                              setSelectedStationsForGroup(prev => 
                                (prev || []).includes(station.id) 
                                  ? (prev || []).filter(id => id !== station.id) 
                                  : [...(prev || []), station.id]
                              );
                            }}
                            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                              selectedStationsForGroup.includes(station.id)
                                ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-500/50 text-indigo-600 dark:text-indigo-400'
                                : 'bg-transparent border-zinc-100 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            <span className="font-bold text-sm truncate whitespace-nowrap pr-4" title={station.name}>
                              {truncateText(station.name)}
                            </span>
                            {selectedStationsForGroup.includes(station.id) && <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={handleSaveGroup}
                        disabled={!newGroupName.trim() || selectedStationsForGroup.length === 0}
                        className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200/50 dark:shadow-none hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {editingGroupId ? 'Update Group' : 'Create Group'}
                      </button>
                      {editingGroupId && (
                        <button 
                          onClick={() => {
                            setEditingGroupId(null);
                            setNewGroupName('');
                            setSelectedStationsForGroup([]);
                          }}
                          className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full lg:w-1/2 p-8 bg-zinc-50 dark:bg-zinc-950/30 overflow-y-auto">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 mb-4 block">Existing Groups</label>
                  <div className="space-y-4">
                    {stationGroups.length === 0 ? (
                      <div className="text-center py-12">
                        <TagIcon className="w-12 h-12 text-zinc-200 mx-auto mb-2" />
                        <p className="text-sm font-bold text-zinc-400">No groups created yet</p>
                      </div>
                    ) : (
                      stationGroups.map(group => (
                        <div key={group.id} className="p-5 bg-white dark:bg-zinc-900 rounded-[1.5rem] border border-zinc-100 dark:border-zinc-800 flex items-center justify-between group">
                          <div>
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white capitalize truncate whitespace-nowrap max-w-[200px]" title={group.name}>
                              {truncateText(group.name)}
                            </h4>
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap">{(group.stationIds || []).length} Stations</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              type="button"
                              onClick={() => handleEditGroup(group)}
                              className="p-2 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                            >
                              <PencilSquareIcon className="w-5 h-5" />
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => handleDeleteGroup(e, group.id)}
                              className={`p-2 rounded-xl transition-all flex items-center gap-1 ${
                                deleteConfirmId === group.id
                                  ? 'bg-red-500 text-white hover:bg-red-600 scale-105'
                                  : 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                              }`}
                            >
                              {deleteConfirmId === group.id && (
                                <span className="text-[10px] font-bold px-1 whitespace-nowrap">Confirm?</span>
                              )}
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CashReportPage;