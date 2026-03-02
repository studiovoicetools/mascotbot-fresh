import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const BRAIN_API_URL =
  process.env.BRAIN_API_URL || "https://efro-five.vercel.app";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, shopDomain } = body;

    if (!message || !shopDomain) {
      return NextResponse.json(
        { error: "message and shopDomain are required" },
        { status: 400 }
      );
    }

    // 1. Brain API aufrufen
    const brainResponse = await fetch(`${BRAIN_API_URL}/api/brain/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, shop_domain: shopDomain }),
    });

    if (!brainResponse.ok) {
      throw new Error(`Brain API error: ${brainResponse.statusText}`);
    }

    const brainData = await brainResponse.json();
    const replyText: string = brainData.replyText || brainData.response || "";
    // Normalize product fields to match the frontend Product interface.
    // Brain API returns price as number and image as image_url/imageUrl.
    const products = (brainData.products || []).slice(0, 3).map((p: any) => ({
      title: p.title || "",
      price: p.price != null ? String(p.price) : "0",
      image: p.image_url || p.imageUrl || p.image || undefined,
      url: p.url || undefined,
      handle: p.handle || p.shopify_handle || undefined,
    }));

    const textHash = crypto
      .createHash("md5")
      .update(`${shopDomain}:${replyText}`)
      .digest("hex");

    // 2. Audio-Cache in Supabase prüfen (optional, nur wenn konfiguriert)
    let cachedAudio = null;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      const { data } = await supabase
        .from("audio_cache")
        .select("audio_data, viseme_data")
        .eq("text_hash", textHash)
        .single();

      cachedAudio = data || null;
    }

    return NextResponse.json({
      success: true,
      replyText,
      products,
      textHash,
      cached: !!cachedAudio,
      audioData: cachedAudio,
    });
  } catch (error) {
    console.error("brain-chat error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";