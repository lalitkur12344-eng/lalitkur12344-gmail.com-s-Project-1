import { Complaint, User, Department, NotificationItem, Announcement, AnalyticsData } from '../types';

const rawApiUrl = (import.meta as any).env?.VITE_API_URL || '';
const API_BASE = rawApiUrl ? `${String(rawApiUrl).replace(/\/$/, '')}/api` : '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('recb_campus_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Auth
  auth: {
    getStatus: async (): Promise<{ hasUsers: boolean; totalUsers: number }> => {
      const res = await fetch(`${API_BASE}/auth/status`);
      return handleResponse(res);
    },
    setupInitialAdmin: async (adminData: {
      name: string;
      email: string;
      identifier?: string;
      password: string;
      mobileNumber?: string;
      department?: string;
    }): Promise<{ message: string; token: string; user: User }> => {
      const res = await fetch(`${API_BASE}/auth/setup-initial-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminData),
      });
      return handleResponse(res);
    },
    login: async (identifier: string, password: string): Promise<{ token: string; user: User }> => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      return handleResponse(res);
    },
    getProfile: async (): Promise<{ user: User }> => {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    updateProfile: async (data: Partial<User>): Promise<{ message: string; user: User }> => {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    forgotPassword: async (identifier: string): Promise<{ message: string; demoToken?: string }> => {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      return handleResponse(res);
    },
    resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      return handleResponse(res);
    },
    registerRequestOtp: async (data: {
      email: string;
      enrollmentNumber?: string;
      password: string;
    }): Promise<{ message: string; emailMasked: string; resendAvailableInSeconds: number; devOtp?: string }> => {
      const res = await fetch(`${API_BASE}/auth/register/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    registerVerifyOtp: async (data: {
      email: string;
      otp: string;
    }): Promise<{ message: string; token: string; user: User }> => {
      const res = await fetch(`${API_BASE}/auth/register/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    registerResendOtp: async (data: {
      email: string;
    }): Promise<{ message: string; emailMasked: string; resendAvailableInSeconds: number; devOtp?: string }> => {
      const res = await fetch(`${API_BASE}/auth/register/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    registerInitiate: async (data: {
      name: string;
      email: string;
      enrollmentNumber: string;
      mobileNumber: string;
      department: string;
      academicYear?: string;
      password: string;
      confirmPassword: string;
    }): Promise<{
      message: string;
      emailMasked: string;
      mobileMasked: string;
      resendAvailableInSeconds: number;
      devEmailOtp?: string;
      devSmsOtp?: string;
    }> => {
      const res = await fetch(`${API_BASE}/auth/register/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    verifyEmailOtp: async (data: {
      email: string;
      otp: string;
    }): Promise<{
      message: string;
      emailVerified: boolean;
      smsVerified: boolean;
      fullyVerified: boolean;
      token?: string;
      user?: User;
    }> => {
      const res = await fetch(`${API_BASE}/auth/register/verify-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    verifySmsOtp: async (data: {
      email: string;
      otp: string;
    }): Promise<{
      message: string;
      emailVerified: boolean;
      smsVerified: boolean;
      fullyVerified: boolean;
      token?: string;
      user?: User;
    }> => {
      const res = await fetch(`${API_BASE}/auth/register/verify-sms-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    resendDualOtp: async (data: {
      email: string;
      channel: 'email' | 'sms';
    }): Promise<{
      message: string;
      resendAvailableInSeconds: number;
      devOtp?: string;
    }> => {
      const res = await fetch(`${API_BASE}/auth/register/resend-dual-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
  },

  // Complaints
  complaints: {
    list: async (filters?: {
      status?: string;
      category?: string;
      priority?: string;
      department?: string;
      search?: string;
      assignedToMe?: boolean;
    }): Promise<{ complaints: Complaint[]; total: number }> => {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.category) params.append('category', filters.category);
      if (filters?.priority) params.append('priority', filters.priority);
      if (filters?.department) params.append('department', filters.department);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.assignedToMe) params.append('assignedToMe', 'true');

      const res = await fetch(`${API_BASE}/complaints?${params.toString()}`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    getById: async (id: string): Promise<{ complaint: Complaint }> => {
      const res = await fetch(`${API_BASE}/complaints/${id}`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    create: async (data: any): Promise<{ message: string; complaint: Complaint; duplicateWarning?: any }> => {
      const res = await fetch(`${API_BASE}/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    updateStatus: async (
      id: string,
      status: string,
      resolutionNotes?: string,
      resolutionEvidence?: string[]
    ): Promise<{ message: string; complaint: Complaint }> => {
      const res = await fetch(`${API_BASE}/complaints/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ status, resolutionNotes, resolutionEvidence }),
      });
      return handleResponse(res);
    },
    reassign: async (
      id: string,
      newStaffId?: string,
      newDepartment?: string,
      reason?: string
    ): Promise<{ message: string; complaint: Complaint }> => {
      const res = await fetch(`${API_BASE}/complaints/${id}/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ newStaffId, newDepartment, reason }),
      });
      return handleResponse(res);
    },
    addNote: async (id: string, note: string): Promise<{ message: string; complaint: Complaint }> => {
      const res = await fetch(`${API_BASE}/complaints/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ note }),
      });
      return handleResponse(res);
    },
    submitFeedback: async (
      id: string,
      rating: number,
      comments: string
    ): Promise<{ message: string; complaint: Complaint }> => {
      const res = await fetch(`${API_BASE}/complaints/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ rating, comments }),
      });
      return handleResponse(res);
    },
  },

  // AI Assistance
  ai: {
    analyze: async (title: string, description: string): Promise<{ analysis: any }> => {
      const res = await fetch(`${API_BASE}/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ title, description }),
      });
      return handleResponse(res);
    },
    detectDuplicates: async (data: any): Promise<{ duplicateCheck: any }> => {
      const res = await fetch(`${API_BASE}/ai/detect-duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    chat: async (
      messages: Array<{ role: 'user' | 'model' | 'assistant'; text: string }>,
      roleMode?: 'advisor' | 'technical' | 'emergency',
      model?: string
    ): Promise<{ reply: string; modelUsed: string; roleMode: string }> => {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ messages, roleMode, model }),
      });
      return handleResponse(res);
    },
  },

  // Notifications
  notifications: {
    list: async (channel?: string): Promise<{ notifications: NotificationItem[]; unreadCount: number }> => {
      const url = channel ? `${API_BASE}/notifications?channel=${channel}` : `${API_BASE}/notifications`;
      const res = await fetch(url, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    getStatus: async (): Promise<any> => {
      const res = await fetch(`${API_BASE}/notifications/status`);
      return handleResponse(res);
    },
    getPreferences: async (): Promise<{ preferences: any; mobileNumber: string; email: string }> => {
      const res = await fetch(`${API_BASE}/notifications/preferences`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    updatePreferences: async (preferences: { email?: boolean; sms?: boolean; inApp?: boolean }): Promise<{ message: string; preferences: any }> => {
      const res = await fetch(`${API_BASE}/notifications/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(preferences),
      });
      return handleResponse(res);
    },
    markRead: async (id: string): Promise<{ message: string }> => {
      const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    markAllRead: async (): Promise<{ message: string }> => {
      const res = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PATCH',
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
  },

  // Announcements
  announcements: {
    list: async (): Promise<{ announcements: Announcement[] }> => {
      const res = await fetch(`${API_BASE}/announcements`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    create: async (data: Partial<Announcement>): Promise<{ message: string; announcement: Announcement }> => {
      const res = await fetch(`${API_BASE}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const res = await fetch(`${API_BASE}/announcements/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
  },

  // Analytics
  analytics: {
    get: async (): Promise<AnalyticsData> => {
      const res = await fetch(`${API_BASE}/analytics`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
  },

  // Admin
  admin: {
    getUsers: async (): Promise<{ users: User[] }> => {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    createUser: async (data: any): Promise<{ message: string; user: User }> => {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    updateUserStatus: async (id: string, isActive: boolean): Promise<{ message: string; user: User }> => {
      const res = await fetch(`${API_BASE}/admin/users/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ isActive }),
      });
      return handleResponse(res);
    },
    resetPassword: async (id: string): Promise<{ message: string; temporaryPassword: string }> => {
      const res = await fetch(`${API_BASE}/admin/users/${id}/reset-password`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    getDepartments: async (): Promise<{ departments: Department[] }> => {
      const res = await fetch(`${API_BASE}/admin/departments`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    updateDepartment: async (id: string, data: any): Promise<{ message: string; department: Department }> => {
      const res = await fetch(`${API_BASE}/admin/departments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    getAuditLogs: async (): Promise<{ logs: any[] }> => {
      const res = await fetch(`${API_BASE}/admin/audit-logs`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    getRoster: async (params?: { role?: string; isClaimed?: string; search?: string }): Promise<{
      roster: any[];
      stats: { total: number; claimed: number; unclaimed: number };
    }> => {
      const sp = new URLSearchParams();
      if (params?.role) sp.append('role', params.role);
      if (params?.isClaimed) sp.append('isClaimed', params.isClaimed);
      if (params?.search) sp.append('search', params.search);
      const res = await fetch(`${API_BASE}/admin/roster?${sp.toString()}`, {
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
    importRosterCsv: async (csvText: string): Promise<{ message: string; stats: any }> => {
      const res = await fetch(`${API_BASE}/admin/roster/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ csvText }),
      });
      return handleResponse(res);
    },
    createRosterEntry: async (data: any): Promise<{ message: string; entry: any }> => {
      const res = await fetch(`${API_BASE}/admin/roster/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
    toggleRosterEligibility: async (id: string): Promise<{ message: string; entry: any }> => {
      const res = await fetch(`${API_BASE}/admin/roster/${id}/toggle-eligibility`, {
        method: 'PATCH',
        headers: { ...getAuthHeader() },
      });
      return handleResponse(res);
    },
  },

  // System Health
  health: {
    check: async (): Promise<any> => {
      const res = await fetch(`${API_BASE}/health`);
      return handleResponse(res);
    },
  },
};
