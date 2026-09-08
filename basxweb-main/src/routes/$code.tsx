import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
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
      .select("code, target_url, password_hash")
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

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ViewerPage() {
  const { code } = Route.useParams();
  const { session } = Route.useLoaderData() as {
    session: { code: string; target_url: string; password_hash: string };
  };

  const noPassword = !session.password_hash;
  const sessionKey = `basx:auth:${session.code}`;
  const [authed, setAuthed] = useState(noPassword);
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authed) return;
    setShowHelp(false);
    const t = setTimeout(() => setShowHelp(true), 4000);
    return () => clearTimeout(t);
  }, [authed, reloadKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (noPassword || sessionStorage.getItem(sessionKey) === "1") {
      setAuthed(true);
    }
  }, [sessionKey, noPassword]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setChecking(true);
    try {
      const hash = await sha256(pwd);
      if (hash !== session.password_hash) {
        setError("รหัสผ่านไม่ถูกต้อง");
        return;
      }
      sessionStorage.setItem(sessionKey, "1");
      setAuthed(true);
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(sessionKey);
    setAuthed(false);
    setPwd("");
  };

  if (authed) {
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
                <a
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
        {!noPassword && (
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            style={{
              position: "fixed",
              top: 12,
              right: 12,
              zIndex: 10,
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              backdropFilter: "blur(6px)",
            }}
          >
            ⏻
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="basx-root">
      <div className="basx-grid" />
      <div className="basx-stars" />
      <div className="basx-shooting" />
      <div className="basx-shooting s2" />
      <div className="basx-shooting s3" />
      <div className="basx-shooting s4" />
      <div
        className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-12"
        style={{ zIndex: 1 }}
      >
        <div className="basx-card w-full p-7">
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="mb-2 flex items-center gap-2">
              <span className="basx-dot basx-pulse" />
              <h1 className="basx-brand-title" style={{ fontSize: 20 }}>
                BASX Panel
              </h1>
            </div>
            <p style={{ fontSize: 11, color: "var(--basx-muted)", margin: 0 }}>
              Streamers Choice · Session {code}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="basx-label">Password</label>
            <div className="basx-pwd-wrap">
              <input
                className="basx-input"
                type={showPwd ? "text" : "password"}
                placeholder="กรอกรหัสผ่านที่ตั้งไว้"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="basx-pwd-toggle"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? "🙈" : "👁"}
              </button>
            </div>

            {error && (
              <p
                className="mt-3 rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#fca5a5",
                }}
              >
                {error}
              </p>
            )}

            <button type="submit" disabled={checking} className="basx-btn mt-5">
              {checking ? "กำลังตรวจ..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link
              to="/"
              style={{
                fontSize: 12,
                color: "var(--basx-muted)",
                textDecoration: "none",
              }}
            >
              ← กลับหน้าสร้างเซสชัน
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}