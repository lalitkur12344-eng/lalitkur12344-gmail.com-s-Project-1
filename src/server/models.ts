import mongoose, { Schema, Document } from 'mongoose';

export interface IUserNotificationPreferences {
  email: boolean;
  sms: boolean;
  inApp: boolean;
  unsubscribedEvents?: string[];
}

// User Schema
export interface IUser extends Document {
  identifier: string; // official email, roll no, or emp ID
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'staff' | 'admin';
  passwordHash: string;
  department?: string;
  enrollmentNumber?: string;
  mobileNumber?: string;
  notificationPreferences?: IUserNotificationPreferences;
  academicYear?: string;
  hostel?: string;
  roomNumber?: string;
  isActive: boolean;
  failedLoginAttempts?: number;
  lockUntil?: Date | null;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<IUser>(
  {
    identifier: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ['student', 'faculty', 'staff', 'admin'], default: 'student' },
    passwordHash: { type: String, required: true },
    department: { type: String, trim: true },
    enrollmentNumber: { type: String, trim: true, sparse: true, index: true },
    mobileNumber: { type: String, trim: true },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
      unsubscribedEvents: [{ type: String }],
    },
    academicYear: { type: String, trim: true },
    hostel: { type: String, trim: true },
    roomNumber: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ enrollmentNumber: 1 }, { unique: true, sparse: true });

// Complaint Schema
export interface IComplaint extends Document {
  complaintId: string; // e.g. REC-2026-1001
  title: string;
  description: string;
  category: string;
  location: {
    area: string;
    block?: string;
    room?: string;
    landmark?: string;
  };
  priority: 'Low' | 'Medium' | 'High' | 'Emergency';
  severity: number;
  status: 'Pending' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed' | 'Reopened';
  isEscalated: boolean;
  escalatedAt?: Date;
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
  };
  assignedDepartment: string;
  evidenceImages: string[];
  resolutionNotes?: string;
  resolutionEvidence: string[];
  slaHours: number;
  slaDeadline: Date;
  aiSummary?: string;
  aiSuggestedChecklist: string[];
  history: Array<{
    timestamp: Date;
    action: string;
    actor: { id: string; name: string; role: string };
    notes?: string;
  }>;
  feedback?: {
    rating: number;
    comments: string;
    submittedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

export const ComplaintSchema = new Schema<IComplaint>(
  {
    complaintId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    location: {
      area: { type: String, required: true },
      block: { type: String },
      room: { type: String },
      landmark: { type: String },
    },
    priority: { type: String, required: true, enum: ['Low', 'Medium', 'High', 'Emergency'], default: 'Medium' },
    severity: { type: Number, default: 3, min: 1, max: 5 },
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Reopened'],
      default: 'Pending',
      index: true,
    },
    isEscalated: { type: Boolean, default: false, index: true },
    escalatedAt: { type: Date },
    escalationReason: { type: String },
    createdBy: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      email: { type: String, required: true },
      role: { type: String, required: true },
      mobileNumber: { type: String },
    },
    assignedTo: {
      id: { type: String },
      name: { type: String },
      email: { type: String },
      department: { type: String },
    },
    assignedDepartment: { type: String, required: true, index: true },
    evidenceImages: [{ type: String }],
    resolutionNotes: { type: String },
    resolutionEvidence: [{ type: String }],
    slaHours: { type: Number, required: true },
    slaDeadline: { type: Date, required: true, index: true },
    aiSummary: { type: String },
    aiSuggestedChecklist: [{ type: String }],
    history: [
      {
        timestamp: { type: Date, default: Date.now },
        action: { type: String, required: true },
        actor: {
          id: { type: String, required: true },
          name: { type: String, required: true },
          role: { type: String, required: true },
        },
        notes: { type: String },
      },
    ],
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comments: { type: String },
      submittedAt: { type: Date },
    },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

// Department Schema
export interface IDepartment extends Document {
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

export const DepartmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    headOfDepartment: { type: String, required: true },
    contactEmail: { type: String, required: true },
    slaHoursDefault: {
      Low: { type: Number, default: 48 },
      Medium: { type: Number, default: 24 },
      High: { type: Number, default: 12 },
      Emergency: { type: Number, default: 4 },
    },
    categories: [{ type: String }],
  },
  { timestamps: true }
);

export type NotificationChannel = 'in_app' | 'email' | 'sms';
export type DeliveryStatus = 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'skipped';

// Notification Schema
export interface INotification extends Document {
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  eventType: string;
  title: string;
  message: string;
  complaintId?: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  providerMessageId?: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  errorCategory?: string;
  errorDetails?: string;
  idempotencyKey?: string;
  isRead: boolean;
  sentAt?: Date;
  deliveredAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = new Schema<INotification>(
  {
    recipientId: { type: String, required: true, index: true },
    recipientEmail: { type: String, trim: true },
    recipientPhone: { type: String, trim: true },
    eventType: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    complaintId: { type: String, index: true },
    channel: {
      type: String,
      enum: ['in_app', 'email', 'sms'],
      default: 'in_app',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'delivered', 'failed', 'skipped'],
      default: 'delivered',
      index: true,
    },
    providerMessageId: { type: String, sparse: true, index: true },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRetryAt: { type: Date, index: true },
    errorCategory: { type: String },
    errorDetails: { type: String },
    idempotencyKey: { type: String, sparse: true, index: true },
    isRead: { type: Boolean, default: false, index: true },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ channel: 1, status: 1, nextRetryAt: 1 });

// Announcement Schema
export interface IAnnouncement extends Document {
  title: string;
  content: string;
  priority: 'Normal' | 'Urgent' | 'Emergency';
  targetAudience: 'all' | 'student' | 'faculty' | 'staff';
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: Date;
}

