'use client';

import { useEffect, useState } from 'react';

type Feature = {
  key: string;
  enabled: boolean;
};

const FEATURE_LABELS: Record<string, string> = {
  AIRTIME_ENABLED: 'Airtime',
  DATA_ENABLED: 'Data',
  ELECTRICITY_ENABLED: 'Electricity',
  TV_ENABLED: 'TV Subscription',
  BETTING_ENABLED: 'Betting',
  AIRTIME_TO_MONEY_ENABLED: 'Airtime to Money',
  VOUCHERS_ENABLED: 'Vouchers / ePIN',
  DATA_PRINTING_ENABLED: 'Data Printing',
  WALLET_FUNDING_ENABLED: 'Wallet Funding',
  TRANSFERS_ENABLED: 'Transfers',
  AGENT_API_ENABLED: 'Agent API',
  VENDOR_API_ENABLED: 'Vendor API',
  DOLLAR_WALLET_ENABLED: 'Dollar Wallet',
  NOTIFICATIONS_ENABLED: 'Notifications',

  DATA_TO_CASH_ENABLED: 'Data to Cash',
  DATA_AIRTIME_GIFT_ENABLED: 'Data / Airtime Gift',
  SCHEDULED_RECHARGE_ENABLED: 'Scheduled Recharge',
  REWARDS_ENABLED: 'Rewards',
  REFERRALS_ENABLED: 'Referrals',
  BULK_PURCHASE_ENABLED: 'Bulk Purchase',

  MARKETPLACE_ENABLED: 'Marketplace',
  NIGERIA_TO_NIGERIA_MARKETPLACE_ENABLED: 'Nigeria → Nigeria',
  NIGERIA_TO_INTERNATIONAL_MARKETPLACE_ENABLED:
    'Nigeria → International',
  GLOBAL_MARKETPLACE_ENABLED: 'Global Marketplace',

  SELLER_STORES_ENABLED: 'Seller Stores',
  MARKETPLACE_DELIVERY_ENABLED: 'Marketplace Delivery',

  USSD_ENABLED: 'USSD',
  WHATSAPP_VTU_ENABLED: 'WhatsApp VTU',
};

const SECTIONS = [
  {
    title: 'Core Services',
    description: 'Control the main VTU and wallet services.',
    keys: [
      'AIRTIME_ENABLED',
      'DATA_ENABLED',
      'ELECTRICITY_ENABLED',
      'TV_ENABLED',
      'BETTING_ENABLED',
      'AIRTIME_TO_MONEY_ENABLED',
      'VOUCHERS_ENABLED',
      'DATA_PRINTING_ENABLED',
      'WALLET_FUNDING_ENABLED',
      'TRANSFERS_ENABLED',
      'NOTIFICATIONS_ENABLED',
    ],
  },
  {
    title: 'Advanced Services',
    description: 'Additional Naivex services and customer features.',
    keys: [
      'DATA_TO_CASH_ENABLED',
      'DATA_AIRTIME_GIFT_ENABLED',
      'SCHEDULED_RECHARGE_ENABLED',
      'REWARDS_ENABLED',
      'REFERRALS_ENABLED',
      'BULK_PURCHASE_ENABLED',
    ],
  },
  {
    title: 'Marketplace',
    description: 'Control the Naivex marketplace and its operating regions.',
    keys: [
      'MARKETPLACE_ENABLED',
      'NIGERIA_TO_NIGERIA_MARKETPLACE_ENABLED',
      'NIGERIA_TO_INTERNATIONAL_MARKETPLACE_ENABLED',
      'GLOBAL_MARKETPLACE_ENABLED',
      'SELLER_STORES_ENABLED',
      'MARKETPLACE_DELIVERY_ENABLED',
    ],
  },
  {
    title: 'Platform Channels',
    description: 'Additional ways customers and partners can access Naivex.',
    keys: [
      'AGENT_API_ENABLED',
      'VENDOR_API_ENABLED',
      'DOLLAR_WALLET_ENABLED',
      'USSD_ENABLED',
      'WHATSAPP_VTU_ENABLED',
    ],
  },
];

export default function FeatureManagementPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState('');

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

  async function loadFeatures() {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${apiUrl}/features`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load feature settings');
      }

      const result = await response.json();
      const data = result?.data ?? result;

      if (Array.isArray(data)) {
        setFeatures(
          data.map((item) => ({
            key: item.key,
            enabled: Boolean(item.enabled),
          })),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load feature settings',
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggleFeature(feature: Feature) {
    try {
      setUpdating(feature.key);
      setError('');

      const response = await fetch(
        `${apiUrl}/features/${encodeURIComponent(feature.key)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            enabled: !feature.enabled,
          }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to update feature');
      }

      setFeatures((current) =>
        current.map((item) =>
          item.key === feature.key
            ? { ...item, enabled: !item.enabled }
            : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update feature',
      );
    } finally {
      setUpdating(null);
    }
  }

  function getFeature(key: string) {
    return features.find((feature) => feature.key === key);
  }

  useEffect(() => {
    loadFeatures();
  }, []);

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Feature Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Control which Naivex services and platform features are enabled.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
          Loading feature settings...
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const sectionFeatures = section.keys
              .map((key) => getFeature(key))
              .filter((feature): feature is Feature => Boolean(feature));

            if (sectionFeatures.length === 0) {
              return null;
            }

            return (
              <section
                key={section.title}
                className="overflow-hidden rounded-xl border bg-white"
              >
                <div className="border-b bg-gray-50 px-5 py-4">
                  <h2 className="font-semibold">{section.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {section.description}
                  </p>
                </div>

                <div className="divide-y">
                  {sectionFeatures.map((feature) => {
                    const label =
                      FEATURE_LABELS[feature.key] ||
                      feature.key
                        .replace(/_ENABLED$/, '')
                        .replace(/_/g, ' ');

                    const isUpdating = updating === feature.key;

                    return (
                      <div
                        key={feature.key}
                        className="flex items-center justify-between gap-4 p-4"
                      >
                        <div>
                          <p className="font-medium">{label}</p>
                          <p className="text-xs text-gray-500">
                            {feature.key}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleFeature(feature)}
                          disabled={isUpdating}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
                            feature.enabled
                              ? 'bg-green-600'
                              : 'bg-gray-300'
                          } ${
                            isUpdating
                              ? 'cursor-not-allowed opacity-50'
                              : 'cursor-pointer'
                          }`}
                          aria-label={`Turn ${label} ${
                            feature.enabled ? 'off' : 'on'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                              feature.enabled
                                ? 'translate-x-5'
                                : 'translate-x-0.5'
                            } mt-0.5`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}