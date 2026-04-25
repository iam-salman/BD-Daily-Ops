import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  XMarkIcon
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
  orderBy
} from 'firebase/firestore';
import { Driver, DriverMasterRecord, UserRole, IDCardHandoverRequest } from '../types';
import { OperationType, handleFirestoreError } from '../lib/firebase';
import { Html5Qrcode } from 'html5-qrcode';
import PaginationFooter from '../components/PaginationFooter';
import CustomSelect from '../components/CustomSelect';

interface IDCardsPageProps {
  isDarkMode: boolean;
  db: Firestore;
  user: any;
  role: UserRole;
  userName: string;
}

const IDCardsPage: React.FC<IDCardsPageProps> = ({ isDarkMode, db, user, role, userName }) => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [masterRecords, setMasterRecords] = useState<Record<string, DriverMasterRecord>>({});
  const [users, setUsers] = useState<{email: string, name: string, pin?: string}[]>([]);
  const [handovers, setHandovers] = useState<IDCardHandoverRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Not Generated' | 'Generated' | 'In Transit' | 'Delivered'>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Handover State
  const [selectedCard, setSelectedCard] = useState<Driver | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [generatedPin, setGeneratedPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Handover State
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkStage, setBulkStage] = useState<'recipient' | 'scanning' | 'pin'>('recipient');
  const [scannedIds, setScannedIds] = useState<string[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [bulkRecipient, setBulkRecipient] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [bulkPin, setBulkPin] = useState('');
  const [bulkPinExpiresAt, setBulkPinExpiresAt] = useState<number | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);

  // PIN Verification State
  const [showPinModal, setShowPinModal] = useState(false);
  const [activeHandover, setActiveHandover] = useState<IDCardHandoverRequest | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Delivery State
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  const fetchIDCards = async () => {
    setLoading(true);
    try {
      const driversRef = collection(db, 'drivers');
      const q = query(driversRef, orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      
      let driversData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver));

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        driversData = driversData.filter(d => 
          d.name.toLowerCase().includes(q) || 
          (d.driver_id || d.id)?.toLowerCase().includes(q)
        );
      }

      setTotalDatabaseCount(driversData.length);
      const totalPagesCount = Math.ceil(driversData.length / itemsPerPage);
      
      const startIndex = (currentPage - 1) * itemsPerPage;
      const paginatedData = driversData.slice(startIndex, startIndex + itemsPerPage);

      setDrivers(paginatedData);
      setHasMore(currentPage < totalPagesCount);
    } catch (err) {
      console.error("Error fetching ID cards:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIDCards();
  }, [currentPage, searchQuery]);

  useEffect(() => {
    // 1. Fetch Master Records
    const unsubMaster = onSnapshot(collection(db, "drivers_master"), (snap) => {
      const records: Record<string, DriverMasterRecord> = {};
      snap.docs.forEach(d => {
        records[d.id] = d.data() as DriverMasterRecord;
      });
      setMasterRecords(records);
      setLoading(false);
    });

    // 3. Fetch Users for Handover
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      setUsers(snap.docs.map(d => ({ 
        email: d.data().email, 
        name: d.data().name || d.data().email.split('@')[0],
        pin: d.data().pin
      })));
    };
    fetchUsers();

    // 4. Listen to Handover Requests involving current user
    const qHandovers = query(
      collection(db, "id_card_handovers"), 
      where("status", "==", "Pending")
    );
    const unsubHandovers = onSnapshot(qHandovers, (snap) => {
      setHandovers(snap.docs.map(d => ({ id: d.id, ...d.data() } as IDCardHandoverRequest)));
    });

    return () => { unsubMaster(); unsubHandovers(); };
  }, [db]);

  const filteredCards = useMemo(() => {
    return drivers.filter(d => {
      const master = masterRecords[driverId(d)];
      const status = master?.id_card?.status || 'Not Generated';
      const matchesStatus = statusFilter === 'All' || status === statusFilter;
      return matchesStatus;
    });
  }, [drivers, masterRecords, statusFilter]);

  // Helper because driver_id has dynamic field name sometimes
  function driverId(d: any) {
    return d.driver_id || d.driverId || d.id;
  }

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (bulkStage === 'pin' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && bulkStage === 'pin') {
      setBulkError("PIN Expired. Please generate a new one.");
    }
    return () => clearInterval(timer);
  }, [bulkStage, timeLeft]);

  useEffect(() => {
    if (showScanner && bulkMode) {
      const startScanner = async () => {
        try {
          if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode("reader");
          }
          await html5QrCodeRef.current.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              if (isProcessingScan) return;
              
              if (scannedIds.includes(decodedText)) {
                // Already scanned, maybe show a brief toast or ignore
                return;
              }

              setIsProcessingScan(true);
              html5QrCodeRef.current?.pause();
              
              setScannedIds(prev => [...prev, decodedText]);
              setLastScannedId(decodedText);
              
              if (navigator.vibrate) navigator.vibrate(200);
            },
            () => {}
          );
          const capabilities = html5QrCodeRef.current.getRunningTrackCapabilities() as any;
          if (capabilities.torch) setIsTorchSupported(true);
          setScannerError(null);
        } catch (err: any) {
          console.error("Scanner start error:", err);
          if (err?.toString().includes("NotAllowedError") || err?.toString().includes("Permission denied")) {
            setScannerError("Camera permission denied. Please allow camera access in your browser settings.");
          } else {
            setScannerError("Failed to start camera. Please ensure no other app is using it.");
          }
        }
      };
      startScanner();
    } else {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(err => console.error("Scanner stop error:", err));
      }
    }
    return () => {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(err => console.error("Cleanup stop error:", err));
      }
    };
  }, [showScanner, bulkMode]);

  const toggleTorch = async () => {
    if (html5QrCodeRef.current && isTorchSupported) {
      try {
        const newState = !isTorchOn;
        await html5QrCodeRef.current.applyVideoConstraints({
          advanced: [{ torch: newState } as any]
        });
        setIsTorchOn(newState);
      } catch (err) {
        console.error("Torch error:", err);
      }
    }
  };

  const generateBulkPin = async () => {
    if (!bulkRecipient || scannedIds.length === 0) {
      setBulkError("Select recipient and scan cards first.");
      return;
    }
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 60000; // 1 minute
    
    setIsSubmitting(true);
    try {
      const recipient = users.find(u => u.email === bulkRecipient);
      await addDoc(collection(db, "id_card_handovers"), {
        cardIds: scannedIds,
        fromId: user.email,
        fromName: userName || user.displayName || user.email.split('@')[0],
        toId: bulkRecipient,
        toName: recipient?.name || bulkRecipient.split('@')[0],
        pin,
        status: 'Pending',
        timestamp: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        type: 'BulkScan'
      });
      
      setBulkPin(pin);
      setBulkPinExpiresAt(expiresAt);
      setBulkStage('pin');
      setTimeLeft(60);
      setBulkError('');
    } catch (err) {
      console.error("Error generating PIN:", err);
      setBulkError("Failed to generate PIN.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyBulkPin = async () => {
    if (Date.now() > (bulkPinExpiresAt || 0)) {
      setBulkError("PIN Expired. Please generate a new one.");
      return;
    }
    if (enteredPin !== bulkPin) {
      setBulkError("Incorrect PIN.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Find the handover request we just created
      const q = query(
        collection(db, "id_card_handovers"),
        where("pin", "==", bulkPin),
        where("status", "==", "Pending")
      );
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("Handover request not found");
      
      const handoverDoc = snap.docs[0];
      const handoverData = handoverDoc.data() as IDCardHandoverRequest;

      // 1. Update Handover Request
      await updateDoc(doc(db, "id_card_handovers", handoverDoc.id), {
        status: 'Completed'
      });

      // 2. Update Master Records for all scanned IDs
      for (const driverId of handoverData.cardIds) {
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

  const paginatedCards = filteredCards;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const handleContinueScanning = () => {
    setLastScannedId(null);
    setIsProcessingScan(false);
    html5QrCodeRef.current?.resume();
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
    setGeneratedPin(Math.floor(1000 + Math.random() * 9000).toString());
  };

  const confirmHandoverRequest = async () => {
    if (!selectedCard || !recipientEmail) return;
    setIsSubmitting(true);
    try {
      const recipient = users.find(u => u.email === recipientEmail);
      const request: Omit<IDCardHandoverRequest, 'id'> = {
        cardIds: [selectedCard.driver_id],
        fromId: user.email,
        fromName: userName || user.displayName || user.email.split('@')[0],
        toId: recipientEmail,
        toName: recipient?.name || recipientEmail.split('@')[0],
        pin: generatedPin,
        status: 'Pending',
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(db, "id_card_handovers"), request);
      setShowHandoverModal(false);
      setSelectedCard(null);
      setRecipientEmail('');
    } catch (err) {
      console.error("Error creating handover request:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyPin = async () => {
    if (!activeHandover || enteredPin !== activeHandover.pin) {
      setPinError("Incorrect PIN. Please try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Update Handover Request
      await updateDoc(doc(db, "id_card_handovers", activeHandover.id), {
        status: 'Completed'
      });

      // 2. Update Master Record(s)
      const idsToUpdate = activeHandover.cardIds || [];
      for (const driverId of idsToUpdate) {
        await setDoc(doc(db, "drivers_master", driverId), {
          id_card: {
            current_holder_id: activeHandover.toId,
            current_holder_name: activeHandover.toName,
            status: "In Transit",
            last_updated_at: new Date().toISOString()
          }
        }, { merge: true });
      }

      setShowPinModal(false);
      setActiveHandover(null);
      setEnteredPin('');
      setPinError('');
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
          last_updated_at: new Date().toISOString()
        }
      }, { merge: true });
      setShowDeliveryModal(false);
      setSelectedCard(null);
    } catch (err) {
      console.error("Error delivering card:", err);
    }
  };

  const myIncomingHandovers = handovers.filter(h => h.toId === user.email);

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-heading text-slate-900 dark:text-white">ID Card Tracking</h2>
          <p className="font-semibold text-gray-400 dark:text-slate-400">Manage lifecycle and handovers of driver ID cards</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setBulkMode(true)}
            className="flex items-center justify-center gap-2 h-11 px-6 rounded-2xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-lg active:scale-95 shrink-0"
          >
            <QrCodeIcon className="w-5 h-5" /> Bulk Handover
          </button>
        </div>
      </div>

      {/* Incoming Handovers Section */}
      {myIncomingHandovers.length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 p-6 rounded-[2rem] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
              <BellIcon className="w-5 h-5 animate-bounce" /> My Incoming PINs
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myIncomingHandovers.map(h => {
              const isExpired = h.expiresAt && new Date() > new Date(h.expiresAt);
              return (
                <div key={h.id} className={`bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border ${isExpired ? 'border-red-200 opacity-60' : 'border-indigo-100 dark:border-indigo-900/30'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase">From</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white">{h.fromName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-zinc-400 uppercase">Cards</p>
                      <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{h.cardIds?.length || 1}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <KeyIcon className="w-4 h-4 text-indigo-500" />
                      <span className="text-lg font-black tracking-widest text-indigo-600 dark:text-indigo-400">
                        {isExpired ? '----' : h.pin}
                      </span>
                    </div>
                    {h.expiresAt && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
                        <ClockIcon className="w-3 h-3" />
                        {isExpired ? 'Expired' : 'Active'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search by Driver Name or ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {['All', 'Not Generated', 'Generated', 'In Transit', 'Delivered'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${statusFilter === status ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-white dark:bg-zinc-900 text-zinc-500 border border-zinc-100 dark:border-zinc-800'}`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {paginatedCards.map(driver => {
          const master = masterRecords[driver.driver_id];
          const status = master?.id_card?.status || 'Not Generated';
          const holder = master?.id_card?.current_holder_name || 'N/A';
          
          return (
            <div key={driver.driver_id} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 p-6 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <IdentificationIcon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">{driver.name}</h3>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{driver.driver_id}</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    status === 'Delivered' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                    status === 'In Transit' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                    status === 'Generated' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                  }`}>
                    {status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Current Holder</span>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{holder}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-50 dark:border-zinc-800">
                {status === 'Not Generated' && (
                  <button 
                    onClick={() => handleGenerateCard(driver.driver_id)}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                  >
                    <QrCodeIcon className="w-4 h-4" /> Generate ID Card
                  </button>
                )}
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

      <PaginationFooter 
        currentPage={currentPage}
        totalPages={Math.ceil(totalDatabaseCount / itemsPerPage)}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
        dataLength={totalDatabaseCount}
        itemsPerPage={itemsPerPage}
      />

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
            <h3 className="text-xl font-bold font-heading mb-2 text-zinc-900 dark:text-white">Initiate Handover</h3>
            <p className="text-sm text-zinc-500 mb-8 font-semibold">Transfer ID Card for {selectedCard.name}</p>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Select Recipient</label>
                <select 
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full px-4 py-3.5 bg-zinc-50 dark:bg-zinc-950 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white"
                >
                  <option value="">Choose Employee...</option>
                  {users.filter(u => u.email !== user.email).map(u => (
                    <option key={u.email} value={u.email}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 text-center">
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-2">Security PIN</p>
                <p className="text-4xl font-black tracking-[0.5em] text-indigo-900 dark:text-indigo-100">{generatedPin}</p>
                <p className="text-[10px] font-bold text-indigo-400 mt-4 italic">Share this PIN with the recipient to complete handover</p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={confirmHandoverRequest}
                  disabled={!recipientEmail || isSubmitting}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                  {isSubmitting ? 'Requesting...' : 'Request Handover'}
                </button>
                <button 
                  onClick={() => setShowHandoverModal(false)}
                  className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN Verification Modal */}
      {showPinModal && activeHandover && (
        <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-6">
              <ShieldCheckIcon className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold font-heading text-center mb-2 text-zinc-900 dark:text-white">Verify Handover</h3>
            <p className="text-sm text-zinc-500 text-center mb-8 font-semibold">Enter the 4-digit PIN provided by {activeHandover.fromName}</p>
            
            <div className="space-y-6">
              <div className="relative">
                <input 
                  type="text" 
                  maxLength={4}
                  value={enteredPin}
                  onChange={(e) => { setEnteredPin(e.target.value); setPinError(''); }}
                  placeholder="0000"
                  className="w-full text-center text-4xl font-black tracking-[0.5em] py-6 bg-zinc-50 dark:bg-zinc-950 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white"
                />
                {pinError && <p className="text-center text-xs font-bold text-red-500 mt-2">{pinError}</p>}
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleVerifyPin}
                  disabled={enteredPin.length < 4 || isSubmitting}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                  {isSubmitting ? 'Verifying...' : 'Confirm Acceptance'}
                </button>
                <button 
                  onClick={() => { setShowPinModal(false); setEnteredPin(''); setPinError(''); }}
                  className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
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
