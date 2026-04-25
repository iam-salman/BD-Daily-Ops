import React, { useState, useEffect, useMemo } from 'react';
import { 
  TicketIcon, 
  PlusIcon, 
  MagnifyingGlassIcon, 
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  UserIcon,
  PhoneIcon,
  IdentificationIcon,
  ChatBubbleLeftEllipsisIcon,
  BanknotesIcon,
  ExclamationCircleIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  FunnelIcon,
  WalletIcon,
  PencilSquareIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  where,
  getDocs,
  Firestore,
  Timestamp
} from 'firebase/firestore';
import { Ticket, TicketStatus, UserRole, Driver, TicketReply, TICKET_CLOSING_REASONS, TicketClosingReason } from '../types';
import CustomSelect from '../components/CustomSelect';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

interface TicketsPageProps {
  isDarkMode: boolean;
  user: any;
  role: UserRole | null;
  db: Firestore;
  userName: string;
}

const CATEGORIES = [
  { id: 'harness', label: 'Harness Issue', subCategories: ['Harness Heating', 'Harness break', 'Other'] },
  { id: 'soc_meter', label: 'Soc Meter Issue', subCategories: ['Not working', 'L--', 'Other'] },
  { id: 'battery', label: 'Battery Issue', subCategories: ['Uneven SoC', 'Buzzer beeping', 'SoC not changing', 'Range issue', 'Other'] },
  { id: 'penalty', label: 'Penalty Issue', subCategories: ['Check penalty', 'Other'] },
  { id: 'rickshaw_stopped', label: 'Rickshaw stopped', subCategories: [] },
  { id: 'other', label: 'Other', subCategories: [] }
];

const getTimestamps = (range: string) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  
  switch (range) {
    case 'today':
      return { from: today, to: today + 86399 };
    case 'yesterday':
      return { from: today - 86400, to: today - 1 };
    case 'last7days':
      return { from: today - (6 * 86400), to: today + 86399 };
    case 'last30days':
      return { from: today - (29 * 86400), to: today + 86399 };
    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;
      return { from: first, to: today + 86399 };
    }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000;
      const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime() / 1000;
      return { from: first, to: last };
    }
    default:
      return { from: 0, to: 2147483647 };
  }
};

const ITEMS_REPLACED_OPTIONS = ['Harness', 'SoC Meter', 'MCB', 'Extension Cable'];

