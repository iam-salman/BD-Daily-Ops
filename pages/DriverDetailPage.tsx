import React, { useState, useEffect } from "react";
import {
  ChevronLeftIcon,
  PhoneIcon,
  TruckIcon,
  UserCircleIcon,
  ClipboardDocumentCheckIcon,
  IdentificationIcon,
  GiftIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
  TrashIcon,
  TicketIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  DocumentTextIcon,
  CalendarIcon,
  ArrowPathIcon,
  BoltIcon,
  RssIcon,
} from "@heroicons/react/24/outline";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  addDoc,
  Firestore,
} from "firebase/firestore";
import { Driver, DriverMasterRecord, DriverComment, Ticket } from "../types";
import { OperationType, handleFirestoreError } from "../lib/firebase";
import CustomSelect from "../components/CustomSelect";

interface DriverDetailPageProps {
  driver: Driver;
  onBack: () => void;
  db: Firestore;
  user: any;
}

const DriverSkeleton = () => (
  <div className="space-y-8 animate-pulse w-full p-6">
    <div className="flex flex-col lg:items-center bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
      <div className="lg:mb-6 mb-1 w-20 h-20 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
      <div className="space-y-3 lg:text-center text-left w-full max-w-lg lg:flex-1">
        <div className="lg:mx-auto h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
        <div className="lg:mx-auto h-4 w-96 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="space-y-6">
        <div className="h-64 bg-zinc-100 dark:bg-zinc-800 rounded-[2rem]"></div>
      </div>
      <div className="lg:col-span-2 h-96 bg-zinc-100 dark:bg-zinc-800 rounded-[2rem]"></div>
    </div>
  </div>
);

const cleanObject = (obj: any) => {
  const newObj = { ...obj };
  Object.keys(newObj).forEach((key) => {
    if (newObj[key] === undefined) {
      delete newObj[key];
    } else if (
      newObj[key] &&
      typeof newObj[key] === "object" &&
      !Array.isArray(newObj[key])
    ) {
      newObj[key] = cleanObject(newObj[key]);
    }
  });
  return newObj;
};

