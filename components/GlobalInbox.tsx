
import React, { useState, useEffect, useCallback } from 'react';
import { 
  XMarkIcon, 
  InboxIcon, 
  ChatBubbleLeftRightIcon,
  KeyIcon,
  ClipboardIcon,
  CheckIcon,
  ChevronDownIcon,
  MapPinIcon
} from '@heroicons/react/24/outline';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc,
  Firestore,
  limit,
  orderBy,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { UserMessage } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface GlobalInboxProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  db: Firestore;
  userName: string;
}

const GlobalInbox: React.FC<GlobalInboxProps> = ({ isOpen, onClose, userEmail, db, userName }) => {
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  const groupedMessages = React.useMemo(() => {
    const groups: { label: string; messages: UserMessage[] }[] = [];
    messages.forEach(msg => {
      const date = new Date(msg.timestamp);
      const isToday = date.toDateString() === new Date().toDateString();
      const label = isToday ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      
      const existing = groups.find(g => g.label === label);
      if (existing) {
        existing.messages.push(msg);
      } else {
        groups.push({ label, messages: [msg] });
      }
    });
    return groups;
  }, [messages]);

  const fetchMessages = useCallback(async (isLoadMore = false) => {
    if (!userEmail || loading) return;
    
    setLoading(true);
    try {
      const messagesRef = collection(db, "user_messages");
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayISO = startOfToday.toISOString();

      let q;
      let snapshot;
      
      try {
        if (!isLoadMore && !showOlder) {
          // Initial load: Try to get today's messages first
          q = query(
            messagesRef,
            where("toId", "==", userEmail),
            where("timestamp", ">=", todayISO),
            limit(10)
          );
        } else {
          // Load more or show older
          q = query(
            messagesRef,
            where("toId", "==", userEmail),
            limit(10)
          );
          if (isLoadMore && lastDoc) {
            q = query(q, startAfter(lastDoc));
          }
        }
        snapshot = await getDocs(q);
      } catch (innerErr: any) {
        console.warn("Optimized inbox query failed, falling back to simple query.", innerErr);
        // Fallback: Simple query
        q = query(
          messagesRef,
          where("toId", "==", userEmail),
          limit(50) 
        );
        snapshot = await getDocs(q);
      }

      let newMessages = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as UserMessage));
      
      // Always sort manually
      newMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // If we finished today's messages, but haven't started showing older ones, 
      // we should still allow loading more (which will transition to older ones)
      if (!isLoadMore && !showOlder && newMessages.length < 10) {
        setHasMore(true); 
      } else {
        setHasMore(snapshot.docs.length === 10);
      }

      if (isLoadMore) {
        if (!showOlder && messages.length > 0 && newMessages.length === 0) {
          // We were showing today, reached end, now start showing older
          setShowOlder(true);
          const olderQ = query(
            messagesRef,
            where("toId", "==", userEmail),
            startAfter(lastDoc),
            limit(10)
          );
          const olderSnap = await getDocs(olderQ);
          const olderMsgs = olderSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as UserMessage));
          olderMsgs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setMessages(prev => [...prev, ...olderMsgs]);
          setLastDoc(olderSnap.docs[olderSnap.docs.length - 1] || null);
          setHasMore(olderSnap.docs.length === 10);
        } else {
          setMessages(prev => [...prev, ...newMessages]);
          setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
          setHasMore(snapshot.docs.length === 10);
        }
      } else if (!isLoadMore && !showOlder && newMessages.length === 0) {
        setShowOlder(true);
        const fallbackQ = query(
          messagesRef,
          where("toId", "==", userEmail),
          limit(10)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        newMessages = fallbackSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as UserMessage));
        newMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLastDoc(fallbackSnap.docs[fallbackSnap.docs.length - 1] || null);
        setHasMore(fallbackSnap.docs.length === 10);
        setMessages(newMessages);
      } else if (!isLoadMore) {
        // Initial load with data
        setMessages(newMessages);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === 10);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      setLoading(false);
    }
  }, [db, userEmail, lastDoc, loading, showOlder]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      fetchMessages();
    }
  }, [isOpen, userEmail]);

  // Real-time listener for new messages (unread count sync and instant updates)
  useEffect(() => {
    if (!userEmail || !isOpen) return;

    // We only listen for the most recent to notify user
    const q = query(
      collection(db, "user_messages"),
      where("toId", "==", userEmail),
      limit(10) // Get a small batch to ensure we catch the fresh ones even without orderBy
    );

    const unsubscribe = onSnapshot(q, (snap) => {
       // We don't need to do much here if we just want to know if there are changes
       // Header will handle unread count. GlobalInbox uses fetchMessages manually usually.
    }, (err) => {
      console.warn("Snapshot listener error (likely index):", err);
    });

    return () => unsubscribe();
  }, [db, userEmail, isOpen]);

  const markAsRead = async (messageId: string) => {
    try {
      await updateDoc(doc(db, "user_messages", messageId), { read: true });
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, read: true } : m));
    } catch (err) {
      console.error("Error marking message as read:", err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 z-[110] w-full max-w-md h-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                  <InboxIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">Inbox</h3>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{userName}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-2xl text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-all border border-zinc-100 dark:border-zinc-800 shadow-sm grow-0 shrink-0"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
              {messages.length === 0 && !loading ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                  <ChatBubbleLeftRightIcon className="w-16 h-16 text-zinc-300 dark:text-zinc-700 mb-4" />
                  <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">No messages yet</p>
                </div>
              ) : (
                <>
                  {groupedMessages.map(group => (
                    <div key={group.label} className="space-y-4">
                      <div className="flex items-center gap-4 py-2">
                        <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">{group.label}</span>
                        <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800"></div>
                      </div>
                      {group.messages.map(msg => (
                        <motion.div 
                          layout
                          key={msg.id} 
                          onClick={() => !msg.read && markAsRead(msg.id)}
                          className={`group relative p-6 rounded-[2rem] border transition-all cursor-pointer ${
                            msg.read 
                              ? 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800' 
                              : 'bg-indigo-50/30 dark:bg-indigo-900/5 border-indigo-100/50 dark:border-indigo-900/20 shadow-sm hover:shadow-md'
                          }`}
                        >
                          {!msg.read && (
                            <span className="absolute top-6 left-3 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                          )}

                          <div className="flex justify-between items-start mb-3 ml-2">
                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${msg.read ? 'text-zinc-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                              {msg.type || 'Notification'}
                            </p>
                            <span className="text-[10px] font-bold text-zinc-400">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <h4 className={`font-bold text-sm mb-1 ml-2 ${msg.read ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                            {msg.title}
                          </h4>
                          {msg.stationName && (
                            <div className="flex items-center gap-1.5 ml-2 mb-2 text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full w-fit">
                              <MapPinIcon className="w-3 h-3" />
                              {msg.stationName}
                            </div>
                          )}
                          <p className="text-xs text-zinc-500 dark:text-zinc-500 font-medium mb-4 ml-2 leading-relaxed">
                            {msg.body}
                          </p>
                          
                          {msg.type === 'HandoverCode' && msg.code && (
                            <div className="ml-2 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 group-hover:border-indigo-200 dark:group-hover:border-indigo-800 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <KeyIcon className="w-4 h-4" />
                                </div>
                                <span className="text-2xl font-black tracking-[0.2em] text-zinc-900 dark:text-white">
                                  {msg.code}
                                </span>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(msg.code!, msg.id);
                                }}
                                className={`p-2 rounded-xl transition-all ${
                                  copiedId === msg.id 
                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' 
                                    : 'bg-white dark:bg-zinc-900 text-zinc-400 hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400 border border-zinc-100 dark:border-zinc-800 shadow-sm'
                                }`}
                              >
                                {copiedId === msg.id ? <CheckIcon className="w-5 h-5" /> : <ClipboardIcon className="w-5 h-5" />}
                              </button>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  ))}
                  
                  {hasMore && (
                    <button 
                      onClick={() => fetchMessages(true)}
                      disabled={loading}
                      className="w-full py-4 flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-2xl transition-all disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <>
                          Load More
                          <ChevronDownIcon className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
            
            <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <button 
                onClick={onClose}
                className="w-full py-4 bg-zinc-900 dark:bg-zinc-800 text-white rounded-2xl font-bold hover:bg-black dark:hover:bg-zinc-700 transition-all active:scale-95 shadow-lg"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default GlobalInbox;