const TicketsPage: React.FC<TicketsPageProps> = ({ isDarkMode, user, role, db, userName }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'All'>('All');
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [techFilter, setTechFilter] = useState<'All' | 'Technician' | 'Non-Technician'>('All');
  const [compFilter, setCompFilter] = useState<'All' | 'Compensation' | 'Non-Compensation'>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [subCategoryFilter, setSubCategoryFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination State - Removed
  const [totalDatabaseCount, setTotalDatabaseCount] = useState(0);

  // Create Ticket Form State
  const [driverSearch, setDriverSearch] = useState('');
  const [foundDrivers, setFoundDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [message, setMessage] = useState('');
  const [selectedTechnician, setSelectedTechnician] = useState<{ id: string; name: string } | null>(null);
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);

  // Closing Form State
  const [closingIssueDesc, setClosingIssueDesc] = useState('');
  const [closingResolved, setClosingResolved] = useState<'Yes' | 'No' | 'Issue is not our side'>('Yes');
  const [closingItemsReplaced, setClosingItemsReplaced] = useState<string[]>([]);
  const [closingCash, setClosingCash] = useState(0);
  const [closingUpi, setClosingUpi] = useState(0);
  const [adminCompensation, setAdminCompensation] = useState(0);
  const [adminDescription, setAdminDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compensationType, setCompensationType] = useState<'Half' | 'Free' | 'Acc to Left' | null>(null);

  // Edit/Delete states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);

  const [activeTab, setActiveTab] = useState<'info' | 'action' | 'chat'>('info');
  const [showConfirmModal, setShowConfirmModal] = useState<{ type: 'close' | 'compensation' | 'initiate', ticketId: string } | null>(null);
  const [driverWalletBalance, setDriverWalletBalance] = useState<number | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [newReply, setNewReply] = useState('');
  const [closingReason, setClosingReason] = useState<TicketClosingReason | ''>('');

  useEffect(() => {
    if (showDetailModal) {
      const q = query(
        collection(db, 'ticket_replies'),
        where('ticketId', '==', showDetailModal.id)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const repliesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TicketReply[];
        // Sort client-side to avoid composite index requirement
        repliesData.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        setReplies(repliesData);
      });
      return () => unsubscribe();
    } else {
      setReplies([]);
      setNewReply('');
      setClosingReason('');
    }
  }, [showDetailModal, db]);

  useEffect(() => {
    if (showDetailModal && (showDetailModal.status === 'Pending Admin' || activeTab === 'action')) {
      const fetchWallet = async () => {
        const q = query(collection(db, 'drivers'), where('driver_id', '==', showDetailModal.driverId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const driver = snap.docs[0].data() as Driver;
          setDriverWalletBalance(driver.wallet_balance);
        }
      };
      fetchWallet();
    } else {
      setDriverWalletBalance(null);
    }
  }, [showDetailModal, activeTab, db]);

  useEffect(() => {
    const fetchTicketsData = async () => {
      setLoading(true);
      try {
        const ticketsRef = collection(db, 'tickets');
        const q = query(ticketsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        let allTickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));

        // Filter by status if not 'All'
        if (statusFilter !== 'All') {
          allTickets = allTickets.filter(t => t.status === statusFilter);
        }

        if (searchQuery) {
          const qStr = searchQuery.toLowerCase();
          allTickets = allTickets.filter(t => 
            t.driverName.toLowerCase().includes(qStr) ||
            t.driverId.toLowerCase().includes(qStr) ||
            t.vehicleNumber.toLowerCase().includes(qStr)
          );
        }

        // Apply date range filter
        const { from, to } = getTimestamps(dateRange);
        if (dateRange !== 'all' && dateRange !== 'All') {
           allTickets = allTickets.filter(t => {
             const ts = new Date(t.createdAt).getTime() / 1000;
             return ts >= from && ts <= to;
           });
        }

        setTickets(allTickets);
        setTotalDatabaseCount(allTickets.length);
      } catch (err) {
        console.error("Failed to fetch tickets", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTicketsData();
  }, [statusFilter, searchQuery, dateRange, customStartDate, customEndDate]);

  useEffect(() => {
    // Fetch Technicians
    const techQuery = query(collection(db, 'users'), where('role', '==', UserRole.TECHNICIAN));
    getDocs(techQuery).then(snapshot => {
      const techList = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || doc.data().email.split('@')[0]
      }));
      setTechnicians(techList);
    });
  }, [db]);

  const handleDriverSearch = async () => {
    if (!driverSearch) return;
    const q = query(collection(db, 'drivers'));
    const snapshot = await getDocs(q);
    const drivers = snapshot.docs.map(doc => doc.data() as Driver);
    const filtered = drivers.filter(d => 
      d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
      d.driver_id.toLowerCase().includes(driverSearch.toLowerCase()) ||
      d.phone.includes(driverSearch) ||
      (d.vehicleData?.[0]?.vehicle_number || '').toLowerCase().includes(driverSearch.toLowerCase())
    );
    setFoundDrivers(filtered);
  };

  const createTicket = async () => {
    if (!selectedDriver || !selectedCategory || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const newTicket: any = {
        driverId: selectedDriver.driver_id,
        driverName: selectedDriver.name,
        driverPhone: selectedDriver.phone,
        vehicleNumber: selectedDriver.vehicleData?.[0]?.vehicle_number || 'N/A',
        category: selectedCategory,
        subCategory: selectedSubCategory,
        message: message || "",
        status: 'Open',
        createdAt: new Date().toISOString(),
        createdBy: user.email,
        createdByName: userName || user.displayName || user.email.split('@')[0]
      };

      if (selectedTechnician) {
        newTicket.technicianId = selectedTechnician.id;
        newTicket.technicianName = selectedTechnician.name;
      }

      await addDoc(collection(db, 'tickets'), newTicket);
      setShowCreateModal(false);
      resetCreateForm();
    } catch (error) {
      console.error("Error creating ticket:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setDriverSearch('');
    setFoundDrivers([]);
    setSelectedDriver(null);
    setSelectedCategory('');
    setSelectedSubCategory('');
    setMessage('');
    setSelectedTechnician(null);
  };

  const handleEditTicket = (e: React.MouseEvent, ticket: Ticket) => {
    e.stopPropagation();
    setEditingTicket(JSON.parse(JSON.stringify(ticket)));
    setIsEditModalOpen(true);
  };

  const handleDeleteTicket = (e: React.MouseEvent, ticket: Ticket) => {
    e.stopPropagation();
    setTicketToDelete(ticket);
    setIsDeleteModalOpen(true);
  };

  const saveEditedTicket = async () => {
    if (!editingTicket) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'tickets', editingTicket.id), {
        category: editingTicket.category,
        subCategory: editingTicket.subCategory,
        message: editingTicket.message
      });
      setIsEditModalOpen(false);
      setEditingTicket(null);
    } catch (error) {
      console.error("Error updating ticket:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteTicket = async () => {
    if (!ticketToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'tickets', ticketToDelete.id));
      setIsDeleteModalOpen(false);
      setTicketToDelete(null);
    } catch (error) {
      console.error("Error deleting ticket:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostComment = async () => {
    // This seems to be for general driver comments, but let's add handleSendReply
  };

  const handleSendReply = async () => {
    if (!newReply.trim() || !showDetailModal || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const reply: Omit<TicketReply, 'id'> = {
        ticketId: showDetailModal.id,
        message: newReply.trim(),
        authorId: user.email,
        authorName: userName || user.displayName || user.email.split('@')[0],
        authorRole: role || 'Unknown',
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(db, 'ticket_replies'), reply);
      setNewReply('');
    } catch (error) {
      console.error("Error sending reply:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const initiateClose = async (ticketId: string) => {
    if (isSubmitting || !closingReason) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        status: 'Initiated Close',
        closingReason: closingReason,
        technicianClosingInfo: {
          issueDescription: closingIssueDesc,
          issueResolved: closingResolved,
          itemsReplaced: closingItemsReplaced,
          charges: {
            cash: Number(closingCash),
            upi: Number(closingUpi)
          },
          initiatedAt: new Date().toISOString()
        }
      });
      setShowDetailModal(null);
      resetClosingForm();
    } catch (error) {
      console.error("Error initiating close:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalClose = async (ticketId: string) => {
    if (isSubmitting || (!closingReason && !tickets.find(t => t.id === ticketId)?.closingReason)) return;
    setIsSubmitting(true);
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      const updateData: any = {
        status: 'Closed',
        closingReason: closingReason || ticket?.closingReason,
        adminClosingInfo: {
          description: adminDescription,
          compensation: Number(adminCompensation),
          closedAt: new Date().toISOString(),
          closedBy: user.email
        }
      };

      // If it was pending admin, mark compensation as given
      if (ticket?.status === 'Pending Admin' && ticket.compensationInfo) {
        updateData.compensationInfo = {
          ...ticket.compensationInfo,
          status: 'Given'
        };
      }

      await updateDoc(doc(db, 'tickets', ticketId), updateData);
      setShowDetailModal(null);
      setShowConfirmModal(null);
      resetClosingForm();
    } catch (error) {
      console.error("Error closing ticket:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetClosingForm = () => {
    setClosingIssueDesc('');
    setClosingResolved('Yes');
    setClosingItemsReplaced([]);
    setClosingCash(0);
    setClosingUpi(0);
    setAdminCompensation(0);
    setAdminDescription('');
  };

  const saveCompensation = async (ticketId: string) => {
    if (!compensationType || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        status: 'Pending Admin',
        compensationInfo: {
          type: compensationType,
          status: 'Pending',
          requestedAt: new Date().toISOString(),
          requestedBy: user.email
        }
      });
      setShowDetailModal(null);
      setCompensationType(null);
    } catch (error) {
      console.error("Error saving compensation:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeWithoutCompensation = async (ticketId: string) => {
    if (isSubmitting || !closingReason) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        status: 'Closed',
        closingReason: closingReason,
        adminClosingInfo: {
          description: adminDescription || 'Closed without compensation',
          compensation: 0,
          closedAt: new Date().toISOString(),
          closedBy: user.email
        }
      });
      setShowDetailModal(null);
      resetClosingForm();
    } catch (error) {
      console.error("Error closing ticket:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // Role-based filtering
      if (role === UserRole.TECHNICIAN) {
        if (t.technicianId !== user.email?.toLowerCase()) return false;
      }

      const matchesSearch = 
        t.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.driverId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase());
      
      // statusFilter is handled server-side now
      
      const isTechnicianRelated = !!t.technicianId;
      const matchesTech = techFilter === 'All' || 
        (techFilter === 'Technician' && isTechnicianRelated) || 
        (techFilter === 'Non-Technician' && !isTechnicianRelated);
      
      const hasCompensation = !!t.compensationInfo;
      const matchesComp = compFilter === 'All' || 
        (compFilter === 'Compensation' && hasCompensation) || 
        (compFilter === 'Non-Compensation' && !hasCompensation);
      
      const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter;
      const matchesSubCategory = subCategoryFilter === 'All' || t.subCategory === subCategoryFilter;

      return matchesSearch && matchesTech && matchesComp && matchesCategory && matchesSubCategory;
    });
  }, [tickets, searchQuery, techFilter, compFilter, categoryFilter, subCategoryFilter, role, user.email]);

  const displayTickets = filteredTickets; // Currently paginated from server for status.

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tickets');

    const headers = [
      'Issue Raise Date', 'Time', 'Driver ID', 'Driver Name', 'Phone', 'Vehicle Number',
      'Status', 'Category', 'Sub category', 'Issue description', 'Technician Related',
      'Technician Name', 'Compensation', 'Item Replaced', 'Amount Received',
      'Compensation Amount', 'Resolve Date', 'Resolve Time'
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
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    filteredTickets.forEach(t => {
      const createdAt = new Date(t.createdAt);
      const resolvedAt = t.adminClosingInfo ? new Date(t.adminClosingInfo.closedAt) : null;
      
      const row = worksheet.addRow([
        createdAt.toLocaleDateString('en-GB').replace(/\//g, '-'),
        createdAt.toLocaleTimeString(),
        t.driverId,
        t.driverName,
        t.driverPhone,
        t.vehicleNumber,
        t.status,
        t.category,
        t.subCategory,
        t.message || t.technicianClosingInfo?.issueDescription || '',
        t.technicianId ? 'Yes' : 'No',
        t.technicianName || 'N/A',
        t.compensationInfo ? 'Yes' : 'No',
        t.technicianClosingInfo?.itemsReplaced.join(', ') || 'None',
        (t.technicianClosingInfo?.charges.cash || 0) + (t.technicianClosingInfo?.charges.upi || 0),
        t.adminClosingInfo?.compensation || 0,
        resolvedAt ? resolvedAt.toLocaleDateString('en-GB').replace(/\//g, '-') : 'N/A',
        resolvedAt ? resolvedAt.toLocaleTimeString() : 'N/A'
      ]);

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

    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 4, 50);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Tickets_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const shareTicket = (ticket: Ticket) => {
    const text = `📌 *Ticket Details*

👤 *Driver Name:* ${ticket.driverName}
🆔 *Driver ID:* ${ticket.driverId}
📞 *Phone:* ${ticket.driverPhone}
🚗 *Vehicle Number:* ${ticket.vehicleNumber}

🔧 *Category:* ${ticket.category}
📂 *Sub-Category:* ${ticket.subCategory || 'N/A'}

📊 *Status:* ${ticket.status}
🕒 *Created At:* ${new Date(ticket.createdAt).toLocaleString()}`;

    if (navigator.share) {
      navigator.share({
        title: `Ticket ${ticket.id}`,
        text: text,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      alert('Ticket details copied to clipboard!');
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    switch (status) {
      case 'Open': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'Initiated Close': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'Pending Admin': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
      case 'Closed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Harness Issue': return <WrenchScrewdriverIcon className="w-5 h-5" />;
      case 'Soc Meter Issue': return <ClockIcon className="w-5 h-5" />;
      case 'Battery Issue': return <ExclamationCircleIcon className="w-5 h-5" />;
      case 'Penalty Issue': return <BanknotesIcon className="w-5 h-5" />;
      case 'Rickshaw stopped': return <XMarkIcon className="w-5 h-5 text-rose-500" />;
      default: return <TicketIcon className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500 pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-heading text-slate-900 dark:text-white">Support Tickets</h2>
          <p className="font-semibold text-gray-400 dark:text-slate-400">Manage driver issues and technical support</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-2xl font-bold font-button shadow-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            <span className="text-sm">Export</span>
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-2xl font-bold font-button shadow-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
          >
            <PlusIcon className="w-5 h-5" />
            <span className="text-sm">
              <span className="hidden sm:inline">Create </span>Ticket
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative group">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
            <input 
              type="text" 
              placeholder="Search by Driver Name, ID or Vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 h-11 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-bold transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center h-11 px-4 lg:px-5 lg:py-3 rounded-2xl font-bold text-xs lg:text-sm gap-2 transition-all border shrink-0 ${showFilters ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'}`}
            >
              <FunnelIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
            <div className="w-40 sm:w-48">
              <CustomSelect
                className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 h-11 !rounded-2xl !text-sm"
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'last7days', label: 'Last 7 Days' },
                  { value: 'last30days', label: 'Last 30 Days' },
                  { value: 'thisMonth', label: 'This Month' },
                  { value: 'lastMonth', label: 'Last Month' },
                  { value: 'custom', label: 'Custom' }
                ]}
                value={dateRange}
                onChange={(val) => setDateRange(val as any)}
              />
            </div>
            <div className="w-40 sm:w-48">
              <CustomSelect
                className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 h-11 !rounded-2xl !text-sm"
                options={[
                  { value: 'All', label: 'All Status' },
                  { value: 'Open', label: 'Open' },
                  { value: 'Initiated Close', label: 'Initiated Close' },
                  { value: 'Pending Admin', label: 'Pending Admin' },
                  { value: 'Closed', label: 'Closed' }
                ]}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as any)}
              />
            </div>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="flex gap-4 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-300">
            <div className="flex-1">
              <CustomDatePicker 
                label="Start Date"
                value={customStartDate}
                onChange={(val) => setCustomStartDate(val)}
              />
            </div>
            <div className="flex-1">
              <CustomDatePicker 
                label="End Date"
                value={customEndDate}
                onChange={(val) => setCustomEndDate(val)}
              />
            </div>
          </div>
        )}

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-top-4 duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Type</label>
              <CustomSelect
                options={[
                  { value: 'All', label: 'All Types' },
                  { value: 'Technician', label: 'Technician Related' },
                  { value: 'Non-Technician', label: 'Non-Technician' }
                ]}
                value={techFilter}
                onChange={(val) => setTechFilter(val as any)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Compensation</label>
              <CustomSelect
                options={[
                  { value: 'All', label: 'All' },
                  { value: 'Compensation', label: 'Compensation' },
                  { value: 'Non-Compensation', label: 'Non-Compensation' }
                ]}
                value={compFilter}
                onChange={(val) => setCompFilter(val as any)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Category</label>
              <CustomSelect
                options={[
                  { value: 'All', label: 'All Categories' },
                  ...CATEGORIES.map(c => ({ value: c.label, label: c.label }))
                ]}
                value={categoryFilter}
                onChange={(val) => {
                  setCategoryFilter(val);
                  setSubCategoryFilter('All');
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Sub Category</label>
              <CustomSelect
                options={[
                  { value: 'All', label: 'All Sub Categories' },
                  ...(CATEGORIES.find(c => c.label === categoryFilter)?.subCategories || []).map(s => ({ value: s, label: s }))
                ]}
                value={subCategoryFilter}
                onChange={setSubCategoryFilter}
                disabled={categoryFilter === 'All'}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 animate-pulse"></div>
          ))
        ) : filteredTickets.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 opacity-40">
            <TicketIcon className="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-lg font-bold text-zinc-900 dark:text-white">No tickets found</p>
          </div>
        ) : (
          displayTickets.map(ticket => (
            <div 
              key={ticket.id}
              onClick={() => {
                setShowDetailModal(ticket);
                setActiveTab('info');
              }}
              className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1.5 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
              
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-20">
                <button 
                  onClick={(e) => handleEditTicket(e, ticket)}
                  className="p-1.5 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-sm transition-all"
                  title="Edit Ticket"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={(e) => handleDeleteTicket(e, ticket)}
                  className="p-1.5 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 shadow-sm transition-all"
                  title="Delete Ticket"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex justify-between items-start mb-6 relative z-10 text-right">
                <div className={`px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm ${getStatusColor(ticket.status)}`}>
                  {ticket.status}
                </div>
                <div className="flex flex-col items-end pr-8 sm:pr-0">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  <span className="text-[8px] font-bold text-zinc-300">{new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              
              <div className="space-y-5 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-white font-black text-xl shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                    {ticket.driverName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight group-hover:text-indigo-600 transition-colors">{ticket.driverName}</h3>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{ticket.vehicleNumber}</span>
                      <span className="text-[9px] font-bold text-zinc-300">ID: {ticket.driverId}</span>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-zinc-50 dark:border-zinc-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                      {getCategoryIcon(ticket.category)}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Issue</p>
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{ticket.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ticket.status !== 'Closed' && (role === UserRole.ADMIN || role === UserRole.SUPPORT_EXECUTIVE) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDetailModal(ticket);
                          setActiveTab('action');
                        }}
                        className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-200 transition-colors"
                        title="Close Ticket"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                      </button>
                    )}
                    <ChevronRightIcon className="w-5 h-5 text-zinc-300 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination removed */}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Create Support Ticket</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Driver Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Select Driver</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input 
                      type="text" 
                      placeholder="Search by Name, ID, Phone or Vehicle..."
                      value={driverSearch}
                      onChange={(e) => setDriverSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleDriverSearch();
                        }
                      }}
                      className="w-full pl-12 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none dark:text-zinc-100"
                    />
                  </div>
                  <button 
                    onClick={handleDriverSearch}
                    className="px-6 py-3 bg-zinc-900 dark:bg-zinc-700 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-all"
                  >
                    Search
                  </button>
                </div>

                {foundDrivers.length > 0 && !selectedDriver && (
                  <div className="mt-2 space-y-2 max-h-40 overflow-y-auto p-2 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    {foundDrivers.map(d => (
                      <div 
                        key={d.driver_id}
                        onClick={() => setSelectedDriver(d)}
                        className="flex items-center justify-between p-3 hover:bg-white dark:hover:bg-zinc-700 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                            {d.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white">{d.name}</p>
                            <p className="text-[10px] font-bold text-zinc-400">{d.driver_id} • {d.vehicleData?.[0]?.vehicle_number || 'No Vehicle'}</p>
                          </div>
                        </div>
                        <ChevronRightIcon className="w-4 h-4 text-zinc-300" />
                      </div>
                    ))}
                  </div>
                )}

                {selectedDriver && (
                  <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
                        {selectedDriver.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{selectedDriver.name}</p>
                        <p className="text-xs font-bold text-indigo-600/60 dark:text-indigo-400/60">{selectedDriver.driver_id} • {selectedDriver.vehicleData?.[0]?.vehicle_number || 'N/A'}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedDriver(null)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Change</button>
                  </div>
                )}
              </div>

              {/* Category Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                  <CustomSelect
                    options={CATEGORIES.map(c => ({ value: c.label, label: c.label }))}
                    value={selectedCategory}
                    onChange={(val) => {
                      setSelectedCategory(val);
                      setSelectedSubCategory('');
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Sub Category</label>
                  <CustomSelect
                    options={
                      (CATEGORIES.find(c => c.label === selectedCategory)?.subCategories || []).map(s => ({ value: s, label: s }))
                    }
                    value={selectedSubCategory}
                    onChange={setSelectedSubCategory}
                    disabled={!selectedCategory || (CATEGORIES.find(c => c.label === selectedCategory)?.subCategories.length === 0)}
                  />
                </div>
              </div>

              {/* Message Field */}
              {(selectedSubCategory === 'Other' || (selectedCategory && CATEGORIES.find(c => c.label === selectedCategory)?.subCategories.length === 0)) && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Message (Optional)</label>
                  <textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe the issue..."
                    className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none dark:text-zinc-100 min-h-[100px] resize-none"
                  />
                </div>
              )}

              {/* Technician Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Assign Technician</label>
                <CustomSelect
                  options={[
                    { value: 'none', label: 'None' },
                    ...technicians.map(t => ({ value: t.id, label: t.name }))
                  ]}
                  value={selectedTechnician?.id || 'none'}
                  onChange={(val) => {
                    if (val === 'none') setSelectedTechnician(null);
                    else {
                      const tech = technicians.find(t => t.id === val);
                      if (tech) setSelectedTechnician(tech);
                    }
                  }}
                />
              </div>
            </div>

            <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 flex gap-3">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-4 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={createTicket}
                disabled={!selectedDriver || !selectedCategory || isSubmitting}
                className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
              >
                {isSubmitting ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Detail / Closing Modal */}
      {showDetailModal && (
        <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-300 border border-zinc-200 dark:border-zinc-800">
            <div className="p-5 sm:p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl ${getStatusColor(showDetailModal.status)} shadow-sm`}>
                  <TicketIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Ticket Details</h3>
                  <p className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{showDetailModal.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => shareTicket(showDetailModal)}
                  className="p-2 sm:p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl sm:rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all shadow-sm group"
                  title="Share Ticket"
                >
                  <ShareIcon className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
                </button>
                <button 
                  onClick={() => setShowDetailModal(null)} 
                  className="p-2 sm:p-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl sm:rounded-2xl transition-all hover:rotate-90 duration-300 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>

            <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-4 sm:px-8 overflow-x-auto scrollbar-hide">
              <button 
                onClick={() => setActiveTab('info')}
                className={`px-4 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'info' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
              >
                Information
              </button>
              <button 
                onClick={() => setActiveTab('chat')}
                className={`px-4 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'chat' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
              >
                Internal Chat
              </button>
              <button 
                onClick={() => setActiveTab('action')}
                disabled={showDetailModal.status === 'Closed'}
                className={`px-4 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'action' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'} disabled:opacity-30`}
              >
                Take Action
              </button>
            </div>

            <div className="p-5 sm:p-8 overflow-y-auto space-y-8 sm:space-y-10 scrollbar-hide">
              {activeTab === 'info' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
                    <div className="space-y-6">
                      <div className="p-5 sm:p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl sm:rounded-[2rem] border border-zinc-100 dark:border-zinc-700/50">
                        <p className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Driver Profile</p>
                        <div className="flex items-center gap-4 sm:gap-5">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-[1.5rem] bg-indigo-600 flex items-center justify-center text-white font-black text-xl sm:text-2xl shadow-lg shadow-indigo-500/20">
                            {showDetailModal.driverName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight">{showDetailModal.driverName}</p>
                            <p className="text-[10px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400">{showDetailModal.driverId}</p>
                          </div>
                        </div>
                        <div className="mt-5 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                          <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl border border-zinc-100 dark:border-zinc-800">
                            <PhoneIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 mb-1" />
                            <p className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase">Phone</p>
                            <p className="text-[10px] sm:text-xs font-black text-zinc-800 dark:text-zinc-200">{showDetailModal.driverPhone}</p>
                          </div>
                          <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl border border-zinc-100 dark:border-zinc-800">
                            <IdentificationIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 mb-1" />
                            <p className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase">Vehicle</p>
                            <p className="text-[10px] sm:text-xs font-black text-zinc-800 dark:text-zinc-200">{showDetailModal.vehicleNumber}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="p-5 sm:p-6 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl sm:rounded-[2rem] border border-indigo-100 dark:border-indigo-900/20">
                        <p className="text-[9px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Issue Details</p>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900 text-indigo-600 shadow-sm">
                            {getCategoryIcon(showDetailModal.category)}
                          </div>
                          <div>
                            <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-tight">{showDetailModal.category}</p>
                            <p className="text-[10px] sm:text-xs font-bold text-zinc-500">{showDetailModal.subCategory || 'No Sub-category'}</p>
                          </div>
                        </div>
                        {showDetailModal.message && (
                          <div className="mt-4 p-4 bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl border border-indigo-50 dark:border-indigo-900/30">
                            <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400 mb-1" />
                            <p className="text-[10px] sm:text-xs font-bold text-zinc-600 dark:text-zinc-300 leading-relaxed italic">"{showDetailModal.message}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {showDetailModal.status === 'Closed' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                      <h4 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white flex items-center gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
                          <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        Resolution History
                      </h4>

                      {showDetailModal.closingReason && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                          <CheckCircleIcon className="w-4 h-4" />
                          Closing Reason: {showDetailModal.closingReason}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        {showDetailModal.technicianClosingInfo && (
                          <div className="p-5 sm:p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl sm:rounded-[2rem] border border-zinc-100 dark:border-zinc-800">
                            <div className="flex justify-between items-center mb-4">
                              <p className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest">Technician</p>
                              <span className="text-[8px] sm:text-[9px] font-bold text-zinc-400">{new Date(showDetailModal.technicianClosingInfo.initiatedAt).toLocaleString()}</span>
                            </div>
                            <p className="text-xs sm:text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-4 leading-relaxed">{showDetailModal.technicianClosingInfo.issueDescription}</p>
                            <div className="flex flex-wrap gap-2">
                              {showDetailModal.technicianClosingInfo.itemsReplaced.map(item => (
                                <span key={item} className="px-2.5 py-1 bg-white dark:bg-zinc-900 rounded-lg text-[8px] sm:text-[9px] font-black text-zinc-500 border border-zinc-100 dark:border-zinc-800 uppercase">{item}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {showDetailModal.adminClosingInfo && (
                          <div className="p-5 sm:p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl sm:rounded-[2rem] border border-emerald-100 dark:border-emerald-900/20">
                            <div className="flex justify-between items-center mb-4">
                              <p className="text-[9px] sm:text-[10px] font-black text-emerald-600 uppercase tracking-widest">Admin Final</p>
                              <span className="text-[8px] sm:text-[9px] font-bold text-emerald-400">{new Date(showDetailModal.adminClosingInfo.closedAt).toLocaleString()}</span>
                            </div>
                            <p className="text-xs sm:text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-4">{showDetailModal.adminClosingInfo.description || 'Closed successfully'}</p>
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black text-base sm:text-lg">
                              <BanknotesIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                              <span>₹{showDetailModal.adminClosingInfo.compensation}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : activeTab === 'chat' ? (
                <div className="flex flex-col h-[500px] bg-zinc-50 dark:bg-zinc-950 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 overflow-hidden relative">
                  <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-hide">
                    {replies.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center opacity-30">
                        <ChatBubbleLeftEllipsisIcon className="w-12 h-12 mb-2" />
                        <p className="text-sm font-bold">No messages yet</p>
                      </div>
                    ) : (
                      replies.map((reply) => (
                        <div 
                          key={reply.id} 
                          className={`flex flex-col ${reply.authorId === user.email ? 'items-end' : 'items-start'}`}
                        >
                          <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-sm relative ${
                            reply.authorId === user.email 
                              ? 'bg-indigo-600 text-white rounded-tr-none' 
                              : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-none border border-zinc-100 dark:border-zinc-700'
                          }`}>
                            {reply.authorId !== user.email && (
                              <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-indigo-600 dark:text-indigo-400">
                                {reply.authorName} • {reply.authorRole}
                              </p>
                            )}
                            <p className="font-medium leading-relaxed">{reply.message}</p>
                            <div className="flex items-center justify-end gap-1.5 mt-1 opacity-50">
                              <p className="text-[8px]">
                                {new Date(reply.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex gap-2 items-center">
                      <input 
                        type="text"
                        value={newReply}
                        onChange={(e) => setNewReply(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                        placeholder="Type a message..."
                        className="flex-1 px-5 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-bold outline-none dark:text-zinc-100"
                      />
                      <button 
                        onClick={handleSendReply}
                        disabled={!newReply.trim() || isSubmitting}
                        className="w-11 h-11 flex items-center justify-center bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20"
                      >
                        <PaperAirplaneIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 sm:space-y-10 animate-in slide-in-from-right-4 duration-300">
                  {/* Technician Flow */}
                  {showDetailModal.status === 'Open' && (role === UserRole.TECHNICIAN || role === UserRole.ADMIN) && showDetailModal.technicianId && (
                    <div className="space-y-6 sm:space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                          <WrenchScrewdriverIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div>
                          <h4 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight">Technician Resolution</h4>
                          <p className="text-[10px] sm:text-xs font-bold text-zinc-400">Provide details to initiate closing</p>
                        </div>
                      </div>
                      
                      <div className="space-y-5 sm:space-y-6">
                        <div className="space-y-2 sm:space-y-3">
                          <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Issue Description</label>
                          <textarea 
                            value={closingIssueDesc}
                            onChange={(e) => setClosingIssueDesc(e.target.value)}
                            placeholder="What did you find? What was fixed?"
                            className="w-full p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl sm:rounded-[1.5rem] text-xs sm:text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none dark:text-zinc-100 min-h-[100px] resize-none shadow-inner"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                          <div className="space-y-2 sm:space-y-3">
                            <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Resolved?</label>
                            <CustomSelect
                              options={[
                                { value: 'Yes', label: 'Yes' },
                                { value: 'No', label: 'No' },
                                { value: 'Issue is not our side', label: 'Issue is not our side' }
                              ]}
                              value={closingResolved}
                              onChange={(val) => setClosingResolved(val as any)}
                            />
                          </div>
                          <div className="space-y-2 sm:space-y-3">
                            <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Closing Reason</label>
                            <CustomSelect
                              options={[
                                { value: '', label: 'Select Reason' },
                                ...TICKET_CLOSING_REASONS.map(r => ({ value: r, label: r }))
                              ]}
                              value={closingReason}
                              onChange={(val) => setClosingReason(val as any)}
                            />
                          </div>
                          <div className="space-y-2 sm:space-y-3">
                            <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Items Replaced</label>
                            <div className="flex flex-wrap gap-2">
                              {ITEMS_REPLACED_OPTIONS.map(item => (
                                <button
                                  key={item}
                                  onClick={() => {
                                    if (closingItemsReplaced.includes(item)) {
                                      setClosingItemsReplaced(closingItemsReplaced.filter(i => i !== item));
                                    } else {
                                      setClosingItemsReplaced([...closingItemsReplaced, item]);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all border-2 ${
                                    closingItemsReplaced.includes(item)
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20'
                                      : 'bg-white dark:bg-zinc-800 text-zinc-500 border-zinc-100 dark:border-zinc-700 hover:border-indigo-200'
                                  }`}
                                >
                                  {item}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                          <div className="space-y-2 sm:space-y-3">
                            <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Cash Charges (₹)</label>
                            <div className="relative">
                              <BanknotesIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                              <input 
                                type="number" 
                                value={closingCash}
                                onChange={(e) => setClosingCash(Number(e.target.value))}
                                className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none dark:text-zinc-100 shadow-inner"
                              />
                            </div>
                          </div>
                          <div className="space-y-2 sm:space-y-3">
                            <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">UPI Charges (₹)</label>
                            <div className="relative">
                              <ChatBubbleLeftEllipsisIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                              <input 
                                type="number" 
                                value={closingUpi}
                                onChange={(e) => setClosingUpi(Number(e.target.value))}
                                className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none dark:text-zinc-100 shadow-inner"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => setShowConfirmModal({ type: 'initiate', ticketId: showDetailModal.id })}
                        disabled={!closingIssueDesc || !closingReason || isSubmitting}
                        className="w-full py-4 sm:py-5 bg-indigo-600 text-white rounded-xl sm:rounded-[1.5rem] font-black text-xs sm:text-sm uppercase tracking-[0.2em] hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xl shadow-indigo-500/20"
                      >
                        {isSubmitting ? 'Processing...' : 'Initiate Close'}
                      </button>
                    </div>
                  )}

                  {/* Support/Admin Flow */}
                  {((showDetailModal.status === 'Open' && (!showDetailModal.technicianId || role === UserRole.SUPPORT_EXECUTIVE || role === UserRole.ADMIN)) || showDetailModal.status === 'Initiated Close' || showDetailModal.status === 'Pending Admin') && (role === UserRole.ADMIN || role === UserRole.SUPPORT_EXECUTIVE) && (
                    <div className="space-y-8 sm:space-y-10">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                          <ShieldCheckIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div>
                          <h4 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight">Final Action</h4>
                          <p className="text-[10px] sm:text-xs font-bold text-zinc-400">Support & Admin verification</p>
                        </div>
                      </div>

                      {showDetailModal.status === 'Open' && showDetailModal.technicianId && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl sm:rounded-2xl border border-amber-100 dark:border-amber-900/20 flex items-center gap-3">
                          <ClockIcon className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                          <p className="text-[10px] sm:text-xs font-bold text-amber-700 dark:text-amber-400">Awaiting technician resolution. You can still add notes or close if needed.</p>
                        </div>
                      )}

                      {showDetailModal.status === 'Pending Admin' && showDetailModal.compensationInfo && (
                        <div className="p-5 sm:p-6 bg-rose-50 dark:bg-rose-900/10 rounded-2xl sm:rounded-[2rem] border border-rose-100 dark:border-rose-900/20">
                          <div className="flex items-center gap-3 mb-2">
                            <ExclamationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                            <p className="text-[9px] sm:text-[10px] font-black text-rose-500 uppercase tracking-widest">Compensation Requested</p>
                          </div>
                          <p className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200">
                            Type: <span className="text-rose-600 dark:text-rose-400">{showDetailModal.compensationInfo.type}</span>
                          </p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 mt-1">Requested by {showDetailModal.compensationInfo.requestedBy} on {new Date(showDetailModal.compensationInfo.requestedAt).toLocaleString()}</p>
                        </div>
                      )}

                      {showDetailModal.technicianClosingInfo && (
                        <div className="p-6 sm:p-8 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl sm:rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/20 space-y-6">
                          <div className="flex items-center gap-2">
                            <WrenchScrewdriverIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
                            <p className="text-[9px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest">Technician Summary</p>
                          </div>
                          <div className="grid grid-cols-2 gap-6 sm:gap-8">
                            <div className="space-y-1">
                              <p className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase">Findings</p>
                              <p className="text-[10px] sm:text-xs font-bold text-zinc-700 dark:text-zinc-200 leading-relaxed">{showDetailModal.technicianClosingInfo.issueDescription}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase">Status</p>
                              <p className="text-[10px] sm:text-xs font-bold text-zinc-700 dark:text-zinc-200">{showDetailModal.technicianClosingInfo.issueResolved}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase">Charges</p>
                              <p className="text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400">₹{showDetailModal.technicianClosingInfo.charges.cash + showDetailModal.technicianClosingInfo.charges.upi}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[8px] sm:text-[9px] font-black text-zinc-400 uppercase">Items</p>
                              <p className="text-[10px] sm:text-xs font-bold text-zinc-700 dark:text-zinc-200">{showDetailModal.technicianClosingInfo.itemsReplaced.join(', ') || 'None'}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Compensation Logic for Support/Admin */}
                      {showDetailModal.status !== 'Pending Admin' && (
                        <div className="space-y-5 sm:space-y-6">
                          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                            <button 
                              onClick={() => setCompensationType(null)}
                              className={`flex-1 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest border-2 transition-all ${!compensationType ? 'bg-zinc-900 text-white border-zinc-900 shadow-lg' : 'bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-100 dark:border-zinc-800'}`}
                            >
                              Non Compensation
                            </button>
                            <button 
                              onClick={() => setCompensationType('Half')}
                              className={`flex-1 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest border-2 transition-all ${compensationType ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-100 dark:border-zinc-800'}`}
                            >
                              Compensation
                            </button>
                          </div>

                          {compensationType && (
                            <div className="p-5 sm:p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl sm:rounded-[2rem] border border-indigo-100 dark:border-indigo-900/30 animate-in zoom-in-95 duration-300">
                              <p className="text-[9px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 text-center">Select Compensation Type</p>
                              <div className="flex gap-2 sm:gap-3">
                                {['Half', 'Free', 'Acc to Left'].map((type) => (
                                  <button
                                    key={type}
                                    onClick={() => setCompensationType(type as any)}
                                    className={`flex-1 py-2.5 sm:py-3 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all ${compensationType === type ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-zinc-800 text-zinc-500 hover:bg-indigo-50'}`}
                                  >
                                    {type}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-5 sm:space-y-6">
                        <div className="space-y-2 sm:space-y-3">
                          <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Closing Reason</label>
                          <CustomSelect
                            options={[
                              { value: '', label: 'Select Reason' },
                              ...TICKET_CLOSING_REASONS.map(r => ({ value: r, label: r }))
                            ]}
                            value={closingReason}
                            onChange={(val) => setClosingReason(val as any)}
                          />
                        </div>
                        <div className="space-y-2 sm:space-y-3">
                          <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Admin/Support Remarks</label>
                          <textarea 
                            value={adminDescription}
                            onChange={(e) => setAdminDescription(e.target.value)}
                            placeholder="Final notes before closing..."
                            className="w-full p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl sm:rounded-[1.5rem] text-xs sm:text-sm font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none dark:text-zinc-100 min-h-[80px] sm:min-h-[100px] resize-none shadow-inner"
                          />
                        </div>

                        {role === UserRole.ADMIN && compensationType && (
                          <div className="space-y-2 sm:space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] sm:text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Final Compensation Amount (₹)</label>
                              {driverWalletBalance !== null && (
                                <div className="flex items-center gap-2 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                                  <WalletIcon className="w-3 h-3 text-indigo-600" />
                                  <span className="text-[8px] sm:text-[10px] font-black text-indigo-600">Wallet: ₹{driverWalletBalance}</span>
                                </div>
                              )}
                            </div>
                            <div className="relative">
                              <BanknotesIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
                              <input 
                                type="text" 
                                value={adminCompensation === 0 ? '' : adminCompensation}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  setAdminCompensation(val === '' ? 0 : Number(val));
                                }}
                                placeholder="0"
                                className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold focus:ring-4 focus:ring-emerald-500/10 outline-none dark:text-zinc-100 shadow-inner"
                              />
                            </div>
                            {driverWalletBalance !== null && adminCompensation > 0 && (
                              <p className="text-[9px] sm:text-[10px] font-bold text-emerald-600 ml-1">
                                New Balance will be: ₹{driverWalletBalance + adminCompensation}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                        {compensationType ? (
                          <button 
                            onClick={() => setShowConfirmModal({ type: 'compensation', ticketId: showDetailModal.id })}
                            disabled={isSubmitting}
                            className="flex-1 py-4 sm:py-5 bg-indigo-600 text-white rounded-xl sm:rounded-[1.5rem] font-black text-xs sm:text-sm uppercase tracking-[0.2em] hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xl shadow-indigo-500/20"
                          >
                            {isSubmitting ? 'Saving...' : 'Save & Send to Admin'}
                          </button>
                        ) : (
                          <>
                            <button 
                              onClick={() => {
                                if (showDetailModal.status === 'Pending Admin' || role === UserRole.ADMIN) {
                                  setShowConfirmModal({ type: 'close', ticketId: showDetailModal.id });
                                } else {
                                  closeWithoutCompensation(showDetailModal.id);
                                }
                              }}
                              disabled={isSubmitting || !closingReason}
                              className="flex-1 py-4 sm:py-5 bg-emerald-600 text-white rounded-xl sm:rounded-[1.5rem] font-black text-xs sm:text-sm uppercase tracking-[0.2em] hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-xl shadow-emerald-500/20"
                            >
                              {isSubmitting ? 'Closing...' : 'Close Ticket'}
                            </button>
                            {showDetailModal.status === 'Open' && (
                              <button 
                                onClick={() => setShowDetailModal(null)}
                                className="flex-1 py-4 sm:py-5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl sm:rounded-[1.5rem] font-black text-xs sm:text-sm uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all"
                              >
                                Just Save Notes
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 sm:p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-300">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 mb-5 mx-auto">
              <ExclamationCircleIcon className="w-8 h-8 sm:w-9 sm:h-9" />
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white text-center mb-2">Are you sure?</h3>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 text-center mb-6 sm:mb-8 font-bold leading-relaxed">
              {showConfirmModal.type === 'close' ? 'This will officially close the ticket and notify the driver.' : 
               showConfirmModal.type === 'compensation' ? 'This will send the compensation request to the Admin for final approval.' :
               'This will notify the support team that technical work is complete.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => setShowConfirmModal(null)}
                className="flex-1 py-3 sm:py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all order-2 sm:order-1"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (showConfirmModal.type === 'close') finalClose(showConfirmModal.ticketId);
                  else if (showConfirmModal.type === 'compensation') saveCompensation(showConfirmModal.ticketId);
                  else if (showConfirmModal.type === 'initiate') initiateClose(showConfirmModal.ticketId);
                }}
                className="flex-1 py-3 sm:py-4 bg-indigo-600 text-white rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 order-1 sm:order-2"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Ticket Modal */}
      {isEditModalOpen && editingTicket && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-black text-zinc-900 dark:text-white">Edit Ticket</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                <CustomSelect
                  options={CATEGORIES.map(c => ({ value: c.label, label: c.label }))}
                  value={editingTicket.category}
                  onChange={(val) => setEditingTicket({...editingTicket, category: val, subCategory: ''})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Sub Category</label>
                <CustomSelect
                  options={(CATEGORIES.find(c => c.label === editingTicket.category)?.subCategories || []).map(s => ({ value: s, label: s }))}
                  value={editingTicket.subCategory || ''}
                  onChange={(val) => setEditingTicket({...editingTicket, subCategory: val})}
                  disabled={!editingTicket.category}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Issue Description</label>
                <textarea 
                  value={editingTicket.message || ''}
                  onChange={(e) => setEditingTicket({...editingTicket, message: e.target.value})}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white min-h-[100px]"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl font-bold text-sm hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveEditedTicket}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none flex items-center justify-center"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Ticket Confirmation Modal */}
      {isDeleteModalOpen && ticketToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <TrashIcon className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Delete Ticket?</h3>
              <p className="text-zinc-500 text-sm font-medium mb-8">
                Are you sure you want to delete this ticket? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl font-bold text-sm hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteTicket}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none flex items-center justify-center"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketsPage;