const DriverDetailPage: React.FC<DriverDetailPageProps> = ({
  driver,
  onBack,
  db,
  user,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'operations'>("overview");
  const [masterData, setMasterData] = useState<DriverMasterRecord | null>(null);
  const [comments, setComments] = useState<DriverComment[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [allUsers, setAllUsers] = useState<{ email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [newPhone, setNewPhone] = useState("");
  const [newComment, setNewComment] = useState("");
  const [idCardLink, setIdCardLink] = useState("");
  const [giftKitLink, setGiftKitLink] = useState("");

  // Visibility States
  const [showInactiveForm, setShowInactiveForm] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [showSpecsForm, setShowSpecsForm] = useState(false);
  const [showReferrerForm, setShowReferrerForm] = useState(false);
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  // Local Sync States
  const [localInactive, setLocalInactive] = useState<
    DriverMasterRecord["status_info"]
  >({});
  const [localFollowUp, setLocalFollowUp] = useState<
    DriverMasterRecord["follow_up"]
  >({});
  const [localRecovery, setLocalRecovery] = useState<
    DriverMasterRecord["kit_recovery"]
  >({});
  const [localSpecs, setLocalSpecs] = useState<
    DriverMasterRecord["vehicle_specs"]
  >({});
  const [localReferrer, setLocalReferrer] = useState<
    DriverMasterRecord["referrer_info"]
  >({ is_our_driver: false });

  useEffect(() => {
    const driverId = driver.driver_id;
    const docRef = doc(db, "drivers_master", driverId);

    const unsubMaster = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setMasterData(snapshot.data() as DriverMasterRecord);
        } else {
          const defaultData: DriverMasterRecord = {
            additional_phones: [],
            onboarding: {
              harness: { installed: false },
              soc_meter: { installed: false },
              mcb: { installed: false },
              extension_cable: { installed: false },
            },
            id_card: {
              generated: false,
              delivered: false,
              status: "Not Generated",
              current_holder_id: "",
              current_holder_name: "",
            },
            gift_kit: { eligible: false, status: "Pending" },
            status_info: { inactive_secondary_reason: "", inactive_remarks: "" },
            follow_up: {
              category: "Pending",
              timeframe: "",
              remarks: "",
              last_called_at: "",
            },
            kit_recovery: {
              harness: false,
              soc_meter: false,
              extension_cable: false,
              mcb: false,
              condition: "N/A",
              refund_amount: 0,
              recovered_date: "",
            },
            vehicle_specs: {
              controller_v: "",
              controller_wattage: "",
              motor_v: "",
              motor_wattage: "",
            },
            referrer_info: {
              is_our_driver: false,
              referrer_driver_id: "",
              referrer_name: "",
              referrer_phone: "",
            },
            agreement_handed_over: false,
          };
          setDoc(docRef, cleanObject(defaultData));
          setMasterData(defaultData);
        }
        setLoading(false);
      },
      (error) =>
        handleFirestoreError(error, OperationType.GET, `drivers_master/${driverId}`)
    );

    const qComments = query(
      collection(db, "driver_comments"),
      where("driverId", "==", driverId)
    );
    const unsubComments = onSnapshot(qComments, (snap) => {
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as DriverComment)
      );
      data.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setComments(data);
    });

    const qTickets = query(
      collection(db, "tickets"),
      where("driverId", "==", driverId)
    );
    const unsubTickets = onSnapshot(qTickets, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ticket));
      data.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setTickets(data);
    });

    return () => {
      unsubMaster();
      unsubComments();
      unsubTickets();
    };
  }, [driver, db]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        email: doc.id,
        role: doc.data().role
      }));
      setAllUsers(usersList);
    });
    return () => unsubUsers();
  }, [db]);

  const handleAddPhone = async () => {
    if (!newPhone || !masterData) return;
    const updatedPhones = [...(masterData.additional_phones || []), newPhone];
    await updateDoc(doc(db, "drivers_master", driver.driver_id), {
      additional_phones: updatedPhones,
    });
    setNewPhone("");
  };

  const handleDeletePhone = async (phone: string) => {
    if (!masterData) return;
    const updatedPhones = masterData.additional_phones.filter((p) => p !== phone);
    await updateDoc(doc(db, "drivers_master", driver.driver_id), {
      additional_phones: updatedPhones,
    });
  };

  const handleUpdateOnboarding = async (
    item: keyof DriverMasterRecord["onboarding"],
    installed: boolean
  ) => {
    await updateDoc(doc(db, "drivers_master", driver.driver_id), {
      [`onboarding.${item}`]: {
        installed,
        date: installed ? new Date().toISOString() : null,
      },
    });
  };

  const handleUpdateLink = async (type: 'id_card' | 'gift_kit', link: string) => {
    const field = type === 'id_card' ? "id_card.photo_url" : "gift_kit.image_link";
    await updateDoc(doc(db, "drivers_master", driver.driver_id), {
      [field]: link,
    });
    type === 'id_card' ? setIdCardLink("") : setGiftKitLink("");
  };

  const handleUpdateMaster = async (updates: Partial<DriverMasterRecord>) => {
    await setDoc(doc(db, "drivers_master", driver.driver_id), cleanObject(updates), {
      merge: true,
    });
  };

  const handleUpdateNested = async (path: string, value: any) => {
    const cleanValue =
      value && typeof value === "object" && !Array.isArray(value)
        ? cleanObject(value)
        : value;
    await updateDoc(doc(db, "drivers_master", driver.driver_id), {
      [path]: cleanValue === undefined ? null : cleanValue,
    });
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    await addDoc(collection(db, "driver_comments"), {
      driverId: driver.driver_id,
      text: newComment,
      author: user.displayName || user.email,
      timestamp: new Date().toISOString(),
    });
    setNewComment("");
  };

  const formatEmailToName = (email: string) => {
    if (!email) return "Not Assigned";
    const namePart = email.split("@")[0];
    return namePart
      .split(/[._-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading || !masterData) return <DriverSkeleton />;

  const vehicleNumber =
    driver.vehicleData[0]?.vehicle_number ||
    driver.latest_swap?.vehicle_number ||
    "";
  const formatDate = (unix: number) => {
    if (!unix) return "N/A";
    const ms = unix > 100000000000 ? unix : unix * 1000;
    return new Date(ms).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const primaryReasons = [
    { value: 'Left Service', label: 'Left Service' },
    { value: 'Temp Inactive', label: 'Temp Inactive' },
  ];
  const secondaryReasonsMap: Record<string, string[]> = {
    'Left Service': [
      "Driver Unavailable",
      "Vehicle Sold",
      "Impounded",
      "Penalty Issue",
      "Out of Station",
      "Emergency",
      "Maintenance",
      "Other",
    ],
    'Temp Inactive': ["Recovery", "Penalty Issue"],
  };

  return (
    <div className="space-y-6 pb-24 w-full animate-in slide-in-from-right duration-300 px-4 sm:px-0">
      {/* REDESIGNED HEADER START */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-5 md:p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-all relative">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 relative z-10">
          {/* Back Button & Mobile Profile Pic */}
          <div className="flex justify-between items-center lg:block shrink-0">
            <button
              onClick={onBack}
              className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all shrink-0 border border-zinc-100 dark:border-zinc-700"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>

            <div className="relative shrink-0 lg:hidden">
              <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-indigo-100 dark:shadow-none overflow-hidden border-4 border-white dark:border-zinc-800">
                {driver.profile_pic ? (
                  <img
                    src={driver.profile_pic}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{driver.name?.charAt(0) || '?'}</span>
                )}
              </div>
              <div
                className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white dark:border-zinc-900 shadow-sm ${
                  driver.is_active ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
            </div>
          </div>

          {/* Main Info */}
          <div className="flex-1 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div>
                <h2 className="text-2xl md:text-3xl font-black font-heading text-zinc-900 dark:text-white tracking-tight mb-1">
                  {driver.name || 'Unknown Driver'}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {masterData.status_info?.inactive_primary_reason === 'Left Service' ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-500 text-white">
                      Left Our Service
                    </span>
                  ) : (
                    <>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                          driver.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {driver.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                          driver.assigned
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {driver.assigned ? 'Assigned' : 'Unassigned'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-2 gap-x-6">
                <div className="flex items-center gap-2 group">
                  <IdentificationIcon className="w-4 h-4 text-zinc-300 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    ID:
                  </span>
                  <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-lg">
                    {driver.driver_id}
                  </span>
                </div>
                {driver.phone && (
                  <div className="flex items-center gap-2">
                    <PhoneIcon className="w-3.5 h-3.5 text-zinc-300" />
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {driver.phone}
                    </span>
                  </div>
                )}
                {vehicleNumber && (
                  <div className="flex items-center gap-2">
                    <TruckIcon className="w-3.5 h-3.5 text-zinc-300" />
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {vehicleNumber}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop Profile Pic */}
            <div className="relative shrink-0 hidden lg:block">
              <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-4xl font-black shadow-2xl shadow-indigo-100 dark:shadow-none overflow-hidden border-4 border-white dark:border-zinc-800">
                {driver.profile_pic ? (
                  <img
                    src={driver.profile_pic}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{driver.name?.charAt(0) || '?'}</span>
                )}
              </div>
              <div
                className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-4 border-white dark:border-zinc-900 shadow-sm ${
                  driver.is_active ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
      {/* REDESIGNED HEADER END */}

      <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto scrollbar-hide">
        {[
          { id: 'overview', label: 'Overview & Assets', icon: UserCircleIcon },
          {
            id: 'operations',
            label: 'Operations & History',
            icon: ClipboardDocumentCheckIcon,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-8 py-4 border-b-2 text-sm font-black transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {activeTab === 'overview' && (
          <>
            <div className="space-y-6">
              {/* Onboarding Status */}
              <div className="p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <h4 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest flex items-center gap-2">
                  <ClipboardDocumentCheckIcon className="w-4 h-4" /> Onboarding
                  Status
                </h4>
                <div className="space-y-4">
                  {[
                    { l: 'Vehicle Number', v: vehicleNumber || 'N/A' },
                    { l: 'Onboarding Date', v: formatDate(driver.onboarded_on) },
                    {
                      l: 'Last Swap Date',
                      v: formatDate(driver.last_swap_date || 0),
                    },
                    { l: 'Status', v: driver.onboardingStatus || 'N/A' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-xs font-bold text-zinc-400">
                        {item.l}
                      </span>
                      <span className="text-sm font-black text-zinc-800 dark:text-zinc-200">
                        {item.v}
                      </span>
                    </div>
                  ))}
                  
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-zinc-400">Connection By</span>
                      <button 
                        onClick={() => setShowConnectionForm(!showConnectionForm)}
                        className="text-[10px] font-black text-indigo-600 uppercase"
                      >
                        {showConnectionForm ? 'Cancel' : 'Change'}
                      </button>
                    </div>
                    
                    {showConnectionForm ? (
                      <div className="space-y-2">
                        <CustomSelect
                          placeholder="Select Technician/User"
                          options={allUsers.map((u) => ({
                            value: u.email,
                            label: `${formatEmailToName(u.email)} (${u.role})`,
                          }))}
                          value={masterData.connection_by?.user_id || ""}
                          onChange={async (val) => {
                            const selectedUser = allUsers.find(
                              (u) => u.email === val
                            );
                            if (selectedUser) {
                              await handleUpdateNested("connection_by", {
                                user_id: selectedUser.email,
                                user_name: formatEmailToName(selectedUser.email),
                              });
                              setShowConnectionForm(false);
                            }
                          }}
                          searchable
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-[10px] font-black text-indigo-600 dark:text-indigo-400">
                          {masterData.connection_by?.user_name?.charAt(0) || "?"}
                        </div>
                        <span className="text-sm font-black text-zinc-800 dark:text-zinc-200">
                          {masterData.connection_by?.user_name || "Not Assigned"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Referrer Details */}
              <div className="p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black uppercase text-zinc-400 tracking-widest flex items-center gap-2">
                    <UserCircleIcon className="w-4 h-4" /> Referrer Info
                  </h4>
                  <button
                    onClick={() => {
                      if (!showReferrerForm)
                        setLocalReferrer(
                          masterData.referrer_info || { is_our_driver: false }
                        );
                      setShowReferrerForm(!showReferrerForm);
                    }}
                    className="text-[10px] font-black text-indigo-600 uppercase"
                  >
                    {showReferrerForm ? 'Cancel' : 'Update'}
                  </button>
                </div>
                {showReferrerForm ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 p-3 rounded-xl">
                      <span className="text-xs font-bold text-zinc-500">
                        Is our driver?
                      </span>
                      <div className="flex gap-2">
                        {[true, false].map((v) => (
                          <button
                            key={String(v)}
                            onClick={() =>
                              setLocalReferrer((p) => ({ ...p, is_our_driver: v }))
                            }
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                              localReferrer?.is_our_driver === v
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-400'
                            }`}
                          >
                            {v ? 'Yes' : 'No'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {localReferrer?.is_our_driver ? (
                      <input
                        placeholder="Driver ID"
                        value={localReferrer?.referrer_driver_id || ''}
                        onChange={(e) =>
                          setLocalReferrer((p) => ({
                            ...p,
                            referrer_driver_id: e.target.value,
                          }))
                        }
                        className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 text-sm font-bold outline-none"
                      />
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        <input
                          placeholder="Name"
                          value={localReferrer?.referrer_name || ''}
                          onChange={(e) =>
                            setLocalReferrer((p) => ({
                              ...p,
                              referrer_name: e.target.value,
                            }))
                          }
                          className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 text-sm font-bold outline-none"
                        />
                        <input
                          placeholder="Mobile"
                          value={localReferrer?.referrer_phone || ''}
                          onChange={(e) =>
                            setLocalReferrer((p) => ({
                              ...p,
                              referrer_phone: e.target.value,
                            }))
                          }
                          className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 text-sm font-bold outline-none"
                        />
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        await handleUpdateNested('referrer_info', localReferrer);
                        setShowReferrerForm(false);
                      }}
                      className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase"
                    >
                      Save Referrer
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {masterData.referrer_info ? (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-400">Our Driver?</span>
                          <span className="text-sm font-black">
                            {masterData.referrer_info.is_our_driver ? 'Yes' : 'No'}
                          </span>
                        </div>
                        {masterData.referrer_info.is_our_driver ? (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-zinc-400">ID</span>
                            <span className="text-sm font-black">
                              {masterData.referrer_info.referrer_driver_id ||
                                'N/A'}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-zinc-400">Name</span>
                              <span className="text-sm font-black">
                                {masterData.referrer_info.referrer_name || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-zinc-400">Mobile</span>
                              <span className="text-sm font-black">
                                {masterData.referrer_info.referrer_phone || 'N/A'}
                              </span>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-zinc-400 italic">
                        No referrer details added.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Additional Phones */}
              <div className="p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <h4 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest flex items-center gap-2">
                  <PhoneIcon className="w-4 h-4" /> Extra Contacts
                </h4>
                <div className="space-y-2 mb-4">
                  {masterData.additional_phones.map((phone, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded-xl"
                    >
                      <span className="text-sm font-bold">{phone}</span>
                      <button
                        onClick={() => handleDeletePhone(phone)}
                        className="text-red-400 hover:text-red-500"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Add Number"
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-sm font-bold outline-none"
                  />
                  <button
                    onClick={handleAddPhone}
                    className="p-2 bg-indigo-600 text-white rounded-xl"
                  >
                    <PlusIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Checklist Items */}
              <div className="p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <h4 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest flex items-center gap-2">
                  <ClipboardDocumentCheckIcon className="w-4 h-4" /> Installed Items
                </h4>
                <div className="space-y-4">
                  {(
                    [
                      'harness',
                      'soc_meter',
                      'mcb',
                      'extension_cable',
                    ] as const
                  ).map((item) => (
                    <div key={item} className="flex items-center justify-between">
                      <span className="text-sm font-bold capitalize">
                        {item.replace('_', ' ')}
                      </span>
                      <button
                        onClick={() =>
                          handleUpdateOnboarding(
                            item,
                            !masterData.onboarding[item].installed
                          )
                        }
                        className={`w-12 h-6 rounded-full transition-all relative ${
                          masterData.onboarding[item].installed
                            ? 'bg-emerald-500'
                            : 'bg-zinc-200 dark:bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                            masterData.onboarding[item].installed
                              ? 'left-7'
                              : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agreement */}
              <div className="p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <h4 className="text-xs font-black uppercase text-zinc-400 mb-4 tracking-widest flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4" /> Agreement
                </h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Agreement Handed Over</span>
                  <button
                    onClick={() =>
                      handleUpdateMaster({
                        agreement_handed_over: !masterData.agreement_handed_over,
                      })
                    }
                    className={`w-12 h-6 rounded-full transition-all relative ${
                      masterData.agreement_handed_over
                        ? 'bg-emerald-500'
                        : 'bg-zinc-200 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                        masterData.agreement_handed_over ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {/* Inactive Tracking */}
              {!driver.is_active && (
                <div className="p-8 rounded-[2.5rem] bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-lg font-black text-red-900 dark:text-red-100 flex items-center gap-2">
                      <ExclamationTriangleIcon className="w-6 h-6" /> Inactive Reason
                      Tracking
                    </h4>
                    <button
                      onClick={() => {
                        if (!showInactiveForm)
                          setLocalInactive(masterData.status_info || {});
                        setShowInactiveForm(!showInactiveForm);
                      }}
                      className="text-xs font-black text-red-600 uppercase"
                    >
                      {showInactiveForm ? 'Cancel' : 'Update'}
                    </button>
                  </div>
                  {showInactiveForm ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <CustomSelect
                          label="Primary Reason"
                          options={primaryReasons}
                          value={localInactive?.inactive_primary_reason || ''}
                          onChange={(val) =>
                            setLocalInactive((p) => ({
                              ...p,
                              inactive_primary_reason: val,
                            }))
                          }
                        />
                        <CustomSelect
                          label="Secondary Reason"
                          options={(
                            secondaryReasonsMap[
                              localInactive?.inactive_primary_reason || ''
                            ] || []
                          ).map((r) => ({ value: r, label: r }))}
                          value={localInactive?.inactive_secondary_reason || ''}
                          onChange={(val) =>
                            setLocalInactive((p) => ({
                              ...p,
                              inactive_secondary_reason: val,
                            }))
                          }
                          disabled={!localInactive?.inactive_primary_reason}
                        />
                      </div>
                      <textarea
                        placeholder="Remarks..."
                        value={localInactive?.inactive_remarks || ''}
                        onChange={(e) =>
                          setLocalInactive((p) => ({
                            ...p,
                            inactive_remarks: e.target.value,
                          }))
                        }
                        className="w-full p-4 rounded-2xl bg-white border border-red-100 text-sm font-bold h-24 outline-none focus:ring-2 focus:ring-red-200"
                      />
                      <button
                        onClick={async () => {
                          if (
                            localInactive?.inactive_primary_reason ===
                              'Left Service' &&
                            driver.assigned
                          ) {
                            alert("Driver still has batteries.");
                            return;
                          }
                          await handleUpdateNested('status_info', localInactive);
                          setShowInactiveForm(false);
                        }}
                        className="w-full py-4 bg-red-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-red-200"
                      >
                        Save Inactive Info
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        { l: 'Primary', v: masterData.status_info?.inactive_primary_reason },
                        {
                          l: 'Secondary',
                          v: masterData.status_info?.inactive_secondary_reason,
                        },
                        { l: 'Remarks', v: masterData.status_info?.inactive_remarks },
                      ].map((x, i) => (
                        <div
                          key={i}
                          className="p-4 bg-white/60 dark:bg-black/20 rounded-2xl"
                        >
                          <p className="text-[10px] font-black text-red-400 uppercase mb-1">
                            {x.l}
                          </p>
                          <p className="text-sm font-black text-red-900 dark:text-red-100">
                            {x.v || 'N/A'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Follow Up */}
              {!driver.assigned && (
                <div className="p-8 rounded-[2.5rem] bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-lg font-black text-amber-900 dark:text-amber-100 flex items-center gap-2">
                      <ClockIcon className="w-6 h-6" /> Follow-up (Unassigned)
                    </h4>
                    <button
                      onClick={() => {
                        if (!showFollowUpForm)
                          setLocalFollowUp(masterData.follow_up || {});
                        setShowFollowUpForm(!showFollowUpForm);
                      }}
                      className="text-xs font-black text-amber-600 uppercase"
                    >
                      {showFollowUpForm ? 'Cancel' : 'Update'}
                    </button>
                  </div>
                  {showFollowUpForm ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <CustomSelect
                          label="Category"
                          options={[
                            { v: 'Will continue', l: 'Will continue' },
                            { v: 'Not Continue', l: 'Not Continue' },
                            { v: 'Pending', l: 'Pending' },
                          ].map((x) => ({ value: x.v, label: x.l }))}
                          value={localFollowUp?.category || ''}
                          onChange={(val) =>
                            setLocalFollowUp((p) => ({ ...p, category: val }))
                          }
                        />
                        <CustomSelect
                          label="Timeframe"
                          options={[
                            { v: 'within a week', l: 'Within a week' },
                            { v: '15 days', l: '15 Days' },
                            { v: 'a month', l: 'A Month' },
                          ].map((x) => ({ value: x.v, label: x.l }))}
                          value={localFollowUp?.timeframe || ''}
                          onChange={(val) =>
                            setLocalFollowUp((p) => ({ ...p, timeframe: val }))
                          }
                        />
                      </div>
                      <textarea
                        placeholder="Remarks..."
                        value={localFollowUp?.remarks || ''}
                        onChange={(e) =>
                          setLocalFollowUp((p) => ({ ...p, remarks: e.target.value }))
                        }
                        className="w-full p-4 rounded-2xl bg-white border border-amber-100 text-sm font-bold h-24 outline-none focus:ring-2 focus:ring-amber-200"
                      />
                      <button
                        onClick={async () => {
                          const upd = {
                            ...localFollowUp,
                            last_called_at: new Date().toISOString(),
                          };
                          await handleUpdateNested('follow_up', upd);
                          setShowFollowUpForm(false);
                        }}
                        className="w-full py-4 bg-amber-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-amber-200"
                      >
                        Save Follow-up
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        { l: 'Category', v: masterData.follow_up?.category },
                        { l: 'Timeframe', v: masterData.follow_up?.timeframe },
                        {
                          l: 'Last Called',
                          v: masterData.follow_up?.last_called_at
                            ? new Date(masterData.follow_up.last_called_at).toLocaleDateString()
                            : 'Never',
                        },
                      ].map((x, i) => (
                        <div
                          key={i}
                          className="p-4 bg-white/60 dark:bg-black/20 rounded-2xl"
                        >
                          <p className="text-[10px] font-black text-amber-500 uppercase mb-1">
                            {x.l}
                          </p>
                          <p className="text-sm font-black text-amber-900 dark:text-amber-100">
                            {x.v || 'Pending'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Kit Recovery */}
              {(!driver.is_active || masterData.status_info?.inactive_primary_reason === 'Left Service') && (
                <div className="p-8 rounded-[2.5rem] bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-lg font-black flex items-center gap-2 italic">
                      <ArrowPathIcon className="w-6 h-6 text-indigo-500" /> Kit Recovery
                    </h4>
                    <button
                      onClick={() => {
                        if (!showRecoveryForm)
                          setLocalRecovery(masterData.kit_recovery || {});
                        setShowRecoveryForm(!showRecoveryForm);
                      }}
                      className="text-xs font-black text-indigo-600 uppercase underline"
                    >
                      Update
                    </button>
                  </div>
                  {showRecoveryForm ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {(
                          ['harness', 'soc_meter', 'extension_cable', 'mcb'] as const
                        ).map((item) => (
                          <label
                            key={item}
                            className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-zinc-950 rounded-2xl cursor-pointer border border-zinc-100 shadow-sm"
                          >
                            <input
                              type="checkbox"
                              checked={localRecovery?.[item] || false}
                              onChange={(e) =>
                                setLocalRecovery((p) => ({
                                  ...p,
                                  [item]: e.target.checked,
                                }))
                              }
                              className="w-5 h-5 rounded text-indigo-600 focus:ring-0"
                            />
                            <span className="text-[10px] font-black uppercase text-zinc-500 text-center">
                              {item.replace('_', ' ')}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select
                          value={localRecovery?.condition || ''}
                          onChange={(e) =>
                            setLocalRecovery((p) => ({
                              ...p,
                              condition: e.target.value as any,
                            }))
                          }
                          className="px-4 py-4 rounded-2xl bg-white border border-zinc-100 text-sm font-black outline-none"
                        >
                          <option value="">Condition</option>
                          <option value="Good">Good</option>
                          <option value="Damaged">Damaged</option>
                          <option value="N/A">N/A</option>
                        </select>
                        <input
                          type="number"
                          placeholder="Refund"
                          value={localRecovery?.refund_amount || ''}
                          onChange={(e) =>
                            setLocalRecovery((p) => ({
                              ...p,
                              refund_amount: parseFloat(e.target.value),
                            }))
                          }
                          className="px-4 py-4 rounded-2xl bg-white border border-zinc-100 text-sm font-black outline-none"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          const upd = {
                            ...localRecovery,
                            recovered_date: new Date().toISOString(),
                          };
                          await handleUpdateNested('kit_recovery', upd);
                          setShowRecoveryForm(false);
                        }}
                        className="w-full py-4 bg-zinc-900 text-white rounded-2xl text-xs font-black uppercase"
                      >
                        Save Recovery
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-5 bg-white dark:bg-black/20 rounded-3xl border border-zinc-100">
                        <p className="text-[10px] font-black text-zinc-400 uppercase mb-3 tracking-widest">
                          Recovered Items
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {['harness', 'soc_meter', 'extension_cable', 'mcb'].map(
                            (item) => (
                              <span
                                key={item}
                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                  masterData.kit_recovery?.[
                                    item as keyof typeof masterData.kit_recovery
                                  ]
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : 'bg-zinc-100 text-zinc-400'
                                }`}
                              >
                                {item.replace('_', ' ')}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      <div className="p-5 bg-white dark:bg-black/20 rounded-3xl border border-zinc-100">
                        <p className="text-[10px] font-black text-zinc-400 uppercase mb-1 tracking-widest">
                          Refund Details
                        </p>
                        <p className="text-xl font-black text-zinc-900 dark:text-white">
                          ₹{masterData.kit_recovery?.refund_amount || 0}{' '}
                          <span className="text-xs font-bold text-zinc-400">
                            ({masterData.kit_recovery?.condition || 'N/A'})
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Vehicle Specs */}
              <div className="p-8 rounded-[2.5rem] bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-lg font-black text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
                    <TruckIcon className="w-6 h-6" /> Vehicle Specs
                  </h4>
                  <button
                    onClick={() => {
                      if (!showSpecsForm) setLocalSpecs(masterData.vehicle_specs || {});
                      setShowSpecsForm(!showSpecsForm);
                    }}
                    className="text-xs font-black text-indigo-600 uppercase"
                  >
                    Update
                  </button>
                </div>
                {showSpecsForm ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {['controller', 'motor'].map((type) => (
                        <div key={type} className="space-y-3">
                          <p className="text-[10px] font-black text-indigo-400 uppercase ml-2 tracking-widest">
                            {type} Specs
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              placeholder="Voltage"
                              value={localSpecs?.[`${type}_v` as keyof typeof localSpecs] || ''}
                              onChange={(e) =>
                                setLocalSpecs((p) => ({
                                  ...p,
                                  [`${type}_v`]: e.target.value,
                                }))
                              }
                              className="w-full px-4 py-4 rounded-2xl bg-white border border-zinc-100 text-sm font-bold outline-none"
                            />
                            <input
                              placeholder="Wattage"
                              value={
                                localSpecs?.[`${type}_wattage` as keyof typeof localSpecs] || ''
                              }
                              onChange={(e) =>
                                setLocalSpecs((p) => ({
                                  ...p,
                                  [`${type}_wattage`]: e.target.value,
                                }))
                              }
                              className="w-full px-4 py-4 rounded-2xl bg-white border border-zinc-100 text-sm font-bold outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        await handleUpdateNested('vehicle_specs', localSpecs);
                        setShowSpecsForm(false);
                      }}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-indigo-100"
                    >
                      Save Specs
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['controller', 'motor'].map((t) => (
                      <div
                        key={t}
                        className="p-5 bg-white/60 dark:bg-black/20 rounded-3xl border border-indigo-100/50"
                      >
                        <p className="text-[10px] font-black text-indigo-400 uppercase mb-1 tracking-widest">
                          {t}
                        </p>
                        <p className="text-lg font-black text-indigo-950 dark:text-indigo-50">
                          {masterData.vehicle_specs?.[`${t}_v` as keyof typeof masterData.vehicle_specs] || 'N/A'}V / {masterData.vehicle_specs?.[`${t}_wattage` as keyof typeof masterData.vehicle_specs] || 'N/A'}W
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ID Card Tracking */}
              <div className="p-8 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-black text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                      <IdentificationIcon className="w-6 h-6 text-indigo-500" /> ID
                      Card Tracking
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl">
                        <p className="text-[10px] font-black text-zinc-400 uppercase mb-1">
                          Status
                        </p>
                        <p className="text-sm font-black">
                          {masterData.id_card.status || 'Not Generated'}
                        </p>
                      </div>
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl">
                        <p className="text-[10px] font-black text-zinc-400 uppercase mb-1">
                          Holder
                        </p>
                        <p className="text-sm font-black">
                          {masterData.id_card.current_holder_name || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        Photo URL
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={idCardLink}
                          onChange={(e) => setIdCardLink(e.target.value)}
                          placeholder="Paste URL..."
                          className="flex-1 px-4 py-3 rounded-2xl bg-zinc-50 text-xs font-bold outline-none"
                        />
                        <button
                          onClick={() => handleUpdateLink('id_card', idCardLink)}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase"
                        >
                          Save
                        </button>
                      </div>
                      {masterData.id_card.photo_url && (
                        <a
                          href={masterData.id_card.photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-black text-indigo-600 underline block mt-2"
                        >
                          View ID Photo
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="w-full md:w-48 flex items-center justify-center p-6 border-2 border-dashed border-zinc-100 rounded-[2rem] bg-zinc-50/50">
                    <div className="text-center">
                      <IdentificationIcon className="w-12 h-12 text-zinc-200 mx-auto mb-2" />
                      <p className="text-[10px] font-black text-zinc-400 uppercase">
                        System Active
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Gift Kit */}
              <div className="p-8 rounded-[2.5rem] bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-black text-amber-900 dark:text-amber-100 mb-6 flex items-center gap-2">
                      <GiftIcon className="w-6 h-6 text-amber-500" /> Gift Kit
                    </h4>
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 p-4 bg-white/80 rounded-2xl cursor-pointer">
                        <input
                          type="checkbox"
                          checked={masterData.gift_kit.eligible}
                          onChange={(e) =>
                            handleUpdateMaster({
                              gift_kit: {
                                ...masterData.gift_kit,
                                eligible: e.target.checked,
                              },
                            })
                          }
                          className="w-6 h-6 rounded text-amber-600 focus:ring-0"
                        />
                        <span className="text-sm font-black text-amber-900">
                          Eligible for Welcome Kit
                        </span>
                      </label>
                      {masterData.gift_kit.eligible && (
                        <div className="flex gap-2">
                          {(['Pending', 'Given'] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() =>
                                handleUpdateMaster({
                                  gift_kit: { ...masterData.gift_kit, status: s },
                                })
                              }
                              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${
                                masterData.gift_kit.status === s
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-white text-amber-700'
                              }`}
                            >
                              {s === 'Given' ? 'Delivered' : 'Not Given'}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="pt-4 space-y-3">
                        <input
                          type="text"
                          value={giftKitLink}
                          onChange={(e) => setGiftKitLink(e.target.value)}
                          placeholder="Gift Image URL..."
                          className="w-full px-4 py-3 rounded-2xl bg-white/50 text-xs font-bold outline-none border border-amber-200"
                        />
                        <button
                          onClick={() => handleUpdateLink('gift_kit', giftKitLink)}
                          className="w-full py-3 bg-amber-600 text-white rounded-2xl text-xs font-black uppercase"
                        >
                          Save Image
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="w-full md:w-48 flex items-center justify-center p-6 border-2 border-dashed border-amber-200 rounded-[2rem] bg-white/40">
                    <GiftIcon className="w-12 h-12 text-amber-200" />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'operations' && (
          <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Comments */}
            <div className="p-6 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="w-4 h-4 text-indigo-500" /> Internal Log
              </h4>
              <div className="space-y-3 mb-6 max-h-[30rem] overflow-y-auto pr-2 custom-scrollbar">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100/50"
                  >
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-3">
                      {c.text}
                    </p>
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-200/50">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">
                        {c.author}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400">
                        {new Date(c.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-center py-8 text-xs text-zinc-400">
                    No notes recorded yet.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Type a note..."
                  className="flex-1 px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 text-sm font-bold outline-none resize-none h-14 focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  onClick={handlePostComment}
                  className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100 shrink-0"
                >
                  <PlusIcon className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Ticket History */}
            <div className="p-6 rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
                <TicketIcon className="w-4 h-4 text-indigo-500" /> Service History
              </h4>
              <div className="space-y-3 max-h-[30rem] overflow-y-auto pr-2 custom-scrollbar">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100/50 hover:shadow-md transition-all"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h5 className="text-sm font-black text-zinc-900 dark:text-white mb-0.5">
                          {t.category}
                        </h5>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                          {t.subCategory}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          t.status === 'Closed'
                            ? 'bg-emerald-100 text-emerald-600'
                            : t.status === 'Open'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-amber-100 text-amber-600'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-4 line-clamp-2">
                      {t.message}
                    </p>
                    <div className="flex justify-between items-center pt-3 border-t border-zinc-200/50">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-black">
                          {t.technicianName?.charAt(0) || 'T'}
                        </div>
                        <span className="text-[10px] font-black text-zinc-500 uppercase">
                          {t.technicianName || 'Support'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3" />{' '}
                        {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
                {tickets.length === 0 && (
                  <div className="text-center py-12">
                    <TicketIcon className="w-12 h-12 text-zinc-100 mx-auto mb-3" />
                    <p className="text-xs text-zinc-400">
                      No tickets found.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverDetailPage;