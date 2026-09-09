export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-contrast">
            S
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Standup</span>
        </div>
        {children}
      </div>
    </div>
  );
}
