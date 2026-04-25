
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MagnifyingGlassIcon, 
  FunnelIcon,
  CalendarIcon,
  ClockIcon,
  BuildingStorefrontIcon,
  CreditCardIcon,
  UserIcon,
  TruckIcon,
  Battery50Icon,
  BoltIcon,
  DocumentChartBarIcon,
  XMarkIcon,
  ClipboardIcon,
  CheckIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { SwappingSession, FinancialSnapshot, StationGroup } from '@/types';
import { toPng } from 'html-to-image';
import { format } from 'date-fns';
import CustomSelect from '@/components/CustomSelect';
import { CustomDatePicker } from '@/components/CustomDatePicker';
import SortableHeader from '@/components/SortableHeader';
import PaginationFooter from '@/components/PaginationFooter';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, collection, onSnapshot, addDoc, deleteDoc, query as firestoreQuery, orderBy as firestoreOrderBy, getDocs, limit, where } from 'firebase/firestore';
import { 
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  TagIcon,
  CloudArrowUpIcon
} from '@heroicons/react/24/outline';

const MANUAL_IMPORT_HEADERS = [
  "Swap ID", "Date/time", "Station ID", "Station Name", "Driver ID", "Driver Name", "Phone", "Mode Of Payment", "Vehicle Number", 
  "Battery IN 1", "SOC Start 1", "Battery IN 2", "SOC Start 2", "Battery OUT 1", "SOC End 1", "Battery OUT 2", "SOC End 2", 
  "SOC Consumed 1", "SOC Consumed 2", "Swap Start", "Swap End", "Duration", "Penalty Amount", "Penalty Paid Amount", 
  "Pending Penalty Amount", "Swap Amount", "Total Amount", "Odometer Range 1", "Odometer Range 2"
];

const parsePasteData = (text: string, currentData: string[][], startRow: number, startCol: number, totalCols: number) => {
  const rows = text.split(/\r\n|\n|\r/);
  if (rows.length === 0 || (rows.length === 1 && rows[0] === '')) return currentData;
  const newRowCount = Math.max(currentData.length, startRow + rows.length);
  const newData = Array.from({ length: newRowCount }, (_, i) => currentData[i] ? [...currentData[i]] : Array(totalCols).fill(''));
  rows.forEach((rowStr, rIdx) => {
    const currentRow = startRow + rIdx;
    let cells: string[] = [];
    if (rowStr.includes('\t')) {
      cells = rowStr.split('\t');
    } else {
      cells = [rowStr];
    }
    cells.forEach((cellData, cIdx) => {
      const currentCol = startCol + cIdx;
      if (currentCol < totalCols) {
        newData[currentRow][currentCol] = cellData.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      }
    });
  });
  return newData;
};

