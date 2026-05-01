import React, { useState, useEffect, useMemo } from 'react';
import { 
  UsersIcon, 
  MagnifyingGlassIcon, 
  PhoneIcon, 
  ChevronLeftIcon, 
  DocumentDuplicateIcon, 
  CheckIcon, 
  AdjustmentsHorizontalIcon, 
  CalendarIcon, 
  MapPinIcon, 
  ClockIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { Driver, UserRole, DriverMasterRecord } from '@/types';
import CustomSelect from '@/components/CustomSelect';
import CopyButton from '@/components/CopyButton';
import PaginationFooter from '@/components/PaginationFooter';
import SortableHeader from '@/components/SortableHeader';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, startAfter, where, endBefore, limitToLast } from 'firebase/firestore';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface DriversPageProps {
  onDriverSelect: (driver: Driver) => void;
  isDarkMode: boolean;
  role: string | null;
}

const SkeletonRow: React.FC<{ showPlan: boolean }> = ({ showPlan }) => (
  <tr className="animate-pulse border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
    <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800"></div><div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded"></div></div></td>
    <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    <td className="px-6 py-4"><div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>
    {showPlan && <td className="px-6 py-4"><div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div></td>}
  </tr>
);

const DriversPage: React.FC<DriversPageProps> = ({ onDriverSelect, isDarkMode, role }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); 
  const [onboardingFilter, setOnboardingFilter] = useState('Complete'); // Default to Complete
  const [assignedFilter, setAssignedFilter] = useState('all'); 
  const [cityFilter, setCityFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); 
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'onboarded_on', direction: 'desc' });

  // Master records map
  const [masterRecords, setMasterRecords] = useState<Record<string, DriverMasterRecord>>({});
  const [cities, setCities] = useState<string[]>([]);

  // Pagination cursor state
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [firstVisible, setFirstVisible] = useState<any>(null);
  const [pageHistory, setPageHistory] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState(0);

  const isAdmin = role === UserRole.ADMIN;

  const fetchDrivers = async () => {
    setIsRefetching(true);
    setLoading(true);
    try {
      const driversRef = collection(db, 'drivers');
      const q = query(driversRef, orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      
      let driversData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver));

      // Fetch master records
      const masterSnapshot = await getDocs(collection(db, 'drivers_master'));
      const masterMap: Record<string, DriverMasterRecord> = {};
      const uniqueCities = new Set<string>();
      masterSnapshot.forEach(doc => {
        const data = doc.data() as DriverMasterRecord;
        masterMap[doc.id] = data;
        if (data.onboarded_city) uniqueCities.add(data.onboarded_city);
      });
      setMasterRecords(masterMap);
      setCities(Array.from(uniqueCities).sort());

      // Apply filters in memory
      const qStr = searchQuery.toLowerCase();
      driversData = driversData.filter(d => {
        const master = masterMap[d.driver_id];
        const matchesSearch = !qStr || 
          d.name?.toLowerCase().includes(qStr) || 
          d.driver_id?.toLowerCase().includes(qStr) ||
          d.phone?.includes(qStr) ||
          (d.vehicle_info?.vehicle_number || d.latest_swap?.vehicle_number || '').toLowerCase().includes(qStr) ||
          (master?.onboarded_city || '').toLowerCase().includes(qStr);
        
        const matchesOnboarding = onboardingFilter === 'all' || d.onboardingStatus === onboardingFilter;
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? d.is_active : !d.is_active);
        const matchesAssigned = assignedFilter === 'all' || (assignedFilter === 'yes' ? d.assigned : !d.assigned);
        const matchesCity = cityFilter === 'all' || master?.onboarded_city === cityFilter;
        
        return matchesSearch && matchesOnboarding && matchesStatus && matchesAssigned && matchesCity;
      });

      setTotalDatabaseCount(driversData.length);
      const totalPagesCount = Math.ceil(driversData.length / itemsPerPage);
      
      const startIndex = (currentPage - 1) * itemsPerPage;
      const paginatedData = driversData.slice(startIndex, startIndex + itemsPerPage);

      setDrivers(paginatedData);
      setHasMore(currentPage < totalPagesCount);
    } catch (err) { 
      console.error("Failed to fetch data from Firestore", err); 
      setNotification({ message: 'Failed to fetch drivers from Firestore', type: 'error' });
    } finally { 
      setLoading(false); 
      setIsRefetching(false); 
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = async () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  useEffect(() => { 
    fetchDrivers(); 
  }, [onboardingFilter, statusFilter, assignedFilter, sortConfig, itemsPerPage, currentPage, searchQuery]);

  const planOptions = useMemo(() => { const plans = Array.from(new Set(drivers.map(d => d.planData?.[0]?.plan_name).filter(Boolean))); return [{ value: 'all', label: 'All Plans' }, ...plans.map(p => ({ value: p!, label: p! }))]; }, [drivers]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => { 
    let base = drivers.filter(d => { 
      const q = searchQuery.toLowerCase(); 
      const vehicleNo = (d.vehicle_info?.vehicle_number || d.latest_swap?.vehicle_number || '').toLowerCase(); 
      if (q && !d.name?.toLowerCase().includes(q) && !d.phone?.includes(q) && !d.driver_id?.toLowerCase().includes(q) && !vehicleNo.includes(q)) { return false; } 
      
      // Client-side filtering to avoid needing complex server-side indexes
      if (statusFilter === 'active' && !d.is_active) return false; 
      if (statusFilter === 'inactive' && d.is_active) return false; 
      if (onboardingFilter !== 'all' && d.onboardingStatus !== onboardingFilter) return false; 
      if (assignedFilter === 'yes' && !d.assigned) return false; 
      if (assignedFilter === 'no' && d.assigned) return false; 
      
      if (planFilter !== 'all' && d.planData?.[0]?.plan_name !== planFilter) return false; 
      if (dateFilter !== 'all') { 
        const onboardDate = new Date(d.onboarded_on * 1000); 
        const now = new Date(); 
        const diffDays = (now.getTime() - onboardDate.getTime()) / (1000 * 3600 * 24); 
        if (dateFilter === 'today' && diffDays > 1) return false; 
        if (dateFilter === '7days' && diffDays > 7) return false; 
        if (dateFilter === '30days' && diffDays > 30) return false; 
      } 
      return true; 
    });

    // Sorting is now handled server-side for the main fetch, 
    // but we keep it here for any remaining client-side results
    return base;
  }, [drivers, searchQuery, planFilter, dateFilter]);

  const handleExportExcel = async () => {
    if (filteredData.length === 0) {
      setNotification({ message: 'No data to export', type: 'error' });
      return;
    }

    setIsExporting(true);
    let cleanupCount = 0;

    try {
      // 1. Fetch Master Records for all filtered drivers
      const masterSnapshot = await getDocs(collection(db, 'drivers_master'));
      const masterMap: Record<string, DriverMasterRecord> = {};
      masterSnapshot.forEach(doc => {
        masterMap[doc.id] = doc.data() as DriverMasterRecord;
      });

      // Helper to format date as dd-mm-yyyy
      const formatExcelDate = (unix: number) => {
        if (!unix) return '--';
        const ms = unix > 100000000000 ? unix : unix * 1000;
        const d = new Date(ms);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      };

      // 2. Prepare Headers and Data mapping
      const headers = [
        'Name', 
        'Driver ID', 
        'Phone', 
        'Additional Phone', 
        'Vehicle', 
        'Assigned',
        'Driver Status',
        'Onboarded Date', 
        'Onboarded City',
        'Last Swap Date', 
        'Onboarding Status', 
        'Unassigned Follow-up',
        'ID Card Given', 
        'Gift given',
        'Agreement',
        'Items Installed', 
        'Referrer Name', 
        'Referrer Phone', 
        'Connection By', 
        'Vehicle Specs',
        'Left Our Service',
        'Secondary Reason',
        'Remarks',
        'Items Recovered',
        'Refund Amount'
      ];

      const rows = await Promise.all(filteredData.map(async (d) => {
        const master = masterMap[d.driver_id];
        
        // --- STORAGE CLEANUP LOGIC ---
        // if some one who was earlier unassigned and now assigned automatically deletes its unassigned follow up 
        // if timestamp of follow-up is less than last swap date
        let followUpCategory = '--';
        if (d.assigned) {
          // If assigned, follow-up should be blank/dash
          followUpCategory = '--';

          // Check for cleanup
          if (master?.follow_up?.category && master?.follow_up?.last_called_at && d.last_swap_date) {
            const followUpTime = new Date(master.follow_up.last_called_at).getTime();
            const lastSwapTime = (d.last_swap_date > 100000000000 ? d.last_swap_date : d.last_swap_date * 1000);
            
            if (followUpTime < lastSwapTime) {
              // Delete follow-up from storage
              try {
                const { doc, updateDoc, deleteField } = await import('firebase/firestore');
                await updateDoc(doc(db, 'drivers_master', d.driver_id), {
                  follow_up: deleteField()
                });
                cleanupCount++;
              } catch (e) {
                console.error("Cleanup failed for", d.driver_id, e);
              }
            }
          }
        } else {
          followUpCategory = master?.follow_up?.category || 'Pending';
        }

        // Format Items Installed
        const itemsInstalledArr = [];
        if (master?.onboarding) {
          if (master.onboarding.harness?.installed) itemsInstalledArr.push('Harness');
          if (master.onboarding.soc_meter?.installed) itemsInstalledArr.push('SoC Meter');
          if (master.onboarding.mcb?.installed) itemsInstalledArr.push('MCB');
          if (master.onboarding.extension_cable?.installed) itemsInstalledArr.push('Ext Cable');
        }
        const itemsInstalled = itemsInstalledArr.join(', ') || 'None';

        // Format Items Recovered
        const recoveredArr = [];
        if (master?.kit_recovery) {
          if (master.kit_recovery.harness) recoveredArr.push('Harness');
          if (master.kit_recovery.soc_meter) recoveredArr.push('SoC Meter');
          if (master.kit_recovery.mcb) recoveredArr.push('MCB');
          if (master.kit_recovery.extension_cable) recoveredArr.push('Ext Cable');
        }
        const itemsRecovered = recoveredArr.join(', ') || 'None';

        // Format Vehicle Specs with SI Units
        const specs = master?.vehicle_specs;
        const specsStr = specs ? 
          `Ctrl: ${specs.controller_v ? specs.controller_v + 'V' : '--'}/${specs.controller_wattage ? specs.controller_wattage + 'W' : '--'}, Motor: ${specs.motor_v ? specs.motor_v + 'V' : '--'}/${specs.motor_wattage ? specs.motor_wattage + 'W' : '--'}` : 
          '--';

        // Safe values
        const name = d.name || '--';
        const driverId = d.driver_id || '--';
        const phone = d.phone || '--';
        const addPhones = master?.additional_phones?.join(', ') || '--';
        const vehicle = d.vehicleData?.[0]?.vehicle_number || d.latest_swap?.vehicle_number || d.vehicle_info?.vehicle_number || '--';
        const onboardDate = formatExcelDate(d.onboarded_on);
        const onboardCity = master?.onboarded_city || '--';
        const lastSwapDate = formatExcelDate(d.last_swap_date || 0);
        const onbStatus = d.onboardingStatus || 'Pending';
        const primaryReason = master?.status_info?.inactive_primary_reason || (master?.status_info?.inactive_primary_reason === 'Left Service' ? 'Yes' : 'No');
        const secondaryReason = master?.status_info?.inactive_secondary_reason || '--';
        const remarks = master?.status_info?.inactive_remarks || '--';
        const idCardGiven = master?.id_card?.status === 'Delivered' ? 'Yes' : 'No';
        const giftGiven = master?.gift_kit?.status === 'Given' ? 'Yes' : 'No';
        const refName = master?.referrer_info?.referrer_name || '--';
        const refPhone = master?.referrer_info?.referrer_phone || '--';
        const connBy = master?.connection_by?.user_name || '--';
        const assigned = d.assigned ? 'Yes' : 'No';
        const driverStatus = d.is_active ? 'Active' : 'Inactive';
        const agreement = master?.agreement_handed_over ? 'Yes' : 'No';
        const refundAmount = master?.kit_recovery?.refund_amount !== undefined ? `₹${master.kit_recovery.refund_amount}` : '--';

        return [
          name,
          driverId,
          phone,
          addPhones,
          vehicle,
          assigned,
          driverStatus,
          onboardDate,
          onboardCity,
          lastSwapDate,
          onbStatus,
          followUpCategory,
          idCardGiven,
          giftGiven,
          agreement,
          itemsInstalled,
          refName,
          refPhone,
          connBy,
          specsStr,
          primaryReason,
          secondaryReason,
          remarks,
          itemsRecovered,
          refundAmount
        ];
      }));

      // 3. Create Workbook using ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Drivers Export');

      // Add headers with styling
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'BFBFBF' } // Even darker grey for header as requested
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows
      rows.forEach(rowData => {
        const row = worksheet.addRow(rowData);
        
        // Remove grey fill from column 1 (Normal)
        // No fill needed
        
        // Center all cells and add borders
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Auto-size columns
      worksheet.columns.forEach((column, i) => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 4, 60);
      });

      // 4. Download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Drivers_Report_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.xlsx`;
      saveAs(blob, fileName);

      setNotification({ 
        message: cleanupCount > 0 
          ? `Export successful! Cleaned up ${cleanupCount} outdated follow-ups.` 
          : 'Export successful!', 
        type: 'success' 
      });
    } catch (err) {
      console.error("Export Error:", err);
      setNotification({ message: 'Export failed. Please check your connection or console.', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };


  const totalPages = 0; // We don't know total pages easily with offset-less pagination, but we can use hasMore
  const paginatedData = filteredData; // Already paginated by repository fetch

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  const formatDate = (unix: number) => {
    if (!unix) return '--';
    const ms = unix > 100000000000 ? unix : unix * 1000;
    return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6 pb-20 w-full animate-in fade-in duration-500">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-2xl shadow-xl animate-in slide-in-from-right-4 duration-300 ${notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          <div className="flex items-center gap-3">
            {notification.type === 'success' ? <CheckIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
            <span className="font-bold text-sm">{notification.message}</span>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Driver Operations</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] sm:text-xs font-bold border border-indigo-100 dark:border-indigo-800">
              <UsersIcon className="w-3.5 h-3.5" />
              <span>Registered Drivers</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportExcel}
            disabled={isExporting || drivers.length === 0}
            className="flex items-center justify-center p-3 sm:px-5 sm:py-3 rounded-2xl font-bold bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-sm transition-all hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 shrink-0 outline-none focus:ring-2 focus:ring-indigo-500"
            title="Export to Excel"
          >
            <ArrowDownTrayIcon className={`w-5 h-5 sm:mr-2 ${isExporting ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline text-sm">Report</span>
          </button>
          <button 
            onClick={() => fetchDrivers()} 
            disabled={isRefetching} 
            className="flex items-center justify-center p-3 sm:px-5 sm:py-3 rounded-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0"
          >
            <ArrowPathIcon className={`w-5 h-5 sm:mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline text-sm">Refresh</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 relative group">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input type="text" placeholder="Search by ID, Name, Phone or Vehicle..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 h-11 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-semibold transition-all shadow-sm" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center justify-center gap-2 h-11 px-4 bg-white dark:bg-zinc-900 border rounded-2xl text-sm font-bold transition-all shadow-sm shrink-0 ${showFilters ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-600'}`}>
            <AdjustmentsHorizontalIcon className="w-5 h-5" />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>
        {showFilters && (
          <div className="p-6 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-lg shadow-zinc-200/50 dark:shadow-none animate-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <CustomSelect label="Driver Status" options={[{ value: 'all', label: 'All Statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} value={statusFilter} onChange={setStatusFilter} />
              <CustomSelect label="Onboarding" options={[{ value: 'all', label: 'All' }, { value: 'Complete', label: 'Complete' }, { value: 'Pending', label: 'Pending' }]} value={onboardingFilter} onChange={setOnboardingFilter} />
              <CustomSelect label="Assigned" options={[{ value: 'all', label: 'All' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} value={assignedFilter} onChange={setAssignedFilter} />
              <CustomSelect label="Date Joined" options={[{ value: 'all', label: 'Any Time' }, { value: 'today', label: 'Today' }, { value: '7days', label: 'Last 7 Days' }, { value: '30days', label: 'Last 30 Days' }]} value={dateFilter} onChange={setDateFilter} />
              <CustomSelect 
                label="Onboarded City" 
                options={[{ value: 'all', label: 'All Cities' }, ...cities.map(c => ({ value: c, label: c }))]} 
                value={cityFilter} 
                onChange={setCityFilter} 
                searchable
              />
              <CustomSelect label="Plan" options={planOptions} value={planFilter} onChange={setPlanFilter} />
              <div className="flex items-end">
                <button 
                  onClick={() => { 
                    setStatusFilter('all'); 
                    setOnboardingFilter('all'); 
                    setAssignedFilter('all'); 
                    setPlanFilter('all'); 
                    setDateFilter('all'); 
                    setCityFilter('all');
                  }} 
                  className="w-full py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-bold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto max-h-[70vh] min-h-[300px] scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
          <table className="w-full text-left min-w-[1500px] table-fixed border-collapse">
            <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortableHeader label="Driver ID" sortKey="driver_id" currentSort={sortConfig as any} onSort={handleSort} className="w-32" />
                <SortableHeader label="Name" sortKey="name" currentSort={sortConfig as any} onSort={handleSort} className="w-64" />
                <SortableHeader label="Phone" sortKey="phone" currentSort={sortConfig as any} onSort={handleSort} className="w-40" />
                <SortableHeader label="Vehicle" sortKey="vehicle_number" currentSort={sortConfig as any} onSort={handleSort} className="w-40" />
                <SortableHeader label="City" sortKey="onboarded_city" currentSort={sortConfig as any} onSort={handleSort} className="w-40" />
                <SortableHeader label="Joined" sortKey="onboarded_on" currentSort={sortConfig as any} onSort={handleSort} className="w-40" />
                <SortableHeader
                  label="Last Swap"
                  sortKey="last_swap_date"
                  currentSort={sortConfig as any}
                  onSort={handleSort}
                  className="w-40"
                />
                <SortableHeader label="Onboarding" sortKey="onboardingStatus" currentSort={sortConfig as any} onSort={handleSort} className="w-32" />
                <SortableHeader label="Status" sortKey="is_active" currentSort={sortConfig as any} onSort={handleSort} className="w-32" />
                <SortableHeader label="Assigned" sortKey="assigned" currentSort={sortConfig as any} onSort={handleSort} className="w-24" />
                {isAdmin && <SortableHeader label="Plan" sortKey="plan_name" currentSort={sortConfig as any} onSort={handleSort} className="w-48" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 bg-white dark:bg-zinc-900">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} showPlan={isAdmin} />)
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan={isAdmin ? 10 : 9} className="py-20 text-center"><div className="flex flex-col items-center justify-center opacity-40"><UsersIcon className="w-16 h-16 text-zinc-300 dark:text-zinc-600 mb-4" /><p className="text-lg font-bold text-zinc-900 dark:text-white">No drivers found</p></div></td></tr>
              ) : (
                paginatedData.map(driver => (
                  <tr key={driver.driver_id} onClick={() => onDriverSelect(driver)} className="group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200">
                    <td className="px-6 py-4"><div className="flex items-center gap-1 whitespace-nowrap"><span className="text-xs font-bold text-zinc-900 dark:text-zinc-200">{driver.driver_id}</span><CopyButton text={driver.driver_id} /></div></td>
                    <td className="px-6 py-4"><div className="flex items-center gap-3 whitespace-nowrap">{driver.profile_pic ? (<img src={driver.profile_pic} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />) : (<div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{driver.name ? driver.name.charAt(0) : '?'}</div>)}<span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 whitespace-nowrap" title={driver.name}>{driver.name || '--'}</span></div></td>
                    <td className="px-6 py-4">{driver.phone ? (<a href={`tel:${driver.phone}`} onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2 whitespace-nowrap"><PhoneIcon className="w-3.5 h-3.5 shrink-0" />{driver.phone}</a>) : <span className="text-xs text-zinc-300">--</span>}</td>
                    <td className="px-6 py-4"><span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{driver.vehicleData?.[0]?.vehicle_number || driver.latest_swap?.vehicle_number || '--'}</span></td>
                    <td className="px-6 py-4"><span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{masterRecords[driver.driver_id]?.onboarded_city || '--'}</span></td>
                    <td className="px-6 py-4"><div className="flex items-center gap-2 text-xs text-zinc-500 font-bold whitespace-nowrap"><CalendarIcon className="w-3.5 h-3.5 shrink-0" />{formatDate(driver.onboarded_on)}</div></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 font-bold whitespace-nowrap">
                        <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                        {formatDate(driver.last_swap_date || 0)}
                      </div>
                    </td>
                    <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${driver.onboardingStatus === 'Complete' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'}`}>{driver.onboardingStatus || 'Pending'}</span></td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${driver.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                          <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{driver.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                        {/* We don't have masterData here easily without fetching all, but we can check if the driver object has it if we fetched it */}
                      </div>
                    </td>
                    <td className="px-6 py-4">{driver.assigned ? (<span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">Yes</span>) : (<span className="text-xs font-bold text-zinc-400 whitespace-nowrap">No</span>)}</td>
                    {isAdmin && <td className="px-6 py-4"><span className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400 truncate max-w-[160px] block whitespace-nowrap" title={driver.planData?.[0]?.plan_name}>{driver.planData?.[0]?.plan_name || '--'}</span></td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <PaginationFooter 
          currentPage={currentPage}
          totalPages={Math.ceil(totalDatabaseCount / itemsPerPage)}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(val) => { setItemsPerPage(val); setCurrentPage(1); }}
          dataLength={totalDatabaseCount}
        />
      </div>
    </div>
  );
};

export default DriversPage;