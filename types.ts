
import React from 'react';

export enum UserRole {
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
  SUPPORT_EXECUTIVE = 'SUPPORT_EXECUTIVE',
  MARKETING_EXECUTIVE = 'MARKETING_EXECUTIVE',
  TECHNICIAN = 'TECHNICIAN',
  OPERATOR = 'OPERATOR'
}

export type BatteryStatusLabel = 'Available' | 'Assigned' | 'Error' | 'Low SoC' | 'Charging' | 'Offline' | 'Plant' | 'Office' | 'Warehouse';

export interface Battery {
  _id: string;
  id: string; // Asset ID
  iot_id?: string;
  bms_id?: string;
  make: string;
  model: string;
  status: number; // 0, 2, 3, 4
  soc: number;
  soh: number;
  cycles?: number;
  charge_cycles?: number;
  discharge_cycles?: number;
  voltage: number;
  temperature: number;
  network: boolean;
  odometer: number;
  dealer_name: string;
  dealer_id?: string; // Added Station ID
  charge_state?: number; // Added for precise charging status
  driver_id?: string; // Root level driver ID
  driverData?: {
    id?: string; // Kept for backward compatibility if needed
    name: string;
    phone: string;
  };
  mosfet?: {
    charging: number;
    discharging: number;
  };
  last_updated_on: number | string; // Support both unix timestamp and ISO string
  last_swap_on?: number; // Added for swap tracking
  location: {
    coordinates: [number, number];
  };
  // New field for Smart Swap logic
  batteryHistory?: {
    txn_id?: string;
    timestamp: number; // Milliseconds
  };
}

// --- Driver Interfaces ---

export interface Driver {
  id?: string;
  driver_id: string;
  name: string;
  phone: string;
  wallet_balance: number;
  onboarded_on: number;
  onboardingStatus: string;
  is_active: boolean;
  assigned: boolean;
  city: string;
  total_swaps: number;
  last_swap_date?: number;
  
  // Nested Data Structures from API
  planData?: { plan_name: string; deposit_amount?: number; free_swaps?: number }[];
  vehicle_info?: { vehicle_number: string | null; chassis_number?: string | null };
  vehicleData?: { vehicle_number: string | null; chassis_number?: string | null }[];
  latest_swap?: { vehicle_number: string | null; last_swap_date?: number };
  
  // Optional / UI fields
  _id?: string; // Keeping optional for compatibility
  email?: string;
  profile_pic?: string;
  kyc_status?: boolean;
  activePenalty?: string;
  penalty_info?: {
    total_penalty_amount: number;
    paid_penalty_amount: number;
    pending_penalty_amount: number;
    paid_penalties: number;
    pending_penalties: number;
    total_penalties: number;
  };
}

export interface DriverOnboardingItem {
  installed: boolean;
  date?: string;
  remarks?: string;
}

export interface DriverOnboardingItem {
  installed: boolean;
  date?: string;
  remarks?: string;
}

export interface DriverMasterRecord {
  additional_phones: string[];
  onboarding: {
    harness: DriverOnboardingItem;
    soc_meter: DriverOnboardingItem;
    mcb: DriverOnboardingItem;
    extension_cable: DriverOnboardingItem;
  };
  id_card: {
    generated: boolean;
    delivered: boolean;
    photo_url?: string;
    current_holder_id?: string; // User email or 'Driver'
    current_holder_name?: string;
    status: 'Not Generated' | 'Generated' | 'In Transit' | 'Delivered';
    last_updated_at?: string;
  };
  gift_kit: {
    eligible: boolean;
    status: 'Pending' | 'Given' | 'Delivered Later';
    photo_url?: string;
    delivered_date?: string;
    image_link?: string; // New field for pasted link
  };
  status_info?: {
    inactive_primary_reason?: 'Left Service' | 'Temp Inactive';
    inactive_secondary_reason?: string;
    inactive_remarks?: string;
  };
  follow_up?: {
    category?: 'Will continue' | 'Not Continue' | 'Pending';
    timeframe?: string;
    reason?: string;
    remarks?: string;
    last_called_at?: string;
  };
  kit_recovery?: {
    harness?: boolean;
    soc_meter?: boolean;
    extension_cable?: boolean;
    mcb?: boolean;
    condition?: 'Good' | 'Damaged' | 'N/A';
    refund_amount?: number;
    recovered_date?: string;
  };
  referrer_info?: {
    is_our_driver: boolean;
    referrer_driver_id?: string;
    referrer_name?: string;
    referrer_phone?: string;
  };
  vehicle_specs?: {
    controller_v?: string;
    controller_wattage?: string;
    motor_v?: string;
    motor_wattage?: string;
  };
  connection_by?: {
    user_id: string; // email
    user_name: string; // fallback or display name if available
  };
  agreement_handed_over?: boolean;
}

