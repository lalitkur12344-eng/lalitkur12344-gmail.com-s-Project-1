export type UserRole = 'student' | 'faculty' | 'staff' | 'admin';

export interface UserNotificationPreferences {
  email: boolean;
  sms: boolean;
  inApp: boolean;
  unsubscribedEvents?: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
  enrollmentNumber?: string;
  mobileNumber?: string;
  notificationPreferences?: UserNotificationPreferences;
  academicYear?: string;
  hostel?: string;
  roomNumber?: string;
  isActive: boolean;
  createdAt?: string;
  lastLogin?: string;
}

export type ComplaintStatus = 'Pending' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed' | 'Reopened';
export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Emergency';

export interface ComplaintLocation {
  area: string;
  block?: string;
  room?: string;
  landmark?: string;
}

export interface ComplaintHistoryItem {
  timestamp: string;
  action: string;
  actor: {
    id: string;
    name: string;
    role: string;
  };
  notes?: string;
}

export interface ComplaintFeedback {
  rating: number; // 1 to 5
  comments: string;
  submittedAt: string;
}

export interface Complaint {
  id: string;
  complaintId: string;
  title: string;
  description: string;
  category: string;
  location: ComplaintLocation;
  priority: ComplaintPriority;
  severity: number;
  status: ComplaintStatus;
  isEscalated: boolean;
  escalatedAt?: string;
  escalationReason?: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: string;
    mobileNumber?: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  assignedDepartment: string;
  evidenceImages: string[];
  resolutionNotes?: string;
  resolutionEvidence?: string[];
  slaHours: number;
  slaDeadline: string;
  aiSummary?: string;
  aiSuggestedChecklist?: string[];
  history: ComplaintHistoryItem[];
  feedback?: ComplaintFeedback | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  headOfDepartment: string;
  contactEmail: string;
  slaHoursDefault: {
    Low: number;
    Medium: number;
    High: number;
    Emergency: number;
  };
  categories: string[];
}

export type NotificationChannel = 'in_app' | 'email' | 'sms';
export type DeliveryStatus = 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'skipped';

export interface NotificationItem {
  id: string;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  eventType: string;
  title: string;
  message: string;
  complaintId?: string;
  channel?: NotificationChannel;
  status?: DeliveryStatus;
  providerMessageId?: string;
  attemptCount?: number;
  errorCategory?: string;
  errorDetails?: string;
  isRead: boolean;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'Normal' | 'Urgent' | 'Emergency';
  targetAudience: 'all' | 'student' | 'faculty' | 'staff';
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface AnalyticsData {
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  closed: number;
  reopened: number;
  escalated: number;
  emergency: number;
  highPriority: number;
  avgResolutionHours: number;
  slaComplianceRate: number;
  avgSatisfaction: number;
  feedbackCount: number;
  categoryCounts: Record<string, number>;
  departmentCounts: Record<string, number>;
  staffWorkload: Array<{
    staffId: string;
    name: string;
    department: string;
    activeWorkload: number;
    totalResolved: number;
    totalAssigned: number;
  }>;
  departmentCount: number;
}

export interface CollegeRosterEntry {
  _id?: string;
  id?: string;
  email: string;
  name: string;
  role: UserRole;
  enrollmentNumber?: string;
  department?: string;
  academicYear?: string;
  hostel?: string;
  roomNumber?: string;
  mobileNumber?: string;
  isEligible: boolean;
  isClaimed: boolean;
  registeredUserId?: string;
  claimedAt?: string;
  createdAt?: string;
}

export interface RosterImportResult {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string; data?: any }>;
}

export interface RegistrationOtpRequest {
  email: string;
  enrollmentNumber?: string;
  password: string;
}

export interface RegistrationOtpResponse {
  message: string;
  emailMasked: string;
  resendAvailableInSeconds: number;
  devOtp?: string;
}

export interface RegistrationVerifyRequest {
  email: string;
  otp: string;
}

