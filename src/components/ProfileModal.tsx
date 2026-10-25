import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  X,
  User as UserIcon,
  Mail,
  Shield,
  Phone,
  Building,
  GraduationCap,
  Home,
  CheckCircle2,
  AlertCircle,
  Lock,
  Bell,
  MessageSquare,
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser } = useAuth();

  const [mobileNumber, setMobileNumber] = useState(user?.mobileNumber || '');
  const [hostel, setHostel] = useState(user?.hostel || '');
  const [roomNumber, setRoomNumber] = useState(user?.roomNumber || '');

  // Notification Preferences State
  const [prefEmail, setPrefEmail] = useState(user?.notificationPreferences?.email !== false);
  const [prefSms, setPrefSms] = useState(user?.notificationPreferences?.sms !== false);
  const [prefInApp, setPrefInApp] = useState(user?.notificationPreferences?.inApp !== false);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await api.auth.updateProfile({
        mobileNumber,
        hostel,
        roomNumber,
        notificationPreferences: {
          email: prefEmail,
          sms: prefSms,
          inApp: prefInApp,
        },
      });
      setMessage(res.message);
      await refreshUser();
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-sm">
              {user.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{user.name}</h3>
              <p className="text-xs text-slate-500 capitalize">
                {user.role} · Rajkiya Engineering College, Bijnor
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {message && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {/* Verified Immutable Fields */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
            <div className="flex items-center justify-between font-bold text-slate-700 uppercase tracking-wider text-[10px]">
              <span>Verified Institutional Identity</span>
              <span className="flex items-center gap-1 text-slate-400 font-normal normal-case">
                <Lock className="w-3 h-3" />
                <span>Protected fields</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-slate-500 block text-[11px]">Official Email</span>
                <span className="font-semibold text-slate-900 truncate block">{user.email}</span>
              </div>

              {user.enrollmentNumber && (
                <div>
                  <span className="text-slate-500 block text-[11px]">Enrollment Number / Roll No</span>
                  <span className="font-semibold text-slate-900 font-mono">{user.enrollmentNumber}</span>
                </div>
              )}

              {user.department && (
                <div>
                  <span className="text-slate-500 block text-[11px]">Department / Branch</span>
                  <span className="font-semibold text-slate-900">{user.department}</span>
                </div>
              )}

              {user.academicYear && (
                <div>
                  <span className="text-slate-500 block text-[11px]">Academic Standing</span>
                  <span className="font-semibold text-slate-900">{user.academicYear}</span>
                </div>
              )}

              <div>
                <span className="text-slate-500 block text-[11px]">Account Status</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  <span>Active &amp; Verified</span>
                </span>
              </div>
            </div>
          </div>

          {/* Editable Contact & Accommodation Fields */}
          <div className="space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Permitted Contact &amp; Room Updates
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number (SMS &amp; Emergency Helpline)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="+91 98765 43210 or 9876543210"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-indigo-600"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Normalized to E.164 format (+91...) for urgent SMS dispatch.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hostel Residence</label>
                <input
                  type="text"
                  value={hostel}
                  onChange={(e) => setHostel(e.target.value)}
                  placeholder="e.g. Ramanujan Hostel 1"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Room / Flat Number</label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. 304"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Notification Channel Preferences */}
          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-2.5 text-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-indigo-700" />
              <span>Multi-Channel Notification Preferences</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Choose which delivery channels you wish to receive complaint updates, assignments, and escalations on.
            </p>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={prefEmail}
                  onChange={(e) => setPrefEmail(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Mail className="w-3.5 h-3.5 text-sky-600" />
                <span>
                  <strong>Email Notifications</strong> (Confirmation, status updates, and resolution feedback)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={prefSms}
                  onChange={(e) => setPrefSms(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  <strong>SMS Alerts</strong> (Important milestone notifications &amp; emergency escalations)
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={prefInApp}
                  onChange={(e) => setPrefInApp(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Bell className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  <strong>In-App Notifications</strong> (Campus Care bell alert drawer)
                </span>
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60"
            >
              {isSaving ? 'Saving Changes...' : 'Save Profile & Preferences'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
