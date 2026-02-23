import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch("https://api.mascot.bot/v1/visemes-audio", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MASCOT_BOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("MascotBot visemes-audio error:", errorText);
      return NextResponse.json(
        { error: "Failed to get visemes-audio" },
        { status: response.status }
      );
    }

    // Stream response zurück
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("visemes-audio proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";