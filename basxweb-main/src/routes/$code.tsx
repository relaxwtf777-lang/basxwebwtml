// language: TSX, file: src/routes/$code.tsx
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.code} · BASX Portal` },
      { name: "description", content: "Secure BASX session viewer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ params }) => {
    if (!/^BASX-[A-F0-9]+$/i.test(params.code)) {
      throw notFound();
    }
    const { data, error } = await supabase
      .from("sessions")
      .select("code, target_url")
      .eq("code", params.code.toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound();
    return { session: data };
  },
  component: ViewerPage,
  errorComponent: ({ error }) => (
    <div className="basx-root">
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h2 style={{ color: "var(--basx-err)" }}>เกิดข้อผิดพลาด</h2>
        <p style={{ color: "var(--basx-muted)", marginTop: 8 }}>{error.message}</p>
        <Link to="/" className="basx-btn mt-6" style={{ maxWidth: 240, textDecoration: "none" }}>
          กลับหน้าแรก
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="basx-root">
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="basx-brand-title">404</h1>
        <p style={{ color: "var(--basx-muted)", marginTop: 8 }}>
          ไม่พบเซสชัน BASX นี้ หรือลิงก์ถูกลบไปแล้ว
        </p>
        <Link
          to="/"
          className="basx-btn mt-6"
          style={{ maxWidth: 240, textDecoration: "none" }}
        >
          สร้างเซสชันใหม่
        </Link>
      </div>
    </div>
  ),
});

function ViewerPage() {
  const { code } = Route.useParams();
  const { session } = Route.useLoaderData() as {
    session: { code: string; target_url: string };
  };

  const [loaded, setLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setShowHelp(false);
    const t = setTimeout(() => setShowHelp(true), 4000);
    return () => clearTimeout(t);
  }, [reloadKey]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <iframe
        key={reloadKey}
        src={session.target_url}
        title={code}
        onLoad={() => setLoaded(true)}
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          background: "#000",
        }}
        allow="autoplay; clipboard-read; clipboard-write"
      />
      {!loaded && showHelp && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(10,10,10,0.96)",
            zIndex: 20,
          }}
        >
          <div className="basx-card w-full p-6" style={{ maxWidth: 420 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: "var(--basx-text)" }}>
              เปิดเว็บของเครื่องนี้ไม่ได้
            </h2>
            <p style={{ fontSize: 13, color: "var(--basx-muted)", lineHeight: 1.6 }}>
              ลิงก์นี้ชี้ไปที่{" "}
              <span className="font-mono">{session.target_url}</span> ตรวจสอบว่า:
            </p>
            <ul
              style={{
                fontSize: 13,
                color: "var(--basx-muted)",
                lineHeight: 1.7,
                paddingLeft: 18,
                margin: 0,
              }}
            >
              <li>โปรแกรมของคุณเปิดอยู่และรันที่พอร์ตนี้</li>
              <li>ใช้เครื่องที่อยู่วง Wi‑Fi / LAN เดียวกัน</li>
              <li>IPv4 ของเครื่องยังเป็นเลขเดิม (ถ้าเปลี่ยนต้องสร้างลิงก์ใหม่)</li>
              <li>ไฟร์วอลล์ไม่ได้บล็อกพอร์ตนี้</li>
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="basx-btn"
                onClick={() => {
                  setLoaded(false);
                  setShowHelp(false);
                  setReloadKey((k) => k + 1);
                }}
              >
                ลองใหม่
              </button>
              
                href={session.target_url}
                target="_blank"
                rel="noopener noreferrer"
                className="basx-btn ghost"
                style={{ textDecoration: "none" }}
              >
                เปิดแท็บใหม่ →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
