export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  companyName?: string;
  itin?: string;
  notes?: string;
  hourlyRate?: number;
  cloningRate?: number;
  programmingRate?: number;
  addKeyRate?: number;
  allKeysLostRate?: number;
  accessCode?: string;
  prepaidAmount?: number;
  portalId?: string;
  createdAt: Date;
  // Per-client portal branding (overrides Settings defaults)
  portalLogoUrl?: string;
  portalBgColor?: string;
  portalBusinessName?: string;
  portalBgImageUrl?: string;   // background image for portal body
}

export interface Vehicle {
  id: string;
  clientId: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  diagnosticPdfUrl?: string;
  prepaidAmount?: number;
}

export interface Part {
  name: string;
  quantity: number;
  price: number;
  description?: string;
  providedByClient?: boolean; // true = client brought the part, excluded from revenue
}

export interface SessionPhoto {
  id: string;
  filePath?: string;      // Path to photo file in filesystem
  base64?: string;        // Deprecated: only used for migration from old format
  cloudUrl?: string;      // Public URL of photo in cloud storage
  capturedAt: Date;
  sessionNumber: number;
}

export interface WorkPeriod {
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number; // seconds
  chargeMinimumHour?: boolean; // charge this period as minimum 1 hour if under 60min
}

export interface WorkSession {
  id: string;
  createdAt: Date;
  completedAt?: Date;
  description?: string;
  periods: WorkPeriod[];
  parts: Part[];
  photos?: SessionPhoto[];
  chargeMinimumHour?: boolean; // Bill minimum 1 hour for this session
  isCloning?: boolean; // Apply cloning rate to this session
  isProgramming?: boolean; // Apply programming rate to this session
  isAddKey?: boolean; // Apply add key rate to this session
  isAllKeysLost?: boolean; // Apply all keys lost rate to this session
}

export type TaskStatus = 'pending' | 'in-progress' | 'paused' | 'completed' | 'billed' | 'paid';

export interface Task {
  id: string;
  clientId: string;
  vehicleId: string;
  customerName: string;
  carVin: string;
  status: TaskStatus;
  totalTime: number; // seconds
  needsFollowUp: boolean;
  sessions: WorkSession[];
  createdAt: Date;
  startTime?: Date;
  activeSessionId?: string; // Track which session is currently being worked on
  chargeMinimumHour?: boolean; // @deprecated - use session.chargeMinimumHour instead
  importedSalary?: number; // Exact dollar amount from XLS "rel. Salary" column
  billedAmount?: number;   // Locked cost at time of billing — never recalculated
  diagnosticPdfUrl?: string; // URL to uploaded diagnostic PDF for this task
}

export interface BackupSettings {
  lastBackupDate?: string;
  autoBackupEnabled?: boolean;
  lastBackupStatus?: 'success' | 'failed';
}

export interface CloudSyncSettings {
  enabled: boolean;
  provider: 'google-drive' | 'none';
  syncIntervalMinutes: number; // 5, 15, 30, 60
  lastSyncDate?: string;
  lastSyncStatus?: 'success' | 'failed' | 'syncing';
  autoSyncOnChange: boolean;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  userEmail?: string;
}

export interface PaymentMethod {
  label: string;
  url: string;
  icon?: string; // emoji or identifier
  type?: 'link' | 'card'; // link = opens URL, card = Stripe/Square card form
}

export interface Settings {
  defaultHourlyRate: number;
  defaultCloningRate?: number;
  defaultProgrammingRate?: number;
  defaultAddKeyRate?: number;
  defaultAllKeysLostRate?: number;
  googleApiKey?: string;
  grokApiKey?: string;
  ocrSpaceApiKey?: string;
  ocrProvider?: 'gemini' | 'grok' | 'ocrspace' | 'tesseract';
  backup?: BackupSettings;
  cloudSync?: CloudSyncSettings;
  notificationsEnabled?: boolean;
  paymentLink?: string; // @deprecated - use paymentMethods instead
  paymentLabel?: string; // @deprecated - use paymentMethods instead
  paymentMethods?: PaymentMethod[];
  // Client portal branding
  portalLogoUrl?: string;       // URL or base64 of shop logo
  portalBgColor?: string;       // hex color for portal header gradient
  portalBusinessName?: string;  // shown in portal header instead of "Service Portal"
  portalBgImageUrl?: string;    // background image for portal body
}
