"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { api, type TestSimulatorStatus, type AdminPendingSellerMembershipPayment, type AdminKycVerification } from "@/lib/api";

export default function TestingPage() {
  const [paymentStatus, setPaymentStatus] = useState<TestSimulatorStatus | null>(null);
  const [kycStatus, setKycStatus] = useState<TestSimulatorStatus | null>(null);
  const [payments, setPayments] = useState<AdminPendingSellerMembershipPayment[]>([]);
  const [verifications, setVerifications] = useState<AdminKycVerification[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api.getTestPaymentSimulatorStatus(),
      api.getPendingSellerMembershipPayments(),
      api.getAdminKycSimulatorStatus(),
      api.getAdminKycVerifications(),
    ]);
    if (results[0].status === "fulfilled") setPaymentStatus(results[0].value);
    if (results[1].status === "fulfilled") setPayments(results[1].value);
    if (results[2].status === "fulfilled") setKycStatus(results[2].value);
    if (results[3].status === "fulfilled") setVerifications(results[3].value);
    if (results.some((r) => r.status === "rejected")) {
      setMessage("Some testing data could not be loaded. Check access and API availability.");
    } else {
      setMessage("");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function confirmPayment(id: string) {
    if (!window.confirm("Simulate successful payment for this pending seller membership?")) return;
    setBusy(id);
    setMessage("");
    try {
      await api.simulateSellerMembershipPayment(id);
      setMessage("Payment simulation completed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment simulation failed.");
    } finally {
      setBusy("");
    }
  }

  async function simulateKyc(id: string, status: "VERIFIED" | "REJECTED" | "MORE_INFORMATION_REQUIRED") {
    if (!window.confirm(`Simulate KYC outcome: ${status.replaceAll("_", " ")}?`)) return;
    setBusy(id);
    setMessage("");
    try {
      await api.simulateAdminKycVerification(id, status);
      setMessage(`KYC simulation completed: ${status.replaceAll("_", " ")}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "KYC simulation failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN"]}>
      <main className="space-y-6 p-6">
        <header className="rounded-2xl bg-[#08205B] p-6 text-white">
          <h1 className="text-2xl font-bold">CHIMZO Testing & Simulation</h1>
          <p className="mt-2 text-sm">Super Admin testing controls. All simulation actions are audited.</p>
        </header>
        {message && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm">{message}</p>}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-white p-5">
            <h2 className="font-bold">Payment simulator</h2>
            <p className="mt-2">{paymentStatus?.enabled ? "ENABLED" : "DISABLED"}</p>
            <p className="text-sm text-slate-500">{paymentStatus?.production ? "Production: blocked" : "Non-production testing"}</p>
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h2 className="font-bold">KYC simulator</h2>
            <p className="mt-2">{kycStatus?.enabled ? "ENABLED" : "DISABLED"}</p>
            <p className="text-sm text-slate-500">{kycStatus?.production ? "Production: blocked" : "Non-production testing"}</p>
          </div>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-bold">Pending seller membership payments</h2>
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap justify-between gap-3 border-t py-3">
              <span className="text-sm">{p.reference} · {p.currency} {(Number(p.amount_minor) / 100).toFixed(2)}</span>
              <button disabled={!paymentStatus?.enabled || !!busy} onClick={() => void confirmPayment(p.id)} className="rounded-lg bg-[#08205B] px-3 py-2 text-sm text-white disabled:opacity-40">{busy === p.id ? "Processing..." : "Simulate success"}</button>
            </div>
          ))}
          {!payments.length && <p className="py-4 text-sm text-slate-500">No pending payments.</p>}
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-bold">Seller KYC verifications</h2>
          {verifications.map((v) => (
            <div key={v.id} className="border-t py-4">
              <p className="font-semibold">{v.business_name} · {v.status}</p>
              <p className="text-xs text-slate-500">{v.seller_id}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["VERIFIED", "REJECTED", "MORE_INFORMATION_REQUIRED"] as const).map((status) => (
                  <button key={status} disabled={!kycStatus?.enabled || !!busy} onClick={() => void simulateKyc(v.id, status)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">{status.replaceAll("_", " ")}</button>
                ))}
              </div>
            </div>
          ))}
          {!verifications.length && <p className="py-4 text-sm text-slate-500">No KYC records.</p>}
        </section>
        <button onClick={() => void load()} className="rounded-lg border px-4 py-2 text-sm">Refresh data</button>
      </main>
    </ProtectedRoute>
  );
}
