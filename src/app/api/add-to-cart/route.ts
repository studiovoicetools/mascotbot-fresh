import { NextRequest, NextResponse } from "next/server";

// Validate shopDomain is a well-formed hostname with no path/protocol injection
function isValidShopDomain(domain: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-\.]{0,253}[a-zA-Z0-9]$/.test(domain) &&
    !domain.includes('//') &&
    !domain.includes('/') &&
    !domain.includes('\\');
}

export async function POST(request: NextRequest) {
  try {
    const { handle, shopDomain } = await request.json();
    if (!handle || !shopDomain) {
      return NextResponse.json({ error: "handle and shopDomain required" }, { status: 400 });
    }
    if (!isValidShopDomain(shopDomain)) {
      return NextResponse.json({ error: "Invalid shopDomain" }, { status: 400 });
    }

    // First, look up the variant ID via Shopify storefront (products.json)
    const productRes = await fetch(
      `https://${shopDomain}/products/${handle}.js`,
      { headers: { "Accept": "application/json" } }
    );
    if (!productRes.ok) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const productData = await productRes.json();
    const variantId = productData?.variants?.[0]?.id;
    if (!variantId) {
      return NextResponse.json({ error: "No variant found" }, { status: 404 });
    }

    // Add to cart via Shopify AJAX API
    const cartRes = await fetch(`https://${shopDomain}/cart/add.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
    });
    if (!cartRes.ok) {
      const errData = await cartRes.json().catch(() => ({}));
      return NextResponse.json({ error: "Failed to add to cart", details: errData }, { status: cartRes.status });
    }
    const cartData = await cartRes.json();

    return NextResponse.json({ success: true, cart: cartData });
  } catch (error) {
    console.error("add-to-cart error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
