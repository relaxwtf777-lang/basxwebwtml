import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BASX Launcher — เปิดเว็บจาก IPv4:3001" },
      { name: "description", content: "กรอก IPv4 ของเครื่องแล้วเปิดเว็บที่รันอยู่บนพอร์ต 3001 ได้ทันที" },
      { property: "og:title", content: "BASX Launcher" },
      { property: "og:description", content: "เปิดเว็บ IPv4:3001 ในแท็บใหม่อย่างรวดเร็ว" },
    ],
  }),
  component: Index,
});

const IPV4_REGEX =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;


function genBasxCode() {
  // 4 hex chars, uppercase — collision check is done by retry on insert.
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `BASX-${hex}`;
}

function Index() {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("3001");


  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{
    code: string;
    target: string;
    fullUrl: string;
    open: boolean;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ipParam = params.get("ip");
    const portParam = params.get("port");
    if (ipParam) setIp(ipParam);
    if (portParam) {
      setPort(portParam);
    } else if (ipParam) {
      setPort("3001");
    }
    if (ipParam) return;

    // Remember the last IP used on this device.
    try {
      const savedIp = localStorage.getItem("basx_last_ip");
      const savedPort = localStorage.getItem("basx_last_port");
      if (savedIp) setIp((prev) => (prev ? prev : savedIp));
      if (savedPort && !portParam) setPort(savedPort);
    } catch {
      /* ignore */
    }

    // Try to detect the machine's local IPv4 via WebRTC (works when the
    // browser does not hide candidates behind mDNS).
    let cancelled = false;
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("basx");
      pc.onicecandidate = (e) => {
        const cand = e.candidate?.candidate;
        if (!cand || cancelled) return;
        const m = cand.match(
          /((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})/,
        );
        const found = m?.[1];
        if (!found) return;
        if (
          found.startsWith("192.168.") ||
          found.startsWith("10.") ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(found)
        ) {
          cancelled = true;
          setIp((prev) => (prev ? prev : found));
          pc.close();
        }
      };
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(() => {});
      setTimeout(() => {
        cancelled = true;
        try {
          pc.close();
        } catch {
          /* ignore */
        }
      }, 3000);
    } catch {
      /* WebRTC unavailable */
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = ip.trim();
    if (!IPV4_REGEX.test(trimmed)) {
      setError("รูปแบบ IPv4 ไม่ถูกต้อง ตัวอย่าง: 192.168.1.10");
      return;
    }
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError("พอร์ตต้องเป็นตัวเลข 1–65535");
      return;
    }

    try {
      localStorage.setItem("basx_last_ip", trimmed);
      localStorage.setItem("basx_last_port", String(portNum));
    } catch {
      /* ignore */
    }

    setLoading(true);
    try {
      const target_url = `http://${trimmed}:${portNum}`;
      const password_hash = "";

      // Remember previous links: if this IPv4:port already has a link,
      // return the original one instead of creating a new code.
      const { data: existing } = await supabase
        .from("sessions")
        .select("code")
        .eq("target_url", target_url)
        .order("created_at", { ascending: true })
        .limit(1);

      if (existing && existing.length > 0) {
        const code = existing[0].code as string;
        setCreated({
          code,
          target: target_url,
          fullUrl: `${window.location.origin}/${code}`,
          open: true,
        });
        return;
      }

      // Try up to 5 times in case of code collision.
      let inserted = false;
      let finalCode = "";
      let lastErr: unknown = null;
      for (let i = 0; i < 5; i++) {
        const code = genBasxCode();
        const { error: insErr } = await supabase
          .from("sessions")
          .insert({ code, target_url, password_hash });
        if (!insErr) {
          inserted = true;
          finalCode = code;
          break;
        }
        lastErr = insErr;
        const msg = (insErr.message || "").toLowerCase();
        if (!msg.includes("duplicate") && !msg.includes("unique")) {
          throw insErr;
        }
      }
      if (!inserted) {
        const detail = lastErr instanceof Error ? lastErr.message : "unknown";
        throw new Error(`สร้างรหัสไม่สำเร็จ: ${detail}`);
      }

      const fullUrl = `${window.location.origin}/${finalCode}`;
      setCreated({ code: finalCode, target: target_url, fullUrl, open: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
      setError(msg);
      console.error("[BASX] create session failed", err);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="basx-root">
      <div className="basx-grid" />
      <div className="basx-stars" />
      <div className="basx-shooting" />
      <div className="basx-shooting s2" />
      <div className="basx-shooting s3" />
      <div className="basx-shooting s4" />
      <div
        className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-12"
        style={{ zIndex: 1 }}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-3">
            <span className="basx-dot" />
            <h1 className="basx-brand-title">BASX PORTAL</h1>
          </div>
          <p
            style={{
              color: "var(--basx-text)",
              fontSize: 15,
              lineHeight: 1.55,
              margin: 0,
              maxWidth: 320,
            }}
          >
            วิธีใช้: กดสร้างลิงก์แล้วใช้เปิดโปรผ่านเว็บได้ทันที&nbsp;
             คำเตือนเปิดเว็บครั้งแรกเซฟลิงก์ไว้ให้ดีห้ามหายจะใช้ลิงก์นี้เข้าเว็บไปตลอด
          </p>
        </div>

        {!created ? (
          <form onSubmit={handleSubmit} className="basx-card w-full p-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="basx-label">IPv4 Address</label>
                <input
                  className="basx-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="192.168.1.10"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="basx-label">Port</label>
                <input
                  className="basx-input"
                  type="text"
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>





            {error && (
              <p
                className="mt-4 rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#fca5a5",
                }}
              >
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="basx-btn mt-5">
              {loading ? "กำลังสร้าง..." : "สร้างเว็บเปิดโปร"}
            </button>

            <p
              className="mt-4 text-center"
              style={{ fontSize: 11, color: "var(--basx-muted)" }}
            >
              สมัครครั้งเดียว ใช้ลิงก์เดิมได้ตลอด · รหัสไม่ซ้ำกับเครื่องอื่น
            </p>
          </form>
        ) : (
          <div className="basx-card w-full p-6 text-center">
            <p
              style={{
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--basx-ok)",
                margin: 0,
              }}
            >
              ✓ Session Created
            </p>
            <div className="mt-4">
              <span className="basx-code-pill">{created.code}</span>
            </div>

            <div
              className="mt-5 rounded-lg p-3 text-left"
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--basx-stroke)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--basx-muted)",
                }}
              >
                ลิงก์สำหรับเปิดเว็บ (เก็บไว้ใช้ได้ตลอด)
              </div>
              <input
                readOnly
                value={created.fullUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="basx-input mt-2"
                style={{ fontSize: 13, color: "#d4d4d4" }}
              />
              <div
                className="mt-2"
                style={{ fontSize: 11, color: "var(--basx-muted)" }}
              >
                Target: <span className="font-mono">{created.target}</span>
              </div>
              <div
                className="mt-1"
                style={{
                  fontSize: 11,
                  color: created.open ? "var(--basx-ok)" : "var(--basx-muted)",
                }}
              >
                {created.open
                  ? "โหมดเปิดทันที · ไม่ต้องใส่รหัสผ่าน"
                  : "ต้องใส่รหัสผ่านก่อนเข้า"}
              </div>

            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="basx-btn ghost" onClick={copyLink}>
                {copied ? "✓ คัดลอกแล้ว" : "คัดลอกลิงก์"}
              </button>
              <a
                href={created.fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="basx-btn"
                style={{ textDecoration: "none" }}
              >
                เปิดในแท็บใหม่ →
              </a>
            </div>

            <Link
              to="/$code"
              params={{ code: created.code }}
              className="basx-btn ghost mt-3"
              style={{ textDecoration: "none" }}
            >
              ไปหน้าล็อกอินเลย
            </Link>

            <button
              type="button"
              className="mt-4"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--basx-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
              onClick={() => {
                setCreated(null);

              }}
            >
              ← สร้างเซสชันใหม่
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
