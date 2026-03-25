import { CompetitiveAssistant } from "@/components/competitive-assistant";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 md:px-8 md:py-10">
      <div className="pointer-events-none absolute -left-10 top-10 h-24 w-24 rounded-full border-4 border-slate-900 bg-gradient-to-b from-red-500 to-red-600" />
      <div className="pointer-events-none absolute -right-8 bottom-12 h-20 w-20 rounded-full border-4 border-slate-900 bg-gradient-to-b from-blue-500 to-blue-700" />
      <CompetitiveAssistant />
    </main>
  );
}
