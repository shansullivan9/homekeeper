export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Home {
  id: string;
  name: string;
  address: string | null;
  year_built: number | null;
  square_footage: number | null;
  floors: number;
  roof_type: string | null;
  exterior_type: string | null;
  hvac_type: string | null;
  hvac_units: number;
  water_heater_type: string | null;
  plumbing_type: string | null;
  has_irrigation: boolean;
  has_septic: boolean;
  has_well_water: boolean;
  has_deck: boolean;
  has_pool: boolean;
  has_garage: boolean;
  has_fireplace: boolean;
  has_dryer: boolean;
  invite_code: string;
  created_at: string;
}

export interface HomeMember {
  id: string;
  home_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profiles?: Profile;
}

export interface Category {
  id: string;
  home_id: string | null;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
  sort_order: number;
}
export type Recurrence = 'one_time' | 'weekly' | 'bi_monthly' | 'monthly' | 'quarterly' | 'bi_annual' | 'yearly' | 'custom';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  home_id: string;
  category_id: string | null;
  appliance_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  due_date: string | null;
  recurrence: Recurrence;
  recurrence_days: number | null;
  estimated_minutes: number | null;
  estimated_cost: number | null;
  priority: Priority;
  status: TaskStatus;
  is_suggestion: boolean;
  completed_at: string | null;
  completed_by: string | null;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
  categories?: Category;
}

export interface TaskHistory {
  id: string;
  task_id: string | null;
  home_id: string;
  title: string;
  category_name: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  completed_at: string;
  notes: string | null;
  cost: number | null;
  photos: string[] | null;
  duration_minutes: number | null;
}

export interface Appliance {
  id: string;
  home_id: string;
  name: string;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  category: string | null;
  location: string | null;
  installation_date: string | null;
  warranty_expiration: string | null;
  purchase_price: number | null;
  notes: string | null;
  photo_url: string | null;
  manual_document_id: string | null;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  home_id: string;
  event_type: 'maintenance' | 'replacement' | 'repair' | 'renovation' | 'purchase' | 'other';
  title: string;
  description: string | null;
  event_date: string;
  cost: number | null;
  photos: string[] | null;
  related_task_id: string | null;
  related_appliance_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  home_id: string;
  title: string;
  category: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  notes: string | null;
  searchable_text: string | null;
  appliance_id: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  push_subscription: any;
  remind_days_before: number;
  remind_on_due: boolean;
  remind_when_overdue: boolean;
}
