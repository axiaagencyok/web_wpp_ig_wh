import { NavSidebar } from "@/components/panel/NavSidebar";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex bg-cream-raised overflow-hidden">
      <NavSidebar />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
