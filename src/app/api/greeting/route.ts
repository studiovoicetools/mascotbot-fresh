import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BRAIN_API_URL, pingBrainApi } from "@/lib/brainApi";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shopDomain = searchParams.get("shopDomain") || "avatarsalespro-dev.myshopify.com";

  try {
    // 1. Supabase Cache prüfen (optional, nur wenn konfiguriert)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      const { data: cached } = await supabase
        .from("cache_responses")
        .select("reply_text, hit_count, id")
        .eq("question_hash", "greeting")
        .eq("shop_id", "b4cbd96d-b0f1-4a39-9021-b276a4302a76")
        .single();

      if (cached?.reply_text) {
        await supabase
          .from("cache_responses")
          .update({ hit_count: cached.hit_count + 1, last_used_at: new Date().toISOString() })
          .eq("id", cached.id);

        return NextResponse.json({ success: true, replyText: cached.reply_text, source: "cache" });
      }
    }

    // 2. Fallback: Brain API
    await pingBrainApi();

    let replyText = "Hallo! 👋 Ich bin EFRO, dein KI-Verkäufer. Wie kann ich dir helfen?";
    try {
      const brainResponse = await fetch(`${BRAIN_API_URL}/api/brain/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "begrüße den kunden", shopDomain }),
      });

      const brainData = await brainResponse.json();
      replyText = brainData.replyText || brainData.response || replyText;
    } catch {
      // Brain API unreachable — use fallback greeting
    }

    return NextResponse.json({ success: true, replyText, source: "brain" });

  } catch (error) {
    console.error("Greeting error:", error);
    return NextResponse.json({ success: true, replyText: "Hallo! Wie kann ich dir helfen?", source: "fallback" });
  }
}

export const dynamic = "force-dynamic";