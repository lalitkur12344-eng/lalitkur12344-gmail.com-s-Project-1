import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, User, LogOut, Shield, Wrench, GraduationCap, BookOpen, Menu, X, Sparkles } from 'lucide-react';

interface NavbarProps {
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenChat?: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  unreadCount,
  onOpenNotifications,
  onOpenProfile,
  onOpenChat,
  mobileMenuOpen,
  setMobileMenuOpen,
}) => {
  const { user, logout } = useAuth();

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-3.5 h-3.5 text-amber-600" />;
      case 'staff':
        return <Wrench className="w-3.5 h-3.5 text-blue-600" />;
      case 'faculty':
        return <BookOpen className="w-3.5 h-3.5 text-indigo-600" />;
      default:
        return <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />;
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'Deanery Admin';
      case 'staff':
        return 'Technical Staff';
      case 'faculty':
        return 'Faculty Member';
      default:
        return 'Student';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: College Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-indigo-900 text-white font-bold flex items-center justify-center text-sm shadow-xs border border-indigo-800">
                REC
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-extrabold text-slate-900 text-base tracking-tight">Campus Care</span>
                  <span className="text-xs font-semibold text-indigo-700 hidden sm:inline">REC Bijnor</span>
                </div>
                <p className="text-[11px] text-slate-500 hidden md:block">
                  Rajkiya Engineering College, Bijnor · AI Service Portal
                </p>
              </div>
            </div>
          </div>

          {/* Right: User status & controls */}
          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* AI Chatbot Trigger */}
              {onOpenChat && (
                <button
                  onClick={onOpenChat}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-indigo-750 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200/60 shadow-2xs"
                  title="Open Gemini Campus Assistant Chatbot"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">AI Help</span>
                </button>
              )}

              {/* Notification Bell */}
              <button
                onClick={onOpenNotifications}
                className="relative p-2 text-slate-600 hover:text-indigo-700 hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label={`Notifications: ${unreadCount} unread`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Profile Chip */}
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 text-left rounded-lg hover:bg-slate-100 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-xs">
                  {user.name.charAt(0)}
                </div>
                <div className="hidden lg:block">
                  <div className="text-xs font-semibold text-slate-900 leading-tight flex items-center gap-1.5">
                    <span className="truncate max-w-[140px]">{user.name}</span>
                    {getRoleIcon(user.role)}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight">
                    {getRoleLabel(user.role)}
                  </div>
                </div>
              </button>

              {/* Logout Button */}
              <button
                onClick={logout}
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium">Official Portal Login</div>
          )}
        </div>
      </div>
    </header>
  );
};
