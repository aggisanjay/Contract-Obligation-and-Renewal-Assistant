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
      ? "text-sky-600 bg-sky-50 font-semibold"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100";
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link to="/" className="flex items-center space-x-2 text-slate-900 font-bold text-lg tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <span>Contract Assistant</span>
          </Link>

          {isDemoMode && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
              <Sparkles className="w-3 h-3 mr-1 text-amber-600" />
              Demo Mode (Mock AI)
            </span>
          )}
        </div>

        <nav className="flex items-center space-x-2">
          <Link
            to="/dashboard"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center space-x-1.5 ${isActive(
              "/dashboard"
            )}`}
          >
            <Calendar className="w-4 h-4" />
            <span>Deadlines & Dashboard</span>
          </Link>

          <Link
            to="/"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center space-x-1.5 ${isActive(
              "/"
            )}`}
          >
            <FileText className="w-4 h-4" />
            <span>Contracts</span>
          </Link>

          <Link
            to="/upload"
            className="ml-2 inline-flex items-center px-3.5 py-1.5 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 shadow-2xs transition-colors"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            <span>Upload Contract</span>
          </Link>
        </nav>
      </div>
    </header>
  );
};
