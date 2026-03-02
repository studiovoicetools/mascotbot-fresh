import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dynamicVariables } = body;

    // Log env var presence for LipSync debugging
    console.log("[LipSync][get-signed-url] MASCOT_BOT_API_KEY present:", !!process.env.MASCOT_BOT_API_KEY);
    console.log("[LipSync][get-signed-url] ELEVENLABS_AGENT_ID present:", !!process.env.ELEVENLABS_AGENT_ID);
    console.log("[LipSync][get-signed-url] ELEVENLABS_API_KEY present:", !!process.env.ELEVENLABS_API_KEY);

    if (!process.env.MASCOT_BOT_API_KEY) {
      console.error("[LipSync][get-signed-url] ❌ MASCOT_BOT_API_KEY is not set – LipSync will NOT work!");
    }

    // Use Mascot Bot proxy endpoint for automatic viseme injection
    const response = await fetch("https://api.mascot.bot/v1/get-signed-url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MASCOT_BOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        config: {
          provider: "elevenlabs",
          provider_config: {
            agent_id: process.env.ELEVENLABS_AGENT_ID,
            api_key: process.env.ELEVENLABS_API_KEY,
            sample_rate: 16000,
            ...(dynamicVariables && { dynamic_variables: dynamicVariables }),
          },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[LipSync][get-signed-url] ❌ mascot.bot API error:", response.status, errorText);
      throw new Error(`Failed to get signed URL: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const signedUrl: string = data.signed_url || "";
    // Log URL metadata only (never the actual URL for security)
    console.log("[LipSync][get-signed-url] ✅ signed_url received, length:", signedUrl.length);
    console.log("[LipSync][get-signed-url] URL starts with wss://:", signedUrl.startsWith("wss://"));
    console.log("[LipSync][get-signed-url] URL via mascot.bot proxy:", signedUrl.includes("mascot.bot"));

    if (!signedUrl) {
      console.error("[LipSync][get-signed-url] ❌ mascot.bot returned no signed_url!");
      throw new Error("mascot.bot returned no signed_url");
    }

    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error("[LipSync][get-signed-url] ❌ Error:", error);
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
