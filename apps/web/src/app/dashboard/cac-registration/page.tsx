export default function CacRegistrationPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold text-emerald-700">
          CHIMZO Business Services
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          CAC Registration
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Explore business name and company registration services for businesses
          in Nigeria through the Corporate Affairs Commission (CAC).
        </p>
      </div>

      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" />
          </svg>
        </div>

        <h2 className="mt-5 text-xl font-bold text-slate-900">
          Business registration made easier
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          CHIMZO is preparing this service so customers can access registration
          information and track their applications from their account.
        </p>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">
            Registration applications are not yet available
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            Application submission and payment will be enabled after the
            authorized registration provider or submission workflow is configured.
            No registration fee is being charged on this page.
          </p>
        </div>

        <h3 className="mt-6 font-semibold text-slate-900">
          What to prepare
        </h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
          <li>Your proposed business name or company name.</li>
          <li>Accurate applicant and business details.</li>
          <li>Required identification and supporting documents, as applicable.</li>
        </ul>
      </section>
    </main>
  );
}