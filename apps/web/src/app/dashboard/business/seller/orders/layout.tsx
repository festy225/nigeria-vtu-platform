import { ProtectedRoute } from "@/components/protected-route";

export default function SellerOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute roles={["SELLER"]}>{children}</ProtectedRoute>;
}
