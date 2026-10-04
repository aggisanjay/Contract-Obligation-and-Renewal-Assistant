import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getDashboardData } from "../services/api.js";
import {
  Calendar,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Filter,
  ChevronRight,
  Search,
  Sparkles,
} from "lucide-react";

interface DeadlineItem {
  id: string;
  contractId: string;
  contractTitle: string;
  itemType: string;
  title: string;
  deadlineDate: string;
  responsibleParty?: string | null;
  urgency: "overdue" | "due_soon" | "upcoming";
  daysRemaining: number;
  reviewStatus: string;
  sourceSectionLabel: string;
  recurrence?: string | null;
}

interface DashboardResponse {
  today: string;
  metrics: {
    totalFirm: number;
    overdueCount: number;
    dueSoonCount: number;
    notYetReviewedCount: number;
  };
  firmDeadlines: DeadlineItem[];
  notYetReviewed: DeadlineItem[];
}

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<string>("all");
  const [partySearch, setPartySearch] = useState<string>("");

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await getDashboardData(timeframe === "all" ? undefined : timeframe);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeframe]);

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3 shadow-glow-sky"></div>
          <p className="text-xs text-slate-500 font-medium">Loading deadlines and obligation calendar...</p>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalFirm: 0,
    overdueCount: 0,
    dueSoonCount: 0,
    notYetReviewedCount: 0,
  };

  const filteredFirmDeadlines = (data?.firmDeadlines || []).filter((item) => {
    if (timeframe === "overdue") return item.urgency === "overdue";
    if (partySearch) {
      if (!item.responsibleParty) return false;
      return item.responsibleParty.toLowerCase().includes(partySearch.toLowerCase());
    }
    return true;
  });

  const getUrgencyBadge = (urgency: "overdue" | "due_soon" | "upcoming", daysRemaining: number) => {
    if (urgency === "overdue") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
          <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
          Overdue ({Math.abs(daysRemaining)}d ago)
        </span>
      );
    }
    if (daysRemaining === 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
          <Clock className="w-3.5 h-3.5 mr-1 text-rose-700" />
          Due Today
        </span>
      );
    }
    if (urgency === "due_soon") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
          <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
          Due Soon ({daysRemaining}d left)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
        <Calendar className="w-3.5 h-3.5 mr-1 text-sky-600" />
        Upcoming ({daysRemaining}d left)
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      {/* Page Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-600 tracking-wider uppercase mb-1 font-heading">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Deterministic Schedule</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
            Obligation & Renewal Deadlines
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 max-w-2xl leading-relaxed">
            Deterministic deadline tracking for confirmed & approved contract commitments.
          </p>
        </div>

        {data?.today && (
          <div className="flex items-center space-x-3 px-4 py-2.5 bg-gradient-to-r from-sky-50 to-indigo-50/60 border border-sky-200/90 rounded-2xl shadow-xs self-start md:self-auto">
            <div className="w-9 h-9 rounded-xl bg-white border border-sky-200 flex items-center justify-center text-sky-600 shrink-0 shadow-2xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-extrabold text-sky-700 tracking-wider font-heading">
                Today's Reference Date
              </p>
              <p className="text-sm font-extrabold text-slate-900 font-mono">
                {new Date(data.today + "T00:00:00Z").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider font-heading">Approved Firm Deadlines</p>
            <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-2 font-heading tracking-tight">{metrics.totalFirm}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200/80 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-rose-600 font-bold uppercase tracking-wider font-heading">Overdue</p>
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-rose-600 mt-2 font-heading tracking-tight">{metrics.overdueCount}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-600 font-bold uppercase tracking-wider font-heading">Due Soon (&le; 14 Days)</p>
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-amber-600 mt-2 font-heading tracking-tight">{metrics.dueSoonCount}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider font-heading">Not Yet Reviewed</p>
            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-700 mt-2 font-heading tracking-tight">{metrics.notYetReviewedCount}</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-card mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/70 overflow-x-auto">
          <div className="flex items-center px-2 text-slate-400">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-600 font-heading">Timeframe:</span>
          </div>
          {[
            { id: "all", label: "All Deadlines" },
            { id: "7", label: "Next 7 Days" },
            { id: "30", label: "Next 30 Days" },
            { id: "90", label: "Next 90 Days" },
            { id: "overdue", label: "Overdue Only" },
          ].map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                timeframe === tf.id
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200 font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter by responsible party..."
            value={partySearch}
            onChange={(e) => setPartySearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-slate-200/90 bg-slate-50/50 rounded-xl text-xs w-72 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Section 1: Firm Approved Deadlines */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 font-heading">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Firm Approved Deadlines</span>
          </h2>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
            {filteredFirmDeadlines.length} scheduled items
          </span>
        </div>

        {filteredFirmDeadlines.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 font-heading">No firm deadlines found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Only approved items with confirmed dates appear as firm deadlines. Review pending clauses in your contracts to add them to this calendar.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-card divide-y divide-slate-100 overflow-hidden">
            {filteredFirmDeadlines.map((item) => (
              <div
                key={item.id}
                className="p-5 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/90 flex flex-col items-center justify-center shrink-0 shadow-2xs">
                    <span className="text-[10px] font-extrabold uppercase text-sky-700 tracking-wider">
                      {new Date(item.deadlineDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                    </span>
                    <span className="text-base font-black text-slate-900 font-mono leading-none my-0.5">
                      {item.deadlineDate.slice(8, 10)}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 font-medium">
                      {item.deadlineDate.slice(0, 4)}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center flex-wrap gap-2">
                      <h4 className="text-sm font-bold text-slate-900 font-heading">{item.title}</h4>
                      {getUrgencyBadge(item.urgency, item.daysRemaining)}
                    </div>

                    <div className="mt-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>
                        Contract: <strong className="text-slate-700 font-semibold">{item.contractTitle}</strong>
                      </span>
                      <span>Clause: <strong className="font-mono text-slate-700">{item.sourceSectionLabel}</strong></span>
                      {item.responsibleParty && (
                        <span>
                          Party: <strong className="text-slate-800 font-semibold">{item.responsibleParty}</strong>
                        </span>
                      )}
                      {item.recurrence && (
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[10px] uppercase font-mono font-bold text-slate-600 border border-slate-200/70">
                          {item.recurrence}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <Link
                    to={`/contracts/${item.contractId}`}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-bold text-sky-700 bg-sky-50/70 hover:bg-sky-100 border border-sky-200/70 transition-all active:scale-95 group"
                  >
                    View in Contract
                    <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Not Yet Reviewed (Warning & Review Queue) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-slate-800 font-heading">
              Not Yet Reviewed ({data?.notYetReviewed.length || 0})
            </h2>
          </div>
          <span className="text-xs text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/70">
            Pending / Uncertain clauses — Do not treat as firm commitments until approved
          </span>
        </div>

        {data?.notYetReviewed.length === 0 ? (
          <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-400 font-medium">
            All extracted items have been reviewed!
          </div>
        ) : (
          <div className="bg-amber-50/30 rounded-2xl border border-amber-200/80 divide-y divide-amber-100/80 overflow-hidden shadow-2xs">
            {data?.notYetReviewed.map((item) => (
              <div
                key={item.id}
                className="p-5 flex items-center justify-between hover:bg-amber-50/70 transition-colors gap-4"
              >
                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <h4 className="text-sm font-bold text-slate-900 font-heading">{item.title}</h4>
                    <span className="px-2.5 py-1 text-xs rounded-lg bg-amber-100 text-amber-900 border border-amber-200 font-bold font-mono">
                      Tentative Date: {item.deadlineDate}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Contract: <strong className="text-slate-700 font-semibold">{item.contractTitle}</strong> ({item.sourceSectionLabel})
                    {item.responsibleParty && ` — Party: ${item.responsibleParty}`}
                  </p>
                </div>

                <Link
                  to={`/contracts/${item.contractId}`}
                  className="px-3.5 py-1.5 bg-white border border-amber-300 text-amber-900 text-xs font-bold rounded-xl hover:bg-amber-50 transition-all shadow-xs active:scale-95 shrink-0"
                >
                  Review Item
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
