import React from "react";
import { Link, useLocation } from "react-router-dom";
import { FileText, Calendar, PlusCircle, Sparkles } from "lucide-react";

interface HeaderProps {
  isDemoMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isDemoMode }) => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path
      ? "text-sky-700 bg-sky-50/90 font-semibold shadow-2xs border border-sky-100"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent";
  };

  return (
    <header className="backdrop-blur-md bg-white/85 border-b border-slate-200/80 sticky top-0 z-40 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <Link to="/" className="flex items-center space-x-2.5 text-slate-900 font-bold text-lg tracking-tight group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-500 flex items-center justify-center text-white shadow-xs group-hover:shadow-glow-sky group-hover:scale-105 transition-all">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold tracking-tight text-slate-900">Contract Assistant</span>
              <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase -mt-0.5">Obligation & Renewal</span>
            </div>
          </Link>

          {isDemoMode && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
              <Sparkles className="w-3 h-3 mr-1 text-amber-600" />
              Demo Mode (Mock AI)
            </span>
          )}
        </div>

        <nav className="flex items-center space-x-1.5">
          <Link
            to="/dashboard"
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center space-x-1.5 ${isActive(
              "/dashboard"
            )}`}
          >
            <Calendar className="w-4 h-4 text-sky-600" />
            <span>Deadlines & Dashboard</span>
          </Link>

          <Link
            to="/"
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center space-x-1.5 ${isActive(
              "/"
            )}`}
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Contracts</span>
          </Link>

          <Link
            to="/upload"
            className="ml-2 inline-flex items-center px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-xs hover:shadow-glow-sky active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            <span>Upload Contract</span>
          </Link>
        </nav>
      </div>
    </header>
  );
};