export const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    priority: { type: String, enum: ['Normal', 'Urgent', 'Emergency'], default: 'Normal' },
    targetAudience: { type: String, enum: ['all', 'student', 'faculty', 'staff'], default: 'all' },
    createdBy: {
      id: { type: String, required: true },
      name: { type: String, required: true },
    },
  },
  { timestamps: true }
);

// Audit Log Schema
export interface IAuditLog extends Document {
  action: string;
  actor: {
    id: string;
    name: string;
    role: string;
  };
  details: any;
  ip: string;
  timestamp: Date;
}

export const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true },
    actor: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      role: { type: String, required: true },
    },
    details: { type: Schema.Types.Mixed },
    ip: { type: String, default: '127.0.0.1' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// College Roster Schema (Authorized student, faculty, staff identities)
export interface ICollegeRoster extends Document {
  email: string;
  name: string;
  role: 'student' | 'faculty' | 'staff' | 'admin';
  enrollmentNumber?: string;
  department?: string;
  academicYear?: string;
  hostel?: string;
  roomNumber?: string;
  mobileNumber?: string;
  isEligible: boolean;
  isClaimed: boolean;
  registeredUserId?: mongoose.Types.ObjectId | string;
  claimedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const CollegeRosterSchema = new Schema<ICollegeRoster>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, enum: ['student', 'faculty', 'staff', 'admin'], default: 'student', index: true },
    enrollmentNumber: { type: String, uppercase: true, trim: true, sparse: true, index: true },
    department: { type: String, trim: true },
    academicYear: { type: String, trim: true },
    hostel: { type: String, trim: true },
    roomNumber: { type: String, trim: true },
    mobileNumber: { type: String, trim: true },
    isEligible: { type: Boolean, default: true, index: true },
    isClaimed: { type: Boolean, default: false, index: true },
    registeredUserId: { type: Schema.Types.ObjectId, ref: 'User', sparse: true },
    claimedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

CollegeRosterSchema.index({ email: 1, isEligible: 1, isClaimed: 1 });

// Email Verification Schema (Time-limited OTPs)
export interface IEmailVerification extends Document {
  email: string;
  purpose: 'registration' | 'password_reset';
  otpHashed: string;
  pendingPasswordHash?: string;
  enrollmentNumber?: string;
  expiresAt: Date;
  attemptsRemaining: number;
  maxAttempts: number;
  resendAvailableAt: Date;
  resendCount: number;
  isUsed: boolean;
  verifiedAt?: Date;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const EmailVerificationSchema = new Schema<IEmailVerification>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, required: true, enum: ['registration', 'password_reset'], default: 'registration', index: true },
    otpHashed: { type: String, required: true },
    pendingPasswordHash: { type: String },
    enrollmentNumber: { type: String, uppercase: true, trim: true },
    expiresAt: { type: Date, required: true, index: true },
    attemptsRemaining: { type: Number, default: 3 },
    maxAttempts: { type: Number, default: 3 },
    resendAvailableAt: { type: Date, required: true },
    resendCount: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date },
    ip: { type: String },
  },
  { timestamps: true }
);

EmailVerificationSchema.index({ email: 1, purpose: 1, isUsed: 1, expiresAt: 1 });

// Pending Registration Schema for Mandatory Dual-OTP (Email + SMS)
export interface IPendingRegistration extends Document {
  email: string;
  enrollmentNumber: string;
  name: string;
  mobileNumber: string;
  department: string;
  academicYear?: string;
  passwordHash: string;

  // Email OTP
  emailOtpHashed: string;
  emailVerified: boolean;
  emailAttemptsRemaining: number;
  emailExpiresAt: Date;
  emailResendAvailableAt: Date;
  emailResendCount: number;

  // SMS OTP
  smsOtpHashed: string;
  smsVerified: boolean;
  smsAttemptsRemaining: number;
  smsExpiresAt: Date;
  smsResendAvailableAt: Date;
  smsResendCount: number;

  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PendingRegistrationSchema = new Schema<IPendingRegistration>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    enrollmentNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    academicYear: { type: String, trim: true },
    passwordHash: { type: String, required: true },

    emailOtpHashed: { type: String, required: true },
    emailVerified: { type: Boolean, default: false, index: true },
    emailAttemptsRemaining: { type: Number, default: 5 },
    emailExpiresAt: { type: Date, required: true, index: true },
    emailResendAvailableAt: { type: Date, required: true },
    emailResendCount: { type: Number, default: 0 },

    smsOtpHashed: { type: String, required: true },
    smsVerified: { type: Boolean, default: false, index: true },
    smsAttemptsRemaining: { type: Number, default: 5 },
    smsExpiresAt: { type: Date, required: true, index: true },
    smsResendAvailableAt: { type: Date, required: true },
    smsResendCount: { type: Number, default: 0 },

    ip: { type: String },
  },
  { timestamps: true }
);

// Auto-expire abandoned registrations after 1 hour
PendingRegistrationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

// Mongoose Models
export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const ComplaintModel = mongoose.models.Complaint || mongoose.model<IComplaint>('Complaint', ComplaintSchema);
export const DepartmentModel = mongoose.models.Department || mongoose.model<IDepartment>('Department', DepartmentSchema);
export const NotificationModel = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
export const AnnouncementModel = mongoose.models.Announcement || mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export const CollegeRosterModel = mongoose.models.CollegeRoster || mongoose.model<ICollegeRoster>('CollegeRoster', CollegeRosterSchema);
export const EmailVerificationModel = mongoose.models.EmailVerification || mongoose.model<IEmailVerification>('EmailVerification', EmailVerificationSchema);
export const PendingRegistrationModel = mongoose.models.PendingRegistration || mongoose.model<IPendingRegistration>('PendingRegistration', PendingRegistrationSchema);

