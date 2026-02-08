/**
 * Example: Browse the public marketplace
 *
 * This example demonstrates listing and inspecting products
 * available on the Ragora marketplace.
 */

import { RagoraClient } from '../src/index.js';

async function main() {
  const client = new RagoraClient({
    apiKey: process.env.RAGORA_API_KEY ?? 'your-api-key',
    baseUrl: process.env.RAGORA_BASE_URL ?? 'https://api.ragora.app',
  });

  // --- List marketplace products ---
  console.log('=== Marketplace Products ===\n');

  const products = await client.listMarketplace({ limit: 10, offset: 0 });

  console.log(`Found ${products.total} product(s) (showing ${products.data.length}):\n`);

  products.data.forEach((product) => {
    console.log(`  ${product.title}`);
    console.log(`    ID: ${product.id}`);
    console.log(`    Description: ${product.description ?? 'No description'}`);
    console.log(`    Rating: ${product.averageRating.toFixed(1)} (${product.reviewCount} reviews)`);
    console.log();
  });

  // --- Get details of a specific product ---
  if (products.data.length > 0) {
    const productId = products.data[0].id;

    console.log('=== Product Details ===\n');

    const detail = await client.getMarketplaceProduct(productId);

    console.log(`Title: ${detail.title}`);
    console.log(`ID: ${detail.id}`);
    console.log(`Slug: ${detail.slug}`);
    console.log(`Description: ${detail.description ?? 'No description'}`);
    console.log(`Status: ${detail.status}`);
    console.log(`Vectors: ${detail.totalVectors}, Chunks: ${detail.totalChunks}`);
    console.log(`Access count: ${detail.accessCount}`);

    if (detail.listings && detail.listings.length > 0) {
      console.log(`\nListings (${detail.listings.length}):`);
      detail.listings.forEach((listing) => {
        console.log(`  - Type: ${listing.type}`);
        if (listing.type === 'usage_based') {
          console.log(`    Per retrieval: $${listing.pricePerRetrievalUsd?.toFixed(5) ?? 'N/A'}`);
        } else if (listing.type === 'free') {
          console.log(`    Price: Free`);
        } else {
          console.log(`    Price: $${listing.priceAmountUsd.toFixed(2)}${listing.priceInterval ? `/${listing.priceInterval}` : ''}`);
        }
        console.log(`    Active: ${listing.isActive}`);
      });
    }

    if (detail.seller) {
      console.log(`\nSeller: ${detail.seller.name ?? 'Unknown'}`);
    }

    if (detail.categories && detail.categories.length > 0) {
      console.log(`Categories: ${detail.categories.map((c) => c.name).join(', ')}`);
    }
  }

  // --- Search marketplace ---
  console.log('\n=== Search Marketplace ===\n');

  const searchResults = await client.listMarketplace({
    search: 'AI',
    limit: 5,
  });

  console.log(`Search results for "AI": ${searchResults.total} product(s)`);
  searchResults.data.forEach((product) => {
    console.log(`  - ${product.title} (rating: ${product.averageRating.toFixed(1)})`);
  });
}

main().catch(console.error);
