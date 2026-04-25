import React, { useState, useRef, useEffect } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays,
  X
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO, isToday } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface CustomDatePickerProps {
  value: string; // ISO string or YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  label?: string;
}

export function CustomDatePicker({ value, onChange, className = '', label }: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? new Date(value) : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-zinc-500" />
        </button>
        <span className="text-[10px] font-black text-zinc-900 dark:text-white uppercase tracking-[0.15em]">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </button>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    return (
      <div className="grid grid-cols-7 mb-1">
        {days.map((day, idx) => (
          <div key={idx} className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center py-1">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;
        const isSelected = selectedDate && isSameDay(day, selectedDate);
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isCurrentDay = isToday(day);

        days.push(
          <div
            key={day.toString()}
            className={`relative flex items-center justify-center h-8 w-8 mx-auto cursor-pointer rounded-xl transition-all font-black text-[11px]
              ${!isCurrentMonth ? "text-zinc-200 dark:text-zinc-800" : "text-zinc-500 dark:text-zinc-400"}
              ${isSelected ? "bg-indigo-600 !text-white shadow-lg shadow-indigo-200/50 dark:shadow-none" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}
              ${isCurrentDay && !isSelected ? "border border-indigo-500/30" : ""}
            `}
            onClick={() => {
              onChange(format(cloneDay, "yyyy-MM-dd"));
              setIsOpen(false);
            }}
          >
            <span>{formattedDate}</span>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-y-0.5" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="space-y-0.5">{rows}</div>;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-1 mb-2 block">{label}</label>}
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative group cursor-pointer bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800/50 rounded-2xl transition-all h-10 flex items-center
          ${isOpen ? 'ring-4 ring-indigo-500/10 border-indigo-500/30' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}
        `}
      >
        <Calendar className={`absolute left-3 w-4 h-4 transition-colors ${isOpen ? 'text-indigo-500' : 'text-zinc-400 group-hover:text-zinc-500'}`} />
        <div className="w-full pl-9 pr-4 text-[11px] font-black text-zinc-900 dark:text-white uppercase tracking-wider truncate">
          {value ? format(new Date(value), 'dd MMM yyyy') : 'Select Date'}
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[998] md:hidden"
            />
            
            {/* Centering wrapper for mobile, absolute for desktop */}
            <div className="fixed inset-0 z-[999] pointer-events-none md:absolute md:inset-auto md:top-full md:left-0 md:mt-2 md:z-[100] md:pointer-events-auto flex items-center justify-center md:block">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="pointer-events-auto w-[280px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-[2rem] shadow-2xl overflow-hidden"
              >
                {renderHeader()}
                <div className="p-3">
                  {renderDays()}
                  {renderCells()}
                </div>
                
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800/50">
                  <button
                    onClick={() => {
                      onChange('');
                      setIsOpen(false);
                    }}
                    className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest hover:text-rose-500 transition-colors"
                  >
                    Clear
                  </button>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        onChange(format(new Date(), "yyyy-MM-dd"));
                        setCurrentMonth(new Date());
                        setIsOpen(false);
                      }}
                      className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline"
                    >
                      Today
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
