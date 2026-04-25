
import React, { useState, useEffect, useMemo } from 'react';
import PaginationFooter from '../components/PaginationFooter';
import { 
  AlertCircle, 
  Phone, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  ChevronRight,
  Search,
  RefreshCw,
  PhoneCall,
  PhoneOff,
  History
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc,
  Timestamp 
} from 'firebase/firestore';
import { Ticket, Driver, UserRole } from '../types';

interface AlertsPageProps {
  isDarkMode: boolean;
  db: any;
  user: any;
  role: UserRole | null;
}

interface AlertLog {
  driverId: string;
  driverName: string;
  alertType: 'Ticket' | 'Swap';
  status: 'Picked' | 'Not Picked';
  message?: string;
  timestamp: string;
  user: string;
}

const AlertsPage: React.FC<AlertsPageProps> = ({ isDarkMode, db, user, role }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'tickets' | 'swaps'>('tickets');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<{
    driverId: string;
    driverName: string;
    phone: string;
    type: 'Ticket' | 'Swap';
    id?: string;
  } | null>(null);
  const [callStatus, setCallStatus] = useState<'Picked' | 'Not Picked' | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  const fetchAlerts = async () => {
    setIsRefetching(true);
    setLoading(true);
    try {
      const endpoint = activeTab === 'tickets' ? '/api/getTicketAlerts' : '/api/getSwapAlerts';
      const response = await fetch(`${endpoint}?page=${currentPage}&count=${itemsPerPage}&search=${searchQuery}`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error);

      setAlerts(activeTab === 'tickets' ? data.alerts : data.alerts);
      setTotalDatabaseCount(data.total);
      setHasMore(currentPage < data.totalPages);

      // Still need logs for the sidebar
      const logsSnap = await getDocs(collection(db, 'alert_logs'));
      const logsData = logsSnap.docs.map(doc => doc.data() as AlertLog);
      setLogs(logsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

    } catch (err) {
      console.error("Error fetching alerts:", err);
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [activeTab, currentPage, searchQuery]);

  const handleNextPage = () => {
    if (hasMore) setCurrentPage(prev => prev + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(prev => prev - 1);
  };

  const alertsToDisplay = alerts;

  const handleCallLog = async () => {
    if (!selectedAlert || !callStatus || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const log: AlertLog = {
        driverId: selectedAlert.driverId,
        driverName: selectedAlert.driverName,
        alertType: selectedAlert.type,
        status: callStatus,
        message: reason,
        timestamp: new Date().toISOString(),
        user: user.email
      };
      await addDoc(collection(db, 'alert_logs'), log);
      setLogs([log, ...logs]);
      setSelectedAlert(null);
      setCallStatus(null);
      setReason('');
    } catch (err) {
      console.error("Error saving call log:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string | number | undefined) => {
    if (!dateStr || dateStr === 0) return 'Never';
    if (typeof dateStr === 'number') {
      // Robust handling for both seconds and milliseconds
      const ms = dateStr > 100000000000 ? dateStr : dateStr * 1000;
      return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Alert Center</h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">Critical issues requiring immediate attention</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl w-fit">
          <button 
            onClick={() => { setActiveTab('tickets'); setCurrentPage(1); }}
            className={`px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'tickets' ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Ticket Alerts
          </button>
          <button 
            onClick={() => { setActiveTab('swaps'); setCurrentPage(1); }}
            className={`px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'swaps' ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            Swap Alerts
          </button>
        </div>

        <button 
          onClick={fetchAlerts}
          disabled={isRefetching}
          className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl font-bold text-sm shadow-sm hover:bg-zinc-50 transition-all shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
        <input 
          type="text" 
          placeholder="Search by Name, ID or Phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-bold transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {alerts.length === 0 ? (
            <div className="py-20 text-center bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 opacity-40">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
              <p className="text-lg font-bold text-zinc-900 dark:text-white">No active alerts</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div 
                key={alert.id || alert.driverId || alert.driver_id}
                className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${activeTab === 'tickets' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                      {activeTab === 'tickets' ? <AlertCircle className="w-7 h-7" /> : <RefreshCw className="w-7 h-7" />}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">{alert.driverName || alert.name}</h3>
                      <p className="text-xs font-bold text-zinc-400">ID: {alert.driverId || alert.driver_id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                      {activeTab === 'tickets' ? 'Raised On' : 'Last Swap'}
                    </p>
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {activeTab === 'tickets' 
                        ? new Date(alert.createdAt).toLocaleDateString()
                        : (alert.last_swap_date ? new Date(alert.last_swap_date > 100000000000 ? alert.last_swap_date : alert.last_swap_date * 1000).toLocaleDateString() : 'Never')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-6 border-t border-zinc-50 dark:border-zinc-800/50">
                  <div className="flex items-center gap-6">
                    <a 
                      href={`tel:${alert.driverPhone || alert.phone}`}
                      onClick={() => setSelectedAlert({ 
                        driverId: alert.driverId || alert.driver_id,
                        driverName: alert.driverName || alert.name,
                        phone: alert.driverPhone || alert.phone,
                        type: activeTab === 'tickets' ? 'Ticket' : 'Swap',
                        id: alert.id
                      })}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all"
                    >
                      <Phone className="w-4 h-4" />
                      {alert.driverPhone || alert.phone}
                    </a>
                    {activeTab === 'tickets' && (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Category</span>
                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{alert.category}</span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => setSelectedAlert({ 
                      driverId: alert.driverId || alert.driver_id,
                      driverName: alert.driverName || alert.name,
                      phone: alert.driverPhone || alert.phone,
                      type: activeTab === 'tickets' ? 'Ticket' : 'Swap',
                      id: alert.id
                    })}
                    className="w-full sm:w-auto px-6 py-2.5 bg-zinc-900 dark:bg-zinc-800 text-white rounded-xl font-bold text-sm hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
                  >
                    Log Call
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}

          <PaginationFooter 
            currentPage={currentPage}
            totalPages={Math.ceil(totalDatabaseCount / itemsPerPage)}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={() => {}} // fixed 10 for alerts
            dataLength={totalDatabaseCount}
          />
        </div>

        <div className="space-y-6">
          {/* Call Interaction Panel */}
          {selectedAlert ? (
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border-2 border-indigo-500 shadow-2xl shadow-indigo-500/10 animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">Call Interaction</h3>
                <button onClick={() => setSelectedAlert(null)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                  <XCircle className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Driver</p>
                <p className="text-lg font-black text-zinc-900 dark:text-white">{selectedAlert.driverName}</p>
                <p className="text-sm font-bold text-indigo-600">{selectedAlert.phone}</p>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Call Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setCallStatus('Picked')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${callStatus === 'Picked' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600' : 'border-zinc-100 dark:border-zinc-800 text-zinc-400 hover:border-zinc-200'}`}
                  >
                    <PhoneCall className="w-6 h-6" />
                    <span className="text-xs font-bold">Picked</span>
                  </button>
                  <button 
                    onClick={() => setCallStatus('Not Picked')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${callStatus === 'Not Picked' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/10 text-rose-600' : 'border-zinc-100 dark:border-zinc-800 text-zinc-400 hover:border-zinc-200'}`}
                  >
                    <PhoneOff className="w-6 h-6" />
                    <span className="text-xs font-bold">Not Picked</span>
                  </button>
                </div>

                {callStatus === 'Picked' && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Reason / Message</label>
                    <textarea 
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="What did the driver say?"
                      className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none dark:text-zinc-100 min-h-[100px] resize-none"
                    />
                  </div>
                )}

                <button 
                  onClick={handleCallLog}
                  disabled={!callStatus || isSubmitting}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20 mt-4"
                >
                  {isSubmitting ? 'Saving...' : 'Submit Log'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-[2.5rem] p-8 border border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-center h-64 opacity-60">
              <Phone className="w-10 h-10 text-zinc-300 mb-4" />
              <p className="text-sm font-bold text-zinc-500">Select an alert to log a call</p>
            </div>
          )}

          {/* Recent Logs */}
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <History className="w-5 h-5 text-zinc-400" />
              <h3 className="text-lg font-black text-zinc-900 dark:text-white tracking-tight">Recent Activity</h3>
            </div>
            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
              {logs.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-10">No call logs yet</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="relative pl-6 border-l-2 border-zinc-100 dark:border-zinc-800">
                    <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white dark:border-zinc-900 ${log.status === 'Picked' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    <div className="mb-1 flex justify-between items-start">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white">{log.driverName}</p>
                      <span className="text-[8px] font-bold text-zinc-400 uppercase">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">
                      <span className={`font-bold ${log.status === 'Picked' ? 'text-emerald-600' : 'text-rose-600'}`}>{log.status}</span>
                      {log.message && ` • ${log.message}`}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlertsPage;