export interface IDCardHandoverRequest {
  id: string;
  cardIds: string[]; // Changed from cardId to cardIds for bulk support
  fromId: string; // email
  fromName: string;
  toId: string; // email
  toName: string;
  pin: string;
  status: 'Pending' | 'Completed' | 'Cancelled' | 'Expired';
  timestamp: string;
  expiresAt?: string; // ISO string for 1-minute expiry
}

export interface DriverComment {
  id: string;
  driverId: string;
  text: string;
  author: string;
  timestamp: string;
}

export interface DriverRepairLog {
  id: string;
  driverId: string;
  item: string; // e.g., Harness, Meter
  reason: string;
  status: 'Pending' | 'Completed';
  timestamp: string;
  technician: string;
  photo_url?: string;
}

// -------------------------

export interface AssetChangeLog {
  id?: string;
  batteryId: string;
  timestamp: string; // ISO string
  field: 'iot_id' | 'bms_id';
  oldValue: string;
  newValue: string;
}

export const ISSUE_TYPES = [
  'UV issue',
  'UV issue observed again',
  'IoT offline',
  'BMS not connected',
  'E5 Error',
  'CE Error',
  'E3 Error',
  'Buzzer is beeping',
  'Other'
] as const;

export type IssueType = typeof ISSUE_TYPES[number];

export interface BatteryIssue {
  id: string;
  batteryId: string;
  stationId?: string;
  mainDescription: IssueType; // Replaces issueType for clarity in new logic
  subDescription?: string;
  occurrenceCount: number;
  occurrenceDates: string[]; // Array of ISO strings
  raisedBy: string; // email
  raisedByName: string;
  raisedByRole: UserRole;
  createdAt: string; // ISO (First occurrence)
  lastOccurrenceAt: string; // ISO (Latest occurrence)
  status: 'Open' | 'Closed' | 'Pending';
  currentLocationContext: string;
  verifiedBy?: string;
  verifiedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  actionTaken?: string;
  resolutionDate?: string;
  // Keep issueType for backward compatibility during transition if needed
  issueType: IssueType; 
}

export interface RepairLog {
  id: string;
  issueId: string;
  batteryId: string;
  technician: string;
  action: string;
  location: string; // Station/Office/Plant
  resolved: boolean;
  timestamp: string; // ISO
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  category: string;
  roles: UserRole[];
}

// --- Station Types ---

export interface Station {
  _id: string;
  id: string;
  dealer_id: string;
  name: string;
  location: [number, number]; // [lat, lng]
  location_url?: string;
  last_synced_at?: string;
}

export type TicketStatus = 'Open' | 'Initiated Close' | 'Closed' | 'Pending Admin';

export const TICKET_CLOSING_REASONS = [
  'No issue',
  'UV issue',
  'Battery Issue',
  'Rickshaw stopped',
  'Other'
] as const;

export type TicketClosingReason = typeof TICKET_CLOSING_REASONS[number];

export interface TicketReply {
  id: string;
  ticketId: string;
  message: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  timestamp: string;
}

