import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { Download, Plus, LogOut, User, Home, LayoutGrid, CalendarDays, BookmarkPlus, Settings, Menu, X } from "lucide-react";
import vendoxLogo from "../assets/images/vendox_ai_logo_1786045501501.jpg";

interface SidebarProps {
  onOpenExport: () => void;
  username?: string;
  onLogout?: () => void;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold rounded-xl transition-all cursor-pointer ${
    isActive ? "bg-amber-500/10 text-amber-300 border border-amber-500/40" : "text-slate-300 hover:bg-slate-800 border border-transparent"
  }`;

// Shared between the fixed desktop rail and the slide-in mobile drawer so nav items never drift
// out of sync between the two.
const SidebarContent: React.FC<SidebarProps & { onNavigate?: () => void }> = ({
  onOpenExport,
  username = "admin",
  onLogout,
  onNavigate,
}) => (
  <div className="flex flex-col h-full">
    <NavLink
      to="/home"
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-5 text-left group hover:opacity-95 transition-all cursor-pointer focus:outline-none border-b border-slate-800/90"
    >
      <div className="relative p-0.5 rounded-xl bg-slate-950 border border-slate-800 shadow-xs group-hover:scale-105 transition-transform overflow-hidden shrink-0">
        <img src={vendoxLogo} alt="Vendox AI Logo" className="w-9 h-9 object-cover rounded-[10px]" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h1 className="font-bold text-base tracking-tight text-white truncate">Vendox Content AI</h1>
        </div>
        <p className="text-[10px] text-slate-400 truncate">Multi-Brand SMS &amp; Web Push AI</p>
      </div>
    </NavLink>

    <div className="p-3 space-y-1.5 border-b border-slate-800/90">
      <NavLink
        to="/create"
        onClick={onNavigate}
        className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-extrabold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl shadow-md transition-all transform active:scale-95 cursor-pointer"
      >
        <Plus className="w-4 h-4 stroke-[3]" />
        <span>New Campaign</span>
      </NavLink>
      <button
        type="button"
        onClick={() => {
          onOpenExport();
          onNavigate?.();
        }}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl border border-slate-800 transition-all cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Export</span>
      </button>
    </div>

    <nav className="flex-1 p-3 space-y-1">
      <NavLink to="/home" onClick={onNavigate} className={navLinkClass} end>
        <Home className="w-4 h-4" />
        <span>Home</span>
      </NavLink>
      <NavLink to="/library" onClick={onNavigate} className={navLinkClass}>
        <LayoutGrid className="w-4 h-4" />
        <span>Library</span>
      </NavLink>
      <NavLink to="/calendar" onClick={onNavigate} className={navLinkClass}>
        <CalendarDays className="w-4 h-4" />
        <span>Calendar</span>
      </NavLink>
      <NavLink to="/templates" onClick={onNavigate} className={navLinkClass}>
        <BookmarkPlus className="w-4 h-4" />
        <span>Templates</span>
      </NavLink>
      <NavLink to="/manage" onClick={onNavigate} className={navLinkClass}>
        <Settings className="w-4 h-4" />
        <span>Manage</span>
      </NavLink>
    </nav>

    <div className="p-3 border-t border-slate-800/90 flex items-center gap-2">
      <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 rounded-lg border border-slate-800 text-xs font-semibold text-slate-200 min-w-0">
        <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="truncate">{username}</span>
      </div>
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="p-2 text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer shrink-0"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      )}
    </div>
  </div>
);

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop fixed rail */}
      <aside className="hidden md:flex w-64 shrink-0 sticky top-0 h-screen bg-slate-900/95 border-r border-slate-800/90 backdrop-blur-md z-30">
        <SidebarContent {...props} />
      </aside>

      {/* Mobile top bar + slide-in drawer */}
      <div className="md:hidden sticky top-0 z-30 bg-slate-900/95 border-b border-slate-800/90 backdrop-blur-md flex items-center justify-between px-4 h-14">
        <NavLink to="/home" className="flex items-center gap-2">
          <img src={vendoxLogo} alt="Vendox AI Logo" className="w-7 h-7 object-cover rounded-lg" />
          <span className="font-bold text-sm text-white">Vendox Content AI</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] bg-slate-900 border-r border-slate-800 h-full shadow-2xl">
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent {...props} onNavigate={() => setIsMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
};
