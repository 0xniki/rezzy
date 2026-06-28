// Restaurant Config
export interface RestaurantConfig {
  id: number;
  name: string;
  total_extra_chairs: number;
  weather_location: string | null;
}

export interface RestaurantConfigCreate {
  name: string;
  total_extra_chairs?: number;
  weather_location?: string | null;
}

export interface RestaurantConfigUpdate {
  name?: string;
  total_extra_chairs?: number;
  weather_location?: string | null;
}

// Events and Weather
export interface WeatherHour {
  time: string;
  temperature_f: number | null;
  precipitation_probability: number | null;
  wind_speed_mph: number | null;
  condition: string | null;
}

export interface VenueEvent {
  source: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  url: string | null;
}

export interface DailyEventsContext {
  date: string;
  window_start: string | null;
  window_end: string | null;
  is_closed: boolean;
  weather_location: string | null;
  weather: WeatherHour[];
  events: VenueEvent[];
  errors: string[];
}

// Users
export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  is_active: boolean;
  created_at: string | null;
  approved_at: string | null;
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
}

export interface TableUpdate {
  table_number?: string;
  x_position?: number;
  y_position?: number;
  default_chairs?: number;
  max_chairs?: number;
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
  table_id: number;
  new_chair_count: number;
}

// Utility
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
