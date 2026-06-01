export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-8 sm:px-6 sm:py-10">
      <div className="w-full max-w-[27rem]">{children}</div>
    </main>
  );
}
