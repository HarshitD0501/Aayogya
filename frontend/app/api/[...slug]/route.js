import { NextResponse } from "next/server";
import { FIXTURE_DATA } from "@/lib/fixtures";

const BACKEND_URL = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000";

export async function GET(request, { params }) {
  return handleRequest(request, params, "GET");
}

export async function POST(request, { params }) {
  return handleRequest(request, params, "POST");
}

export async function PUT(request, { params }) {
  return handleRequest(request, params, "PUT");
}

export async function DELETE(request, { params }) {
  return handleRequest(request, params, "DELETE");
}

async function handleRequest(request, params, method) {
  const resolvedParams = await params;
  const path = "/" + (resolvedParams?.slug || []).join("/");
  const url = new URL(request.url);
  const targetUrl = `${BACKEND_URL}/api${path}${url.search}`;

  // Forward to real FastAPI backend
  try {
    const isHeavyEndpoint =
      path.includes("/upload") ||
      path.includes("/chat") ||
      path.includes("/trigger");
    const timeoutMs = isHeavyEndpoint ? 90000 : 20000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = new Headers(request.headers);
    headers.delete("host");

    let body = undefined;
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = await request.arrayBuffer();
      } catch {
        body = undefined;
      }
    }

    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.arrayBuffer();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    // Only if backend is completely offline/unreachable: serve dev fixtures as fallback
    console.warn(`[Proxy] Real backend at ${BACKEND_URL} unreachable for ${path}: ${err.message}. Using dev fixture.`);
    const fixture = getFixtureResponse(path, url.searchParams);
    const authUnavailable = path === "/auth/register" || path === "/auth/google";
    return NextResponse.json(fixture, { status: authUnavailable ? 503 : 200 });
  }
}

function getFixtureResponse(path, searchParams) {
  if (path === "/auth/register" || path === "/auth/google") {
    return { detail: "Authentication is unavailable while the backend is offline." };
  }
  if (path === "/auth/login") {
    return {
      token: "dev-fixture-token-ramesh",
      patient: FIXTURE_DATA.patients.ramesh,
    };
  }
  if (path === "/auth/me") {
    return FIXTURE_DATA.patients.ramesh;
  }
  if (path.includes("/summary")) {
    return FIXTURE_DATA.summary.ramesh;
  }
  if (path.includes("/medicines")) {
    return FIXTURE_DATA.medicines.ramesh;
  }
  if (path.includes("/interactions")) {
    return FIXTURE_DATA.interactions.ramesh;
  }
  if (path.includes("/pharmacies") || path.includes("/stores")) {
    return FIXTURE_DATA.pharmacies;
  }
  if (path.includes("/reports")) {
    return FIXTURE_DATA.reports;
  }
  if (path.includes("/prices")) {
    const brand = searchParams.get("brand") || "Dolo 650";
    return {
      brand,
      salt: "Paracetamol",
      strength: "650 mg",
      market_price: 32.5,
      nppa_ceiling_price: 24.0,
      jan_aushadhi_price: 10.5,
      max_savings_percent: 68,
      _development_fixture: true,
    };
  }
  if (path.includes("/public/stats")) {
    return {
      verified_medicines: 250000,
      nppa_caps_tracked: 840,
      jan_aushadhi_generics: 1800,
      interaction_rules: 3,
      status: "online",
      _development_fixture: true,
    };
  }
  return { status: "ok", _development_fixture: true };
}
