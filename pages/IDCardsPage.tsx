import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  IdentificationIcon, 
  MagnifyingGlassIcon, 
  ArrowRightCircleIcon, 
  CheckCircleIcon, 
  UserCircleIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  XCircleIcon,
  TrashIcon,
  BoltIcon,
  BoltSlashIcon,
  ClockIcon, 
  ExclamationTriangleIcon,
  BellIcon,
  KeyIcon,
  ArrowLeftIcon,
  XMarkIcon,
  InboxIcon,
  ChatBubbleLeftRightIcon,
  AdjustmentsHorizontalIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc, 
  addDoc, 
  query, 
  where, 
  Firestore,
  getDocs,
  orderBy,
  deleteDoc,
  limit,
  startAfter,
  getCountFromServer,
  QueryDocumentSnapshot,
  DocumentData,
  or,
  and
} from 'firebase/firestore';
import { Driver, DriverMasterRecord, UserRole, IDCardHandoverRequest, Station, UserMessage } from '../types';
import { OperationType, handleFirestoreError } from '../lib/firebase';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'motion/react';
import PaginationFooter from '../components/PaginationFooter';
import CustomSelect from '../components/CustomSelect';

interface IDCardsPageProps {
  isDarkMode: boolean;
  db: Firestore;
  user: {
    email: string;
    displayName: string | null;
  };
  userName: string;
  role: UserRole;
}

