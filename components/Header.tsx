
import React from 'react';
import { 
  MagnifyingGlassIcon, 
  BellIcon, 
  EnvelopeIcon, 
  ChevronDownIcon, 
  Bars3Icon,
  SunIcon,
  MoonIcon
} from '@heroicons/react/24/outline';
import { UserRole } from '../types';
import { User } from "firebase/auth";

interface HeaderProps {
  role: UserRole;
  onMenuClick: () => void;
  isDarkMode: boolean;
  onThemeToggle: () => void;
  user: User;
  userName?: string;
}

const Header: React.FC<HeaderProps> = ({ role, onMenuClick, isDarkMode, onThemeToggle, user, userName }) => {
  return (
    <header className="h-20 border-b px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30 transition-all bg-white dark:bg-dark-surface border-gray-50 dark:border-dark-border">
      <div className="flex items-center gap-4 flex-1">
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-bg rounded-xl transition-colors"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>

        <div className="flex-1 max-w-xl hidden sm:block">
          <div className="relative group">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 group-focus-within:text-indigo-500 transition-colors w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search assets..."
              className="w-full pl-12 pr-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-transparent dark:border-dark-border rounded-2xl text-sm focus:bg-white dark:focus:bg-dark-surface focus:border-indigo-100 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 outline-none transition-all dark:text-zinc-100"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-6">
        <div className="flex items-center gap-1 lg:gap-2">
          <button 
            onClick={onThemeToggle}
            className="p-2.5 rounded-xl transition-all text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-dark-bg dark:hover:text-indigo-400"
          >
            {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>
          
          <button className="p-2.5 rounded-xl transition-all relative text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-dark-bg dark:hover:text-indigo-400">
            <EnvelopeIcon className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-2 border-white dark:border-dark-surface"></span>
          </button>
          <button className="hidden sm:flex p-2.5 rounded-xl transition-all text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-dark-bg dark:hover:text-indigo-400">
            <BellIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="h-8 w-[1px] bg-gray-100 dark:bg-dark-border"></div>

        <button className="flex items-center gap-2 lg:gap-3 pl-2 pr-1 py-1 rounded-2xl transition-all hover:bg-gray-50 dark:hover:bg-dark-bg">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold leading-tight font-heading text-zinc-900 dark:text-zinc-50">
              {userName || user.displayName || user.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
              {role}
            </p>
          </div>
          <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 border-2 border-white dark:border-dark-surface shadow-sm flex items-center justify-center text-white overflow-hidden text-xs font-bold">
             {user.photoURL ? (
               <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
             ) : (
               <span>{user.email?.charAt(0).toUpperCase() || 'U'}</span>
             )}
          </div>
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </header>
  );
};

export default Header;