const ExcelGrid: React.FC<{
  headers: string[];
  data: string[][];
  onChange: (newData: string[][]) => void;
  onPasteEvent: (e: React.ClipboardEvent, r: number, c: number) => void;
}> = ({ headers, data, onChange, onPasteEvent }) => {
  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newData = [...data];
    if (!newData[rowIndex]) newData[rowIndex] = Array(headers.length).fill('');
    newData[rowIndex] = [...newData[rowIndex]];
    newData[rowIndex][colIndex] = value;
    onChange(newData);
  };
  return (
    <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl max-h-[400px]">
      <table className="w-full text-left text-xs border-collapse bg-white dark:bg-zinc-950 min-w-[2500px]">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10 shadow-sm">
            <th className="w-10 p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 font-mono">#</th>
            {headers.map((h, i) => (
              <th key={i} className="p-3 border-r border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
              <td className="p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center bg-zinc-50 dark:bg-zinc-900 text-zinc-400 font-mono">{rIdx + 1}</td>
              {Array.from({ length: headers.length }).map((_, cIdx) => (
                <td key={cIdx} className="p-0 border-r border-b border-zinc-200 dark:border-zinc-800 min-w-[150px]">
                  <input
                    id={`cell-${rIdx}-${cIdx}`}
                    value={row[cIdx] || ''}
                    onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                    onPaste={(e) => onPasteEvent(e, rIdx, cIdx)}
                    className="w-full h-full px-3 py-2.5 bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20 font-medium text-zinc-700 dark:text-zinc-200"
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

const SwappingSessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SwappingSession[]>([]);
  const [dealers, setDealers] = useState<{ value: string; label: string }[]>([]);
  
  // Manual Import State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualGridData, setManualGridData] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem('swap_manual_grid_data');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return Array.from({ length: 15 }, () => Array(29).fill(""));
  });
  const [isProcessingManual, setIsProcessingManual] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('swap_manual_grid_data', JSON.stringify(manualGridData));
    } catch (e) {}
  }, [manualGridData]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [payMode, setPayMode] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [swapMode, setSwapMode] = useState('all');
  const [penaltyPaid, setPenaltyPaid] = useState('all');
  const [swapAmountFilter, setSwapAmountFilter] = useState('all');
  const [penaltyRangeFilter, setPenaltyRangeFilter] = useState('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Report State
  const [showReport, setShowReport] = useState(false);
  const [reportPayMode, setReportPayMode] = useState('all');
  const [reportStationFilter, setReportStationFilter] = useState<string[]>([]);
  const [isCopying, setIsCopying] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const reportTableRef = useRef<HTMLDivElement>(null);

  // Grouping State
  const [stationGroups, setStationGroups] = useState<StationGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedStationsForGroup, setSelectedStationsForGroup] = useState<string[]>([]);
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  const [loading, setLoading] = useState(true);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const sessionsRef = collection(db, 'swapping_sessions');
      const q = firestoreQuery(sessionsRef, firestoreOrderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      
      let allSessions = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() } as SwappingSession));

      if (searchQuery) {
        const qStr = searchQuery.toLowerCase();
        allSessions = allSessions.filter(s => 
          s.txn_id.toLowerCase().includes(qStr) ||
          s.payer_id.toLowerCase().includes(qStr) ||
          s.vehicle_number.toLowerCase().includes(qStr) ||
          (s.driverData?.phone || '').includes(qStr) ||
          (s.driverData?.name || '').toLowerCase().includes(qStr)
        );
      }

      setTotalDatabaseCount(allSessions.length);
      const totalPagesCount = Math.ceil(allSessions.length / itemsPerPage);
      
      const startIndex = (currentPage - 1) * itemsPerPage;
      const paginatedData = allSessions.slice(startIndex, startIndex + itemsPerPage);

      setSessions(paginatedData);
      setHasMore(currentPage < totalPagesCount);
    } catch (err) {
      console.error("Error fetching sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [currentPage, itemsPerPage, searchQuery]);

  useEffect(() => {
    // Listen to Station Groups
    const unsubGroups = onSnapshot(firestoreQuery(collection(db, 'station_groups'), where('type', '==', 'swapping_report')), (snapshot) => {
      const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StationGroup));
      setStationGroups(groups);
    });

    // Listen to Stations for filter dropdown
    const unsubStations = onSnapshot(collection(db, 'swap_stations'), (snapshot) => {
      const stationsData = snapshot.docs.map(doc => doc.data() as any);
      const uniqueNames = Array.from(new Set(stationsData.map(s => s.name).filter(Boolean)));
      setDealers([
        { value: 'all', label: 'All Stations' },
        ...uniqueNames.map(name => ({ value: name as string, label: name as string }))
      ]);
    });

    return () => {
      unsubGroups();
      unsubStations();
    };
  }, []);

  const handleManualPasteEvent = (e: React.ClipboardEvent, rIdx: number, cIdx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const newData = parsePasteData(text, manualGridData, rIdx, cIdx, 29);
    setManualGridData(newData);
  };

  const processManualData = () => {
    setIsProcessingManual(true);
    try {
      const newSessions: SwappingSession[] = [];
      
      const parseDate = (str: string) => {
        if (!str || typeof str !== 'string') return 0;
        try {
          // Format might be: 19/04/2026 11:03:36 PM
          // Also handle cases with extra spaces
          const parts = str.trim().split(/\s+/);
          if (parts.length === 0) return 0;

          const dateStr = parts[0];
          const dateParts = dateStr.split('/');
          
          if (dateParts.length < 3) {
            const d = new Date(str);
            return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
          }

          const timeStr = parts[1] || '00:00:00';
          const timeParts = timeStr.replace(/[AP]M/i, '').split(':');
          
          const amPm = parts[2] || (timeStr.toUpperCase().endsWith('PM') ? 'PM' : timeStr.toUpperCase().endsWith('AM') ? 'AM' : '');
          
          let hours = parseInt(timeParts[0] || '0');
          const minutes = parseInt(timeParts[1] || '0');
          const seconds = parseInt(timeParts[2] || '0');

          if (amPm.toUpperCase() === 'PM' && hours < 12) hours += 12;
          if (amPm.toUpperCase() === 'AM' && hours === 12) hours = 0;

          const d = new Date(
            parseInt(dateParts[2]), 
            parseInt(dateParts[1]) - 1, 
            parseInt(dateParts[0]), 
            hours, 
            minutes, 
            seconds
          );
          
          return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
        } catch(e) {
          console.error("Date parse error for:", str, e);
          return 0;
        }
      };

      const parseSOC = (val: any) => {
        const str = String(val || '').trim();
        if (!str) return 0;
        return parseInt(str.replace('%', '')) || 0;
      };

      manualGridData.forEach((row, idx) => {
        if (!row[0] || row[0].trim() === '' || row[0] === 'Swap ID') return;
        
        const session: SwappingSession = {
          _id: row[0],
          txn_id: row[0],
          timestamp: parseDate(row[1]),
          payee_id: row[2],
          dealer_name: row[3],
          payer_id: row[4],
          driverData: {
            _id: row[4],
            driver_id: row[4],
            name: row[5],
            phone: row[6]
          },
          mode: row[7].toLowerCase(),
          vehicle_number: row[8],
          old_battries: [row[9], row[11]].filter(Boolean),
          new_battries: [row[13], row[15]].filter(Boolean),
          soc_details: {
            old_soc: [parseSOC(row[10]), parseSOC(row[12])],
            new_soc: [parseSOC(row[14]), parseSOC(row[16])]
          },
          soc_range_1: parseSOC(row[17]),
          soc_range_2: parseSOC(row[18]),
          start_time: parseDate(row[19]),
          end_time: parseDate(row[20]),
          duration: parseFloat(row[21]) || 0,
          penalty_amount: parseFloat(row[22]) || 0,
          penalty_paid_amount: parseFloat(row[23]) || 0,
          total_penalty_paid: parseFloat(row[23]) || 0,
          amount: parseFloat(row[25]) || 0,
          odometer_range_1: parseFloat(row[27]) || 0,
          odometer_range_2: parseFloat(row[28]) || 0,
          type: 1,
          penalty_payment_count: 1,
          dealer_share: 0,
          odometer_details: {
            old_odometer: [],
            new_odometer: []
          }
        };
        newSessions.push(session);
      });

      if (newSessions.length > 0) {
        setSessions(newSessions);
        
        // Extract unique dealers from imported data to update filters
        const uniqueStationNames = Array.from(new Set(newSessions.map(s => s.dealer_name)));
        const dealerOptions = uniqueStationNames.map(name => ({ value: name, label: name }));
        setDealers([
          { value: 'all', label: 'All Stations' },
          ...dealerOptions
        ]);
        setReportStationFilter(uniqueStationNames);
        setDateRange('all');

        setShowManualModal(false);
      } else {
        alert("No valid rows found to import.");
      }
    } catch (err) {
      console.error("Manual processing error:", err);
      alert("Failed to process manual data. Check date format.");
    } finally {
      setIsProcessingManual(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedStationsForGroup.length === 0) {
      alert("Please provide a group name and select at least one station.");
      return;
    }
    setIsSavingGroup(true);
    try {
      await addDoc(collection(db, 'station_groups'), {
        name: newGroupName.trim(),
        stationNames: selectedStationsForGroup,
        type: 'swapping_report',
        createdAt: new Date().toISOString()
      });
      setNewGroupName('');
      setSelectedStationsForGroup([]);
      setIsGroupModalOpen(false);
    } catch (err) {
      console.error("Failed to create group:", err);
      alert("Failed to create group.");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Are you sure you want to delete this group?")) return;
    try {
      await deleteDoc(doc(db, 'station_groups', groupId));
      if (selectedGroupId === groupId) {
        setSelectedGroupId('all');
        setReportStationFilter(dealers.filter(d => d.value !== 'all').map(d => d.value));
      }
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
  };

  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId);
    if (groupId === 'all') {
      setReportStationFilter(dealers.filter(d => d.value !== 'all').map(d => d.value));
    } else {
      const group = stationGroups.find(g => g.id === groupId);
      if (group) {
        setReportStationFilter(group.stationNames);
      }
    }
  };

  const getReportDateRangeLabel = () => {
    let fromTs = 0;
    let toTs = 0;

    if (dateRange === 'all' && sessions.length > 0) {
      // Find min and max timestamp from all sessions
      fromTs = Math.min(...sessions.map(s => s.timestamp));
      toTs = Math.max(...sessions.map(s => s.timestamp));
    } else {
      const ts = getTimestamps(dateRange);
      fromTs = ts.from;
      toTs = ts.to;
    }

    const startDate = new Date(fromTs * 1000);
    const endDate = new Date(toTs * 1000);

    // Format as "8th March 2026"
    const startStr = format(startDate, "do MMMM yyyy");
    const endStr = format(endDate, "do MMMM yyyy");

    // If start and end are the same day, just show one date
    if (startStr === endStr) {
      return startStr;
    }
    return `${startStr} to ${endStr}`;
  };

  const handleCopyReport = async () => {
    if (!reportTableRef.current) return;
    setIsCopying(true);
    try {
      // Try with fonts first
      let dataUrl;
      try {
        dataUrl = await toPng(reportTableRef.current, { 
          backgroundColor: '#ffffff', 
          quality: 1, 
          pixelRatio: 2,
          cacheBust: true,
        });
      } catch (fontErr) {
        console.warn('Failed to capture with fonts, retrying without fonts...', fontErr);
        // Fallback: Try without fonts if font inlining fails
        dataUrl = await toPng(reportTableRef.current, { 
          backgroundColor: '#ffffff', 
          quality: 1, 
          pixelRatio: 2,
          skipFonts: true,
          cacheBust: true,
        });
      }

      const blob = await (await fetch(dataUrl)).blob();
      
      try {
        // Ensure window is focused for clipboard API
        window.focus();
        
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ]);
          // Show success state briefly
          setTimeout(() => setIsCopying(false), 2000);
        } else {
          throw new Error('Clipboard API not supported');
        }
      } catch (clipboardErr) {
        console.warn('Clipboard write failed, falling back to download...', clipboardErr);
        // Fallback: Download the image if clipboard fails
        const link = document.createElement('a');
        link.download = `summary-report-${format(new Date(), 'yyyy-MM-dd')}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsCopying(false);
      }
    } catch (err) {
      console.error('Failed to copy image:', err);
      setIsCopying(false);
      alert('Failed to copy image. Please try again or take a screenshot manually.');
    }
  };

  const handleCreateSnapshot = async (reportData: any[]) => {
    setIsCreatingSnapshot(true);
    try {
      const { from } = getTimestamps(dateRange);
      const snapshotDate = format(new Date(from * 1000), 'yyyy-MM-dd');
      
      const swap_amount = reportData.reduce((acc, r) => acc + r.swapTotal, 0);
      const penalty_amount = reportData.reduce((acc, r) => acc + r.penaltyTotal, 0);
      const grand_total = swap_amount + penalty_amount;

      const snapshotRef = doc(db, 'financial_snapshots', snapshotDate);
      const existing = await getDoc(snapshotRef);

      const snapshot: FinancialSnapshot = {
        id: snapshotDate,
        date: snapshotDate,
        swap_amount,
        penalty_amount,
        grand_total,
        received_swap_amount: existing.exists() ? existing.data().received_swap_amount : 0,
        received_penalty_amount: existing.exists() ? existing.data().received_penalty_amount : 0,
        total_received: existing.exists() ? existing.data().total_received : 0,
        difference: existing.exists() ? grand_total - existing.data().total_received : grand_total,
        created_at: new Date().toISOString()
      };

      await setDoc(snapshotRef, snapshot);
      alert(`Snapshot created for ${snapshotDate}!`);
    } catch (err) {
      console.error('Failed to create snapshot:', err);
      alert('Failed to create snapshot.');
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const getTimestamps = (range: string) => {
    // Current time in UTC
    const now = new Date();
    
    // IST is UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    
    // Helper to get IST start of day for a given date
    const getISTStartOfDay = (date: Date) => {
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const ist = new Date(utc + istOffset);
      const istStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
      return (istStart.getTime() - istOffset) / 1000;
    };

    const startOfToday = getISTStartOfDay(now);
    const endOfToday = startOfToday + 86399;

    switch (range) {
      case 'today':
        return { from: startOfToday, to: endOfToday };
      case 'yesterday':
        const startOfYesterday = startOfToday - 86400;
        return { from: startOfYesterday, to: startOfYesterday + 86399 };
      case 'last7':
        return { from: startOfToday - (7 * 86400), to: endOfToday };
      case 'last30':
        return { from: startOfToday - (30 * 86400), to: endOfToday };
      case 'thisMonth':
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const ist = new Date(utc + istOffset);
        const istStartOfMonth = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1));
        const startOfMonth = (istStartOfMonth.getTime() - istOffset) / 1000;
        return { from: startOfMonth, to: endOfToday };
      case 'lastMonth':
        const utcLM = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istLM = new Date(utcLM + istOffset);
        const istFirstOfLastMonth = new Date(Date.UTC(istLM.getUTCFullYear(), istLM.getUTCMonth() - 1, 1));
        const istLastOfLastMonth = new Date(Date.UTC(istLM.getUTCFullYear(), istLM.getUTCMonth(), 0));
        const firstOfLastMonth = (istFirstOfLastMonth.getTime() - istOffset) / 1000;
        const lastOfLastMonth = (istLastOfLastMonth.getTime() - istOffset) / 1000 + 86399;
        return { from: firstOfLastMonth, to: lastOfLastMonth };
      case 'all':
        return { from: 0, to: 2147483647 }; // Far future
      case 'custom':
        if (customFromDate && customToDate) {
          // Custom dates from input are local, convert to IST start/end
          const from = new Date(customFromDate);
          const to = new Date(customToDate);
          return { 
            from: getISTStartOfDay(from), 
            to: getISTStartOfDay(to) + 86399 
          };
        }
        return { from: startOfToday, to: endOfToday };
      default:
        return { from: startOfToday, to: endOfToday };
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredSessions = useMemo(() => {
    let result = sessions;

    const { from, to } = getTimestamps(dateRange);
    if (dateRange !== 'all') {
      result = result.filter(s => s.timestamp >= from && s.timestamp <= to);
    }

    if (stationFilter !== 'all') {
      result = result.filter(s => s.dealer_name === stationFilter);
    }

    if (swapMode !== 'all') {
      result = result.filter(s => {
        const hasOld = s.old_battries && s.old_battries.length > 0;
        const hasNew = s.new_battries && s.new_battries.length > 0;
        if (swapMode === 'swap') return hasOld && hasNew;
        if (swapMode === 'return') return hasOld && !hasNew;
        if (swapMode === 'assigned') return !hasOld && hasNew;
        return true;
      });
    }

    if (penaltyPaid !== 'all') {
      result = result.filter(s => {
        if (penaltyPaid === 'yes') return s.total_penalty_paid > 0;
        if (penaltyPaid === 'no') return s.total_penalty_paid === 0;
        return true;
      });
    }

    if (swapAmountFilter !== 'all') {
      const amt = parseInt(swapAmountFilter);
      result = result.filter(s => s.amount === amt);
    }

    if (penaltyRangeFilter !== 'all') {
      const limit = parseInt(penaltyRangeFilter.replace('<', ''));
      result = result.filter(s => s.total_penalty_paid < limit);
    }

    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(s => 
        s.txn_id.toLowerCase().includes(q) ||
        s.payer_id.toLowerCase().includes(q) ||
        s.vehicle_number.toLowerCase().includes(q) ||
        (s.driverData?.phone || '').includes(q) ||
        (s.driverData?.name || '').toLowerCase().includes(q)
      );
    }

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const getNestedValue = (obj: any, path: string) => {
          if (path === 'driver') return obj.driverData?.name || '';
          if (path === 'time') return obj.timestamp || 0;
          return path.split(".").reduce((acc, part) => acc && acc[part], obj);
        };

        let aVal = getNestedValue(a, sortConfig.key);
        let bVal = getNestedValue(b, sortConfig.key);

        if (aVal === undefined || aVal === null) aVal = "";
        if (bVal === undefined || bVal === null) bVal = "";

        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [sessions, searchQuery, stationFilter, swapMode, penaltyPaid, swapAmountFilter, penaltyRangeFilter, sortConfig]);

  const paginatedSessions = filteredSessions;

  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Swap Sessions</h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-semibold">View and manage all swapping sessions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none"
          >
            <CloudArrowUpIcon className="w-5 h-5" /> Import
          </button>
          <button 
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none"
          >
            <DocumentChartBarIcon className="w-5 h-5" /> Report
          </button>
        </div>
      </div>

      {showReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-zinc-900 w-full max-w-6xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
            {/* Close Button - Fixed at top right for all screens */}
            <button 
              onClick={() => setShowReport(false)}
              className="absolute top-4 right-4 z-50 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-sm"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <div className="p-6 sm:p-8 pt-12 sm:pt-8 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                      <DocumentChartBarIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Summary Report</h3>
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium ml-11">
                    Aggregated session data by station
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-3 w-full md:w-auto pr-10 md:pr-0">
                  <button 
                    onClick={() => {
                      const reportData = reportStationFilter.map(station => {
                        let stationSessions = sessions.filter(s => s.dealer_name === station);
                        if (reportPayMode !== 'all') stationSessions = stationSessions.filter(s => s.mode === reportPayMode);
                        const swapTotal = stationSessions.reduce((acc, s) => acc + s.amount, 0);
                        const penaltyTotal = stationSessions.reduce((acc, s) => acc + (s.penalty_paid_amount || s.total_penalty_paid || 0), 0);
                        return { swapTotal, penaltyTotal };
                      });
                      handleCreateSnapshot(reportData);
                    }}
                    disabled={isCreatingSnapshot}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none disabled:opacity-50 active:scale-95"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${isCreatingSnapshot ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isCreatingSnapshot ? 'Creating...' : 'Create Snapshot'}</span>
                    <span className="sm:hidden">Snapshot</span>
                  </button>

                  <button 
                    onClick={handleCopyReport}
                    disabled={isCopying}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all border shadow-sm active:scale-95 ${
                      isCopying 
                        ? 'bg-emerald-500 text-white border-emerald-500' 
                        : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {isCopying ? <CheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
                    <span>{isCopying ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-8 overflow-y-auto scrollbar-hide space-y-8">
              {/* Report Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Filter by Pay Mode</label>
                  <div className="flex flex-wrap gap-2">
                    {['all', 'cash', 'wallet', 'upi'].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setReportPayMode(mode)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                          reportPayMode === mode 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-none' 
                            : 'bg-white dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-indigo-500'
                        }`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Station Group</label>
                    <button 
                      onClick={() => setIsGroupModalOpen(true)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg transition-colors"
                    >
                      <TagIcon className="w-3 h-3" /> Manage Groups
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-400 ml-1">Filter by Group</p>
                      <CustomSelect 
                        options={[
                          { value: 'all', label: 'All Stations' },
                          ...stationGroups.map(g => ({ value: g.id, label: g.name }))
                        ]}
                        value={selectedGroupId}
                        onChange={(val) => handleGroupChange(val as string)}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-400 ml-1">Individual Station</p>
                      <CustomSelect 
                        options={dealers}
                        value={reportStationFilter.length === 1 ? reportStationFilter[0] : 'all'}
                        onChange={(val) => {
                          if (val === 'all') {
                            handleGroupChange('all');
                          } else {
                            setReportStationFilter([val as string]);
                            setSelectedGroupId('individual');
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Table */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-[2rem] overflow-x-auto shadow-sm scrollbar-hide">
                <div ref={reportTableRef} className="bg-white dark:bg-zinc-900 p-6 min-w-max">
                  <div className="mb-6 border-l-4 border-indigo-600 pl-4">
                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Session Summary</h4>
                    <p className="text-xl font-black text-zinc-900 dark:text-white">
                      {getReportDateRangeLabel()}
                    </p>
                  </div>
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Station Name</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Rs 0</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Count</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Rs 70</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Count</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Rs 145</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Count</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Swap Amount</th>
                        <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Penalty Amount</th>
                        <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-center">Grand Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {(() => {
                        const reportData = reportStationFilter.map(station => {
                          let stationSessions = sessions.filter(s => s.dealer_name === station);
                          
                          if (reportPayMode !== 'all') {
                            stationSessions = stationSessions.filter(s => s.mode === reportPayMode);
                          }
                          
                          const rs0 = stationSessions.filter(s => s.amount === 0);
                          const rs70 = stationSessions.filter(s => s.amount === 70);
                          const rs145 = stationSessions.filter(s => s.amount === 145);
                          
                          const swapTotal = stationSessions.reduce((acc, s) => acc + s.amount, 0);
                          const penaltyTotal = stationSessions.reduce((acc, s) => acc + (s.penalty_paid_amount || s.total_penalty_paid || 0), 0);
                          
                          return {
                            name: station,
                            rs0_amt: 0,
                            rs0_count: rs0.length,
                            rs70_amt: rs70.length * 70,
                            rs70_count: rs70.length,
                            rs145_amt: rs145.length * 145,
                            rs145_count: rs145.length,
                            swapTotal,
                            penaltyTotal,
                            grandTotal: swapTotal + penaltyTotal
                          };
                        });

                        const totals = reportData.reduce((acc, curr) => ({
                          rs0_amt: acc.rs0_amt + curr.rs0_amt,
                          rs0_count: acc.rs0_count + curr.rs0_count,
                          rs70_amt: acc.rs70_amt + curr.rs70_amt,
                          rs70_count: acc.rs70_count + curr.rs70_count,
                          rs145_amt: acc.rs145_amt + curr.rs145_amt,
                          rs145_count: acc.rs145_count + curr.rs145_count,
                          swapTotal: acc.swapTotal + curr.swapTotal,
                          penaltyTotal: acc.penaltyTotal + curr.penaltyTotal,
                          grandTotal: acc.grandTotal + curr.grandTotal
                        }), { rs0_amt: 0, rs0_count: 0, rs70_amt: 0, rs70_count: 0, rs145_amt: 0, rs145_count: 0, swapTotal: 0, penaltyTotal: 0, grandTotal: 0 });

                        return (
                          <>
                            {reportData.map(row => (
                              <tr key={row.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="px-6 py-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">{row.name}</td>
                                <td className="px-4 py-3 text-sm font-bold text-zinc-500 text-center">{row.rs0_amt || '-'}</td>
                                <td className="px-4 py-3 text-sm font-bold text-zinc-900 dark:text-zinc-100 text-center">{row.rs0_count}</td>
                                <td className="px-4 py-3 text-sm font-bold text-zinc-700 dark:text-zinc-300 text-center">{row.rs70_amt || '-'}</td>
                                <td className="px-4 py-3 text-sm font-bold text-zinc-900 dark:text-zinc-100 text-center">{row.rs70_count}</td>
                                <td className="px-4 py-3 text-sm font-bold text-zinc-700 dark:text-zinc-300 text-center">{row.rs145_amt || '-'}</td>
                                <td className="px-4 py-3 text-sm font-bold text-zinc-900 dark:text-zinc-100 text-center">{row.rs145_count}</td>
                                <td className="px-4 py-3 text-sm font-bold text-indigo-600 dark:text-indigo-400 text-center">₹{row.swapTotal}</td>
                                <td className="px-4 py-3 text-sm font-bold text-red-500 text-center">₹{row.penaltyTotal}</td>
                                <td className="px-6 py-3 text-sm font-bold text-zinc-900 dark:text-zinc-100 text-center bg-zinc-50/50 dark:bg-zinc-800/50">₹{row.grandTotal}</td>
                              </tr>
                            ))}
                            <tr className="bg-zinc-100/50 dark:bg-zinc-950 font-black">
                              <td className="px-6 py-4 text-sm uppercase tracking-wider text-zinc-900 dark:text-white">Grand Total</td>
                              <td className="px-4 py-4 text-sm text-center">₹{totals.rs0_amt}</td>
                              <td className="px-4 py-4 text-sm text-center">{totals.rs0_count}</td>
                              <td className="px-4 py-4 text-sm text-center">₹{totals.rs70_amt}</td>
                              <td className="px-4 py-4 text-sm text-center">{totals.rs70_count}</td>
                              <td className="px-4 py-4 text-sm text-center">₹{totals.rs145_amt}</td>
                              <td className="px-4 py-4 text-sm text-center">{totals.rs145_count}</td>
                              <td className="px-4 py-4 text-sm text-center text-indigo-600 dark:text-indigo-400">₹{totals.swapTotal}</td>
                              <td className="px-4 py-4 text-sm text-center text-red-500">₹{totals.penaltyTotal}</td>
                              <td className="px-6 py-4 text-sm text-center text-zinc-900 dark:text-white bg-zinc-200/50 dark:bg-zinc-800">₹{totals.grandTotal}</td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-all duration-300">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <div className="relative group flex-1">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search ID, Driver, Vehicle..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-12 pr-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100 font-bold transition-all"
              />
            </div>
            
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center transition-all ${
                showFilters 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none' 
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
              }`}
              title={showFilters ? 'Hide Filters' : 'Show Filters'}
            >
              <FunnelIcon className={`w-5 h-5 transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: 'auto', opacity: 1, marginTop: 24 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Date Range</label>
                    <CustomSelect 
                      options={[
                        { value: 'all', label: 'All Imported Data' },
                        { value: 'today', label: 'Today' },
                        { value: 'yesterday', label: 'Yesterday' },
                        { value: 'last7', label: 'Last 7 Days' },
                        { value: 'last30', label: 'Last 30 Days' },
                        { value: 'thisMonth', label: 'This Month' },
                        { value: 'lastMonth', label: 'Last Month' },
                        { value: 'custom', label: 'Custom Range' },
                      ]}
                      value={dateRange}
                      onChange={(val) => setDateRange(val as string)}
                    />
                  </div>

                  {dateRange === 'custom' && (
                    <>
                      <div className="space-y-1">
                        <CustomDatePicker 
                          label="From Date"
                          value={customFromDate}
                          onChange={(val) => setCustomFromDate(val)}
                        />
                      </div>
                      <div className="space-y-1">
                        <CustomDatePicker 
                          label="To Date"
                          value={customToDate}
                          onChange={(val) => setCustomToDate(val)}
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Payment Mode</label>
                    <CustomSelect 
                      options={[
                        { value: 'all', label: 'All Modes' },
                        { value: 'cash', label: 'Cash' },
                        { value: 'wallet', label: 'Wallet' },
                        { value: 'upi', label: 'UPI' },
                      ]}
                      value={payMode}
                      onChange={(val) => setPayMode(val as string)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Station</label>
                    <CustomSelect 
                      options={dealers}
                      value={stationFilter}
                      onChange={(val) => setStationFilter(val as string)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Swap Mode</label>
                    <CustomSelect 
                      options={[
                        { value: 'all', label: 'All Modes' },
                        { value: 'swap', label: 'Swap (Old & New)' },
                        { value: 'return', label: 'Return (Old Only)' },
                        { value: 'assigned', label: 'Assigned (New Only)' },
                      ]}
                      value={swapMode}
                      onChange={(val) => setSwapMode(val as string)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Penalty Paid</label>
                    <CustomSelect 
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'yes', label: 'Yes' },
                        { value: 'no', label: 'No' },
                      ]}
                      value={penaltyPaid}
                      onChange={(val) => setPenaltyPaid(val as string)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Swap Amount</label>
                    <CustomSelect 
                      options={[
                        { value: 'all', label: 'All' },
                        { value: '0', label: '₹0' },
                        { value: '70', label: '₹70' },
                        { value: '145', label: '₹145' },
                      ]}
                      value={swapAmountFilter}
                      onChange={(val) => setSwapAmountFilter(val as string)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Penalty Range</label>
                    <CustomSelect 
                      options={[
                        { value: 'all', label: 'All' },
                        { value: '<10', label: '< ₹10' },
                        { value: '<20', label: '< ₹20' },
                        { value: '<30', label: '< ₹30' },
                        { value: '<50', label: '< ₹50' },
                        { value: '<60', label: '< ₹60' },
                      ]}
                      value={penaltyRangeFilter}
                      onChange={(val) => setPenaltyRangeFilter(val as string)}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1800px]">
            <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
              <tr>
                <SortableHeader label="Session ID" sortKey="txn_id" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Driver" sortKey="driver" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Station Name" sortKey="dealer_name" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Driver ID" sortKey="payer_id" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Vehicle Number" sortKey="vehicle_number" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Battery Received" sortKey="old_battries" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Battery Assigned" sortKey="new_battries" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="SOC Consumed 1" sortKey="soc_consumed_1" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="SOC Consumed 2" sortKey="soc_consumed_2" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Odometer Range 1" sortKey="odometer_range_1" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Odometer Range 2" sortKey="odometer_range_2" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Time" sortKey="timestamp" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Swapping Station" sortKey="dealer_name" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Penalty Amount" sortKey="total_penalty_paid" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Paid Penalty" sortKey="total_penalty_paid" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Pending Penalty" sortKey="total_penalty_pending" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Swap Amount" sortKey="amount" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Total Amount" sortKey="total_amount" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                <SortableHeader label="Payment Mode" sortKey="mode" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 bg-white dark:bg-zinc-900">
              {paginatedSessions.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ClockIcon className="w-12 h-12 text-zinc-200 dark:text-zinc-800" />
                      <p className="text-zinc-400 font-bold">No sessions found. Please import data using the "Import" button.</p>
                      <button 
                        onClick={() => setShowManualModal(true)}
                        className="mt-2 text-indigo-600 font-bold hover:underline"
                      >
                        Import Data Now
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedSessions.map((session) => (
                  <tr key={session._id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{session.txn_id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 font-bold text-xs uppercase">
                          {session.driverData?.name?.charAt(0) || '?'}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{session.driverData?.name || '--'}</span>
                          <span className="text-[10px] font-bold text-zinc-400">{session.driverData?.phone || '--'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{session.dealer_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-zinc-500">{session.payer_id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{session.vehicle_number}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-row flex-wrap gap-1.5 min-w-[180px]">
                        {session.old_battries.map((oldB, idx) => (
                          <span key={idx} className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded border border-red-100 dark:border-red-800/50 min-w-[80px] text-center">
                            {oldB}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-row flex-wrap gap-1.5 min-w-[180px]">
                        {session.new_battries.map((newB, idx) => (
                          <span key={idx} className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800/50 min-w-[80px] text-center">
                            {newB}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                        {session.soc_range_1}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                        {session.soc_range_2}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{session.odometer_range_1} km</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{session.odometer_range_2} km</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-zinc-500 whitespace-nowrap">{formatTime(session.timestamp)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{session.dealer_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-red-500">₹{session.penalty_amount || 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-emerald-500">₹{session.penalty_paid_amount || session.total_penalty_paid || 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-400">₹{(session.penalty_amount || 0) - (session.penalty_paid_amount || session.total_penalty_paid || 0)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">₹{session.amount}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">₹{session.amount + session.total_penalty_paid}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                        session.mode === 'cash' ? 'bg-amber-100 text-amber-700' :
                        session.mode === 'wallet' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {session.mode}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationFooter 
          currentPage={currentPage}
          totalPages={Math.ceil(filteredSessions.length / itemsPerPage)}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
          dataLength={filteredSessions.length}
        />
      </div>

      {isGroupModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">Manage Station Groups</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Create and manage groups of stations for reports</p>
              </div>
              <button onClick={() => setIsGroupModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto max-h-[60vh] space-y-8">
              {/* Create New Group */}
              <div className="space-y-4 bg-zinc-50 dark:bg-zinc-950 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <PlusIcon className="w-4 h-4 text-indigo-600" /> Create New Group
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Group Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g., North Zone Stations"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100 font-bold transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Select Stations</label>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 scrollbar-hide">
                      {dealers.filter(d => d.value !== 'all').map((dealer) => (
                        <button
                          key={dealer.value}
                          onClick={() => {
                            if (selectedStationsForGroup.includes(dealer.value)) {
                              setSelectedStationsForGroup(selectedStationsForGroup.filter(s => s !== dealer.value));
                            } else {
                              setSelectedStationsForGroup([...selectedStationsForGroup, dealer.value]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                            selectedStationsForGroup.includes(dealer.value)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700'
                          }`}
                        >
                          {dealer.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={handleCreateGroup}
                    disabled={isSavingGroup}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                  >
                    {isSavingGroup ? 'Saving...' : 'Create Group'}
                  </button>
                </div>
              </div>

              {/* Existing Groups */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <TagIcon className="w-4 h-4 text-indigo-600" /> Existing Groups
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {stationGroups.length === 0 ? (
                    <p className="text-center py-8 text-zinc-400 text-sm font-medium italic">No groups created yet.</p>
                  ) : (
                    stationGroups.map((group) => (
                      <div key={group.id} className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl hover:border-indigo-500/50 transition-all group">
                        <div className="space-y-1">
                          <h5 className="font-bold text-zinc-900 dark:text-white">{group.name}</h5>
                          <p className="text-[10px] text-zinc-500 font-medium">
                            {group.stationNames.length} Stations: {group.stationNames.slice(0, 3).join(', ')}{group.stationNames.length > 3 ? '...' : ''}
                          </p>
                        </div>
                        <button 
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showManualModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-[95vw] h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                  <CloudArrowUpIcon className="w-7 h-7 text-indigo-600" />
                  Import Swap Data
                </h3>
                <p className="text-zinc-500 text-sm font-medium mt-1">Paste your excel data into the grid below (Supports Tab-Separated values)</p>
              </div>
              <button 
                onClick={() => setShowManualModal(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-8 flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                <div className="flex items-center gap-4">
                  <div className="bg-white dark:bg-zinc-800 p-2 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700">
                    <CloudArrowUpIcon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-zinc-900 dark:text-white">Grid Interface</p>
                    <p className="text-zinc-500">Supports direct Excel copy-paste (Tab Delimited)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setManualGridData(Array.from({ length: 15 }, () => Array(29).fill("")))}
                    className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                  >
                    Clear All
                  </button>
                  <button 
                    onClick={processManualData}
                    disabled={isProcessingManual}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none flex items-center gap-2"
                  >
                    {isProcessingManual ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CloudArrowUpIcon className="w-4 h-4" />}
                    Process Data
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-0.5">
                <ExcelGrid 
                  headers={MANUAL_IMPORT_HEADERS} 
                  data={manualGridData} 
                  onChange={setManualGridData}
                  onPasteEvent={handleManualPasteEvent}
                />
              </div>
            </div>
            
            <div className="p-6 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 text-center">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest italic">
                Note: Ensure the columns in your excel sheet exactly match the header order in the grid above.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwappingSessionsPage;
