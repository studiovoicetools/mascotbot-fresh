import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const BRAIN_API_URL =
  process.env.BRAIN_API_URL || "https://efro-brain-api.onrender.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shopDomain = searchParams.get("shopDomain") || "avatarsalespro-dev.myshopify.com";

  try {
    // 1. Supabase Cache prüfen
    const { data: cached } = await supabase
      .from("cache_responses")
      .select("reply_text, hit_count, id")
      .eq("question_hash", "greeting")
      .eq("shop_id", "b4cbd96d-b0f1-4a39-9021-b276a4302a76")
      .single();

    if (cached?.reply_text) {
      // hit_count erhöhen
      await supabase
        .from("cache_responses")
        .update({ hit_count: cached.hit_count + 1, last_used_at: new Date().toISOString() })
        .eq("id", cached.id);

      return NextResponse.json({ success: true, replyText: cached.reply_text, source: "cache" });
    }

    // 2. Fallback: Brain API
    const brainResponse = await fetch(`${BRAIN_API_URL}/api/brain/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "begrüße den kunden", shopDomain }),
    });

    const brainData = await brainResponse.json();
    const replyText = brainData.replyText || brainData.response || "Hallo! Wie kann ich dir helfen?";

    return NextResponse.json({ success: true, replyText, source: "brain" });

  } catch (error) {
    console.error("Greeting error:", error);
    return NextResponse.json({ success: true, replyText: "Hallo! Wie kann ich dir helfen?", source: "fallback" });
  }
}

export const dynamic = "force-dynamic";