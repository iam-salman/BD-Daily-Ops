import React, { useState, useEffect, useMemo } from 'react';
import { 
  BuildingStorefrontIcon, 
  MagnifyingGlassIcon, 
  MapPinIcon, 
  ArrowPathIcon,
  CheckIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { Station } from '../types';
import SortableHeader from '../components/SortableHeader';
import PaginationFooter from '../components/PaginationFooter';
import CopyButton from '../components/CopyButton';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

interface StationsPageProps { isDarkMode: boolean; }

const SkeletonCard: React.FC = () => (
  <div className="animate-pulse bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
      <div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl"></div>
    </div>
    <div className="space-y-2">
      <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded"></div>
      <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
    </div>
  </div>
);

const StationsPage: React.FC<StationsPageProps> = ({ isDarkMode }) => {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchStations = async () => {
    setLoading(true);
    try {
      const stationsRef = collection(db, 'swap_stations');
      const qSnapshot = await getDocs(query(stationsRef, orderBy('name', 'asc')));
      let stationsData = qSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Station));

      if (searchQuery) {
        const qStr = searchQuery.toLowerCase();
        stationsData = stationsData.filter(s => 
          s.name.toLowerCase().includes(qStr) || 
          s.dealer_id?.toLowerCase().includes(qStr)
        );
      }

      setTotalDatabaseCount(stationsData.length);
      const totalPagesCount = Math.ceil(stationsData.length / itemsPerPage);
      
      const startIndex = (currentPage - 1) * itemsPerPage;
      const paginatedData = stationsData.slice(startIndex, startIndex + itemsPerPage);

      setStations(paginatedData);
      setHasMore(currentPage < totalPagesCount);
    } catch (err) {
      console.error("Error fetching stations:", err);
      setNotification({ message: 'Failed to fetch stations', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [currentPage, searchQuery]);

  const totalPages = Math.ceil(totalDatabaseCount / itemsPerPage);
  const paginatedData = stations;
  
  const openMap = (e: React.MouseEvent, coords: [number, number]) => { 
    e.stopPropagation(); 
    if (!coords || coords.length < 2) return; 
    window.open(`https://www.google.com/maps?q=${coords[0]},${coords[1]}`, '_blank'); 
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
      
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Station Network</h2>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-100 dark:border-indigo-800 w-fit">
            <BuildingStorefrontIcon className="w-3.5 h-3.5" />
            <span>{stations.length} Active Hubs</span>
          </div>
        </div>
        
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search Stations by Name or ID..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-bold transition-all shadow-sm" 
          />
        </div>
      </div>

      <div className="min-h-[400px]">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-col items-center justify-center opacity-40">
              <BuildingStorefrontIcon className="w-16 h-16 text-zinc-300 dark:text-zinc-600 mb-4" />
              <p className="text-lg font-bold text-zinc-900 dark:text-white">No stations found</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {paginatedData.map(station => (
              <div 
                key={station._id || station.id} 
                className="group bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl text-indigo-600 dark:text-indigo-400">
                    <BuildingStorefrontIcon className="w-6 h-6" />
                  </div>
                  <button 
                    onClick={(e) => openMap(e, station.location)} 
                    className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                    title="View on Google Maps"
                  >
                    <MapPinIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white line-clamp-1">{station.name}</h3>
                  </div>

                  <div className="pt-4 border-t border-zinc-50 dark:border-zinc-800/50">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Station ID</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400 font-mono tracking-tight">{station.dealer_id}</span>
                      <CopyButton text={station.dealer_id} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-4 mt-8">
        <PaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(val) => {
            setItemsPerPage(val);
            setCurrentPage(1);
          }}
          dataLength={totalDatabaseCount}
        />
      </div>
    </div>
  );
};

export default StationsPage;
