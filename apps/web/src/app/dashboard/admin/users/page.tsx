"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { ErrorState, LoadingState } from "@/components/ui/loading-state";
import { Button, Card } from "@/components/ui/primitives";
import { api, ApiError, type AdminUserList } from "@/lib/api";

const PAGE_SIZE = 25;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status < 500) {
    return error.errors?.[0] ?? error.message;
  }
  return "Unable to load users. Check the API server and try again.";
}

function statusStyle(status: string) {
  const normalized = status.toUpperCase();
  if (["ACTIVE", "VERIFIED", "ENABLED"].includes(normalized)) {
    return "bg-emerald-50 text-emerald-700";
  }
  if (["SUSPENDED", "DISABLED", "BLOCKED"].includes(normalized)) {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-amber-50 text-amber-700";
}

function UserManagementContent() {
  const [result, setResult] = useState<AdminUserList | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getAdminUsers({
        page,
        limit: PAGE_SIZE,
        search: activeSearch || undefined,
      });
      setResult(data);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [page, activeSearch]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers, retry]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setActiveSearch(searchInput.trim().slice(0, 100));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">CHIMZO - Platform control</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            User management
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Search accounts and review account status, assigned roles, and
            registration details. This page does not expose passwords or tokens.
          </p>
        </div>
        <Link
          href="/dashboard/admin"
          className="text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          Back to Admin workspace
        </Link>
      </header>

      <Card>
        <form
          onSubmit={submitSearch}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label className="sr-only" htmlFor="user-search">
            Search by email, phone, or user ID
          </label>
          <input
            id="user-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={100}
            placeholder="Search email, phone number, or user ID"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <Button type="submit">Search users</Button>
          {activeSearch && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSearchInput("");
                setActiveSearch("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </form>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Search is performed by the API. Only account fields intended for
          administration are returned.
        </p>
      </Card>

      {error ? (
        <div className="space-y-4">
          <ErrorState message={error} />
          <Button type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </Button>
        </div>
      ) : loading ? (
        <LoadingState label="Loading platform users..." />
      ) : !result || result.items.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <h2 className="font-semibold text-slate-900">No users found</h2>
            <p className="mt-2 text-sm text-slate-500">
              {activeSearch
                ? "Try a different email, phone number, or user ID."
                : "User accounts will appear here when available."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                {result.total.toLocaleString("en-NG")}
              </span>{" "}
              account{result.total === 1 ? "" : "s"} found
              {activeSearch ? ` for "${activeSearch}"` : ""}
            </p>
            <p className="text-xs text-slate-500">
              Page {result.page} of {Math.max(result.totalPages, 1)}
            </p>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Roles</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.items.map((user) => (
                    <tr key={user.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {user.email}
                        </p>
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                          {user.id}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {user.phone || "Not provided"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-64 flex-wrap gap-1.5">
                          {user.roles?.length ? (
                            user.roles.map((role) => (
                              <span
                                key={role}
                                className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#08205B]"
                              >
                                {role.replaceAll("_", " ")}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400">No role assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(user.status)}`}
                        >
                          {user.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Showing {((result.page - 1) * result.limit) + 1}–{Math.min(
                result.page * result.limit,
                result.total,
              )} of {result.total}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={loading || page >= result.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <ProtectedRoute roles={["SUPER_ADMIN"]}>
      <UserManagementContent />
    </ProtectedRoute>
  );
}
