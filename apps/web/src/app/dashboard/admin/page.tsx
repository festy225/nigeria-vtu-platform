"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/providers/auth-provider";

const sections = [
  {
    title: "Provider management",
    description: "Review provider records, routing configuration and recorded health information.",
    href: "/dashboard/admin/providers",
    marker: "P",
    access: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    title: "Feature configuration",
    description: "Review and manage platform feature flags where your permissions allow.",
    href: "/dashboard/admin/features",
    marker: "F",
    access: ["SUPER_ADMIN"],
  },
  {
    title: "User management",
    description: "Search platform accounts and review their status, assigned roles, and registration dates.",
    href: "/dashboard/admin/users",
    marker: "U",
    access: ["SUPER_ADMIN"],
  },  {
    title: "Seller applications",
    description: "Review seller profiles and their current application statuses.",
    href: "/dashboard/admin/sellers",
    marker: "S",
    access: ["SUPER_ADMIN"],
  },
];

function AdminWorkspace() {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("SUPER_ADMIN");
  const visibleSections = sections.filter((section) =>
    section.access.some((role) => hasRole(role)),
  );

  const [providerCount, setProviderCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [sellerApplicationCount, setSellerApplicationCount] = useState<number | null>(null);
  const [overviewErrors, setOverviewErrors] = useState<string[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setOverviewLoading(true);
    setOverviewErrors([]);

    const tasks: Promise<void>[] = [
      api.getAdminProviders()
        .then((records) => {
          if (active) setProviderCount(records.length);
        })
        .catch(() => {
          if (active) setOverviewErrors((previous) => [...previous, "Provider summary unavailable."]);
        }),
    ];

    if (isSuperAdmin) {
      tasks.push(
        api.getAdminUsers({ page: 1, limit: 1 })
          .then((result) => {
            if (active) setUserCount(result.total);
          })
          .catch(() => {
            if (active) setOverviewErrors((previous) => [...previous, "User summary unavailable."]);
          }),
      );

      tasks.push(
        api.getSellerApplications()
          .then((records) => {
            if (active) setSellerApplicationCount(records.length);
          })
          .catch(() => {
            if (active) setOverviewErrors((previous) => [...previous, "Seller application summary unavailable."]);
          }),
      );
    }

    void Promise.all(tasks).finally(() => {
      if (active) setOverviewLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-[#08205B] p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#00D4A3]">
          CHIMZO Platform Control
        </p>
        <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {isSuperAdmin ? "Super Admin workspace" : "Admin workspace"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
              Manage the platform from a dedicated workspace. Available
              sections depend on your assigned permissions.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold">
            {isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
          </span>
        </div>
      </section>

      <section aria-labelledby="operational-overview-heading">
        <div className="mb-4">
          <h2 id="operational-overview-heading" className="text-lg font-bold text-slate-900">
            Operational overview
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Live counts from the platform management APIs.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Provider records</p>
            <p className="mt-3 text-3xl font-bold text-[#08205B]" aria-live="polite">
              {overviewLoading && providerCount === null ? "Loading…" : providerCount ?? "Unavailable"}
            </p>
            <Link href="/dashboard/admin/providers" className="mt-3 inline-block text-sm font-semibold text-blue-700">
              Manage providers →
            </Link>
          </div>

          {isSuperAdmin && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Registered accounts</p>
                <p className="mt-3 text-3xl font-bold text-[#08205B]" aria-live="polite">
                  {overviewLoading && userCount === null ? "Loading…" : userCount ?? "Unavailable"}
                </p>
                <Link href="/dashboard/admin/users" className="mt-3 inline-block text-sm font-semibold text-blue-700">
                  Manage users →
                </Link>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Seller applications</p>
                <p className="mt-3 text-3xl font-bold text-[#08205B]" aria-live="polite">
                  {overviewLoading && sellerApplicationCount === null ? "Loading…" : sellerApplicationCount ?? "Unavailable"}
                </p>
                <Link href="/dashboard/admin/sellers" className="mt-3 inline-block text-sm font-semibold text-blue-700">
                  Review applications →
                </Link>
              </div>
            </>
          )}
        </div>

        {overviewErrors.length > 0 && (
          <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {overviewErrors.join(" ")} Open the relevant management page to retry.
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Management</h2>
          <p className="mt-1 text-sm text-slate-500">
            Open an available area to manage its current configuration.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-[#08205B]">
                {section.marker}
              </div>
              <h3 className="mt-4 font-bold text-slate-900">
                {section.title}
              </h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
                {section.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 group-hover:text-blue-800">
                Open section <span aria-hidden="true">-&gt;</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Access and security</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This interface only displays sections permitted by the current role.
          The API must continue enforcing authorization for every protected
          operation; hiding a link is not a substitute for backend security.
        </p>
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <ProtectedRoute roles={["ADMIN", "SUPER_ADMIN"]}>
      <AdminWorkspace />
    </ProtectedRoute>
  );
}
