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
      const res = await getDashboardData(timeframe === "all" || timeframe === "overdue" ? undefined : parseInt(timeframe, 10));
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
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
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
    if (partySearch && item.responsibleParty) {
      return item.responsibleParty.toLowerCase().includes(partySearch.toLowerCase());
    }
    return true;
  });

  const getUrgencyBadge = (urgency: "overdue" | "due_soon" | "upcoming", daysRemaining: number) => {
    if (urgency === "overdue") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Overdue ({Math.abs(daysRemaining)}d ago)
        </span>
      );
    }
    if (urgency === "due_soon") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3 mr-1" />
          Due Soon ({daysRemaining}d left)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
        <Calendar className="w-3 h-3 mr-1" />
        Upcoming ({daysRemaining}d left)
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Obligation & Renewal Deadlines</h1>
        <p className="mt-1 text-sm text-slate-500">
          Deterministic deadline tracking for confirmed & approved contract commitments.
        </p>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Approved Firm Deadlines</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.totalFirm}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Overdue</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{metrics.overdueCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Due Soon (&le; 14 Days)</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{metrics.dueSoonCount}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Not Yet Reviewed</p>
          <p className="text-2xl font-bold text-slate-600 mt-1">{metrics.notYetReviewedCount}</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">Timeframe:</span>
          {[
            { id: "all", label: "All Upcoming" },
            { id: "7", label: "Next 7 Days" },
            { id: "30", label: "Next 30 Days" },
            { id: "90", label: "Next 90 Days" },
            { id: "overdue", label: "Overdue Only" },
          ].map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                timeframe === tf.id
                  ? "bg-sky-600 text-white font-semibold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div>
          <input
            type="text"
            placeholder="Filter by responsible party..."
            value={partySearch}
            onChange={(e) => setPartySearch(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-64 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Section 1: Firm Approved Deadlines */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Firm Approved Deadlines</span>
          </h2>
          <span className="text-xs text-slate-500">
            {filteredFirmDeadlines.length} scheduled items
          </span>
        </div>

        {filteredFirmDeadlines.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-700">No firm deadlines found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Only approved items with confirmed dates appear as firm deadlines. Review pending clauses in your contracts to add them to this calendar.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {filteredFirmDeadlines.map((item) => (
              <div
                key={item.id}
                className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold uppercase text-slate-500">
                      {item.deadlineDate.slice(5, 7)}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {item.deadlineDate.slice(8, 10)}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                      {getUrgencyBadge(item.urgency, item.daysRemaining)}
                    </div>

                    <div className="mt-1 flex items-center space-x-3 text-xs text-slate-500">
                      <span>
                        Contract: <strong>{item.contractTitle}</strong>
                      </span>
                      <span>Clause: {item.sourceSectionLabel}</span>
                      {item.responsibleParty && (
                        <span>
                          Party: <strong className="text-slate-700">{item.responsibleParty}</strong>
                        </span>
                      )}
                      {item.recurrence && (
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] uppercase font-mono">
                          {item.recurrence}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <Link
                    to={`/contracts/${item.contractId}`}
                    className="inline-flex items-center text-xs font-semibold text-sky-600 hover:text-sky-800"
                  >
                    View in Contract
                    <ChevronRight className="w-4 h-4 ml-0.5" />
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
            <h2 className="text-base font-bold text-slate-800">
              Not Yet Reviewed ({data?.notYetReviewed.length || 0})
            </h2>
          </div>
          <span className="text-xs text-amber-700 font-medium">
            Pending / Uncertain clauses - Do not treat as firm commitments until approved
          </span>
        </div>

        {data?.notYetReviewed.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-400">
            All extracted items have been reviewed!
          </div>
        ) : (
          <div className="bg-amber-50/40 rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
            {data?.notYetReviewed.map((item) => (
              <div
                key={item.id}
                className="p-4 flex items-center justify-between hover:bg-amber-50/80 transition-colors"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                    <span className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
                      Tentative Date: {item.deadlineDate}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Contract: <strong>{item.contractTitle}</strong> ({item.sourceSectionLabel})
                    {item.responsibleParty && ` - Party: ${item.responsibleParty}`}
                  </p>
                </div>

                <Link
                  to={`/contracts/${item.contractId}`}
                  className="px-3 py-1 bg-white border border-amber-300 text-amber-900 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors shadow-2xs"
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
