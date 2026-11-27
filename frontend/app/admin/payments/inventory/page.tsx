"use client";

// 2026-11-27 (billing Release 2): Inventory -- stock at each centre, every
// movement, the book queue and the stock setup.
import { BookQueuePanel, InventorySetupPanel, MovementsPanel, StockPanel } from "@/components/payments/panels/InventoryPanels";
import { PaymentsSection } from "@/components/payments/PaymentsSection";
import { getBookQueue } from "@/lib/api/billing";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Boxes, ClipboardList, Settings2 } from "lucide-react";

type Tab = "stock" | "movements" | "books" | "setup";

export default function InventorySectionPage() {
  const books = useQuery({ queryKey: ["admin", "payments", "inventory", "books", "OPEN"], queryFn: () => getBookQueue("OPEN"), staleTime: 60_000 });
  return (
    <PaymentsSection<Tab>
      title="Inventory"
      label="Inventory Sections"
      fallback="stock"
      tabs={[
        { key: "stock", label: "Stock", icon: <Boxes size={16} /> },
        { key: "movements", label: "Movements", icon: <ClipboardList size={16} /> },
        { key: "books", label: "Book Queue", short: "Books", icon: <BookOpen size={16} />, flag: Boolean(books.data && books.data.openCount > 0) },
        { key: "setup", label: "Setup", icon: <Settings2 size={16} /> },
      ]}
      render={(tab) => (tab === "movements" ? <MovementsPanel /> : tab === "books" ? <BookQueuePanel /> : tab === "setup" ? <InventorySetupPanel /> : <StockPanel />)}
    />
  );
}
