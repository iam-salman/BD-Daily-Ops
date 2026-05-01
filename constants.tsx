
import React from 'react';
import { 
  Squares2X2Icon,
  BoltIcon,
  Battery50Icon,
  BuildingStorefrontIcon,
  UsersIcon,
  ClipboardDocumentCheckIcon,
  IdentificationIcon,
  ExclamationTriangleIcon,
  SignalSlashIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  PresentationChartLineIcon,
  ClockIcon,
  DocumentTextIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  CommandLineIcon,
  MegaphoneIcon,
  CubeIcon,
  BanknotesIcon,
  MagnifyingGlassCircleIcon,
  MapIcon,
  TicketIcon
} from '@heroicons/react/24/outline';
import { NavItem, UserRole } from './types';

export const NAVIGATION: NavItem[] = [
  // Core Operations
  { id: 'dashboard', label: 'Dashboard', icon: <Squares2X2Icon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.SUPPORT_EXECUTIVE, UserRole.TECHNICIAN, UserRole.OPERATOR, UserRole.MARKETING_EXECUTIVE] },
  { id: 'alerts', label: 'Alerts', icon: <MegaphoneIcon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN, UserRole.SUPPORT_EXECUTIVE, UserRole.TECHNICIAN] },
  { id: 'drivers', label: 'Drivers', icon: <UsersIcon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN] },
  { id: 'id-cards', label: 'ID Cards', icon: <IdentificationIcon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.SUPPORT_EXECUTIVE, UserRole.TECHNICIAN, UserRole.OPERATOR, UserRole.MARKETING_EXECUTIVE] },
  { id: 'stations', label: 'Stations', icon: <BuildingStorefrontIcon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN] },
  { id: 'tickets', label: 'Tickets', icon: <TicketIcon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN, UserRole.SUPPORT_EXECUTIVE, UserRole.TECHNICIAN] },
  
  // Daily Operations
  { id: 'inventory', label: 'Inventory', icon: <CubeIcon className="w-5 h-5" />, category: 'Daily Operations', roles: [UserRole.ADMIN] },
  { id: 'swap-sessions', label: 'Swap Sessions', icon: <PresentationChartLineIcon className="w-5 h-5" />, category: 'Daily Operations', roles: [UserRole.ADMIN] },
  { id: 'cash-report', label: 'Cash Collections', icon: <BanknotesIcon className="w-5 h-5" />, category: 'Daily Operations', roles: [UserRole.ADMIN, UserRole.SUPERVISOR] },

  // System
  { id: 'users', label: 'User Management', icon: <UserGroupIcon className="w-5 h-5" />, category: 'System', roles: [UserRole.ADMIN] },
  { id: 'settings', label: 'Settings', icon: <Cog6ToothIcon className="w-5 h-5" />, category: 'System', roles: [UserRole.ADMIN] },
];
