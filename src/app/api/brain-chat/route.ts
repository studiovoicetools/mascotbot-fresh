import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { BRAIN_API_URL, pingBrainApi } from "@/lib/brainApi";

// Maximale Anzahl an Nachrichten die als Kontext mitgeschickt werden
const MAX_CONTEXT_MESSAGES = 6;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, shopDomain, limit, sessionId } = body;

    if (!message || !shopDomain) {
      return NextResponse.json(
        { error: "message and shopDomain are required" },
        { status: 400 }
      );
    }

    // Supabase-Client (optional, nur wenn konfiguriert)
    const supabase =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
        ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
        : null;

    // 1. Konversations-Verlauf laden (falls sessionId vorhanden und Supabase aktiv)
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (supabase && sessionId) {
      try {
        const { data: history } = await supabase
          .from("conversations")
          .select("role, message")
          .eq("session_id", sessionId)
          .eq("shop_domain", shopDomain)
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: true })
          .limit(MAX_CONTEXT_MESSAGES);

        if (history && history.length > 0) {
          conversationHistory = history.map((row) => ({
            role: row.role as "user" | "assistant",
            content: row.message,
          }));
        }
      } catch (err) {
        // Nicht-kritisch: Bei Fehler einfach ohne Kontext weitermachen
        console.warn("brain-chat: could not load conversation history:", err);
      }
    }

    // Warm-up ping: weckt die Brain API falls sie kalt ist (Vercel cold-start)
    // Fehler werden still geschluckt – für den User unsichtbar
    await pingBrainApi();

    // 2. Brain API aufrufen (mit Kontext im history-Feld falls vorhanden)
    const brainResponse = await fetch(`${BRAIN_API_URL}/api/brain/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        shop_domain: shopDomain,
        limit: limit || 3,
        // Konversations-Kontext (Brain API nimmt das entgegen wenn vorhanden)
        history: conversationHistory,
      }),
    });

    if (!brainResponse.ok) {
      throw new Error(`Brain API error: ${brainResponse.statusText}`);
    }

    const brainData = await brainResponse.json();
    const replyText: string = brainData.replyText || brainData.response || "";

    // Normalize product fields to match the frontend Product interface.
    // Brain API returns price as number and image as image_url/imageUrl.
    const products = (brainData.products || []).slice(0, limit || 3).map((p: any) => ({
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

    // 3. Nachrichten in conversations-Tabelle speichern (falls sessionId + Supabase aktiv)
    if (supabase && sessionId && replyText) {
      try {
        await supabase.from("conversations").insert([
          { session_id: sessionId, shop_domain: shopDomain, role: "user", message },
          { session_id: sessionId, shop_domain: shopDomain, role: "assistant", message: replyText },
        ]);
      } catch (err) {
        // Nicht-kritisch: Weiter ohne Speichern
        console.warn("brain-chat: could not save conversation:", err);
      }
    }

    // 4. Audio-Cache in Supabase prüfen (optional, nur wenn konfiguriert)
    let cachedAudio = null;
    if (supabase) {
      try {
        const { data } = await supabase
          .from("audio_cache")
          .select("audio_data, viseme_data")
          .eq("text_hash", textHash)
          .single();
        cachedAudio = data || null;
      } catch {
        // Nicht-kritisch
      }
    }

    return NextResponse.json({
      success: true,
      replyText,
      products,
      textHash,
      cached: !!cachedAudio,
      audioData: cachedAudio,
      // sessionId zurückgeben damit Frontend ihn kennt
      sessionId: sessionId || null,
    });
  } catch (error) {
    console.error("brain-chat error:", error);
    return NextResponse.json(
      {
        success: false,
        replyText: "Entschuldigung, ich bin gerade nicht erreichbar. Bitte versuche es in einem Moment nochmal.",
        products: [],
        error: "service_unavailable",
      },
      { status: 200 } // status 200 so the frontend doesn't show an error state
    );
  }
}

export const dynamic = "force-dynamic";