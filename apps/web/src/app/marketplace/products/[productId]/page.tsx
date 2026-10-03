import { MarketplaceProductDetail } from '../../marketplace-ui';

export default function MarketplaceProductPage({
  params,
}: {
  params: { productId: string };
}) {
  return <MarketplaceProductDetail productId={params.productId} />;
}
