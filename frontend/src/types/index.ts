// Restaurant Config
export interface RestaurantConfig {
  id: number;
  name: string;
  total_extra_chairs: number;
}

export interface RestaurantConfigCreate {
  name: string;
  total_extra_chairs?: number;
}

export interface RestaurantConfigUpdate {
  name?: string;
  total_extra_chairs?: number;
}

// Tables
export interface Table {
  id: number;
  table_number: string;
  x_position: number;
  y_position: number;
  default_chairs: number;
  max_chairs: number;
  current_chairs: number;
  is_active: boolean;
}

export interface TableCreate {
  table_number: string;
  x_position?: number;
  y_position?: number;
  default_chairs: number;
  max_chairs: number;
  current_chairs?: number;
}

export interface TableUpdate {
  table_number?: string;
  x_position?: number;
  y_position?: number;
  default_chairs?: number;
  max_chairs?: number;
  current_chairs?: number;
  is_active?: boolean;
}

// Operating Hours
export interface OperatingHours {
  id: number;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export interface OperatingHoursCreate {
  day_of_week: number;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean;
}

export interface OperatingHoursUpdate {
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean;
}

// Special Hours
export interface SpecialHours {
  id: number;
  date: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  reason: string | null;
}

export interface SpecialHoursCreate {
  date: string;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean;
  reason?: string | null;
}

export interface SpecialHoursUpdate {
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean;
  reason?: string | null;
}

// Reservations
export type ReservationStatus = 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: number;
  guest_name: string;
  party_size: number;
  phone_number: string | null;
  notes: string | null;
  reservation_date: string;
  reservation_time: string;
  duration_minutes: number;
  table_ids: number[];
  tables: Table[];
  status: ReservationStatus;
}

export interface ReservationCreate {
  guest_name: string;
  party_size: number;
  phone_number?: string | null;
  notes?: string | null;
  reservation_date: string;
  reservation_time: string;
  duration_minutes?: number;
  table_ids: number[];
}

export interface ReservationUpdate {
  guest_name?: string;
  party_size?: number;
  phone_number?: string | null;
  notes?: string | null;
  reservation_date?: string;
  reservation_time?: string;
  duration_minutes?: number;
  table_ids?: number[];
  status?: ReservationStatus;
}

// Availability result — either a single table or a suggested combo
export interface AvailableOption {
  type: 'table' | 'combo';
  table_ids: number[];
  table_numbers: string[];
  capacity: number;
}

export interface ChairRearrangement {
  table_adjustments: { table_id: number; chair_delta: number }[];
}

// Utility
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
