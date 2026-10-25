import React, { useState } from 'react';
import { NotificationItem } from '../types';
import { Bell, Check, X, Clock, Mail, MessageSquare, ShieldCheck, AlertCircle } from 'lucide-react';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onSelectComplaint: (complaintId: string) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onSelectComplaint,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'in_app' | 'email' | 'sms'>('all');

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'all') return true;
    return (n.channel || 'in_app') === activeTab;
  });

  const unreadCount = notifications.filter((n) => !n.isRead && (n.channel || 'in_app') === 'in_app').length;

  const getChannelBadge = (channel?: string) => {
    switch (channel) {
      case 'email':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-sm">
            <Mail className="w-2.5 h-2.5" />
            Email
          </span>
        );
      case 'sms':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-sm">
            <MessageSquare className="w-2.5 h-2.5" />
            SMS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-sm">
            <Bell className="w-2.5 h-2.5" />
            In-App
          </span>
        );
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
            <ShieldCheck className="w-2.5 h-2.5" />
            Delivered
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
            Sent
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
            Queued
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
            Skipped
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
            <AlertCircle className="w-2.5 h-2.5" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-700" />
              <h3 className="font-bold text-slate-900 text-sm">Notifications &amp; Alerts</h3>
              {unreadCount > 0 && (
                <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Segmented Channel Filter Tabs */}
          <div className="mt-3 grid grid-cols-4 gap-1 p-0.5 bg-slate-200/80 rounded-lg text-[11px] font-medium text-slate-600">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-1 rounded-md transition-colors ${
                activeTab === 'all' ? 'bg-white text-indigo-900 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('in_app')}
              className={`py-1 rounded-md transition-colors ${
                activeTab === 'in_app' ? 'bg-white text-indigo-900 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              In-App
            </button>
            <button
              onClick={() => setActiveTab('email')}
              className={`py-1 rounded-md transition-colors ${
                activeTab === 'email' ? 'bg-white text-indigo-900 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              Email
            </button>
            <button
              onClick={() => setActiveTab('sms')}
              className={`py-1 rounded-md transition-colors ${
                activeTab === 'sms' ? 'bg-white text-indigo-900 font-bold shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              SMS
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
          {filteredNotifications.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-500" />
              <p>No notifications found in this tab.</p>
            </div>
          ) : (
            filteredNotifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-lg transition-colors flex items-start justify-between gap-3 ${
                  n.isRead ? 'hover:bg-slate-50 text-slate-600' : 'bg-indigo-50/40 text-slate-900'
                }`}
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    if (!n.isRead) onMarkRead(n.id);
                    if (n.complaintId) onSelectComplaint(n.complaintId);
                  }}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getChannelBadge(n.channel)}
                    {getStatusBadge(n.status)}
                    <span className="font-bold text-xs">{n.title}</span>
                    {!n.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {n.complaintId && (
                      <>
                        <span>·</span>
                        <span className="font-mono font-semibold text-indigo-700">
                          #{n.complaintId}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {!n.isRead && (
                  <button
                    onClick={() => onMarkRead(n.id)}
                    title="Mark as read"
                    className="p-1 text-slate-400 hover:text-indigo-600"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
