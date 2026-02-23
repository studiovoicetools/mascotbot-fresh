import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BRAIN_API_URL =
  process.env.BRAIN_API_URL || "https://efro-brain-api.onrender.com";

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
      body: JSON.stringify({ message, shopDomain }),
    });

    if (!brainResponse.ok) {
      throw new Error(`Brain API error: ${brainResponse.statusText}`);
    }

    const brainData = await brainResponse.json();
    const replyText: string = brainData.replyText || brainData.response || "";
    const products = brainData.products?.slice(0, 3) || [];

    // 2. Audio-Cache in Supabase prüfen
    const textHash = crypto
      .createHash("md5")
      .update(`${shopDomain}:${replyText}`)
      .digest("hex");

    const { data: cachedAudio } = await supabase
      .from("audio_cache")
      .select("audio_data, viseme_data")
      .eq("text_hash", textHash)
      .single();

    return NextResponse.json({
      success: true,
      replyText,
      products,
      textHash,
      cached: !!cachedAudio,
      audioData: cachedAudio || null,
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