export interface Ticket {
  id: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  category: string;
  subCategory: string;
  message?: string;
  technicianId?: string;
  technicianName?: string;
  status: TicketStatus;
  closingReason?: TicketClosingReason;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  compensationInfo?: {
    type: 'Half' | 'Free' | 'Acc to Left';
    status: 'Pending' | 'Given';
    requestedAt: string;
    requestedBy: string;
  };
  technicianClosingInfo?: {
    issueDescription: string;
    issueResolved: 'Yes' | 'No' | 'Issue is not our side';
    itemsReplaced: string[];
    charges: {
      cash: number;
      upi: number;
    };
    initiatedAt: string;
  };
  adminClosingInfo?: {
    description: string;
    compensation: number;
    closedAt: string;
    closedBy: string;
  };
}

export interface SwappingSession {
  _id: string;
  txn_id: string;
  payee_id: string;
  payer_id: string;
  vehicle_number: string;
  mode: string;
  start_time: number;
  type: number;
  amount: number;
  dealer_share: number;
  odometer_details: {
    old_odometer: number[];
    new_odometer: number[];
  };
  soc_details: {
    old_soc: number[];
    new_soc: number[];
  };
  driverData: {
    _id: string;
    driver_id: string;
    name: string;
    phone: string;
  };
  end_time: number;
  timestamp: number;
  old_battries: string[];
  new_battries: string[];
  duration: number;
  dealer_name: string;
  penalty_amount?: number;
  penalty_paid_amount?: number;
  total_penalty_paid: number;
  penalty_payment_count: number;
  odometer_range_1: number;
  odometer_range_2: number;
  soc_range_1: number;
  soc_range_2: number;
}

export interface DriverPenaltyReport {
  driver_id: string;
  name: string;
  phone: string;
  vehicle_number: string;
  last_swap_date: number | null;
  pending_penalty: number;
  last_synced_at: string; // ISO
  driver_status: boolean;
  onboarding_status: string;
  battery_assigned: boolean;
  kyc_status: boolean;
  onboarded_on?: number;
}

// --- Financial Management Interfaces ---

export interface CashDenominations {
  n500: number; // Count of 500 notes
  n200: number;
  n100: number;
  n50: number;
  n20: number;
  n10: number;
  coins: number; // Total amount in coins
}

export interface CashCollection {
  id?: string;
  stationId: string;
  stationName: string;
  operatorId: string; // User email
  operatorName: string;
  collectedBy: string; // Current user email who is recording this
  collectedByName: string;
  denominations: CashDenominations;
  totalAmount: number;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO string
}

export interface FinancialSnapshot {
  id: string; // Date (YYYY-MM-DD)
  date: string;
  swap_amount: number; // Expected
  penalty_amount: number; // Expected
  grand_total: number; // swap + penalty
  received_swap_amount: number;
  received_penalty_amount: number;
  total_received: number; // received_swap + received_penalty
  difference: number; // grand_total - total_received
  created_at: string; // ISO
}

export interface CashDeposit {
  id: string;
  date: string;
  amount: number;
  reference: string;
  notes: string;
  created_at: string; // ISO
}

export interface CoinConversion {
  id: string;
  date_given: string;
  vendor_name: string;
  amount_given: number;
  amount_received: number;
  date_received: string | null;
  status: 'Pending' | 'Converted';
  created_at: string; // ISO
}

export interface DriverPayment {
  id: string;
  driver_id: string;
  driver_name: string;
  amount: number;
  payment_type: 'Cash' | 'Other';
  date: string;
  created_at: string; // ISO
}

export interface ColumnGroup {
  id: string;
  name: string;
  columnKeys: string[];
  createdAt: string;
  type?: string;
}

export interface StationGroup {
  id: string;
  name: string;
  stationIds?: string[];
  stationNames?: string[]; // For SwappingTransactionsPage
  createdAt: string;
  type?: string;
}

export interface CashExpense {
  id: string;
  date: string;
  amount: number;
  purpose: string;
  paid_to: string;
  payment_method: 'Cash';
  created_at: string; // ISO
}
