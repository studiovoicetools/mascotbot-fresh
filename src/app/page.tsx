"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import {
  Alignment,
  Fit,
  MascotClient,
  MascotProvider,
  MascotRive,
  useMascotElevenlabs,
} from "@mascotbot-sdk/react";

interface Message {
  text: string;
  sender: 'user' | 'bot';
  products?: Product[];
}

interface Product {
  title: string;
  price: string;
  image?: string;
  url?: string;
  handle?: string;
}

interface ElevenLabsAvatarProps {
  dynamicVariables?: Record<string, string | number | boolean>;
}

function ElevenLabsAvatar({ dynamicVariables }: ElevenLabsAvatarProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [viaProxy, setViaProxy] = useState<boolean | null>(null);
  const manualDisconnect = useRef<boolean>(false);
  const urlRefreshInterval = useRef<NodeJS.Timeout | null>(null);
  const connectionStartTime = useRef<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hallo! 👋 Ich bin EFRO, dein KI-Verkäufer. Wie kann ich dir helfen?", sender: 'bot' }
  ]);
  const [userInput, setUserInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const shopDomain = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('shop') || 'avatarsalespro-dev.myshopify.com'
    : 'avatarsalespro-dev.myshopify.com';

  // Stable refs to avoid re-creating clientTools on every render
  const shopDomainRef = useRef(shopDomain);
  const setMessagesRef = useRef(setMessages);
  useEffect(() => { shopDomainRef.current = shopDomain; }, [shopDomain]);
  useEffect(() => { setMessagesRef.current = setMessages; }, []);

  const conversation = useConversation({
    micMuted: isMuted,
    onConnect: () => {
      console.log("[LipSync] ✅ ElevenLabs connected");
      setIsConnecting(false);
    },
    onDisconnect: () => {
      console.log("[LipSync] ElevenLabs disconnected");
      setIsConnecting(false);
    },
    onError: (error: any) => { console.error("[LipSync] ElevenLabs Error:", error); setIsConnecting(false); },
    // Keep empty to prevent unnecessary re-renders during voice — transcripts come through text chat
    onMessage: (msg: { message: string; source: 'user' | 'ai' }) => {
      console.log("[LipSync] onMessage:", msg.source, msg.message?.slice(0, 80));
    },
    onDebug: (msg: any) => { console.log("[LipSync][ElevenLabs Debug]", String(JSON.stringify(msg) ?? "").slice(0, 200)); },
  });

  const [lipSyncConfig] = useState({
    minVisemeInterval: 40,
    mergeWindow: 60,
    keyVisemePreference: 0.6,
    preserveSilence: true,
    similarityThreshold: 0.4,
    preserveCriticalVisemes: true,
    criticalVisemeMinDuration: 80,
  });

  const { isIntercepting, messageCount, lastMessage } = useMascotElevenlabs({
    conversation,
    gesture: true,
    naturalLipSync: true,
    naturalLipSyncConfig: lipSyncConfig,
    debug: true,
    onVisemeReceived: (visemes) => {
      console.log("[LipSync] ✅ Visemes received:", visemes.length, "first:", visemes[0]);
    },
  });

  // Log LipSync state changes for debugging
  useEffect(() => {
    console.log("[LipSync] isIntercepting:", isIntercepting, "| messageCount:", JSON.stringify(messageCount));
  }, [isIntercepting, messageCount]);

  const getSignedUrl = async (): Promise<string> => {
    const response = await fetch(`/api/get-signed-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({ dynamicVariables: dynamicVariables || {} }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Failed to get signed url: ${response.statusText}`);
    const data = await response.json();
    // Expose whether URL routes through mascot.bot proxy
    if (typeof data.viaProxy === 'boolean') setViaProxy(data.viaProxy);
    return data.signedUrl;
  };

  const fetchAndCacheUrl = useCallback(async () => {
    try {
      const url = await getSignedUrl();
      setCachedUrl(url);
    } catch (error) {
      setCachedUrl(null);
    }
  }, [dynamicVariables]);

  useEffect(() => {
    fetchAndCacheUrl();
    urlRefreshInterval.current = setInterval(() => { fetchAndCacheUrl(); }, 9 * 60 * 1000);
    return () => {
      if (urlRefreshInterval.current) clearInterval(urlRefreshInterval.current);
    };
  }, [fetchAndCacheUrl]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { text, sender: 'user' }]);
    setUserInput("");
    try {
      const response = await fetch(`/api/brain-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, shopDomain })
      });
      const data = await response.json();
      setMessages(prev => [...prev, {
        text: data.replyText,
        sender: 'bot',
        products: data.products?.slice(0, 3)
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { text: 'Entschuldigung, es gab einen Fehler.', sender: 'bot' }]);
    }
  };

  const isStartingRef = useRef(false);

  const startConversation = useCallback(async () => {
    if (isStartingRef.current || conversation.status === "connected" || conversation.status === "connecting") {
      console.log("[LipSync] startConversation blocked - status:", conversation.status);
      return;
    }
    try {
      isStartingRef.current = true;
      setIsConnecting(true);
      connectionStartTime.current = Date.now();
      await navigator.mediaDevices.getUserMedia({ audio: true });
      let signedUrl = cachedUrl;
      if (!signedUrl) signedUrl = await getSignedUrl();
      if (!signedUrl) throw new Error("Signed URL fehlt.");
      console.log("[LipSync] Starting session – URL via mascot.bot:", signedUrl.includes("mascot.bot"), "| viaProxy flag:", viaProxy, "| length:", signedUrl.length);
      if (viaProxy === false) {
        console.error("[LipSync] ❌ CRITICAL: signed URL does NOT route through mascot.bot – LipSync/visemes will NOT work! Check MASCOT_BOT_API_KEY env var.");
      }
      await conversation.startSession({ signedUrl, dynamicVariables });
    } catch (error) {
      console.error("[LipSync] Failed to start conversation:", error);
      setIsConnecting(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [conversation, cachedUrl, dynamicVariables]);

  const stopConversation = useCallback(async () => {
    manualDisconnect.current = true;
    await conversation.endSession();
  }, [conversation]);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: "#FFF8F0" }}
    >
      {/* ── Hintergrund über gesamte Seite ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.4 }}>
        <img src="/bg_pattern.svg" alt="" className="object-cover object-center w-full h-full" />
      </div>

      {/* ── Status Badge oben links ── */}
      <div className="absolute top-4 left-4 bg-black/30 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg z-10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${conversation.status === 'connected' ? 'bg-green-400' : 'bg-gray-400'}`} />
          <span>{conversation.status === 'connected' ? 'Voice ON' : 'Voice OFF'}</span>
        </div>
        <div className="mt-1">LipSync: {isIntercepting ? "✓" : "○"}</div>
        <div className="mt-1">Audio: {messageCount.audio} | Viseme: {messageCount.viseme}</div>
        <div className={`mt-1 font-bold ${viaProxy === false ? 'text-red-400' : viaProxy === true ? 'text-green-400' : 'text-gray-400'}`}>
          Proxy: {viaProxy === null ? '…' : viaProxy ? '✓ mascot.bot' : '❌ DIRECT – no LipSync!'}
        </div>
      </div>

      {/* ── RECHTE SPALTE: Avatar + Voice Button + Chat ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "380px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid rgba(255,138,61,0.2)",
          backgroundColor: "#FFF8F0",
          zIndex: 10,
        }}
      >
        {/* Avatar oben rechts */}
        <div
          style={{
            height: "300px",
            flexShrink: 0,
            position: "relative",
            overflow: "hidden",
            backgroundColor: "#FFF8F0",
          }}
        >
          <img
            src="/bg_pattern.svg"
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.3,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <MascotRive />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "60px",
              background: "linear-gradient(180deg, transparent 0%, #FFF8F0 100%)",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Voice Button unter Avatar */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,138,61,0.15)",
            backgroundColor: "#FFF8F0",
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {conversation.status === "connected" ? (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={stopConversation}
                style={{ padding: "10px 20px", backgroundColor: "#FF4444", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
              >⏹ End Call</button>
              <button
                onClick={() => setIsMuted(prev => !prev)}
                style={{ padding: "10px 20px", backgroundColor: "white", color: "#333", border: "2px solid rgba(255,138,61,0.3)", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
              >{isMuted ? "🔇 Unmute" : "🎤 Mute"}</button>
            </div>
          ) : (
            <button
              onClick={startConversation}
              disabled={isConnecting}
              style={{
                padding: "10px 24px",
                backgroundColor: "#FF8A3D",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: isConnecting ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "bold",
                opacity: isConnecting ? 0.6 : 1,
              }}
            >{isConnecting ? "⏳ Connecting..." : "🎤 Sprechen"}</button>
          )}
        </div>

        {/* Chat Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #FF8A3D, #FF4444)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "20px", marginRight: "10px" }}>🤖</span>
          <div>
            <div style={{ color: "white", fontWeight: "bold", fontSize: "14px" }}>EFRO Chat</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "11px" }}>KI Verkaufsassistent</div>
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            backgroundColor: "#FFF8F0",
          }}
        >
          {messages.map((msg, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: msg.sender === 'user' ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    backgroundColor: msg.sender === 'user' ? "#FF8A3D" : "#FFFFFF",
                    color: msg.sender === 'user' ? "white" : "#333",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  }}
                >
                  {msg.text}
                </div>
              </div>
              {msg.products && msg.products.length > 0 && (
                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {msg.products.map((product, j) => (
                    <a
                      key={j}
                      href={product.url || `https://${shopDomain}/products/${product.handle || ''}`}
                      target="_parent"
                      style={{
                        display: "flex",
                        gap: "10px",
                        padding: "10px",
                        backgroundColor: "white",
                        borderRadius: "12px",
                        border: "1px solid rgba(255,138,61,0.2)",
                        textDecoration: "none",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ width: "60px", height: "60px", borderRadius: "8px", overflow: "hidden", flexShrink: 0, backgroundColor: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {product.image
                          ? <img src={product.image} alt={product.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: "24px" }}>🛍️</span>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: "600", fontSize: "12px", color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.title}</div>
                        <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>⭐⭐⭐⭐⭐</div>
                        <div style={{ fontWeight: "bold", fontSize: "15px", color: "#FF8A3D", marginTop: "2px" }}>{product.price}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", color: "#FF8A3D", fontSize: "16px" }}>→</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "12px",
            borderTop: "1px solid rgba(255,138,61,0.15)",
            backgroundColor: "white",
            flexShrink: 0,
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage(userInput)}
            placeholder="Frag mich nach Produkten..."
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: "20px",
              border: "2px solid rgba(255,138,61,0.25)",
              outline: "none",
              fontSize: "13px",
              backgroundColor: "#FFF8F0",
              color: "#333",
            }}
          />
          <button
            onClick={() => sendMessage(userInput)}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              border: "none",
              background: "linear-gradient(135deg, #FF8A3D, #FF4444)",
              color: "white",
              cursor: "pointer",
              fontSize: "16px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >➤</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const mascotUrl = "/retroBot.riv";
  const dynamicVariables = { name: "EFRO" };

  return (
    <MascotProvider>
      <main className="w-full h-screen">
        <MascotClient
          src={mascotUrl}
          artboard="Character"
          inputs={["is_speaking", "gesture"]}
          layout={{ fit: Fit.Contain, alignment: Alignment.BottomCenter }}
        >
          <ElevenLabsAvatar dynamicVariables={dynamicVariables} />
        </MascotClient>
      </main>
    </MascotProvider>
  );
}