const IDCardsPage: React.FC<IDCardsPageProps> = ({ isDarkMode, db, user, userName, role }) => {
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [masterRecords, setMasterRecords] = useState<Record<string, DriverMasterRecord>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Generated' | 'In Transit' | 'Delivered'>('All');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState(0);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [pageHistory, setPageHistory] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([]);

  // Generation Modal State (Admin Only)
  const [showGenModal, setShowGenModal] = useState(false);
  const [genSearchId, setGenSearchId] = useState('');
  const [foundDriver, setFoundDriver] = useState<Driver | null>(null);
  const [isSearchingDriver, setIsSearchingDriver] = useState(false);
  const [genModalError, setGenModalError] = useState('');
  const [genStep, setGenStep] = useState<'search' | 'confirm'>('search');

  // Handover State
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Driver | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [users, setUsers] = useState<{ email: string; name: string; roles: UserRole[] }[]>([]);
  const [generatedPin, setGeneratedPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pinError, setPinError] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Bulk Handover State
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkStage, setBulkStage] = useState<'recipient' | 'scanning' | 'pin'>('recipient');
  const [bulkRecipient, setBulkRecipient] = useState('');
  const [scannedIds, setScannedIds] = useState<string[]>([]);
  const [bulkPin, setBulkPin] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [bulkError, setBulkError] = useState('');
  
  // Scanner State
  const [showScanner, setShowScanner] = useState<any>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);

  const [handovers, setHandovers] = useState<IDCardHandoverRequest[]>([]);
  const [activeHandover, setActiveHandover] = useState<IDCardHandoverRequest | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  // Delivery State
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  const [stations, setStations] = useState<Station[]>([]);
  const [dateFilter, setDateFilter] = useState<'Today' | 'Yesterday' | 'Last 7 Days' | 'This Month' | 'Last 30 Days' | 'All'>('All');
  const [stationFilter, setStationFilter] = useState('All');
  
  // Handover State refinements
  const [recipientCategory, setRecipientCategory] = useState<'Marketing' | 'Technician' | 'Operator' | 'Other'>('Other');
  const [targetStationId, setTargetStationId] = useState('');
  const [handoverStep, setHandoverStep] = useState<'select' | 'verify'>('select');
  const [pinVerificationError, setPinVerificationError] = useState('');

  const fetchIDCards = useCallback(async (isInitial = false) => {
    setLoading(true);
    try {
      let conditions: any[] = [];
      
      // Strict server-side status filter
      if (statusFilter === 'All') {
        conditions.push(where("id_card.status", "in", ["Generated", "In Transit", "Delivered"]));
      } else {
        conditions.push(where("id_card.status", "==", statusFilter));
      }

      if (stationFilter !== 'All') conditions.push(where("id_card.station_id", "==", stationFilter));
      if (dateFilter !== 'All') {
        const now = new Date();
        const startOfToday = new Date(now.setHours(0,0,0,0));
        let startDate = startOfToday;
        if (dateFilter === 'Yesterday') startDate.setDate(startDate.getDate() - 1);
        else if (dateFilter === 'Last 7 Days') startDate.setDate(startDate.getDate() - 7);
        else if (dateFilter === 'Last 30 Days') startDate.setDate(startDate.getDate() - 30);
        else if (dateFilter === 'This Month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        conditions.push(where("id_card.last_updated_at", ">=", startDate.toISOString()));
      }

      const masterRef = collection(db, "drivers_master");
      
      try {
        const countQuery = query(masterRef, ...conditions);
        const countSnap = await getCountFromServer(countQuery);
        setTotalDatabaseCount(countSnap.data().count);

        // Attempt optimized server-side sorting
        let dataQ = query(masterRef, ...conditions, orderBy("id_card.last_updated_at", "desc"), limit(itemsPerPage));
        
        if (!isInitial && currentPage > 1 && pageHistory[currentPage - 2]) {
          dataQ = query(dataQ, startAfter(pageHistory[currentPage - 2]));
        }

        const snap = await getDocs(dataQ);
        const docCount = snap.docs.length;
        
        if (docCount > 0) {
          setLastVisible(snap.docs[docCount - 1]);
        } else {
          setLastVisible(null);
        }

        const masterDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as any));
        const ids = masterDocs.map(d => d.id);
        
        if (ids.length > 0) {
          const driversData: Driver[] = [];
          for (let i = 0; i < ids.length; i += 30) {
            const chunk = ids.slice(i, i + 30);
            const driversSnap = await getDocs(query(collection(db, "drivers"), where("driver_id", "in", chunk)));
            driversData.push(...driversSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Driver)));
          }
          
          const sortedDrivers = ids.map(id => driversData.find(d => d.driver_id === id)).filter(Boolean) as Driver[];
          setAllDrivers(sortedDrivers);
        } else {
          setAllDrivers([]);
        }

        const masterMap: Record<string, DriverMasterRecord> = {};
        masterDocs.forEach(d => masterMap[d.id] = d as DriverMasterRecord);
        setMasterRecords(masterMap);
      } catch (innerErr: any) {
        // Fallback for missing composite index (silent fallback to ensure app remains functional)
        if (innerErr.message?.includes('index') || innerErr.code === 'failed-precondition') {
          // Fetch broader set with only basic equality filters and sort on client
          const baseConditions = [];
          if (statusFilter !== 'All') {
             baseConditions.push(where("id_card.status", "==", statusFilter));
          } else {
             baseConditions.push(where("id_card.status", "in", ["Generated", "In Transit", "Delivered"]));
          }
          
          const fallbackQ = query(masterRef, ...baseConditions, limit(300));
          const snap = await getDocs(fallbackQ);
          let masterDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as any));
          
          // Apply other filters in-memory
          if (stationFilter !== 'All') masterDocs = masterDocs.filter(d => d.id_card?.station_id === stationFilter);
          if (dateFilter !== 'All') {
            const now = new Date();
            const startOfToday = new Date(now.setHours(0,0,0,0));
            masterDocs = masterDocs.filter(d => {
              if (!d.id_card?.last_updated_at) return false;
              return new Date(d.id_card.last_updated_at) >= startOfToday;
            });
          }

          // Client-side sort by date
          masterDocs.sort((a, b) => {
            const dateA = a.id_card?.last_updated_at ? new Date(a.id_card.last_updated_at).getTime() : 0;
            const dateB = b.id_card?.last_updated_at ? new Date(b.id_card.last_updated_at).getTime() : 0;
            return dateB - dateA;
          });

          setTotalDatabaseCount(masterDocs.length);
          
          // Manual pagination
          const startIndex = (currentPage - 1) * itemsPerPage;
          const paginatedDocs = masterDocs.slice(startIndex, startIndex + itemsPerPage);

          const ids = paginatedDocs.map((d: any) => d.id);
          if (ids.length > 0) {
            const driversData: Driver[] = [];
            for (let i = 0; i < ids.length; i += 30) {
              const chunk = ids.slice(i, i + 30);
              const driversSnap = await getDocs(query(collection(db, "drivers"), where("driver_id", "in", chunk)));
              driversData.push(...driversSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Driver)));
            }
            setAllDrivers(ids.map((id: string) => driversData.find(d => d.driver_id === id)).filter(Boolean) as Driver[]);
          } else {
            setAllDrivers([]);
          }
          const masterMap: Record<string, DriverMasterRecord> = {};
          paginatedDocs.forEach((d: any) => masterMap[d.id] = d as DriverMasterRecord);
          setMasterRecords(masterMap);
        } else {
          throw innerErr;
        }
      }
    } catch (err) {
      console.error("Error fetching ID cards server-side:", err);
    } finally {
      setLoading(false);
    }
  }, [db, statusFilter, dateFilter, stationFilter, itemsPerPage, currentPage, pageHistory]);

  useEffect(() => {
    fetchIDCards(currentPage === 1);
  }, [currentPage, statusFilter, dateFilter, stationFilter, itemsPerPage, fetchIDCards]);

  // Pagination history logic is now handled in handlePageChange

  const handlePageChange = (page: number) => {
    if (page === 1) {
      setPageHistory([]);
      setLastVisible(null);
    } else if (page > currentPage) {
      // Record the current lastVisible as the pointer for the page we are leaving
      setPageHistory(prev => {
        const next = [...prev];
        next[currentPage - 1] = lastVisible;
        return next;
      });
    }
    setCurrentPage(page);
  };

  useEffect(() => {
    // metadata fetching
    const fetchStations = async () => {
      const snap = await getDocs(collection(db, "swap_stations"));
      setStations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Station)));
    };
    fetchStations();

    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      setUsers(snap.docs.map(d => {
        const data = d.data();
        return { 
          email: d.id, 
          name: data.name || d.id,
          roles: data.roles || (data.role ? [data.role] : [])
        };
      }));
    };
    fetchUsers();

    const unsubHandovers = onSnapshot(collection(db, "id_card_handovers"), (snap) => {
      setHandovers(snap.docs.map(d => ({ id: d.id, ...d.data() } as IDCardHandoverRequest)));
    }, (err) => console.error("Handovers listener error:", err));

    return () => { unsubHandovers(); };
  }, [db]);

  const filteredAndPaginated = useMemo(() => {
    // Note: since we use server-side pagination, filtered here is mostly for the search bar
    // on the ALREADY fetched items for this page.
    const filtered = (allDrivers as any[]).filter(d => {
      const matchesSearch = !searchQuery || 
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        d.driver_id.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesSearch;
    });

    return {
      cards: filtered,
      total: totalDatabaseCount
    };
  }, [allDrivers, searchQuery, totalDatabaseCount]);

  const drivers_to_show = filteredAndPaginated.cards;
  const totalCount = filteredAndPaginated.total;

  // QR Scanning Logic
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let isStarted = false;

    if (showScanner && bulkStage === 'scanning') {
      scanner = new Html5Qrcode("reader");
      html5QrCodeRef.current = scanner;
      
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (isProcessingScan) return;
          const scannedId = decodedText.trim();
          if (scannedIds.includes(scannedId)) return;
          
          setIsProcessingScan(true);
          setLastScannedId(scannedId);
          setScannedIds(prev => [...prev, scannedId]);
          // We use a safe try-catch for pause as it can also fail if the scanner state is transitionary
          try {
            html5QrCodeRef.current?.pause(true);
          } catch (e) {
            console.warn("Scanner pause error:", e);
          }
        },
        () => {} // silent error callback
      ).then(() => {
        isStarted = true;
      }).catch(err => {
        console.error("Scanner start error:", err);
        setScannerError(typeof err === 'string' ? err : "Failed to start camera");
        isStarted = false;
      });

      return () => {
        const cleanupScanner = async () => {
          if (scanner) {
            try {
              // Only stop if it's started and not already stopping
              if (isStarted) {
                await scanner.stop();
              }
            } catch (e) {
              // Ignore "Cannot stop" errors during cleanup as the instance is being destroyed anyway
              console.log("Scanner cleanup notice:", e);
            } finally {
              html5QrCodeRef.current = null;
            }
          }
        };
        cleanupScanner();
      };
    }
  }, [showScanner, bulkStage]);

  const toggleTorch = async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = !isTorchOn;
        await (html5QrCodeRef.current as any).applyVideoConstraints({
          advanced: [{ torch: state }]
        });
        setIsTorchOn(state);
      } catch (e) {
        console.error("Torch error:", e);
      }
    }
  };

  const generateBulkPin = async () => {
    if (scannedIds.length === 0 || !bulkRecipient) return;
    setIsSubmitting(true);
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setBulkPin(pin);
    setBulkStage('pin');
    setTimeLeft(60);
    setIsSubmitting(false);
  };

  const handleVerifyBulkPin = async () => {
    if (enteredPin !== bulkPin) {
      setBulkError("Invalid PIN code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const recipient = users.find(u => u.email === bulkRecipient);
      const handoverData = {
        cardIds: scannedIds,
        fromId: user.email,
        fromName: userName || user.displayName || user.email.split('@')[0],
        toId: bulkRecipient,
        toName: recipient?.name || bulkRecipient.split('@')[0],
        pin: bulkPin,
        status: 'Completed',
        timestamp: new Date().toISOString()
      };

      // 1. Log Handover
      await addDoc(collection(db, "id_card_handovers"), handoverData);

      // 2. Update Master Records for all scanned IDs
      for (const driverId of scannedIds) {
        await setDoc(doc(db, "drivers_master", driverId), {
          id_card: {
            current_holder_id: handoverData.toId,
            current_holder_name: handoverData.toName,
            status: "In Transit",
            last_updated_at: new Date().toISOString()
          }
        }, { merge: true });
      }

      setBulkMode(false);
      setBulkStage('recipient');
      setScannedIds([]);
      setBulkPin('');
      setEnteredPin('');
      setBulkError('');
    } catch (err) {
      console.error("Error completing bulk handover:", err);
      setBulkError("Failed to complete handover.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueScanning = () => {
    setLastScannedId(null);
    setIsProcessingScan(false);
    html5QrCodeRef.current?.resume();
  };

  const handleSearchDriverForGen = async () => {
    if (!genSearchId.trim()) return;
    setIsSearchingDriver(true);
    setGenModalError('');
    setFoundDriver(null);
    try {
      const q = query(collection(db, "drivers"), where("driver_id", "==", genSearchId.trim()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setGenModalError("Driver not found in system.");
      } else {
        const dr = { id: snap.docs[0].id, ...snap.docs[0].data() } as Driver;
        // Check if already in master and card status
        const masterSnap = await getDocs(query(collection(db, "drivers_master"), where("id", "==", dr.driver_id)));
        if (!masterSnap.empty) {
          const masterData = masterSnap.docs[0].data() as DriverMasterRecord;
          if (masterData.id_card?.status !== 'Not Generated' && masterData.id_card?.status) {
            setGenModalError(`ID Card already exists for this driver (Status: ${masterData.id_card.status}).`);
            return;
          }
        }
        setFoundDriver(dr);
        setGenStep('confirm');
      }
    } catch (err) {
      console.error("Error searching driver:", err);
      setGenModalError("An error occurred while searching.");
    } finally {
      setIsSearchingDriver(false);
    }
  };

  const handleGenerateModalSubmit = async () => {
    if (!foundDriver) return;
    setIsSubmitting(true);
    try {
      await setDoc(doc(db, "drivers_master", foundDriver.driver_id), {
        id: foundDriver.driver_id,
        id_card: {
          generated: true,
          status: "Generated",
          current_holder_id: user.email,
          current_holder_name: userName || user.displayName || user.email.split('@')[0],
          last_updated_at: new Date().toISOString()
        }
      }, { merge: true });
      
      setShowGenModal(false);
      setGenSearchId('');
      setFoundDriver(null);
      setGenStep('search');
      fetchIDCards(true);
    } catch (err) {
      console.error("Error generating card:", err);
      setGenModalError("Failed to generate ID card.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateCard = async (driverId: string) => {
    try {
      await setDoc(doc(db, "drivers_master", driverId), {
        id_card: {
          generated: true,
          status: "Generated",
          current_holder_id: user.email,
          current_holder_name: userName || user.displayName || user.email.split('@')[0],
          last_updated_at: new Date().toISOString()
        }
      }, { merge: true });
    } catch (err) {
      console.error("Error generating card:", err);
    }
  };

  const initiateHandover = (driver: Driver) => {
    setSelectedCard(driver);
    setShowHandoverModal(true);
    setHandoverStep('select');
    setEnteredPin('');
    setPinVerificationError('');
    setGeneratedPin(Math.floor(1000 + Math.random() * 9000).toString());
  };

  const confirmHandoverRequest = async () => {
    if (!selectedCard || !recipientEmail) return;
    setIsSubmitting(true);
    try {
      const recipient = users.find(u => u.email === recipientEmail);
      const isOperator = recipient?.roles.includes(UserRole.OPERATOR);
      
      const request: Omit<IDCardHandoverRequest, 'id'> = {
        cardIds: [selectedCard.driver_id],
        fromId: user.email,
        fromName: userName || user.displayName || user.email.split('@')[0],
        toId: recipientEmail,
        toName: recipient?.name || recipientEmail.split('@')[0],
        pin: generatedPin,
        status: 'Pending',
        executiveType: isOperator ? 'Operator' : 'Other',
        stationId: (isOperator && targetStationId) ? targetStationId : undefined,
        timestamp: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, "id_card_handovers"), request);
      setActiveHandover({ id: docRef.id, ...request } as IDCardHandoverRequest);

      // Create message for the recipient
      await addDoc(collection(db, "user_messages"), {
        toId: recipientEmail,
        fromId: user.email,
        fromName: userName || user.displayName || user.email.split('@')[0],
        title: "ID Card Handover Verification Code",
        body: `You have an incoming ID card handover for ${selectedCard.name}. Please provide this verification code to ${userName}: ${generatedPin}.`,
        type: 'HandoverCode',
        relatedId: docRef.id,
        code: generatedPin,
        stationId: (isOperator && targetStationId) ? targetStationId : undefined,
        stationName: (isOperator && targetStationId) ? stations.find(s => s.id === targetStationId)?.name : undefined,
        read: false,
        timestamp: new Date().toISOString()
      });

      setHandoverStep('verify');
    } catch (err) {
      console.error("Error creating handover request:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyAndCompleteHandover = async () => {
    if (!activeHandover || enteredPin !== activeHandover.pin) {
      setPinVerificationError("Incorrect code. Please check with the recipient.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Update Handover Request
      await updateDoc(doc(db, "id_card_handovers", activeHandover.id), {
        status: 'Completed'
      });

      // 2. Update Master Record
      await setDoc(doc(db, "drivers_master", selectedCard!.driver_id), {
        id_card: {
          current_holder_id: activeHandover.toId,
          current_holder_name: activeHandover.toName,
          status: "In Transit",
          last_updated_at: new Date().toISOString(),
          station_id: activeHandover.stationId || null
        }
      }, { merge: true });

      setShowHandoverModal(false);
      setSelectedCard(null);
      setRecipientEmail('');
      setRecipientCategory('Other');
      setTargetStationId('');
      setHandoverStep('select');
      setActiveHandover(null);
      setEnteredPin('');
    } catch (err) {
      console.error("Error completing handover:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeliverToDriver = async (driverId: string) => {
    try {
      await setDoc(doc(db, "drivers_master", driverId), {
        id_card: {
          delivered: true,
          status: "Delivered",
          current_holder_id: "Driver",
          current_holder_name: "Driver",
          last_updated_at: new Date().toISOString(),
          station_id: null // Clear station on delivery
        }
      }, { merge: true });
      setShowDeliveryModal(false);
      setSelectedCard(null);
    } catch (err) {
      console.error("Error delivering card:", err);
    }
  };

  const myIncomingHandovers = handovers.filter(h => h.toId === user.email && h.status === 'Pending');

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)] animate-in fade-in duration-500">
      <div className="flex-1 space-y-8 pb-12">
        {/* Search & Header UI */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold font-heading text-slate-900 dark:text-white">ID Card Tracking</h2>
            <p className="font-semibold text-gray-400 dark:text-slate-400 text-sm">Manage lifecycle and handovers of driver ID cards</p>
          </div>
          <div className="flex gap-2">
            {role === UserRole.ADMIN && (
              <>
                <button 
                  onClick={() => {
                    setShowGenModal(true);
                    setGenStep('search');
                    setGenSearchId('');
                    setFoundDriver(null);
                    setGenModalError('');
                  }}
                  className="flex items-center justify-center gap-2 h-11 px-6 rounded-2xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-lg active:scale-95 shrink-0"
                >
                  <IdentificationIcon className="w-5 h-5" /> Generate ID Card
                </button>
                <button 
                  onClick={() => setBulkMode(true)}
                  className="flex items-center justify-center gap-2 h-11 px-6 rounded-2xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-lg active:scale-95 shrink-0"
                >
                  <QrCodeIcon className="w-5 h-5" /> Bulk Handover
                </button>
              </>
            )}
          </div>
        </div>

        {/* Updated Search & Filter UI (Inline for Desktop) */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full bg-white dark:bg-zinc-900/50 p-2 rounded-[2rem] border border-zinc-100 dark:border-zinc-800">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search in current page..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-transparent border-none text-sm font-bold outline-none font-body"
            />
          </div>
          
          <div className="hidden md:flex items-center gap-4 pr-2">
            <div className="w-40">
              <CustomSelect
                options={['All', 'Generated', 'In Transit', 'Delivered'].map(s => ({ value: s, label: s }))}
                value={statusFilter}
                onChange={(val) => { setStatusFilter(val as any); handlePageChange(1); }}
                className="!h-10 !rounded-xl !bg-zinc-50 dark:!bg-zinc-800"
              />
            </div>
            <div className="w-40">
              <CustomSelect
                options={[
                  { value: 'Today', label: 'Today' },
                  { value: 'Yesterday', label: 'Yesterday' },
                  { value: 'Last 7 Days', label: 'Last 7 Days' },
                  { value: 'This Month', label: 'This Month' },
                  { value: 'Last 30 Days', label: 'Last 30 Days' },
                  { value: 'All', label: 'All Time' }
                ]}
                value={dateFilter}
                onChange={(val) => { setDateFilter(val as any); handlePageChange(1); }}
                className="!h-10 !rounded-xl !bg-zinc-50 dark:!bg-zinc-800"
              />
            </div>
            <div className="w-48">
              <CustomSelect
                options={[{ value: 'All', label: 'All Stations' }, ...stations.map(s => ({ value: s.id, label: s.name }))]}
                value={stationFilter}
                onChange={(val) => { setStationFilter(val); handlePageChange(1); }}
                searchable
                className="!h-10 !rounded-xl !bg-zinc-50 dark:!bg-zinc-800"
              />
            </div>
          </div>

          <button 
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className={`md:hidden flex items-center justify-center h-[44px] px-6 rounded-xl font-bold transition-all border shrink-0 mx-2 mb-2 ${
              isFiltersOpen 
                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-indigo-600' 
                : 'bg-zinc-50 dark:bg-zinc-800 border-transparent text-zinc-500'
            }`}
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5 mr-2" />
            <span>Filters</span>
          </button>
        </div>

        {/* Mobile Filter Drawer */}
        <AnimatePresence>
          {isFiltersOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 p-6 space-y-4"
            >
              <CustomSelect
                label="Status"
                options={['All', 'Generated', 'In Transit', 'Delivered'].map(s => ({ value: s, label: s }))}
                value={statusFilter}
                onChange={(val) => { setStatusFilter(val as any); handlePageChange(1); }}
              />
              <CustomSelect
                label="Date Range"
                options={[
                  { value: 'Today', label: 'Today' },
                  { value: 'Yesterday', label: 'Yesterday' },
                  { value: 'Last 7 Days', label: 'Last 7 Days' },
                  { value: 'This Month', label: 'This Month' },
                  { value: 'Last 30 Days', label: 'Last 30 Days' },
                  { value: 'All', label: 'All Time' }
                ]}
                value={dateFilter}
                onChange={(val) => { setDateFilter(val as any); handlePageChange(1); }}
              />
              <CustomSelect
                label="Station"
                options={[{ value: 'All', label: 'All Stations' }, ...stations.map(s => ({ value: s.id, label: s.name }))]}
                value={stationFilter}
                onChange={(val) => { setStationFilter(val); handlePageChange(1); }}
                searchable
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {drivers_to_show.map(driver => {
            const master = masterRecords[driver.driver_id];
            const status = master?.id_card?.status || 'Not Generated';
            const holder = master?.id_card?.current_holder_name || 'N/A';
            const stationId = master?.id_card?.station_id;
            const stationName = stations.find(s => s.id === stationId)?.name || '';
            
            return (
              <div key={driver.driver_id} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 p-6 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-16 h-20 rounded-xl overflow-hidden border-2 flex items-center justify-center transition-all bg-zinc-50 dark:bg-zinc-800 ${master?.id_card?.photo_url ? 'border-zinc-100 dark:border-zinc-800' : 'border-dashed border-zinc-200 dark:border-zinc-700'}`}>
                    {master?.id_card?.photo_url ? (
                      <img src={master.id_card.photo_url} alt={driver.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <IdentificationIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">{driver.name}</h3>
                      <button onClick={(e) => { e.stopPropagation(); setShowScanner({ type: 'view', driverId: driver.driver_id }); }} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors text-zinc-400">
                        <QrCodeIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{driver.driver_id}</p>
                    <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                      status === 'Delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' :
                      status === 'In Transit' ? 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' :
                      status === 'Generated' ? 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800' :
                      'bg-zinc-50 text-zinc-400 border-zinc-100 dark:bg-zinc-900/30'
                    }`}>
                      <div className={`w-1 h-1 rounded-full ${status !== 'Not Generated' ? 'animate-pulse bg-current' : 'bg-transparent'}`} />
                      {status}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-zinc-50 dark:border-zinc-800/50">
                  <div className="flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/30 p-2.5 rounded-xl border border-zinc-50 dark:border-zinc-800/50">
                    <div>
                      <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Station</p>
                      <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 truncate max-w-[80px]">{stationName || 'Holding'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Current Holder</p>
                      <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[90px]">{holder === user.email ? 'You' : holder}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-50 dark:border-zinc-800">
                  {(status === 'Generated' || status === 'In Transit') && master?.id_card?.current_holder_id === user.email && (
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => initiateHandover(driver)}
                        className="py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all flex items-center justify-center gap-1.5"
                      >
                        <ArrowRightCircleIcon className="w-4 h-4" /> Handover
                      </button>
                      <button 
                        onClick={() => { setSelectedCard(driver); setShowDeliveryModal(true); }}
                        className="py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
                      >
                        <CheckCircleIcon className="w-4 h-4" /> Deliver
                      </button>
                    </div>
                  )}
                  {status === 'Delivered' && (
                    <div className="flex items-center justify-center gap-2 text-emerald-500">
                      <CheckCircleIcon className="w-5 h-5" />
                      <span className="text-xs font-bold">Delivered to Driver</span>
                    </div>
                  )}
                  {(status === 'Generated' || status === 'In Transit') && master?.id_card?.current_holder_id !== user.email && (
                    <p className="text-center text-[10px] font-bold text-zinc-400 italic">Held by {holder}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generation Modal (Admin Only) */}
      <AnimatePresence>
        {showGenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowGenModal(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <IdentificationIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Generate ID Card</h3>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest leading-none mt-1">Issue new card to driver</p>
                    </div>
                  </div>
                  <button onClick={() => setShowGenModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <XMarkIcon className="w-6 h-6 text-zinc-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  {genStep === 'search' ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                        <input 
                          type="text" 
                          placeholder="ENTER DRIVER ID (e.g. EV24001)"
                          value={genSearchId}
                          onChange={(e) => setGenSearchId(e.target.value.toUpperCase())}
                          className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm font-bold uppercase tracking-widest focus:border-emerald-500 outline-none transition-all"
                        />
                      </div>
                      {genModalError && (
                        <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400">
                          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                          <p className="text-xs font-bold">{genModalError}</p>
                        </div>
                      )}
                      <button 
                        onClick={handleSearchDriverForGen}
                        disabled={isSearchingDriver || !genSearchId.trim()}
                        className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-2xl font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {isSearchingDriver ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <MagnifyingGlassIcon className="w-5 h-5" />}
                        Search Driver
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-3xl flex items-center gap-6">
                        <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-800 flex items-center justify-center border-2 border-emerald-100 dark:border-emerald-800 shrink-0">
                          <UserCircleIcon className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-lg font-black text-zinc-900 dark:text-white truncate uppercase tracking-tight">{foundDriver?.name}</h4>
                          <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest leading-none mt-1">{foundDriver?.driver_id}</p>
                          <div className="flex items-center gap-4 mt-3">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">Phone</span>
                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{foundDriver?.phone}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">City</span>
                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{foundDriver?.city}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <button 
                          onClick={() => { setGenStep('search'); setFoundDriver(null); }}
                          className="flex-1 py-4 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-2xl font-black uppercase tracking-widest hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all border border-zinc-100 dark:border-zinc-700"
                        >
                          Back
                        </button>
                        <button 
                          onClick={handleGenerateModalSubmit}
                          disabled={isSubmitting}
                          className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <IdentificationIcon className="w-5 h-5" />}
                          Confirm & Generate
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="mt-auto sticky bottom-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-800 py-6 -mx-4 px-4 sm:-mx-8 sm:px-8">
        <PaginationFooter 
          currentPage={currentPage}
          totalPages={Math.ceil(totalDatabaseCount / itemsPerPage)}
          onPageChange={handlePageChange}
          onItemsPerPageChange={(val) => {
            setItemsPerPage(val);
            handlePageChange(1);
          }}
          dataLength={totalDatabaseCount}
          itemsPerPage={itemsPerPage}
        />
      </div>

      {/* Bulk Handover Modal */}
      {bulkMode && (
        <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[95vh] overflow-y-auto scrollbar-hide">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                {bulkStage !== 'recipient' && (
                  <button 
                    onClick={() => {
                      if (bulkStage === 'pin') {
                        setBulkStage('scanning');
                      } else {
                        setBulkStage('recipient');
                      }
                      setBulkError('');
                    }}
                    className="w-10 h-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    <ArrowLeftIcon className="w-5 h-5" />
                  </button>
                )}
                <h3 className="text-2xl font-bold font-heading text-zinc-900 dark:text-white">Bulk Handover</h3>
              </div>
              <button 
                onClick={() => {
                  setBulkMode(false);
                  setBulkStage('recipient');
                  setScannedIds([]);
                  setShowScanner(false);
                  setIsProcessingScan(false);
                  setLastScannedId(null);
                }} 
                className="w-10 h-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Stage 1 & 2: Recipient & Scanning UI */}
              {(bulkStage === 'recipient' || bulkStage === 'scanning') && (
                <>
                  {/* Scanner at Top */}
                  <div className="relative aspect-square w-full max-w-[320px] mx-auto bg-zinc-100 dark:bg-zinc-800 rounded-[2.5rem] overflow-hidden border-2 border-dashed border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center shadow-inner">
                    {scannerError ? (
                      <div className="text-center p-6">
                        <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <p className="text-sm font-bold text-red-500 mb-4">{scannerError}</p>
                        <button 
                          onClick={() => { setScannerError(null); setShowScanner(false); setTimeout(() => setShowScanner(true), 100); }}
                          className="px-6 py-2 bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold shadow-sm border border-zinc-100 dark:border-zinc-800"
                        >
                          Try Again
                        </button>
                      </div>
                    ) : showScanner && bulkStage === 'scanning' ? (
                      <>
                        <div id="reader" className="w-full h-full"></div>
                        <div className="absolute top-4 right-4 z-10">
                          <button 
                            onClick={toggleTorch}
                            className={`p-3 rounded-full backdrop-blur-md transition-all ${isTorchOn ? 'bg-amber-400 text-white' : 'bg-black/40 text-white'}`}
                          >
                            {isTorchOn ? <BoltSlashIcon className="w-5 h-5" /> : <BoltIcon className="w-5 h-5" />}
                          </button>
                        </div>
                        {/* Scanning Overlay */}
                        <div className="absolute inset-0 pointer-events-none z-10">
                          <div className="w-full h-full relative">
                            <div className="absolute top-0 w-full h-1 bg-indigo-500/80 shadow-[0_0_20px_rgba(99,102,241,1)] animate-scan"></div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-6">
                        <QrCodeIcon className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
                        <p className="text-sm font-bold text-zinc-500 mb-4">
                          {bulkStage === 'scanning' ? 'Camera Scanner' : 'Select Recipient First'}
                        </p>
                        {bulkStage === 'scanning' && !showScanner && (
                          <button 
                            onClick={() => setShowScanner(true)}
                            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95"
                          >
                            Start Camera
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recipient Selection */}
                  {bulkStage === 'recipient' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                      <CustomSelect 
                        label="Select Recipient"
                        placeholder="Choose Employee..."
                        options={users.filter(u => u.email !== user.email).map(u => ({
                          value: u.email,
                          label: `${u.name} (${u.email})`
                        }))}
                        value={bulkRecipient}
                        onChange={setBulkRecipient}
                        searchable
                      />
                      <button 
                        onClick={() => setBulkStage('scanning')}
                        disabled={!bulkRecipient}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg"
                      >
                        Scan Cards
                      </button>
                    </div>
                  )}

                  {/* Scanned List & Actions */}
                  {bulkStage === 'scanning' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                      <button 
                        onClick={generateBulkPin}
                        disabled={scannedIds.length === 0 || isSubmitting}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-lg transition-all active:scale-95"
                      >
                        {isSubmitting ? 'Generating...' : 'Generate PIN'}
                      </button>

                      <div className="p-5 bg-zinc-50 dark:bg-zinc-950 rounded-[2rem] border border-zinc-100 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-4 px-2">
                          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Scanned Cards</h4>
                          <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">{scannedIds.length}</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-2 scrollbar-hide">
                          {scannedIds.map(id => (
                            <div key={id} className="flex justify-between items-center p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm animate-in slide-in-from-right-2 duration-200">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600">
                                  <IdentificationIcon className="w-4 h-4" />
                                </div>
                                <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{id}</span>
                              </div>
                              <button onClick={() => setScannedIds(prev => prev.filter(i => i !== id))} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all">
                                <TrashIcon className="w-5 h-5" />
                              </button>
                            </div>
                          ))}
                          {scannedIds.length === 0 && (
                            <div className="text-center py-8">
                              <QrCodeIcon className="w-10 h-10 text-zinc-200 mx-auto mb-2" />
                              <p className="text-xs text-zinc-400 font-bold">No cards scanned yet</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Stage 3: PIN Verification */}
              {bulkStage === 'pin' && (
                <div className="space-y-6 animate-in zoom-in-95 duration-300">
                  <div className="p-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/30 text-center shadow-inner">
                    <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-4">Verification PIN</p>
                    <p className="text-5xl font-black tracking-[0.4em] text-indigo-900 dark:text-indigo-100 ml-4">{bulkPin}</p>
                    <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-indigo-400">
                      <ClockIcon className={`w-4 h-4 ${timeLeft < 10 ? 'text-red-500 animate-pulse' : ''}`} />
                      <span className={timeLeft < 10 ? 'text-red-500' : ''}>Expires in {timeLeft}s</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 block ml-2">Enter Recipient's PIN to Confirm</label>
                    <input 
                      type="text" 
                      maxLength={4}
                      placeholder="0000"
                      value={enteredPin}
                      onChange={(e) => { setEnteredPin(e.target.value.replace(/\D/g, '')); setBulkError(''); }}
                      className="w-full px-4 py-5 bg-zinc-50 dark:bg-zinc-950 border-none rounded-[2rem] text-center text-3xl font-black tracking-[0.5em] outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white shadow-inner"
                    />
                  </div>

                  {bulkError && <p className="text-xs font-bold text-red-500 text-center animate-bounce">{bulkError}</p>}

                  <button 
                    onClick={handleVerifyBulkPin}
                    disabled={enteredPin.length < 4 || isSubmitting || timeLeft === 0}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-lg transition-all active:scale-95"
                  >
                    {isSubmitting ? 'Verifying...' : 'Verify & Complete'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan Success Feedback Modal */}
      {lastScannedId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-xs rounded-[2.5rem] p-8 shadow-2xl text-center animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-6">
              <CheckCircleIcon className="w-12 h-12" />
            </div>
            <h4 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Card Scanned!</h4>
            <p className="text-sm font-bold text-zinc-400 mb-8 uppercase tracking-widest">{lastScannedId}</p>
            <button 
              onClick={handleContinueScanning}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
            >
              Continue Scanning
            </button>
          </div>
        </div>
      )}

      {/* Handover Modal */}
      {showHandoverModal && selectedCard && (
        <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">ID Card Handover</h3>
                <p className="text-sm text-zinc-500 font-semibold">Transfer {selectedCard.name}'s card</p>
              </div>
              {handoverStep === 'verify' && (
                <button 
                  onClick={() => setHandoverStep('select')}
                  className="w-10 h-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-600 transition-all"
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {handoverStep === 'select' ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Select Person</label>
                  <CustomSelect 
                    placeholder="Choose Employee..."
                    options={users.filter(u => u.email !== user.email).map(u => ({
                      value: u.email,
                      label: `${u.name} (${u.roles.join(', ')})`
                    }))}
                    value={recipientEmail}
                    onChange={(val) => {
                      setRecipientEmail(val);
                      const recipient = users.find(u => u.email === val);
                      if (!recipient?.roles.includes(UserRole.OPERATOR)) {
                        setTargetStationId('');
                      }
                    }}
                    searchable
                  />
                </div>

                {users.find(u => u.email === recipientEmail)?.roles.includes(UserRole.OPERATOR) && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Select Station</label>
                    <CustomSelect
                      options={stations.map(s => ({ value: s.id, label: s.name }))}
                      value={targetStationId}
                      onChange={setTargetStationId}
                      placeholder="Choose Station..."
                      searchable
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={confirmHandoverRequest}
                    disabled={!recipientEmail || (users.find(u => u.email === recipientEmail)?.roles.includes(UserRole.OPERATOR) && !targetStationId) || isSubmitting}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                  >
                    {isSubmitting ? 'Initiating...' : 'Send Verification Code'}
                  </button>
                  <button 
                    onClick={() => setShowHandoverModal(false)}
                    className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in zoom-in-95 duration-200">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-4">
                    <ShieldCheckIcon className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-zinc-900 dark:text-white">Verify Handover</h4>
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                    Enter the code sent to {activeHandover?.toName}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-center gap-3">
                    {[0, 1, 2, 3].map((i) => (
                      <input
                        key={i}
                        type="text"
                        maxLength={1}
                        value={enteredPin[i] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val) {
                            const newPin = enteredPin.split('');
                            newPin[i] = val;
                            setEnteredPin(newPin.join(''));
                            // Auto focus next
                            if (i < 3) (e.target.nextSibling as HTMLInputElement)?.focus();
                          } else {
                            const newPin = enteredPin.split('');
                            newPin[i] = '';
                            setEnteredPin(newPin.join(''));
                          }
                          setPinVerificationError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !enteredPin[i] && i > 0) {
                            (e.currentTarget.previousSibling as HTMLInputElement)?.focus();
                          }
                        }}
                        className="w-12 h-16 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-center text-2xl font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
                      />
                    ))}
                  </div>
                  {pinVerificationError && (
                    <p className="text-center text-[10px] font-bold text-red-500 animate-bounce">
                      {pinVerificationError}
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={verifyAndCompleteHandover}
                    disabled={enteredPin.length < 4 || isSubmitting}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg active:scale-95"
                  >
                    {isSubmitting ? 'Verifying...' : 'Complete Handover'}
                  </button>
                  <button 
                    onClick={() => setShowHandoverModal(false)}
                    className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-[10px] text-center font-bold text-zinc-400 italic">
                  Ask {activeHandover?.toName} to check their verification inbox for the code.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delivery Confirmation Modal */}
      {showDeliveryModal && selectedCard && (
        <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto mb-6">
              <UserCircleIcon className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold font-heading text-center mb-2 text-zinc-900 dark:text-white">Deliver to Driver</h3>
            <p className="text-sm text-zinc-500 text-center mb-8 font-semibold">Are you sure you are handing over the ID card to the driver?</p>
            
            <div className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 font-bold">
                  {selectedCard.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{selectedCard.name}</p>
                  <p className="text-xs font-bold text-zinc-400">{selectedCard.driver_id}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Phone</span>
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{selectedCard.phone}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => handleDeliverToDriver(selectedCard.driver_id)}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none"
              >
                Yes, Handover to Driver
              </button>
              <button 
                onClick={() => {
                  const msg = `Handed over ID Card to Driver: ${selectedCard.name} (${selectedCard.driver_id})`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                className="w-full py-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all flex items-center justify-center gap-2"
              >
                <PaperAirplaneIcon className="w-5 h-5" /> Share in Group
              </button>
              <button 
                onClick={() => { setShowDeliveryModal(false); setSelectedCard(null); }}
                className="w-full py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default IDCardsPage;
